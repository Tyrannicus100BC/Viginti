import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeckProbabilityDetails } from '../DeckProbabilityRow';
import { DeckView } from '../DeckView';
import { createInitialState } from '../../engine/engine';
import { applyPackCard, getPackCard } from '../../logic/packCards';
import type { DeckProbabilityTarget } from '../../engine/GameState';

const base = createInitialState().deckProbabilities;

describe('deck probability explanations', () => {
    it.each<[DeckProbabilityTarget, string]>([
        [{ kind: 'suit', target: 'hearts' }, 'Chance that each card drawn is hearts.'],
        [{ kind: 'rank', target: 'ace' }, 'Aces count as 1 or 11'],
        [{ kind: 'rank', target: 'face' }, '10, Jack, Queen, or King'],
        [{ kind: 'rank', target: 'upper' }, '6, 7, 8, or 9'],
        [{ kind: 'rank', target: 'lower' }, '2, 3, 4, or 5'],
        [{ kind: 'special', target: 'chip' }, 'Adds $4, $7, or $9'],
        [{ kind: 'special', target: 'mult' }, 'Adds 2%, 4%, or 6%'],
        [{ kind: 'special', target: 'score' }, 'Subtracts 1, 2, 3, or 4'],
    ])('explains %o with its current draw chance', (target, explanation) => {
        const markup = renderToStaticMarkup(<DeckProbabilityDetails label="Test" chance={0.25} target={target} probabilities={base} />);
        expect(markup).toContain(explanation);
        expect(markup).toContain('25%');
        expect(markup).toContain('per card drawn');
        expect(markup).toContain('Raises');
        expect(markup).toContain('No recorded Raises affect this probability.');
    });

    it('lists the actual upgrade and its impact on another suit', () => {
        const probabilities = applyPackCard(base, getPackCard('deck_v3_0_0')!);
        const markup = renderToStaticMarkup(<DeckProbabilityDetails label="Spades" chance={probabilities.suits.spades / 100}
            target={{ kind: 'suit', target: 'spades' }} probabilities={probabilities} />);
        expect(markup).toContain('More Hearts');
        expect(markup).toContain('Probability rebalanced');
        expect(markup).toContain('-1.67 percentage points');
        expect(markup).toContain('25% → 23.33%');
    });

    it('makes every displayed probability focusable, including all special types', () => {
        const probabilities = { ...base, specialWeights: [
            { type: 'chip' as const, chance: 0.1 }, { type: 'mult' as const, chance: 0.05 }, { type: 'score' as const, chance: 0.03 },
        ] };
        const markup = renderToStaticMarkup(<DeckView probabilities={probabilities} activeCards={[]} onClose={() => {}} />);
        expect(markup.match(/tabindex="0"/g)).toHaveLength(11);
        expect(markup).toContain('Hearts: 25% chance per draw');
        expect(markup).toContain('Cash Cards: 10% chance per draw');
        expect(markup).toContain('Mult Cards: 5% chance per draw');
        expect(markup).toContain('Value Cards: 3% chance per draw');
    });
});
