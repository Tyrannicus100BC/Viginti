import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RelicTooltip } from '../../components/RelicTooltip';
import { PlayingCard } from '../../components/PlayingCard';
import { HandScores } from '../../components/HandScores';
import { RELIC_REGISTRY } from '../relics/manager';
import { getRaise } from '../handScoring';
import { formatChipMultiplier, formatHandMult, formatMultPercent } from '../formatters';

describe('chip multiplier percentage displays', () => {
    it('converts fractional, whole, zero, and negative multipliers without floating-point noise', () => {
        expect([0.1, 0.1 + 0.2, 1, 2.5, 0, -0.1].map(value => formatChipMultiplier(value)))
            .toEqual(['x10%', 'x30%', 'x100%', 'x250%', 'x0%', 'x10%']);
        expect(formatMultPercent(0.1 + 0.2)).toBe('30%');
        expect(formatHandMult(1, 0.1, true)).toBe('{x10% / additional card}');
    });

    it('shows current relic bonuses and decay in the multiplier color', () => {
        const relic = RELIC_REGISTRY.faded_tag;
        const html = renderToStaticMarkup(<RelicTooltip relic={relic} displayValues={{ amount: 0.3, decay_amount: 0.1 }} />);
        expect(html).toMatch(/class="[^"]*multValue[^"]*">x30%<\/span>/);
        expect(html).toMatch(/class="[^"]*multValue[^"]*">x10%<\/span>/);
        expect(html).not.toContain('x0.');
    });

    it('keeps cash relic amounts in dollars', () => {
        const relic = RELIC_REGISTRY.faded_bill;
        const html = renderToStaticMarkup(<RelicTooltip relic={relic} displayValues={relic.properties} />);
        expect(html).toContain('$50');
        expect(html).toContain('$10');
        expect(html).not.toContain('%');
    });

    it('does not convert already-formatted Raise descriptions a second time', () => {
        const html = renderToStaticMarkup(<RelicTooltip relic={getRaise('raise_pair_mult')!} />);
        expect(html).toMatch(/class="[^"]*multValue[^"]*">x25%<\/span>/);
        expect(html).not.toContain('5000%');
    });

    it('keeps Raise drawbacks red while hiding their minus signs', () => {
        for (const stat of ['cash', 'mult']) {
            const raise = getRaise(`raise_v2_1_pair_${stat}_2_trade`)!;
            const html = renderToStaticMarkup(<RelicTooltip relic={raise} />);
            expect(html).toMatch(/class="[^"]*negativeValue[^"]*" aria-label="−(?:\$5|x5%)">(?:\$5|x5%)<\/span>/);
            expect(html.replace(/<[^>]*>/g, '')).not.toMatch(/[−-](?:\$|x)/);
        }
    });

    it('handles signed cash and multipliers inside description markup', () => {
        const relic = { ...RELIC_REGISTRY.faded_bill, description: '<-$5> <$-10> −$15 {−x10%} -x20%' };
        const html = renderToStaticMarkup(<RelicTooltip relic={relic} />);
        expect(html.match(/class="[^"]*negativeValue[^"]*"/g)).toHaveLength(5);
        expect(html.replace(/<[^>]*>/g, '')).toContain('$5 $10 $15 x10% x20%');
    });

    it('renders loss and bust hand scores in red without visible signs', () => {
        const html = renderToStaticMarkup(<HandScores onClose={() => {}} />);
        expect(html).toMatch(/class="[^"]*isNegative[^"]*" aria-label="−\$10 cash">\$10<\/strong>/);
        expect(html).toMatch(/class="[^"]*isNegative[^"]*" aria-label="−x10%">x10%<\/strong>/);
        expect(html.replace(/<[^>]*>/g, '')).not.toMatch(/[−-](?:\$|x)/);
    });

    it('formats multiplier cards and enhancement indicators as percentages', () => {
        const base = { id: 'display-test', rank: '2' as const, suit: 'hearts' as const, isFaceUp: true };
        const special = renderToStaticMarkup(<PlayingCard card={{ ...base, type: 'mult', mult: 1 }} />);
        expect(special.match(/x100%/g)).toHaveLength(2);
        const enhanced = renderToStaticMarkup(<PlayingCard card={{ ...base, specialEffect: { type: 'mult', value: 0.1 } }} />);
        expect(enhanced.match(/>10%</g)).toHaveLength(2);
    });

    it('keeps negative card values and enhancements red without visible signs', () => {
        const base = { id: 'negative-display', rank: '2' as const, suit: 'hearts' as const, isFaceUp: true };
        const cash = renderToStaticMarkup(<PlayingCard card={{ ...base, type: 'chip', chips: -10 }} />);
        expect(cash).toContain('color:#ff4444');
        expect(cash.match(/>\$10</g)).toHaveLength(2);
        const mult = renderToStaticMarkup(<PlayingCard card={{ ...base, type: 'mult', mult: -0.1 }} />);
        expect(mult).toContain('color:#ff4444');
        expect(mult.match(/>x10%</g)).toHaveLength(2);
        const enhanced = renderToStaticMarkup(<PlayingCard card={{ ...base, specialEffect: { type: 'mult', value: -0.1 } }} />);
        expect(enhanced).toContain('color:#7f1d1d');
        expect(enhanced.match(/>10%</g)).toHaveLength(2);
    });
});
