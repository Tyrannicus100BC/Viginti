import { describe, expect, it } from 'vitest';
import type { Card, Rank } from '../../types';
import { evaluateHandScore, getBlackjackScore } from '../scoring';
import { getHandPatterns } from '../handScoring';

function makeCards(ranks: Rank[]): Card[] {
    return ranks.map((rank, index) => ({
        id: `card_${index}`,
        rank,
        suit: 'hearts',
        isFaceUp: true,
    }));
}

describe('pair scoring cap', () => {
    it.each<{ ranks: Rank[]; pairs: number }>([
        { ranks: ['2', '2'], pairs: 1 },
        { ranks: ['2', '2', '3', '3'], pairs: 2 },
        { ranks: ['2', '2', '2'], pairs: 3 },
        { ranks: ['2', '2', '2', '2'], pairs: 3 },
        { ranks: ['2', '2', '2', '2', '2'], pairs: 3 },
        { ranks: ['2', '2', '2', '3', '3'], pairs: 3 },
    ])('scores $pairs pairs for $ranks', ({ ranks, pairs }) => {
        expect(getHandPatterns(makeCards(ranks)).filter(row => row.id === 'pair')).toHaveLength(pairs);
    });

    it('gives four of a kind the same pair cash and multiplier as three, including Raises', () => {
        const pairRows = (ranks: Rank[]) => evaluateHandScore(makeCards(ranks), false, false, [], 0, undefined, 'push', { raise_pair_combo: 2 })
            .criteria.filter(row => row.id === 'pair').map(({ chips, multiplier }) => ({ chips, multiplier }));
        expect(pairRows(['2', '2', '2', '2'])).toEqual(pairRows(['2', '2', '2']));
        expect(pairRows(['2', '2', '2', '2'])).toHaveLength(3);
        expect(getHandPatterns(makeCards(['2', '2', '2', '2', '3'])).some(row => row.id === 'straight')).toBe(true);
        expect(getHandPatterns(makeCards(['2', '2', '2', '2', '3'])).some(row => row.id === 'flush')).toBe(true);
    });
});

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
        expect(straights.reduce((sum, criterion) => sum + criterion.chips, 0)).toBe(chips + 10 * runs.length);
    });
});

it('awards A–2–3 only once through the hand scoring pipeline', () => {
    const cards = makeCards(['A', '2', '3']);
    const score = evaluateHandScore(cards, false);

    const straights = score.criteria.filter(criterion => criterion.id === 'straight');
    expect(straights).toHaveLength(1);
    expect(straights[0].cardIds).toEqual(cards.map(card => card.id));
    expect(straights[0].chips).toBe(26);
});

describe('ranked cards with special bonuses', () => {
    it.each<{ ranks: Rank[]; outcome: 'win' | 'loss' | 'push' | 'bust'; pays: boolean }>([
        { ranks: ['9', '9'], outcome: 'win', pays: true },
        { ranks: ['10', '8', '3'], outcome: 'win', pays: true },
        { ranks: ['9', '9'], outcome: 'loss', pays: false },
        { ranks: ['9', '9'], outcome: 'push', pays: false },
        { ranks: ['9', '9', '9'], outcome: 'bust', pays: false },
    ])('awards cash and mult only for a winning hand: $ranks, $outcome', ({ ranks, outcome, pays }) => {
        const ordinary = makeCards(ranks);
        const enhanced = ordinary.map((card, i): Card => ({ ...card,
            specialEffect: i === 0 ? { type: 'chip', value: 10 } : i === 1 ? { type: 'mult', value: 0.1 } : undefined,
        }));
        expect(getBlackjackScore(enhanced)).toBe(getBlackjackScore(ordinary));
        const plainScore = evaluateHandScore(ordinary, outcome === 'win', false, [], 0, undefined, outcome);
        const score = evaluateHandScore(enhanced, outcome === 'win', false, [], 0, undefined, outcome);
        expect(score.criteria.filter(row => row.id !== 'special_cards')).toEqual(plainScore.criteria);
        if (pays) {
            expect(score.criteria.find(row => row.id === 'special_cards')).toMatchObject({
                chips: 10, multiplier: 0.1, count: 2, cardIds: enhanced.slice(0, 2).map(card => card.id),
            });
        } else {
            expect(score).toEqual({ ...plainScore, scoringCards: enhanced });
        }
    });

    it('never pays bonuses on a bust even if marked as a win', () => {
        const cards = makeCards(['K', 'K', '5']);
        cards[0].specialEffect = { type: 'chip', value: 15 };
        expect(evaluateHandScore(cards, true).criteria.some(row => row.id === 'special_cards')).toBe(false);
    });

    it('reduces blackjack value while keeping the original rank for patterns', () => {
        const cards = makeCards(['10', '10']);
        cards[0].specialEffect = { type: 'score', value: 3 };
        expect(getBlackjackScore(cards)).toBe(17);
        expect(getBlackjackScore(cards, [], true)).toBe(20);
        const score = evaluateHandScore(cards, true);
        expect(score.criteria.find(row => row.id === 'pair')).toMatchObject({ chips: 25, cardIds: cards.map(card => card.id) });
        expect(score.criteria.some(row => row.id === 'special_cards')).toBe(false);
    });

    it('can prevent a bust and allow Viginti, and still handles soft aces', () => {
        const cards = makeCards(['10', '10', '4']);
        cards[2].specialEffect = { type: 'score', value: 3 };
        expect(getBlackjackScore(cards)).toBe(21);
        expect(evaluateHandScore(cards, true).criteria.some(row => row.id === 'viginti')).toBe(true);
        const softCards = makeCards(['A', 'K', '4']);
        softCards[2].specialEffect = { type: 'score', value: 2 };
        expect(getBlackjackScore(softCards)).toBe(13);
    });
});
