import { describe, expect, it } from 'vitest';
import { processAction } from '../../engine/engine';
import { getBlackjackScore } from '../../logic/scoring';
import type { Card } from '../../types';
import { chooseAction, observe } from '../bot';
import { DEFAULT_CONFIG, type LabConfig } from '../model';
import { createLabState, currentRaiseTarget, getTreatments, playRound, raiseId, runExperiment, settleRound, streamSeed, summarize, validateConfig } from '../runner';
import { getHandPayout, getRaise } from '../../logic/handScoring';

const config = (extra: Partial<LabConfig> = {}): LabConfig => ({ ...DEFAULT_CONFIG, trials: 20, relicIds: [], ...extra });
function run(options: LabConfig) {
    const job = runExperiment(options);
    let step = job.next();
    while (!step.done) step = job.next();
    return step.value;
}

describe('Balance Lab', () => {
    it('produces the same statistics and example hands regardless of earlier jobs', () => {
        const first = run(config());
        run(config({ seed: 923, bot: 'simple' }));
        const second = run(config());
        expect(second.comparisons).toEqual(first.comparisons);
        expect(second.baseline).toEqual(first.baseline);
        expect(second.meanChips).toBe(first.meanChips);
        expect(second.roundsPlayed).toBe(20);
    });

    it('settles the exact shared round pot and isolates cash / multiplier Raises', () => {
        const initial = createLabState(config());
        const cards: Card[] = [{ id: 'nine-1', rank: '9', suit: 'hearts', isFaceUp: true }, { id: 'nine-2', rank: '9', suit: 'spades', isFaceUp: true }];
        const state = { ...initial, phase: 'scoring' as const, runningSummary: { chips: 0, mult: 1 },
            playerHands: [{ id: 0, cards, blackjackValue: 18, isHeld: true, isBust: false, outcome: 'win' as const }] };
        const original = structuredClone(state);
        const base = settleRound(state);
        const cash = settleRound({ ...state, handUpgrades: { [raiseId('pair', 'cash')]: 1 } });
        const mult = settleRound({ ...state, handUpgrades: { [raiseId('pair', 'mult')]: 1 } });
        expect(base.scoring).toMatchObject({ totalChips: 33, totalMult: 1.05, finalScore: 34 });
        expect(cash.scoring.finalScore).toBe(38); // +$4 Pair unit
        expect(mult.scoring.finalScore).toBe(35); // +3 percentage point Pair unit
        expect(state).toEqual(original);
    });

    it('keeps reference builds fixed while measuring current upgrade units', () => {
        const balanced = createLabState(config({ preset: 'balanced' }));
        for (const hand of ['win', 'loss', 'pair', 'straight', 'flush'] as const) {
            const before = getHandPayout(hand);
            const payout = getHandPayout(hand, balanced.handUpgrades);
            expect(payout.chips - before.chips).toBe(5);
            expect(payout.mult - before.mult).toBeCloseTo(.05);
        }
        const treatment = getTreatments('raises').find(item => item.category === 'flush' && item.stat === 'mult')!;
        expect(treatment.name).toBe('Flush +2 pp');
        expect(getHandPayout('flush', treatment.apply(balanced).handUpgrades).mult).toBe(.07);
        expect(getRaise(raiseId('flush', 'cash'))?.chips).toBe(3);
    });

    it('reruns a saved single-target experiment against the corresponding calibrated unit', () => {
        const legacy = 'raise_v3_0_simple_flush_mult';
        expect(currentRaiseTarget(legacy)).toBe(raiseId('flush', 'mult'));
        const report = run(config({ target: legacy }));
        expect(report.comparisons).toHaveLength(1);
        expect(report.comparisons[0].name).toBe('Flush +2 pp');
        const lossReport = run(config({ target: 'raise_v4_0_simple_loss_cash' }));
        expect(lossReport.comparisons).toHaveLength(1);
        expect(lossReport.comparisons[0].name).toBe('Lose +$3');
    });

    it('never exposes hidden cards or RNG state to the policy', () => {
        let state = createLabState(config());
        state = processAction(state, { type: 'deal' }).nextState;
        state = processAction(state, { type: 'draw' }).nextState;
        const changed = { ...state, rngState: state.rngState + 123456,
            dealer: { ...state.dealer, cards: state.dealer.cards.map(card => card.isFaceUp ? card : { ...card, rank: 'A' as const, suit: 'clubs' as const }) } };
        expect(observe(state)).not.toHaveProperty('rngState');
        expect(observe(state).dealerCards.every(card => card.isFaceUp)).toBe(true);
        expect(observe(changed)).toEqual(observe(state));
        expect(chooseAction(observe(changed), 'score')).toEqual(chooseAction(observe(state), 'score'));
    });

    it('uses visible information from Spyglass, without leaking an unrelated hidden card', () => {
        const state = createLabState(config());
        const revealed = { ...state, dealer: { ...state.dealer, cards: [
            { id: 'king', rank: 'K' as const, suit: 'clubs' as const, isFaceUp: true },
            { id: 'queen', rank: 'Q' as const, suit: 'clubs' as const, isFaceUp: true },
        ] } };
        expect(observe(revealed).dealerCards).toHaveLength(2);
    });

    it('keeps the caller’s starting build intact and captures the fully resolved dealer', () => {
        const options = config({ relicIds: ['faded_bill'] });
        const initial = createLabState(options); const before = structuredClone(initial);
        const result = playRound(initial, options, 0, 0);
        expect(initial).toEqual(before);
        expect(result.view.dealer).toHaveLength(result.scoringState.dealer.cards.length);
        expect(getBlackjackScore(result.view.dealer, [], true)).toBeGreaterThanOrEqual(17);
        expect(result.view.hands.some(hand => hand.cards.length)).toBe(true);
    });

    it('carries decay across a sequence rather than refreshing the relic each round', () => {
        const report = run(config({ experiment: 'relics', target: 'faded_bill', horizon: 10, bot: 'simple' }));
        const example = report.comparisons[0].examples.first;
        // This bot makes the same decisions with and without a chip-only relic.
        expect(example.treatment.slice(5).map(round => round.payout)).toEqual(example.baseline.slice(5).map(round => round.payout));
        expect(report.roundsPlayed).toBe(20 * 10 * 2);
        expect(report.baseline.count).toBe(20);
        expect(report.comparisons[0].delta.count).toBe(20);
    });

    it.each(['relics', 'deck'] as const)('runs every %s treatment through real engine actions', experiment => {
        const report = run(config({ experiment, trials: 10, horizon: 1 }));
        expect(report.comparisons).toHaveLength(getTreatments(experiment).length);
        for (const row of report.comparisons) {
            expect(Number.isFinite(row.delta.mean)).toBe(true);
            expect(row.payout.histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(10);
            expect(row.examples.first.treatment[0].payout).toBeTypeOf('number');
        }
    });

    it('reports actual signed paired deltas, including null effects', () => {
        const report = run(config({ target: raiseId('pair', 'cash') }));
        const row = report.comparisons[0];
        expect(row.payout.mean - report.baseline.mean).toBeCloseTo(row.delta.mean);
        expect(row.triggerRate).toBeGreaterThanOrEqual(0);
        expect(row.examples.best.delta).toBeGreaterThanOrEqual(row.examples.worst.delta);
        expect(row.delta.histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(20);
    });

    it('reports uncertainty across trials, including constant and negative distributions', () => {
        const constant = summarize([5, 5, 5]);
        expect(constant).toMatchObject({ mean: 5, median: 5, ci95: 0 });
        expect(constant.histogram[0].count).toBe(3);
        expect(summarize([-10, 0, 10])).toMatchObject({ mean: 0, median: 0, min: -10, max: 10 });
        expect(summarize([-10, 0, 10]).ci95).toBeCloseTo(1.96 * 10 / Math.sqrt(3));
    });

    it('does not accept an impossible or ambiguous experiment', () => {
        expect(() => validateConfig(config({ trials: 0 }))).toThrow();
        expect(() => validateConfig(config({ seed: NaN }))).toThrow();
        expect(() => validateConfig(config({ relicIds: ['redraw'] }))).toThrow();
        expect(() => validateConfig(config({ experiment: 'relics', relicIds: ['mini_shoe'], target: 'mini_shoe' }))).toThrow();
    });

    it('separates trials, rounds, and draw streams deterministically', () => {
        const values = [streamSeed(42, 0, 0), streamSeed(42, 1, 0), streamSeed(42, 0, 1), streamSeed(42, 0, 0, 1)];
        expect(new Set(values).size).toBe(4);
        expect(streamSeed(42, 0, 0)).toBe(values[0]);
    });
});
