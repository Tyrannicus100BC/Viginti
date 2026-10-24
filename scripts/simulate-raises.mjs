#!/usr/bin/env node
// Finite experiments through the production engine. No server or tuning changes.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(`Raise-focused progression experiments

npm run --silent simulate:raises -- [options]
--trials 100                Games per strategy (sweep: independent rounds)
--seed 42                  Reproducible game and separate policy streams
--max-rounds 80            Survival horizon, not a victory condition
--strategies random,pair,straight,flush,pair-straight,adaptive
--play patterns|score      Pattern-aware play or old score-aware control
--sweep 0,4,8,16,32        Synthetic equal-budget Common Raise stacks
--sweep-rarity Common|Uncommon  Simple Common or strong Uncommon Double cards
--summary                  Compact results; omit for distributions and example runs

Natural runs choose only real offered Raises; all other rewards are skipped.
Pattern play integrates public dealer/draw probabilities, can draw beyond 17,
and values the actual shared chip/mult pot including every Raise drawback.
The sweep gives synthetic stacks and unlimited cash; it does not test survival.`);
    process.exit(0);
}
try {
    const config = { trials: 100, seed: 42, maxRounds: 80, strategies: ['random', 'pair', 'straight', 'flush', 'pair-straight', 'adaptive'], play: 'patterns' };
    const flags = { '--trials': 'trials', '--seed': 'seed', '--max-rounds': 'maxRounds', '--strategies': 'strategies', '--play': 'play' };
    let summary = false, stacks, rarity = 'Common';
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--summary') { summary = true; continue; }
        const flag = args[i], value = args[++i];
        if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
        if (flag === '--sweep') { stacks = value.split(',').map(Number); continue; }
        if (flag === '--sweep-rarity') { rarity = value; continue; }
        const key = flags[flag]; if (!key) throw new Error(`Unknown flag: ${flag}`);
        config[key] = key === 'strategies' ? value.split(',') : key === 'play' ? value : Number(value);
    }
    const bundled = await build({ stdin: { contents: "export { runRaiseExperiment, runStackSweep } from './src/simulation/raiseRuns.ts';",
        resolveDir: fileURLToPath(new URL('../', import.meta.url)), sourcefile: 'raise-experiment.ts' }, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22' });
    const runner = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
    const progress = (strategy, trial) => { if (process.stderr.isTTY && (trial % 10 === 0 || trial === config.trials)) process.stderr.write(`\r${strategy}: ${trial}/${config.trials}             `); };
    const report = stacks ? runner.runStackSweep(config, stacks, progress, rarity) : runner.runRaiseExperiment(config, progress);
    if (process.stderr.isTTY) process.stderr.write('\n');
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    // Unrelated LFS media must not require Git writes just to report provenance.
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src/engine', 'src/logic', 'src/simulation',
        'scripts/simulate-raises.mjs', 'package.json'], { encoding: 'utf8' }).trim();
    const result = summary && stacks ? { ...report, rows: report.rows.map(row => ({
        strategy: row.strategy, raises: row.totalRaises, mean: row.payout.mean, ci95: row.payout.ci95,
        median: row.payout.median, p90: row.payout.p90, max: row.payout.max, chips: row.chips, mult: row.mult,
        patterns: row.patterns, bustedPatterns: row.bustedPatterns, drawsAbove17: row.drawsAbove17,
    })) } : summary ? { ...report, policies: report.policies.map(policy => ({
        strategy: policy.strategy, bankrupt: policy.bankrupt, horizon: policy.horizon,
        rounds: { mean: policy.rounds.mean, median: policy.rounds.median, p90: policy.rounds.p90, max: policy.rounds.max },
        byAnte: policy.byAnte.map(row => ({ ante: row.anteNumber, cost: row.ante, runs: row.runs, meanPayout: row.meanPayout,
            medianPayoutRatio: row.payoutRatio.median, medianCashAntes: row.cashAntes.median, meanRaises: row.meanRaises,
            meanPatterns: row.meanPatterns, meanBustedPatterns: row.meanBustedPatterns, meanDrawsAbove17: row.meanDrawsAbove17 })),
    })) } : report;
    const bundleHash = createHash('sha256').update(bundled.outputFiles[0].text).digest('hex');
    console.log(JSON.stringify({ ...result, revision, dirty: Boolean(dirty), bundleHash,
        ...(!summary ? { workingChanges: dirty.split('\n').filter(Boolean) } : {}) }, null, 2));
} catch (error) {
    console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1;
}
