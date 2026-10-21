import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../model';
import { runExperiment } from '../runner';
import { parseReport } from '../reports';

describe('Balance Lab report import', () => {
    const job = runExperiment({ ...DEFAULT_CONFIG, trials: 10, bot: 'simple' });
    let step = job.next(); while (!step.done) step = job.next();
    const report = step.value;

    it('loads the complete runner output without changing statistics or examples', () => {
        expect(parseReport(JSON.stringify(report))).toEqual(report);
    });
    it('rejects compact CLI summaries and malformed retained examples', () => {
        expect(() => parseReport(JSON.stringify({ config: report.config, baselineMean: 50 }))).toThrow('supported Balance Lab report');
        const broken = structuredClone(report);
        broken.comparisons[0].examples.first.treatment = [];
        expect(() => parseReport(JSON.stringify(broken))).toThrow('supported Balance Lab report');
    });
    it.each(['raise_v3_0_simple_flush_mult', 'raise_v4_0_simple_loss_mult'])('retains the labels and measurements in earlier report %s', target => {
        const earlier = structuredClone(report);
        earlier.config.target = target;
        earlier.comparisons = [{ ...earlier.comparisons[0], id: target, name: target.includes('loss') ? 'Lose +6 pp' : 'Flush +5 pp', category: target.includes('loss') ? 'loss' : 'flush', stat: 'mult' }];
        expect(parseReport(JSON.stringify(earlier))).toEqual(earlier);
    });
    it('rejects invalid statistics and version mismatches before rendering', () => {
        expect(() => parseReport(JSON.stringify({ ...report, version: 12 }))).toThrow();
        expect(() => parseReport(JSON.stringify({ ...report, baseline: { ...report.baseline, ci95: null } }))).toThrow();
        expect(() => parseReport('not json')).toThrow();
    });
});
