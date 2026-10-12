import type { DeckProbabilities, SpecialWeight } from '../engine/GameState';
import type { SeededRNG } from '../engine/rng';

export type SpecialType = SpecialWeight['type'];
export const SPECIAL_TYPES: readonly SpecialType[] = ['chip', 'mult', 'score'];
export const SPECIAL_LABELS: Record<SpecialType, string> = {
    chip: 'Cash Bonus', mult: 'Mult Bonus', score: 'Value Reduction',
};
export const SPECIAL_COLORS: Record<SpecialType, string> = {
    chip: '#4ade80', mult: '#facc15', score: '#c084fc',
};

/** Older saves stored one rate per strength; pool them without losing the total rate. */
export function getSpecialWeights(probabilities: Pick<DeckProbabilities, 'specialWeights' | 'specialChance'>): SpecialWeight[] {
    const totals = { chip: 0, mult: 0, score: 0 };
    for (const weight of probabilities.specialWeights ?? []) {
        if (SPECIAL_TYPES.includes(weight.type) && Number.isFinite(weight.chance)) {
            totals[weight.type] += Math.max(0, weight.chance);
        }
    }
    const total = SPECIAL_TYPES.reduce((sum, type) => sum + totals[type], 0);
    const scale = total > 1 ? 1 / total : 1;
    const generic = (1 - Math.min(1, total)) * Math.max(0, Math.min(1, probabilities.specialChance || 0)) / 3;
    return SPECIAL_TYPES.map(type => ({ type, chance: totals[type] * scale + generic })).filter(weight => weight.chance > 0);
}

export function normalizeDeckProbabilities(probabilities: DeckProbabilities): DeckProbabilities {
    return { ...probabilities, specialChance: 0, specialWeights: getSpecialWeights(probabilities) };
}

export function setSpecialChance(weights: readonly SpecialWeight[], type: SpecialType, targetChance: number, budget = 1 - 1e-12): SpecialWeight[] {
    const current = getSpecialWeights({ specialWeights: weights, specialChance: 0 });
    targetChance = Math.max(0, Math.min(targetChance, budget));
    const othersTotal = current.filter(weight => weight.type !== type).reduce((sum, weight) => sum + weight.chance, 0);
    const scale = othersTotal > budget - targetChance ? (budget - targetChance) / othersTotal : 1;
    return SPECIAL_TYPES.map(key => ({ type: key, chance: key === type ? targetChance : (current.find(weight => weight.type === key)?.chance ?? 0) * scale }))
        .filter(weight => weight.chance > 0);
}

const STRENGTHS: Record<SpecialType, readonly number[]> = {
    chip: [5, 10, 20, 50], mult: [1, 2, 3, 4], score: [1, 2, 3, 4],
};

/** Roll 70% low, 25% middle, 5% high independently of the type's draw rate. */
export function rollSpecialStrength(type: SpecialType, rng: SeededRNG): number {
    const strengths = STRENGTHS[type];
    const roll = rng.next();
    return roll < 0.7 ? strengths[0] : roll < 0.95 ? strengths[1 + rng.roll(2)] : strengths[3];
}
