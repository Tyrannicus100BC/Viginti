#!/usr/bin/env node
// Finite headless entry point. Uses the same runner as the Balance Lab worker.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(`Viginti balance experiments

npm run --silent simulate -- [options] > report.json

--experiment raises|relics|deck  (default: raises)
--trials 1000                  Independent trials, up to 100000
--seed 42                      Unsigned 32-bit seed
--preset fresh|chips|mult|balanced|pairs
--bot score|simple
--horizon 5                    Rounds per relic/deck trial, up to 20
--relics mini_shoe,cozy_socks   Shared starting passive relics
--target all                   One upgrade ID or all available
--summary                      Print a compact summary instead of the full report

Uses production settlement. Does not start a server or change tuning.`);
    process.exit(0);
}
const config = { experiment: 'raises', trials: 1000, seed: 42, preset: 'fresh', bot: 'score', horizon: 5, relicIds: [], target: 'all' };
const flags = { '--experiment': 'experiment', '--trials': 'trials', '--seed': 'seed', '--preset': 'preset', '--bot': 'bot', '--horizon': 'horizon', '--target': 'target', '--relics': 'relicIds' };
let summary = false;
try {
    for (let index = 0; index < args.length; index++) {
        if (args[index] === '--summary') { summary = true; continue; }
        const key = flags[args[index]];
        if (!key) throw new Error(`Unknown argument: ${args[index]}`);
        const value = args[++index];
        if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${args[index - 1]}`);
        config[key] = key === 'relicIds' ? value.split(',').filter(Boolean) : ['trials', 'seed', 'horizon'].includes(key) ? Number(value) : value;
    }
    const bundled = await build({ stdin: { contents: "export { runExperiment } from './src/simulation/runner.ts';",
        resolveDir: fileURLToPath(new URL('../', import.meta.url)), sourcefile: 'balance-cli.ts' }, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22' });
    const { runExperiment } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
    const experiment = runExperiment(config);
    let result = experiment.next();
    let lastPercent = -1;
    while (!result.done) {
        const percent = Math.floor(result.value.completed / result.value.total * 100);
        if (process.stderr.isTTY && percent !== lastPercent) { process.stderr.write(`\rSimulating: ${percent}%`); lastPercent = percent; }
        result = experiment.next();
    }
    if (process.stderr.isTTY) process.stderr.write('\n');
    const report = result.value;
    console.log(JSON.stringify(summary ? { config: report.config, elapsedMs: report.elapsedMs, roundsPlayed: report.roundsPlayed, baselineMean: report.baseline.mean,
        comparisons: report.comparisons.map(row => ({ name: row.name, delta: row.delta.mean, ci95: row.delta.ci95 })) } : report, null, 2));
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
