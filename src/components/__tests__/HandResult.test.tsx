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
