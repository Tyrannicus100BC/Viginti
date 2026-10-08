import { describe, expect, it } from 'vitest';
import type { Card, Rank } from '../../types';
import { evaluateHandScore } from '../scoring';

function makeCards(ranks: Rank[]): Card[] {
    return ranks.map((rank, index) => ({
        id: `card_${index}`,
        rank,
        suit: 'hearts',
        isFaceUp: true,
    }));
}

describe('built-in straight scoring', () => {
    it.each<{ name: string; ranks: Rank[]; runs: Rank[][]; chips: number }>([
        { name: 'Ace-low run', ranks: ['A', '2', '3'], runs: [['A', '2', '3']], chips: 16 },
        { name: 'Ace-low run in placement order', ranks: ['3', 'A', '2'], runs: [['A', '2', '3']], chips: 16 },
        { name: 'longer Ace-low run', ranks: ['A', '2', '3', '4'], runs: [['A', '2', '3', '4']], chips: 20 },
        { name: 'Ace-high run', ranks: ['Q', 'K', 'A'], runs: [['Q', 'K', 'A']], chips: 31 },
        { name: 'duplicate ranks', ranks: ['A', '2', '2', '3'], runs: [['A', '2', '3']], chips: 16 },
        { name: 'separate runs', ranks: ['A', '2', '3', '7', '8'], runs: [['A', '2', '3'], ['7', '8']], chips: 31 },
        { name: 'separate Ace-high and Ace-low runs', ranks: ['K', 'A', '2'], runs: [['K', 'A'], ['A', '2']], chips: 34 },
        { name: 'ordinary run', ranks: ['4', '5', '6'], runs: [['4', '5', '6']], chips: 15 },
    ])('scores only maximal runs for $name', ({ ranks, runs, chips }) => {
        const cards = makeCards(ranks);
        const score = evaluateHandScore(cards, false);
        const straights = score.criteria.filter(criterion => criterion.id === 'straight');
        const scoredRanks = straights.map(criterion => (criterion.cardIds ?? []).map(id => cards.find(card => card.id === id)!.rank).sort());

        expect(scoredRanks).toEqual(expect.arrayContaining(runs.map(run => [...run].sort())));
        expect(straights).toHaveLength(runs.length);
        expect(straights.reduce((sum, criterion) => sum + criterion.chips, 0)).toBe(chips);
    });
});

it('awards A–2–3 only once through the hand scoring pipeline', () => {
    const cards = makeCards(['A', '2', '3']);
    const score = evaluateHandScore(cards, false);

    const straights = score.criteria.filter(criterion => criterion.id === 'straight');
    expect(straights).toHaveLength(1);
    expect(straights[0].cardIds).toEqual(cards.map(card => card.id));
    expect(straights[0].chips).toBe(16);
});
