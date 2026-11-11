import { describe, expect, it } from 'vitest';
import type { Card, Rank, ScoringDetail } from '../../types';
import { evaluateHandScore } from '../scoring';
import { RelicManager } from '../relics/manager';

const cards = (ranks: Rank[]): Card[] => ranks.map((rank, index) => ({ id: `card-${index}`, rank, suit: 'hearts' }));
const relic = (id: string, state = {}) => ({ id, state: { ...RelicManager.getRelicConfig(id)?.properties, ...state } });
function expectReconciled(row: ScoringDetail) {
    expect(row.breakdown, row.name).toBeDefined();
    expect(row.breakdown!.reduce((sum, entry) => sum + entry.chips, 0), row.name).toBeCloseTo(row.chips, 8);
    expect(row.breakdown!.reduce((sum, entry) => sum + entry.multiplier, 0), row.name).toBeCloseTo(row.multiplier, 8);
}

describe('recorded score breakdowns', () => {
    it('counts card values once while preserving three base and Raise payouts', () => {
        const row = evaluateHandScore(cards(['3', '3', '3']), false, false, [], 0, undefined, 'push', { raise_pair_combo: 1 })
            .criteria.find(row => row.id === 'pair')!;
        expect(row).toMatchObject({ count: 3, chips: 84, multiplier: expect.closeTo(0.9) });
        expect(row.breakdown?.filter(entry => entry.label === 'Card sum').reduce((sum, entry) => sum + entry.chips, 0)).toBe(9);
        expect(row.breakdown?.filter(entry => entry.label === 'Base Pair').reduce((sum, entry) => sum + entry.chips, 0)).toBe(15);
        expectReconciled(row);
    });

    it('scores the three sevens from the reported bust as $40 and 15%', () => {
        const hand = cards(['7', '7', 'A', '2', '7']);
        hand.forEach((card, index) => { card.suit = (['hearts', 'clubs', 'spades', 'diamonds', 'diamonds'] as const)[index]; });
        hand[0].specialEffect = { type: 'chip', value: 4 };
        const score = evaluateHandScore(hand, false, false, [], 0, undefined, 'bust');
        const pair = score.criteria.find(row => row.id === 'pair')!;
        expect(pair).toMatchObject({ count: 3, chips: 40, multiplier: expect.closeTo(0.15),
            cardIds: [hand[0].id, hand[1].id, hand[4].id] });
        expect(pair.breakdown?.filter(entry => entry.label === 'Card sum').reduce((sum, entry) => sum + entry.chips, 0)).toBe(21);
        expect(pair.breakdown?.filter(entry => entry.label.endsWith('card bonus'))).toEqual([
            { label: '7♥ card bonus', chips: 4, multiplier: 0 },
        ]);
        score.criteria.forEach(expectReconciled);
    });

    it('records both relics modifying the same outcome row', () => {
        const row = evaluateHandScore(cards(['K', '4']), true, false, [relic('heart_button'), relic('lucky_acorn')])
            .criteria.find(row => row.id === 'win')!;
        expect(row.breakdown?.filter(entry => entry.sourceRelicId)).toEqual([
            { label: 'Heart Button', sourceRelicId: 'heart_button', chips: 0, multiplier: 0.05 },
            { label: 'Lucky Acorn', sourceRelicId: 'lucky_acorn', chips: 0, multiplier: 0.1 },
        ]);
        expectReconciled(row);
    });

    it('captures the earned Climbing Vine bonus before the relic grows again', () => {
        const vine = relic('climbing_vine', { bonus_chips: 10 });
        const row = evaluateHandScore(cards(['2', '3', '4']), true, false, [vine]).criteria.find(row => row.id === 'straight')!;
        vine.state.bonus_chips = 100;
        expect(row.breakdown?.find(entry => entry.sourceRelicId === 'climbing_vine')).toMatchObject({ chips: 15 });
        expect(row.chips).toBe(44);
        expectReconciled(row);
    });

    it('itemizes special-card cash and multiplier within every qualifying row', () => {
        const hand = cards(['9', '8']);
        hand[0].specialEffect = { type: 'chip', value: 7 };
        hand[1].specialEffect = { type: 'mult', value: 0.04 };
        const score = evaluateHandScore(hand, true);
        for (const row of score.criteria) {
            expect(row.breakdown).toEqual(expect.arrayContaining([
                { label: '9♥ card bonus', chips: 7, multiplier: 0 },
                { label: '8♥ card bonus', chips: 0, multiplier: 0.04 },
            ]));
            expectReconciled(row);
        }
        expect(score.criteria.map(row => row.id)).toEqual(['win', 'flush', 'straight']);
    });

    it.each(RelicManager.getAllRelics().filter(config => config.hooks.onEvaluateHandScore).map(config => config.id))(
        'reconciles every row with %s, including outcome penalties and Raise drawbacks', id => {
            for (const ranks of [['A', 'K'], ['3', '3', '3', '4', '5'], ['6', '7', '8'], ['K', 'Q', '9']] as Rank[][]) {
                for (const isWin of [true, false]) {
                    const hand = cards(ranks);
                    hand[0].specialEffect = { type: 'chip', value: 7 };
                    hand[1].specialEffect = { type: 'mult', value: 0.04 };
                    const score = evaluateHandScore(hand, isWin, true, [relic(id)], 0, undefined, isWin ? 'win' : 'loss', {
                        raise_pair_combo: 2, raise_v3_0_tradeoff_win_cash_straight_mult: 1,
                    });
                    score.criteria.forEach(expectReconciled);
                }
            }
        });
});
