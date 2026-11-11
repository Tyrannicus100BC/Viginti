import { describe, expect, it } from 'vitest';
import { createInitialState, processAction } from '../engine';
import type { Card, Rank } from '../../types';
import type { GameState } from '../GameState';

const cards = (ranks: Rank[]): Card[] => ranks.map((rank, i) => ({
    id: `card-${i}`, rank, suit: 'hearts', isFaceUp: true,
    specialEffect: i === 0 ? { type: 'chip', value: 7 } : i === 1 ? { type: 'mult', value: 0.04 } : undefined,
}));

describe('special-card scoring events', () => {
    it.each(['win', 'loss', 'push', 'bust'] as const)('settles integrated bonuses exactly once on %s', outcome => {
        const hand = cards(outcome === 'bust' ? ['9', '9', '9'] : ['3', '3', '4']);
        const state: GameState = { ...createInitialState(), phase: 'scoring',
            runningSummary: { chips: 0, mult: 1 },
            playerHands: [{ id: 0, cards: hand, isHeld: true, isBust: outcome === 'bust',
                blackjackValue: outcome === 'bust' ? 27 : 10, outcome, resultRevealed: true }],
        };
        const { nextState, events } = processAction(state, { type: 'score_round' });
        const score = nextState.playerHands[0].finalScore!;
        const rows = events.filter(event => event.type === 'scoring_row_intro').map(event => event.criterion);
        expect(rows.map(row => row.id)).toEqual(score.criteria.map(row => row.id));
        expect(rows.some(row => row.id === 'special_cards')).toBe(false);
        const chipEvents = events.filter(event => event.type === 'scoring_row_chips');
        const multEvents = events.filter(event => event.type === 'scoring_row_mult');
        for (const row of score.criteria) {
            expect(chipEvents.filter(event => event.criterionId === row.id).reduce((sum, event) => sum + event.chips, 0)).toBeCloseTo(row.chips);
            expect(multEvents.filter(event => event.criterionId === row.id).reduce((sum, event) => sum + event.multiplier, 0)).toBeCloseTo(row.multiplier);
        }
        const summary = events.filter(event => event.type === 'summary_update').at(-1)!;
        expect(summary.chips).toBeCloseTo(score.totalChips);
        expect(summary.mult).toBeCloseTo(1 + score.totalMultiplier);
        expect(score.criteria.find(row => row.id === 'pair')!).toMatchObject({
            chips: outcome === 'bust' ? 27 + 15 + 7 : 6 + 5 + 7,
            multiplier: expect.closeTo(outcome === 'bust' ? 0.19 : 0.09),
        });
    });
});
