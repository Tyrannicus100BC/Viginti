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

    it('caps base and Raises at three pairs while paying each participating card once', () => {
        const pairRows = (ranks: Rank[]) => evaluateHandScore(makeCards(ranks), false, false, [], 0, undefined, 'push', { raise_pair_combo: 2 })
            .criteria.filter(row => row.id === 'pair').map(({ chips, multiplier }) => ({ chips, multiplier }));
        expect(pairRows(['2', '2', '2'])).toEqual([{ chips: 141, multiplier: expect.closeTo(1.65) }]);
        expect(pairRows(['2', '2', '2', '2'])).toEqual([{ chips: 143, multiplier: expect.closeTo(1.65) }]);
        expect(pairRows(['2', '2', '2', '2', '2'])).toEqual(pairRows(['2', '2', '2', '2']));
        expect(pairRows(['2', '2', '2', '2'])).toHaveLength(1);
        expect(getHandPatterns(makeCards(['2', '2', '2', '2', '3'])).some(row => row.id === 'straight')).toBe(true);
        expect(getHandPatterns(makeCards(['2', '2', '2', '2', '3'])).some(row => row.id === 'flush')).toBe(true);
    });

    it('groups each rank into one row while preserving every pair payout and highlight', () => {
        const cards = makeCards(['3', '3', '3', '8', '8']);
        const pairs = evaluateHandScore(cards, false, false, [], 0, undefined, 'push', { raise_pair_combo: 1 })
            .criteria.filter(row => row.id === 'pair');
        expect(pairs).toHaveLength(1);
        expect(pairs[0]).toMatchObject({ count: 3, chips: 84, multiplier: expect.closeTo(0.9), cardIds: cards.slice(0, 3).map(card => card.id) });

        const twoPairs = evaluateHandScore(makeCards(['3', '3', '8', '8']), false).criteria.filter(row => row.id === 'pair');
        expect(twoPairs.map(row => ({ count: row.count, chips: row.chips }))).toEqual([{ count: 1, chips: 11 }, { count: 1, chips: 21 }]);
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
        const bonuses = runs.reduce((sum, run) => sum + run.length - 1, 0);
        expect(straights.map(row => row.count).sort()).toEqual(runs.map(run => run.length - 1).sort());
        expect(straights.reduce((sum, criterion) => sum + criterion.chips, 0)).toBe(chips + 10 * bonuses);
    });
});

it('shows A–2–3 in one row with two straight bonuses', () => {
    const cards = makeCards(['A', '2', '3']);
    const score = evaluateHandScore(cards, false);

    const straights = score.criteria.filter(criterion => criterion.id === 'straight');
    expect(straights).toHaveLength(1);
    expect(straights[0].cardIds).toEqual(cards.map(card => card.id));
    expect(straights[0].count).toBe(2);
    expect(straights[0].chips).toBe(36);
});

describe.each(['straight', 'flush'] as const)('%s bonus scaling', id => {
    it.each([2, 3, 4, 5])('applies the upgraded bonus %i minus one times and card values once', length => {
        const cards = makeCards((['2', '3', '4', '5', '6'] as Rank[]).slice(0, length));
        const upgrades = { [`raise_${id}_combo`]: 2 };
        const row = evaluateHandScore(cards, false, false, [], 0, undefined, 'push', upgrades).criteria.find(row => row.id === id)!;
        const cardValues = cards.reduce((sum, card) => sum + Number(card.rank), 0);
        expect(row).toMatchObject({ count: length - 1, cardIds: cards.map(card => card.id),
            chips: cardValues + (length - 1) * (id === 'straight' ? 50 : 40),
            multiplier: (length - 1) * 0.5 });
    });

    it('scales negative Raise effects as well as bonuses', () => {
        const cards = makeCards(['2', '3', '4', '5']);
        const upgrades = { [`raise_v3_0_tradeoff_win_cash_${id}_mult`]: 1 };
        const row = evaluateHandScore(cards, false, false, [], 0, undefined, 'push', upgrades).criteria.find(row => row.id === id)!;
        expect(row.multiplier).toBe(-0.15);
    });
});

describe('ranked cards with special bonuses', () => {
    it.each(['win', 'loss', 'push', 'bust'] as const)(
        'adds bonuses only to participating scoring rows on %s', outcome => {
            const ordinary = makeCards(outcome === 'bust' ? ['9', '9', '9'] : ['9', '9']);
            const enhanced = ordinary.map((card, i): Card => ({ ...card,
                specialEffect: i === 0 ? { type: 'chip', value: 7 } : i === 1 ? { type: 'mult', value: 0.04 } : undefined,
            }));
            expect(getBlackjackScore(enhanced)).toBe(getBlackjackScore(ordinary));
            const plain = evaluateHandScore(ordinary, outcome === 'win', false, [], 0, undefined, outcome);
            const score = evaluateHandScore(enhanced, outcome === 'win', false, [], 0, undefined, outcome);
            expect(score.criteria.map(row => row.id)).toEqual(plain.criteria.map(row => row.id));
            expect(score.criteria.some(row => row.id === 'special_cards')).toBe(false);
            for (let i = 0; i < score.criteria.length; i++) {
                const row = score.criteria[i];
                const base = plain.criteria[i];
                const bonuses = row.breakdown!.filter(entry => entry.label.endsWith('card bonus'));
                if (row.id === 'loss' || row.id === 'bust') {
                    expect(row).toEqual(base);
                    expect(bonuses).toEqual([]);
                } else {
                    const times = row.id === 'pair' ? 1 : row.count;
                    expect(row.chips - base.chips).toBe(7 * times);
                    expect(row.multiplier - base.multiplier).toBeCloseTo(0.04 * times);
                }
            }
        });

    it.each<[Rank[], string]>([[['9', '8'], 'win'], [['10', '8', '3'], 'viginti']])(
        'integrates winning bonuses for %s into the %s outcome row', (ranks, id) => {
            const cards = makeCards(ranks);
            cards[0].specialEffect = { type: 'chip', value: 7 };
            cards[1].specialEffect = { type: 'mult', value: 0.04 };
            const score = evaluateHandScore(cards, true);
            const row = score.criteria.find(row => row.id === id)!;
            expect(row.chips).toBe((id === 'win' ? 10 : 20) + 7);
            expect(row.multiplier).toBe(id === 'win' ? 0.04 : 0.14);
            expect(row.breakdown!.filter(entry => entry.label.endsWith('card bonus'))).toHaveLength(2);
        });

    it.each(['straight', 'flush'] as const)('scales participating bonuses with every %s bonus', id => {
        for (const length of [2, 3, 4, 5]) {
            const ordinary = makeCards((['2', '3', '4', '5', '6'] as Rank[]).slice(0, length));
            const enhanced = ordinary.map((card, i): Card => ({ ...card,
                specialEffect: i === 0 ? { type: 'chip', value: 9 } : i === length - 1 ? { type: 'mult', value: 0.06 } : undefined,
            }));
            const plain = evaluateHandScore(ordinary, false).criteria.find(row => row.id === id)!;
            const row = evaluateHandScore(enhanced, false).criteria.find(row => row.id === id)!;
            expect(row.chips - plain.chips).toBe(9 * (length - 1));
            expect(row.multiplier - plain.multiplier).toBeCloseTo(0.06 * (length - 1));
        }
    });

    it('pays special bonuses once per participating card under the three-pair cap', () => {
        const cards = makeCards(['2', '2', '2', '2']);
        cards[0].specialEffect = { type: 'chip', value: 4 };
        cards[1].specialEffect = { type: 'chip', value: 7 };
        cards[2].specialEffect = { type: 'mult', value: 0.02 };
        cards[3].specialEffect = { type: 'mult', value: 0.06 };
        // The capped matches are 0–1, 0–2, 0–3; all four cards pay once.
        const row = evaluateHandScore(cards, false).criteria.find(row => row.id === 'pair')!;
        expect(row).toMatchObject({ count: 3, chips: 8 + 15 + 4 + 7, multiplier: 0.23 });
        expect(row.breakdown!.filter(entry => entry.label.endsWith('card bonus'))).toHaveLength(4);
        const skipped: Card = { id: 'skipped', rank: '2', suit: 'clubs', specialEffect: { type: 'chip', value: 99 } };
        expect(evaluateHandScore([...cards, skipped], false).criteria.find(row => row.id === 'pair')).toEqual(row);
    });

    it('excludes cards outside the scored pattern, including skipped duplicate ranks', () => {
        const cards = makeCards(['2', '3', '3', '8']);
        cards[0].suit = 'clubs';
        cards[2].specialEffect = { type: 'chip', value: 7 };
        cards[3].suit = 'spades';
        cards[3].specialEffect = { type: 'chip', value: 9 };
        const score = evaluateHandScore(cards, false);
        expect(score.criteria.find(row => row.id === 'straight')!.chips).toBe(15);
        expect(score.criteria.find(row => row.id === 'pair')!.chips).toBe(18);
        expect(score.criteria.find(row => row.id === 'flush')!.chips).toBe(13);
        expect(score.criteria.some(row => row.id === 'special_cards')).toBe(false);
    });

    it('triggers an Ace in both a separate low and high straight', () => {
        const cards = makeCards(['K', 'A', '2']);
        cards[1].specialEffect = { type: 'chip', value: 4 };
        const straights = evaluateHandScore(cards, false).criteria.filter(row => row.id === 'straight');
        expect(straights).toHaveLength(2);
        expect(straights.map(row => row.breakdown!.find(entry => entry.label === 'A♥ card bonus')!.chips)).toEqual([4, 4]);
    });

    it.each(['loss', 'push', 'bust'] as const)('does not pay non-pattern cards on %s', outcome => {
        const cards = makeCards(['10', '5']);
        cards[1].suit = 'clubs';
        const plain = evaluateHandScore(cards, false, false, [], 0, undefined, outcome);
        cards[0].specialEffect = { type: 'chip', value: 9 };
        cards[1].specialEffect = { type: 'mult', value: 0.06 };
        expect(evaluateHandScore(cards, false, false, [], 0, undefined, outcome)).toEqual(plain);
    });

    it('never pays outcome bonuses on a bust even if marked as a win', () => {
        const cards = makeCards(['K', '8', '5']);
        cards.forEach((card, index) => { card.suit = (['hearts', 'clubs', 'spades'] as const)[index]; });
        const plain = evaluateHandScore(cards, true);
        cards[0].specialEffect = { type: 'chip', value: 15 };
        expect(evaluateHandScore(cards, true)).toEqual(plain);
    });

    it('preserves legacy standalone bonuses in the winning row without pattern participation', () => {
        const cards: Card[] = [...makeCards(['9', '9']),
            { id: 'legacy-cash', rank: 'none', suit: 'clubs', type: 'chip', chips: 7 },
            { id: 'legacy-mult', rank: 'none', suit: 'clubs', type: 'mult', mult: 0.04 },
        ];
        const score = evaluateHandScore(cards, true);
        expect(score.criteria.find(row => row.id === 'win')).toMatchObject({ chips: 17, multiplier: 0.04 });
        expect(score.criteria.find(row => row.id === 'pair')).toMatchObject({ chips: 23, multiplier: 0.05 });
        expect(score.criteria.find(row => row.id === 'flush')).toMatchObject({ chips: 18, multiplier: 0 });
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
