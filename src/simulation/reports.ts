import type { LabConfig, LabReport } from './model';
import { validateConfig } from './runner';

// Imports are data, never executable snapshots. Bound the retained graph before
// rendering an external file; large raw sample arrays are not part of this format.
export function parseReport(text: string): LabReport {
    const fail = () => { throw new Error('This file is not a supported Balance Lab report. Export a full JSON report from the lab or headless simulator.'); };
    const object = (value: unknown): Record<string, unknown> => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
        return value as Record<string, unknown>;
    };
    const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
    const array = (value: unknown, max: number): unknown[] => { if (!Array.isArray(value) || value.length > max) return fail(); return value; };
    const distribution = (value: unknown) => {
        const item = object(value);
        if (!['count', 'mean', 'median', 'p10', 'p90', 'min', 'max', 'ci95'].every(key => finite(item[key])) || Number(item.count) < 1 || Number(item.ci95) < 0) fail();
        const bins = array(item.histogram, 20);
        if (!bins.length || !bins.every(value => { const bin = object(value); return finite(bin.low) && finite(bin.high) && finite(bin.count) && Number(bin.count) >= 0; })) fail();
    };
    const cards = (value: unknown) => array(value, 256).forEach(value => {
        const card = object(value);
        if (typeof card.id !== 'string' || !['hearts', 'diamonds', 'clubs', 'spades'].includes(String(card.suit)) || typeof card.rank !== 'string') fail();
        if (card.type !== undefined && !['standard', 'chip', 'mult', 'score'].includes(String(card.type))) fail();
        if (card.chips !== undefined && !finite(card.chips) || card.mult !== undefined && !finite(card.mult)) fail();
    });
    const rounds = (value: unknown) => {
        const values = array(value, 20); if (!values.length) fail();
        values.forEach(value => {
            const round = object(value);
            if (!['seed', 'round', 'chips', 'mult', 'payout'].every(key => finite(round[key]))) fail();
            cards(round.dealer);
            array(round.hands, 3).forEach(value => {
                const hand = object(value); cards(hand.cards);
                if (!finite(hand.value) || typeof hand.outcome !== 'string') fail();
                array(hand.criteria, 512).forEach(value => {
                    const criterion = object(value);
                    if (typeof criterion.name !== 'string' || !finite(criterion.chips) || !finite(criterion.mult)) fail();
                });
            });
            if (!array(round.decisions, 256).every(value => typeof value === 'string')) fail();
        });
        return values.length;
    };
    try {
        const report = object(JSON.parse(text));
        if (report.version !== 1 || typeof report.createdAt !== 'string' || !finite(report.elapsedMs) || !finite(report.roundsPlayed) || !finite(report.meanChips) || !finite(report.meanMult) || !finite(report.bustRate)) fail();
        const config = object(report.config);
        array(config.relicIds, 6); validateConfig(config as unknown as LabConfig);
        distribution(report.baseline);
        const rows = array(report.comparisons, 64); if (!rows.length) fail();
        const ids = new Set<string>();
        rows.forEach(value => {
            const row = object(value);
            if (typeof row.id !== 'string' || ids.has(row.id) || typeof row.name !== 'string' || typeof row.description !== 'string' || !finite(row.betterRate)) fail();
            ids.add(String(row.id));
            if (row.triggerRate !== null && !finite(row.triggerRate) || row.perTrigger !== null && !finite(row.perTrigger)) fail();
            distribution(row.payout); distribution(row.delta);
            const examples = object(row.examples);
            for (const key of ['first', 'best', 'worst']) {
                const example = object(examples[key]);
                if (!finite(example.trial) || !finite(example.delta) || rounds(example.baseline) !== rounds(example.treatment)) fail();
            }
        });
        return report as unknown as LabReport;
    } catch { return fail(); }
}
