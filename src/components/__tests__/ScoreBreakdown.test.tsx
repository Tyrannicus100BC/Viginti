import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScoreBreakdownDetails } from '../ScoreBreakdown';
import { evaluateHandScore } from '../../logic/scoring';
import type { Card } from '../../types';

describe('score breakdown tooltips', () => {
    it('shows only sources and contributions, combining grouped pair payouts', () => {
        const cards: Card[] = ['hearts', 'clubs', 'spades'].map((suit, i) => ({ id: String(i), rank: '3', suit: suit as Card['suit'] }));
        const row = evaluateHandScore(cards, false, false, [], 0, undefined, 'push', { raise_pair_combo: 1 }).criteria[0];
        const markup = renderToStaticMarkup(<ScoreBreakdownDetails row={row} />);
        for (const text of ['Breakdown', 'Cash', 'Mult', 'Card Sum', 'Base ×3', 'Raises ×3', '$9', '$60', '75%']) {
            expect(markup).toContain(text);
        }
        for (const text of ['3♥', '3 + 3', 'Card Sum ×3', 'Row total', 'Adds to the deal', '<small', '<tfoot', '<strong', 'Base Pair', 'Pair Double Raise', '+$18', '+75%']) {
            expect(markup).not.toContain(text);
        }
        expect([...markup.matchAll(/<th scope="row">([^<]+)<\/th>/g)].map(match => match[1]))
            .toEqual(['Base ×3', 'Raises ×3', 'Card Sum']);
    });

    it.each(['win', 'viginti', 'pair', 'straight', 'flush'])(
        'shows special-card bonuses inside the %s tooltip', id => {
            const ranks = id === 'pair' ? ['3', '3', '3'] : id === 'viginti' ? ['6', '7', '8'] : ['2', '3', '4'];
            const cards = ranks.map((rank, i): Card => ({ id: String(i), rank: rank as Card['rank'], suit: 'hearts',
                specialEffect: i === 0 ? { type: 'chip', value: 7 } : i === 1 ? { type: 'mult', value: 0.04 } : undefined,
            }));
            const score = evaluateHandScore(cards, true);
            const row = score.criteria.find(row => row.id === id)!;
            const markup = renderToStaticMarkup(<ScoreBreakdownDetails row={row} />);
            expect(markup).toContain(`${ranks[0]}♥ card bonus`);
            expect(markup).toContain(`${ranks[1]}♥ card bonus`);
            const repeats = id === 'straight' || id === 'flush';
            expect(markup).toContain(repeats ? 'Base ×2' : id === 'pair' ? 'Base ×3' : '>Base<');
            expect(markup).toContain(repeats ? '$14' : '$7');
            expect(markup).toContain(repeats ? '8%' : '4%');
            expect(markup).not.toContain('Applied 2 times');
            if (id === 'pair' || repeats) {
                expect(markup.lastIndexOf('<th scope="row">Card Sum</th>')).toBeGreaterThan(markup.lastIndexOf('card bonus'));
            }
            expect(score.criteria.some(row => row.id === 'special_cards')).toBe(false);
        });

    it('keeps saved scores without a breakdown in the same simple table', () => {
        const markup = renderToStaticMarkup(<ScoreBreakdownDetails row={{ id: 'bust', name: 'Bust', count: 1, chips: -20, multiplier: -0.1 }} />);
        expect(markup).toContain('-$20');
        expect(markup).toContain('-10%');
        expect(markup).toContain('Recorded score');
    });
});
