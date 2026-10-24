import { describe, expect, it } from 'vitest';
import { createInitialState } from '../engine';
import { SeededRNG } from '../rng';
import { drawCardFromProbabilities } from '../../logic/deck';
import { applyPackCard, generatePackCard, getPackCard } from '../../logic/packCards';
import { getSpecialWeights, normalizeDeckProbabilities, rollSpecialStrength, SPECIAL_TYPES } from '../../logic/specialCards';
import { useGameBridge } from '../../store/gameBridge';

class ScriptedRNG extends SeededRNG {
    private index = 0;
    private readonly rolls: number[];
    constructor(rolls: number[]) { super(0); this.rolls = rolls; }
    override next(): number {
        const value = this.rolls[this.index++];
        if (value === undefined) throw new Error('Unexpected random roll');
        return value;
    }
}

const base = createInitialState().deckProbabilities;

describe('Special card type rates and strength rolls', () => {
    it.each(SPECIAL_TYPES)('uses exact 70/25/5 tier boundaries for %s', type => {
        const strengths = type === 'chip' ? [4, 7, 9] : type === 'mult' ? [0.02, 0.04, 0.06] : [1, 2, 3, 4];
        for (const [roll, middle, index] of [[0, 0, 0], [0.699999, 0, 0], [0.7, 0, 1], [0.949999, 0.999, 2], [0.95, 0, 3], [0.999999, 0, 3]]) {
            const tier = strengths.length === 3 ? (roll < 0.7 ? 0 : roll < 0.95 ? 1 : 2) : index;
            expect(rollSpecialStrength(type, new ScriptedRNG([roll, middle]))).toBe(strengths[tier]);
        }
        const counts = strengths.map(() => 0);
        for (let roll = 0; roll < 200; roll++) {
            const value = rollSpecialStrength(type, new ScriptedRNG([(roll + 0.5) / 200, roll % 2 / 2]));
            counts[strengths.indexOf(value)]++;
        }
        expect(counts).toEqual(type === 'score' ? [140, 25, 25, 10] : [140, 50, 10]);
    });

    it('chooses the type before independently choosing its strength, leaving normal cards reachable', () => {
        const probabilities = { ...base, specialWeights: [
            { type: 'chip' as const, chance: 0.2 }, { type: 'mult' as const, chance: 0.3 }, { type: 'score' as const, chance: 0.1 },
        ] };
        const cash = drawCardFromProbabilities(probabilities, new ScriptedRNG([0, 0.199999, 0, 0, 0.95]));
        expect(cash).toMatchObject({ rank: 'A', suit: 'hearts', specialEffect: { type: 'chip', value: 9 } });
        const mult = drawCardFromProbabilities(probabilities, new ScriptedRNG([0.3, 0.2, 0.2, 0, 0.8]));
        expect(mult).toMatchObject({ rank: 'K', suit: 'diamonds', specialEffect: { type: 'mult', value: 0.04 } });
        const value = drawCardFromProbabilities(probabilities, new ScriptedRNG([0.8, 0.5, 0.99, 0.99, 0.1]));
        expect(value).toMatchObject({ rank: '2', suit: 'spades', specialEffect: { type: 'score', value: 1 } });
        for (const card of [cash, mult, value]) {
            expect(card.type).toBeUndefined();
            expect(card.chips).toBeUndefined();
            expect(card.mult).toBeUndefined();
        }
        const normal = drawCardFromProbabilities(probabilities, new ScriptedRNG([0, 0.6, 0, 0]));
        expect(normal.rank).toBe('A');
        expect(normal.type).toBeUndefined();
        expect(normal.specialEffect).toBeUndefined();
    });

    it.each(SPECIAL_TYPES)('respects rank and suit weights even when every card has a %s bonus', type => {
        const probabilities = { ...base, suits: { hearts: 0, diamonds: 0, clubs: 100, spades: 0 },
            ranks: { ace: 100, face: 0, upper: 0, lower: 0 }, specialWeights: [{ type, chance: 1 }] };
        for (let seed = 0; seed < 100; seed++) {
            expect(drawCardFromProbabilities(probabilities, new SeededRNG(seed)))
                .toMatchObject({ rank: 'A', suit: 'clubs', specialEffect: { type } });
        }
    });

    it('pools legacy strengths and folds generic chance into each type without changing total draw rates', () => {
        const legacy = { ...base, specialChance: 0.3, specialWeights: [
            { type: 'chip' as const, value: 5, chance: 0.05 }, { type: 'chip' as const, value: 50, chance: 0.1 },
            { type: 'mult' as const, value: 3, chance: 0.1 },
        ] };
        const normalized = normalizeDeckProbabilities(legacy);
        expect(normalized.specialChance).toBe(0);
        expect(normalized.specialWeights.map(weight => weight.type)).toEqual(['chip', 'mult', 'score']);
        expect(normalized.specialWeights[0].chance).toBeCloseTo(0.225);
        expect(normalized.specialWeights[1].chance).toBeCloseTo(0.175);
        expect(normalized.specialWeights[2].chance).toBeCloseTo(0.075);
        expect(normalizeDeckProbabilities(normalized)).toEqual(normalized);
        expect(legacy.specialWeights[0].value).toBe(5);
        const state = { ...createInitialState(), deckProbabilities: legacy };
        expect(useGameBridge.getState().loadGameState(JSON.stringify(state))).toBe(true);
        expect(useGameBridge.getState().gameState.deckProbabilities).toEqual(normalized);
    });

    it('maps saved strength-specific benefits to pooled types and retains original offer IDs', () => {
        for (let target = 8; target < 20; target++) {
            const id = `deck_v2_0_${target * 4}`;
            const card = getPackCard(id)!;
            const type = SPECIAL_TYPES[Math.floor((target - 8) / 4)];
            expect(card.id).toBe(id);
            expect(card.benefits[0]).toMatchObject({ kind: 'special', type, change: 'more' });
            expect(card.benefits[0]).not.toHaveProperty('value');
            const probabilities = { ...base, specialWeights: [{ type, chance: 0.1 }] };
            const changed = applyPackCard(probabilities, card).specialWeights;
            expect(changed).toHaveLength(1);
            expect(changed[0].type).toBe(type);
            expect(changed[0].chance).toBeCloseTo(0.15);
        }
    });

    it('generates at most one modifier for each special type on a new card', () => {
        for (let seed = 0; seed < 300; seed++) {
            const card = generatePackCard(new SeededRNG(seed), 'Rare');
            expect(card.id.startsWith('deck_v3_')).toBe(true);
            const types = card.benefits.flatMap(benefit => benefit.kind === 'special' ? [benefit.type] : []);
            expect(new Set(types).size).toBe(types.length);
            expect(getPackCard(card.id)).toEqual(card);
        }
        expect(getPackCard('deck_v3_0_44')).toBeUndefined();
        expect(getSpecialWeights(base)).toEqual([]);
    });
});
