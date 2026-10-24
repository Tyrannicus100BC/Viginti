import { createInitialState, getValidActions, processAction } from '../engine/engine';
import type { GameState } from '../engine/GameState';
import type { PlayerAction } from '../engine/PlayerAction';
import { SeededRNG } from '../engine/rng';
import { TUTORIAL_STEPS } from '../engine/tutorial/definitions';
import { generateRaise, getRaise, type HandUpgrades, type RaiseHandTypeId } from '../logic/handScoring';
import { RAISE_BONUS_RANGES } from '../logic/upgradeTuning';
import { chooseAction, observe } from './bot';
import { summarize, streamSeed } from './runner';
import { BUILD_STRATEGIES, INITIAL_ROW_COUNTS, PATTERNS, RaisePlayPolicy, chooseRaiseOffer, observeRaises, payoutTable,
    type BuildStrategy, type Pattern, type RowCounts } from './raisePolicy';

export interface RaiseRunConfig {
    trials: number;
    seed: number;
    maxRounds: number;
    strategies: BuildStrategy[];
    play: 'score' | 'patterns';
}
export interface RaiseRound {
    round: number; anteNumber: number; ante: number; cash: number; payout: number; chips: number; mult: number;
    noRaisePayout: number; raises: number; rows: RowCounts; bustedPatterns: number;
    draws: number; drawsAbove17: number; decisions: string[];
}
export interface RaisePick { round: number; offers: string[]; chosen: string; description: string }
export interface RaiseRun {
    seed: number; stop: 'bankrupt' | 'horizon'; rounds: RaiseRound[]; picks: RaisePick[]; upgrades: HandUpgrades;
}

const blankCounts = (): RowCounts => ({ win: 0, viginti: 0, loss: 0, bust: 0, pair: 0, straight: 0, flush: 0 });
const countRaises = (upgrades: HandUpgrades) => Object.values(upgrades).reduce((a, b) => a + b, 0);

export function startRaiseRun(seed: number): GameState {
    return processAction(createInitialState(), { type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed,
        globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id) }).nextState;
}

/** Plays a real, already-dealt round. No RNG replacement or cash injection here. */
export function playRaiseRound(initial: GameState, play: RaiseRunConfig['play']): { state: GameState; round: RaiseRound } {
    let state = initial;
    const policy = play === 'patterns' ? new RaisePlayPolicy(observeRaises(state)) : null;
    let draws = 0, drawsAbove17 = 0;
    const decisions: string[] = [];
    for (let step = 0; step < 512; step++) {
        if (state.phase === 'scoring') {
            const noRaises = processAction({ ...state, handUpgrades: {} }, { type: 'score_round' });
            const result = processAction(state, { type: 'score_round' });
            const score = result.events.find(event => event.type === 'deal_scoring_complete');
            const baseScore = noRaises.events.find(event => event.type === 'deal_scoring_complete');
            if (!score || !baseScore || !Number.isFinite(score.finalScore)) throw new Error('Missing or invalid scoring result.');
            const rows = blankCounts(); let bustedPatterns = 0;
            for (const hand of result.nextState.playerHands) for (const row of hand.finalScore?.criteria ?? []) {
                if (row.id in rows) rows[row.id as RaiseHandTypeId]++;
                if (hand.outcome === 'bust' && PATTERNS.includes(row.id as Pattern)) bustedPatterns++;
            }
            return { state: result.nextState, round: {
                round: state.dealsTaken, anteNumber: state.challengeStage + 1, ante: state.ante, cash: result.nextState.cash,
                payout: score.finalScore, chips: score.totalChips, mult: score.totalMult, noRaisePayout: baseScore.finalScore,
                raises: countRaises(state.handUpgrades), rows, bustedPatterns, draws, drawsAbove17, decisions,
            } };
        }
        const legal = getValidActions(state);
        const action = state.phase === 'playing' ? policy ? policy.choose(observeRaises(state)) : chooseAction(observe(state), 'score') : legal[0];
        if (!action || !legal.some(candidate => JSON.stringify(candidate) === JSON.stringify(action))) throw new Error('Policy selected an illegal action.');
        if (action.type === 'draw') {
            draws++;
            if (state.playerHands.every(hand => hand.isBust || hand.isHeld || hand.blackjackValue >= 17)) drawsAbove17++;
        }
        if (action.type === 'place_card') {
            const card = state.drawnCards[state.selectedDrawIndex!]!;
            decisions.push(`${card.rank}/${card.suit} → ${action.handIndex}`);
        } else if (action.type === 'draw' || action.type === 'stand') decisions.push(action.type);
        const result = processAction(state, action);
        if (result.nextState === state) throw new Error('Round policy made no progress.');
        state = result.nextState;
    }
    throw new Error('512-action round limit reached; trial was not counted as a loss.');
}

export function runRaiseGame(config: RaiseRunConfig, strategy: BuildStrategy, trial: number): RaiseRun {
    const seed = streamSeed(config.seed, trial, 0, 91);
    const policyRng = new SeededRNG(streamSeed(config.seed, trial, 0, 92));
    let state = startRaiseRun(seed);
    const rounds: RaiseRound[] = [], picks: RaisePick[] = [];
    const counts = { ...INITIAL_ROW_COUNTS };
    for (let step = 0; step < config.maxRounds * 24 + 100; step++) {
        if (state.phase === 'game_over') return { seed, stop: 'bankrupt', rounds, picks, upgrades: state.handUpgrades };
        if (rounds.length >= config.maxRounds) return { seed, stop: 'horizon', rounds, picks, upgrades: state.handUpgrades };
        if (state.phase === 'playing') {
            const result = playRaiseRound(state, config.play);
            state = result.state; rounds.push(result.round);
            for (const id of Object.keys(counts) as RaiseHandTypeId[]) counts[id] = counts[id] * .7 + result.round.rows[id] * .3;
            continue;
        }
        const legal = getValidActions(state);
        let action: PlayerAction | undefined;
        if (state.phase === 'pack_choice') {
            const offers = [...state.pendingRaiseChoices, ...state.pendingPackChoices].filter(id => getRaise(id));
            const chosen = chooseRaiseOffer(offers, strategy, state.handUpgrades, counts, policyRng);
            if (chosen) {
                action = legal.find(candidate => candidate.type === 'choose_raise' && candidate.raiseId === chosen
                    || candidate.type === 'choose_pack_card' && candidate.cardId === chosen);
                picks.push({ round: rounds.length, offers, chosen, description: getRaise(chosen)!.description });
            } else action = legal.find(candidate => candidate.type === 'skip_pack') ?? legal.find(candidate => candidate.type === 'finish_pack')
                ?? legal.find(candidate => candidate.type === 'open_pack');
        } else action = legal[0];
        if (!action) throw new Error(`No legal progression action: ${state.phase}`);
        const result = processAction(state, action);
        if (result.nextState === state) throw new Error('Progression made no progress.');
        state = result.nextState;
    }
    throw new Error('Progression action limit reached; trial was not counted as a loss.');
}

export function validateRaiseRuns(config: RaiseRunConfig) {
    if (!Number.isInteger(config.trials) || config.trials < 1 || config.trials > 10000) throw new Error('Trials must be 1–10,000.');
    if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff) throw new Error('Seed must be an unsigned 32-bit integer.');
    if (!Number.isInteger(config.maxRounds) || config.maxRounds < 1 || config.maxRounds > 400) throw new Error('Max rounds must be 1–400.');
    if (!['score', 'patterns'].includes(config.play)) throw new Error('Play must be score or patterns.');
    if (!config.strategies.length || new Set(config.strategies).size !== config.strategies.length || config.strategies.some(strategy => !BUILD_STRATEGIES.includes(strategy))) throw new Error('Choose distinct known strategies.');
}

export function summarizeRaiseRuns(runs: RaiseRun[]) {
    const allRounds = runs.flatMap(run => run.rounds);
    const anteNumbers = [...new Set(allRounds.map(round => round.anteNumber))].sort((a, b) => a - b);
    const ordered = [...runs].sort((a, b) => a.rounds.length - b.rounds.length || a.rounds.reduce((sum, row) => sum + row.payout, 0) - b.rounds.reduce((sum, row) => sum + row.payout, 0));
    return {
        bankrupt: runs.filter(run => run.stop === 'bankrupt').length, horizon: runs.filter(run => run.stop === 'horizon').length,
        rounds: summarize(runs.map(run => run.rounds.length)),
        byAnte: anteNumbers.map(ante => {
            const rows = allRounds.filter(round => round.anteNumber === ante);
            return { anteNumber: ante, ante: rows[0].ante, runs: runs.filter(run => run.rounds.some(round => round.anteNumber === ante)).length,
                meanPayout: summarize(rows.map(row => row.payout)).mean,
                payoutRatio: summarize(rows.map(row => row.payout / row.ante)), cashAntes: summarize(rows.map(row => row.cash / row.ante)),
                meanRaises: summarize(rows.map(row => row.raises)).mean,
                meanChips: summarize(rows.map(row => row.chips)).mean, meanMult: summarize(rows.map(row => row.mult)).mean,
                noRaisePayout: summarize(rows.map(row => row.noRaisePayout)).mean,
                meanPatterns: Object.fromEntries(PATTERNS.map(id => [id, summarize(rows.map(row => row.rows[id])).mean])),
                meanBustedPatterns: summarize(rows.map(row => row.bustedPatterns)).mean,
                meanDrawsAbove17: summarize(rows.map(row => row.drawsAbove17)).mean };
        }),
        examples: { shortest: ordered[0], median: ordered[Math.floor(ordered.length / 2)], longest: ordered.at(-1)! },
    };
}

export function runRaiseExperiment(config: RaiseRunConfig, progress?: (strategy: string, trial: number) => void) {
    validateRaiseRuns(config);
    const started = performance.now();
    return { kind: 'raise-runs', version: 1, config, createdAt: new Date().toISOString(), isolation: 'Only real offered Raises are acquired. No relics, deck upgrades, challenge packs, or table actions.',
        policies: config.strategies.map(strategy => {
            const runs = Array.from({ length: config.trials }, (_, trial) => {
                const result = runRaiseGame(config, strategy, trial); progress?.(strategy, trial + 1); return result;
            });
            return { strategy, ...summarizeRaiseRuns(runs) };
        }), get elapsedMs() { return performance.now() - started; } };
}

/** Controlled synthetic builds: same total Raise count for each specialization.
 * Current Common Simple / Uncommon Double rolls, not naturally acquired runs.
 */
export function syntheticStack(focus: Exclude<BuildStrategy, 'adaptive' | 'random'>, totalRaises: number, rarity: 'Common' | 'Uncommon' = 'Common'): HandUpgrades {
    if (!Number.isInteger(totalRaises) || totalRaises < 0 || totalRaises > 100) throw new Error('Stack budget must be an integer from 0–100.');
    const patterns: Pattern[] = focus === 'pair-straight' ? ['pair', 'straight'] : [focus];
    const ids = (['cash', 'mult'] as const).flatMap(stat => patterns.map(id => {
        const range = RAISE_BONUS_RANGES[id][rarity === 'Common' ? 'regular' : 'strong'][stat === 'cash' ? 'cash' : 'multPercent'];
        const midpoint = Math.floor((range[0] + range[1]) / 2);
        const rng = new SeededRNG(718);
        // Obtain an actual current rolled card instead of constructing a versioned
        // ID. No-drawback Uncommon Double cards expose strong affix accumulation.
        for (let attempt = 0; attempt < 4096; attempt++) {
            const raise = generateRaise(rng, rarity), effect = raise.modifiers[0];
            if (raise.modifiers.length === 1 && effect.handTypeId === id
                && Math.abs((stat === 'cash' ? effect.chips : effect.mult * 100) - midpoint) < 1e-8) return raise.id;
        }
        throw new Error(`No ${rarity} ${id}/${stat} midpoint roll found.`);
    }));
    const result: Record<string, number> = {};
    for (let i = 0; i < totalRaises; i++) { const id = ids[i % ids.length]; result[id] = (result[id] ?? 0) + 1; }
    return result;
}

export function runStackSweep(config: RaiseRunConfig, stacks: number[], progress?: (strategy: string, trial: number) => void, rarity: 'Common' | 'Uncommon' = 'Common') {
    validateRaiseRuns(config);
    if (!stacks.length || stacks.some(n => !Number.isInteger(n) || n < 0 || n > 100)) throw new Error('Stacks must be integers from 0–100.');
    const focuses = config.strategies.filter((strategy): strategy is Exclude<BuildStrategy, 'adaptive' | 'random'> => strategy !== 'random' && strategy !== 'adaptive');
    if (!focuses.length) throw new Error('Choose pair, straight, flush, or pair-straight for the synthetic sweep.');
    if (!['Common', 'Uncommon'].includes(rarity)) throw new Error('Sweep rarity must be Common or Uncommon.');
    return { kind: 'raise-stack-sweep', version: 1, config, synthetic: true, rarity,
        description: 'Independent, unlimited-cash rounds with synthetic current no-drawback Raises. Not survival or obtainable-build statistics.',
        rows: focuses.flatMap(strategy => stacks.map(totalRaises => {
            const upgrades = syntheticStack(strategy, totalRaises, rarity);
            const rounds = Array.from({ length: config.trials }, (_, trial) => {
                let state = startRaiseRun(streamSeed(config.seed, trial, 0, 91));
                state = processAction(state, { type: 'skip_pack' }).nextState;
                state = processAction(state, { type: 'finish_pack' }).nextState;
                state = processAction({ ...state, handUpgrades: upgrades, cash: 1e9, challenges: [],
                    rngState: streamSeed(config.seed, trial, 0, 93) }, { type: 'deal' }).nextState;
                const result = playRaiseRound(state, config.play).round; progress?.(`${strategy}/${totalRaises}`, trial + 1); return result;
            });
            return { strategy, totalRaises, upgrades, payouts: payoutTable(upgrades),
                payout: summarize(rounds.map(row => row.payout)), chips: summarize(rounds.map(row => row.chips)).mean,
                mult: summarize(rounds.map(row => row.mult)).mean,
                patterns: Object.fromEntries(PATTERNS.map(id => [id, summarize(rounds.map(row => row.rows[id])).mean])),
                bustedPatterns: summarize(rounds.map(row => row.bustedPatterns)).mean,
                drawsAbove17: summarize(rounds.map(row => row.drawsAbove17)).mean };
        })) };
}
