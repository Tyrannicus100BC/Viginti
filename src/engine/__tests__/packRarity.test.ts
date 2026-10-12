import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../engine';
import { SeededRNG } from '../rng';
import { generateRaiseChoices } from '../../logic/handScoring';
import { generatePackCardChoices } from '../../logic/packCards';

afterEach(() => vi.restoreAllMocks());

const probabilities = createInitialState().deckProbabilities;
const generators = {
    Raise: (rng: SeededRNG) => generateRaiseChoices(rng, 1)[0],
    Deck: (rng: SeededRNG) => generatePackCardChoices(rng, 1, probabilities)[0],
};

describe.each(Object.entries(generators))('%s pack result rarity', (_, generate) => {
    it.each([
        [0, 'Common'], [0.699999, 'Common'],
        [0.7, 'Uncommon'], [0.949999, 'Uncommon'],
        [0.95, 'Rare'], [0.999999, 'Rare'],
    ] as const)('rolls %s as %s', (roll, rarity) => {
        const rng = new SeededRNG(42);
        vi.spyOn(rng, 'next').mockReturnValueOnce(roll);
        expect(generate(rng).rarity).toBe(rarity);
    });

    it('allocates 70/25/5 rarity rolls', () => {
        const counts = { Common: 0, Uncommon: 0, Rare: 0 };
        for (let ticket = 0; ticket < 100; ticket++) {
            const rng = new SeededRNG(42);
            vi.spyOn(rng, 'next').mockReturnValueOnce((ticket + 0.5) / 100);
            counts[generate(rng).rarity]++;
        }
        expect(counts).toEqual({ Common: 70, Uncommon: 25, Rare: 5 });
    });
});
