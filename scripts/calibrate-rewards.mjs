#!/usr/bin/env node
// Finite paired range audit. Leaves production tuning untouched; starts no server.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(`Weighted reward-range calibration (finite; no server or production changes)
--trials 10000
--seed 42
--bot score|simple|patterns
--presets fresh,balanced,chips,mult,pairs
--stacks 0,4,16,32   Compare independently rolled current/proposed Common builds.
                    Requires score or patterns; ignores presets.
Omit --stacks to rescore identical final hands across weighted regular/strong ranges.
All outputs are JSON; progress goes to stderr.`);
    process.exit(0);
}
const options = { trials: 10000, seed: 42, presets: ['fresh', 'balanced', 'chips', 'mult', 'pairs'], bot: 'score' };
for (let i = 0; i < args.length; i++) {
    const flag = args[i], value = args[++i];
    if (!value) throw new Error(`Missing value for ${flag}`);
    if (flag === '--trials') options.trials = Number(value);
    else if (flag === '--seed') options.seed = Number(value);
    else if (flag === '--presets') options.presets = value.split(',');
    else if (flag === '--stacks') options.stacks = value.split(',').map(Number);
    else if (flag === '--bot' && ['score', 'simple', 'patterns'].includes(value)) options.bot = value;
    else throw new Error(`Unknown option: ${flag} ${value}`);
}
if (!Number.isInteger(options.trials) || options.trials < 10 || options.trials > 100000
    || !Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff) throw new Error('Invalid trials or seed.');

const bundled = await build({ stdin: { contents: `
export { createLabState, playRound, settleRound, summarize, streamSeed } from './src/simulation/runner.ts';
export { validateConfig } from './src/simulation/runner.ts';
export { processAction, getValidActions } from './src/engine/engine.ts';
export { RaisePlayPolicy, observeRaises } from './src/simulation/raisePolicy.ts';
export { RAISE_BONUS_RANGES, RAISE_VALUE_WEIGHTS } from './src/logic/upgradeTuning.ts';
export { getRaise } from './src/logic/handScoring.ts';
export { startRaiseRun, playRaiseRound } from './src/simulation/raiseRuns.ts';
export { SeededRNG } from './src/engine/rng.ts';
`, resolveDir: fileURLToPath(new URL('../', import.meta.url)), sourcefile: 'reward-calibration.ts' },
bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22' });
const engine = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const { createLabState, playRound, settleRound, summarize, streamSeed, processAction, getValidActions,
    RaisePlayPolicy, observeRaises, RAISE_BONUS_RANGES, RAISE_VALUE_WEIGHTS, getRaise } = engine;
const patterns = ['pair', 'straight', 'flush'];
// Explicit proposal, for measurement only. These are not new production IDs.
const proposed = {
    pair: { regular: { cash: [2, 6], multPercent: [2, 5] }, strong: { cash: [8, 12], multPercent: [6, 10] } },
    straight: { regular: { cash: [1, 5], multPercent: [1, 4] }, strong: { cash: [5, 9], multPercent: [4, 8] } },
    flush: { regular: { cash: [1, 3], multPercent: [1, 3] }, strong: { cash: [3, 7], multPercent: [2, 6] } },
};
const payout = (chips, mult) => Math.floor(Number((chips * mult).toFixed(8)));
function rolls(range) {
    const weights = RAISE_VALUE_WEIGHTS[range[1] - range[0] + 1];
    if (!weights || weights.reduce((a, b) => a + b, 0) !== 100) throw new Error('Unsupported roll weights.');
    return weights.map((weight, i) => ({ value: range[0] + i, probability: weight / 100 }));
}
function patternRound(initial, config, trial) {
    let state = processAction({ ...structuredClone(initial), phase: 'deal_over', cash: 1e9,
        challengeRewards: [], challenges: [], rngState: streamSeed(config.seed, trial, 0) }, { type: 'deal' }).nextState;
    const policy = new RaisePlayPolicy(observeRaises(state));
    let draw = 0;
    for (let step = 0; step < 256; step++) {
        if (state.phase === 'scoring') return { ...settleRound(state), scoringState: state };
        const action = state.phase === 'playing' ? policy.choose(observeRaises(state)) : getValidActions(state)[0];
        if (!action) throw new Error('No legal action.');
        if (action.type === 'draw') state = { ...state, rngState: streamSeed(config.seed, trial, 0, ++draw) };
        if (action.type === 'resolve_dealer_turn') state = { ...state, rngState: streamSeed(config.seed, trial, 0, 10000) };
        state = processAction(state, action).nextState;
    }
    throw new Error('Action limit reached.');
}

const started = performance.now();
let checks = 0;
if (options.stacks) {
    if (options.bot === 'simple') throw new Error('Stack calibration supports score or patterns.');
    if (!options.stacks.length || options.stacks.some(value => !Number.isInteger(value) || value < 0 || value > 100)) throw new Error('Invalid stacks.');
    const current = { ...RAISE_BONUS_RANGES };
    const rows = [], samples = new Map();
    try {
        for (const [tuning, ranges] of Object.entries({ current, proposed })) {
            Object.assign(RAISE_BONUS_RANGES, ranges);
            for (const hand of patterns) for (const budget of options.stacks) {
                const payouts = [], applications = [];
                for (let trial = 0; trial < options.trials; trial++) {
                    const rng = new engine.SeededRNG(streamSeed(options.seed, trial, 0, 94));
                    const upgrades = {};
                    for (let n = 0; n < budget; n++) {
                        const stat = n % 2 ? 'multPercent' : 'cash';
                        let random = rng.next();
                        const value = rolls(ranges[hand].regular[stat]).find(roll => (random -= roll.probability) < 0).value;
                        const id = `raise_v10_0_simple_${hand}_${stat === 'cash' ? 'cash' : 'mult'}~${value}`;
                        if (!getRaise(id)) throw new Error(`Invalid stack roll: ${id}`);
                        upgrades[id] = (upgrades[id] ?? 0) + 1;
                    }
                    let state = engine.startRaiseRun(streamSeed(options.seed, trial, 0, 91));
                    state = processAction(state, { type: 'skip_pack' }).nextState;
                    state = processAction(state, { type: 'finish_pack' }).nextState;
                    state = processAction({ ...state, handUpgrades: upgrades, cash: 1e9, challenges: [],
                        rngState: streamSeed(options.seed, trial, 0, 93) }, { type: 'deal' }).nextState;
                    const result = engine.playRaiseRound(state, options.bot === 'patterns' ? 'patterns' : 'score').round;
                    payouts.push(result.payout); applications.push(result.rows[hand]);
                }
                const key = `${hand}/${budget}`;
                if (tuning === 'current') samples.set(key, payouts);
                rows.push({ tuning, hand, budget, payout: summarize(payouts), applications: summarize(applications),
                    ...(tuning === 'proposed' ? { pairedChange: summarize(payouts.map((value, index) => value - samples.get(key)[index])) } : {}) });
                process.stderr.write(`${tuning}/${hand}/${budget}: ${options.trials} independently rolled builds complete\n`);
            }
        }
    } finally { Object.assign(RAISE_BONUS_RANGES, current); }
    console.log(JSON.stringify({ kind: 'weighted-reward-stack-calibration', options, current, proposed, rows,
        description: 'Independent unlimited-cash rounds with random weighted Common Simple rolls. Equal card budgets split cash/mult. Policy adapts to each actual rolled build. No relics, deck upgrades, drawbacks or natural reward acquisition.',
        bundleHash: createHash('sha256').update(bundled.outputFiles[0].text).digest('hex'), elapsedMs: performance.now() - started }, null, 2));
    process.exit(0);
}
const contexts = options.presets.map(preset => {
    const config = { experiment: 'raises', trials: options.trials, seed: options.seed, preset,
        bot: options.bot === 'patterns' ? 'score' : options.bot, horizon: 1, relicIds: [], target: 'all' };
    engine.validateConfig(config);
    const initial = createLabState(config);
    const treatments = Object.entries({ current: RAISE_BONUS_RANGES, proposed }).flatMap(([tuning, ranges]) =>
        patterns.flatMap(hand => ['regular', 'strong'].flatMap(strength => ['cash', 'multPercent'].map(stat => ({
            tuning, hand, strength, stat, range: ranges[hand][strength][stat], values: rolls(ranges[hand][strength][stat]), deltas: [],
        })))));
    const baselines = [], counts = Object.fromEntries(patterns.map(hand => [hand, []]));
    for (let trial = 0; trial < options.trials; trial++) {
        const result = options.bot === 'patterns' ? patternRound(initial, config, trial) : playRound(initial, config, trial, 0);
        const { totalChips: chips, totalMult: mult, finalScore: baseline } = result.scoring;
        baselines.push(baseline);
        const triggers = Object.fromEntries(patterns.map(hand => [hand, result.state.playerHands.reduce((sum, player) =>
            sum + (player.finalScore?.criteria.filter(row => row.id === hand).reduce((total, row) => total + row.count, 0) ?? 0), 0)]));
        for (const hand of patterns) counts[hand].push(triggers[hand]);
        for (const treatment of treatments) {
            const delta = value => payout(chips + (treatment.stat === 'cash' ? value * triggers[treatment.hand] : 0),
                mult + (treatment.stat === 'multPercent' ? value * triggers[treatment.hand] / 100 : 0)) - baseline;
            treatment.deltas.push(treatment.values.reduce((sum, roll) => sum + roll.probability * delta(roll.value), 0));
            // Check the algebra against real score_round actions for all current
            // range endpoints in 100 rounds per context (2,400 checks/context).
            if (trial < 100 && treatment.tuning === 'current') for (const value of treatment.range) {
                const kind = treatment.strength === 'strong' ? 'double' : 'simple';
                const stat = treatment.stat === 'cash' ? 'cash' : 'mult';
                const id = `raise_v10_${kind === 'double' ? 1 : 0}_${kind}_${treatment.hand}_${stat}~${value}`;
                if (!getRaise(id)) throw new Error(`Invalid production reference: ${id}`);
                const handUpgrades = { ...result.scoringState.handUpgrades, [id]: (result.scoringState.handUpgrades[id] ?? 0) + 1 };
                const exact = settleRound({ ...result.scoringState, handUpgrades }).scoring.finalScore - baseline;
                if (exact !== delta(value)) throw new Error(`Production settlement mismatch: ${id}: ${exact} vs ${delta(value)}`);
                checks++;
            }
        }
    }
    process.stderr.write(`${preset}/${options.bot}: ${options.trials} paired rounds complete\n`);
    return { preset, baseline: summarize(baselines), applications: Object.fromEntries(patterns.map(hand => [hand, summarize(counts[hand])])),
        comparisons: treatments.map(({ deltas, values, ...treatment }) => ({ ...treatment,
            weightedMeanRoll: values.reduce((sum, roll) => sum + roll.probability * roll.value, 0), delta: summarize(deltas) })) };
});
console.log(JSON.stringify({ kind: 'reward-range-calibration', version: 1, options,
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    bundleHash: createHash('sha256').update(bundled.outputFiles[0].text).digest('hex'),
    dirty: !!execFileSync('git', ['status', '--porcelain', '--', 'src', 'scripts'], { encoding: 'utf8' }).trim(),
    description: 'Same-final-hands direct marginal payouts, no relics or deck changes. Each trial averages the full weighted roll distribution. Intervals measure round-sampling uncertainty, not roll variance or policy quality. Strong values are gross benefits before any Tradeoff drawback.',
    productionSettlementChecks: checks, elapsedMs: performance.now() - started, contexts }, null, 2));
