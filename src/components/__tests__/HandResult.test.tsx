import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Hand } from '../Hand';
import type { PlayerHand } from '../../types';

function dealer(value: number, isBust = false): PlayerHand {
    return { id: -1, cards: [{ id: 'dealer-card', rank: 'K', suit: 'clubs', isFaceUp: true }],
        isHeld: true, blackjackValue: value, isBust };
}

describe('dealer hand results', () => {
    it('shows stand with a dark scrim only after the dealer has stopped', () => {
        const active = renderToStaticMarkup(<Hand hand={dealer(18)} stagger={false} />);
        expect(active).not.toContain('>STAND<');
        expect(active).not.toMatch(/class="[^"]*overlayScrim/);
        const standing = renderToStaticMarkup(<Hand hand={dealer(18)} isStanding stagger={false} />);
        expect(standing).toContain('>STAND<');
        expect(standing).toMatch(/class="[^"]*overlayScrim/);
    });

    it.each([[21, false, 'VIGINTI'], [24, true, 'BUST']] as const)(
        'preserves the terminal result for %s instead of stand', (value, isBust, result) => {
            const html = renderToStaticMarkup(<Hand hand={dealer(value, isBust)} isStanding stagger={false} />);
            expect(html).toContain(`>${result}<`);
            expect(html).not.toContain('>STAND<');
        });
});

describe('boss hand results', () => {
    const player = (): PlayerHand => ({ id: 0, cards: [
        { id: 'ace', rank: 'A', suit: 'hearts', isFaceUp: true },
        { id: 'king', rank: 'K', suit: 'clubs', isFaceUp: true },
    ], blackjackValue: 21, isHeld: false, isBust: false });

    it('does not show a terminal Viginti for a two-card 21 in Three’s Company', () => {
        const html = renderToStaticMarkup(<Hand hand={player()} handRules={{ minWinCards: 3 }} stagger={false} />);
        expect(html).not.toContain('>VIGINTI<');
        expect(html).not.toMatch(/class="[^"]*tinted/);
    });

    it('shows a loss instead of Viginti when 21 loses under a boss rule', () => {
        const html = renderToStaticMarkup(<Hand hand={{ ...player(), resultRevealed: true, outcome: 'loss' }} stagger={false} />);
        expect(html).toContain('>LOSS<');
        expect(html).not.toContain('>VIGINTI<');
    });

    it('dims a three-card full hand in Tight Fit', () => {
        const hand = { ...player(), blackjackValue: 13, cards: [...player().cards, { id: 'two', rank: '2' as const, suit: 'clubs' as const }] };
        const html = renderToStaticMarkup(<Hand hand={hand} handRules={{ maxCards: 3 }} stagger={false} />);
        expect(html).toMatch(/class="[^"]*tinted/);
    });
});
