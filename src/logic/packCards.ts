import type { DeckProbabilities, RankWeights, SpecialWeight, SuitWeights } from '../engine/GameState';
import type { SeededRNG } from '../engine/rng';
import type { RelicRarity } from './relics/types';
import { getSpecialWeights, normalizeDeckProbabilities, setSpecialChance, SPECIAL_LABELS, SPECIAL_TYPES } from './specialCards';

export type ProbabilityChange = 'more' | 'far more' | 'fewer' | 'far fewer';
export type PackBenefit = ({ readonly kind: 'suit'; readonly target: keyof SuitWeights }
    | { readonly kind: 'rank'; readonly target: keyof RankWeights }
    | { readonly kind: 'special'; readonly type: SpecialWeight['type'] })
    & { readonly change: ProbabilityChange; readonly label: string };
export interface PackCard {
    readonly id: string;
    readonly name: string;
    readonly family: 'deck';
    readonly rarity: RelicRarity;
    readonly benefits: readonly PackBenefit[];
}

const RARITIES = ['Common', 'Uncommon', 'Rare'] as const;
export const PACK_CARD_BENEFITS: Readonly<Record<RelicRarity, number>> = { Common: 1, Uncommon: 2, Rare: 3 };
const CHANGES: readonly ProbabilityChange[] = ['more', 'far more', 'fewer', 'far fewer'];
const TARGETS = [
    ...(['hearts', 'diamonds', 'clubs', 'spades'] as const).map(target => ({
        kind: 'suit' as const, target, label: target[0].toUpperCase() + target.slice(1),
    })),
    ...(['ace', 'face', 'upper', 'lower'] as const).map(target => ({
        kind: 'rank' as const, target, label: { ace: 'Aces', face: '10–K', upper: '6–9', lower: '2–5' }[target],
    })),
    ...SPECIAL_TYPES.map(type => ({ kind: 'special' as const, type, label: SPECIAL_LABELS[type] })),
];
const BENEFITS: readonly PackBenefit[] = TARGETS.flatMap(target => CHANGES.map(change => ({ ...target, change })));
const isDecrease = (change: ProbabilityChange) => change.endsWith('fewer');
const LIMIT = 1e-12;

/** Changes are percentage points in the middle and proportional near the limits. */
export function changeProbability(probability: number, change: ProbabilityChange): number {
    const far = change.startsWith('far');
    const step = far ? 0.1 : 0.05;
    const low = far ? 0.15 : 0.1;
    const high = far ? 0.7 : 0.8;
    const p = Math.max(0, Math.min(1, probability));
    if (isDecrease(change)) return p <= low ? p * 2 / 3 : Math.max(LIMIT, p - step);
    // One fifth / one quarter of the remaining gap is always smaller than the
    // normal step above these thresholds, and never exhausts the remaining gap.
    return Math.min(1 - LIMIT, p > high ? p + (1 - p) / (far ? 4 : 5) : p + step);
}

function buildCard(rarity: RelicRarity, indices: number[], id?: string): PackCard {
    return { id: id ?? `deck_v3_${RARITIES.indexOf(rarity)}_${indices.join('.')}`,
        family: 'deck', rarity, name: 'Deck Upgrade', benefits: indices.map(index => BENEFITS[index]) };
}

/** Earlier offers remain readable when resuming a saved pack. */
export function getPackCard(id: string): PackCard | undefined {
    const match = /^(deck_v3|deck_v2|deck_v1|special_v1)_([012])_(\d+(?:\.\d+)*)$/.exec(id);
    if (!match) return undefined;
    const rarity = RARITIES[Number(match[2])];
    const indices = match[3].split('.').map(Number);
    const legacy = match[1] !== 'deck_v3';
    if (indices.length !== PACK_CARD_BENEFITS[rarity] || new Set(indices).size !== indices.length
        || indices.some(index => index >= (match[1] === 'deck_v1' ? 16 : match[1] === 'special_v1' ? 12 : match[1] === 'deck_v2' ? 80 : BENEFITS.length))) return undefined;
    const previous = indices.map(index => match[1] === 'deck_v1' ? Math.floor(index / 2) * 4 + (index % 2 ? 2 : 0)
        : match[1] === 'special_v1' ? (8 + index) * 4 : index);
    if (new Set(previous.map(index => Math.floor(index / 4))).size !== previous.length) return undefined;
    const converted = previous.map(index => legacy && index >= 32 ? (8 + Math.floor((Math.floor(index / 4) - 8) / 4)) * 4 + index % 4 : index);
    return buildCard(rarity, converted, legacy ? id : undefined);
}

function getBenefitProbability(probabilities: DeckProbabilities | undefined, benefit: PackBenefit): number {
    if (benefit.kind === 'special') return probabilities ? getSpecialWeights(probabilities).find(weight => weight.type === benefit.type)?.chance ?? 0 : 0;
    if (!probabilities) return 0.25;
    const weights = benefit.kind === 'suit' ? probabilities.suits : probabilities.ranks;
    const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    return (weights as unknown as Record<string, number>)[benefit.target] / total;
}

export function generatePackCard(rng: SeededRNG, rarity: RelicRarity, probabilities?: DeckProbabilities): PackCard {
    const indices: number[] = [];
    while (indices.length < PACK_CARD_BENEFITS[rarity]) {
        const available = BENEFITS.map((_, index) => index).filter(index =>
            !indices.some(other => Math.floor(other / 4) === Math.floor(index / 4))
            && (!isDecrease(BENEFITS[index].change) || getBenefitProbability(probabilities, BENEFITS[index]) > 0));
        indices.push(rng.pick(available));
    }
    return buildCard(rarity, indices.sort((a, b) => a - b));
}

export function generatePackCardChoices(rng: SeededRNG, count: number, probabilities: DeckProbabilities): PackCard[] {
    const choices: PackCard[] = [];
    while (choices.length < count) {
        const roll = rng.next();
        const card = generatePackCard(rng, roll < 0.7 ? 'Common' : roll < 0.95 ? 'Uncommon' : 'Rare', probabilities);
        if (!choices.some(choice => choice.id === card.id)) choices.push(card);
    }
    return choices;
}

/** Redistribute the remaining probability proportionally among the other outcomes. */
function adjustDistribution(weights: Record<string, number>, target: string, change: ProbabilityChange): Record<string, number> {
    const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    const current = weights[target] / total;
    const next = changeProbability(current, change);
    const remaining = total - weights[target];
    const others = Object.keys(weights).filter(key => key !== target);
    return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key,
        key === target ? next : remaining > 0 ? value / remaining * (1 - next) : (1 - next) / others.length]));
}

// Retain the legacy Enhance action for older callers.
export function increaseSpecialChance(weights: readonly SpecialWeight[], effect: Pick<SpecialWeight, 'type'>, chance: number): SpecialWeight[] {
    const current = getSpecialWeights({ specialWeights: weights, specialChance: 0 }).find(weight => weight.type === effect.type)?.chance ?? 0;
    return setSpecialChance(weights, effect.type, current + chance);
}

export function applyPackCard(probabilities: DeckProbabilities, card: PackCard): DeckProbabilities {
    let result = normalizeDeckProbabilities(probabilities);
    for (const benefit of card.benefits) {
        if (benefit.kind === 'special') {
            const current = getBenefitProbability(result, benefit);
            result = { ...result, specialWeights: setSpecialChance(result.specialWeights, benefit.type, changeProbability(current, benefit.change)) };
        } else if (benefit.kind === 'suit') {
            const weights = adjustDistribution({ ...result.suits }, benefit.target, benefit.change);
            result = { ...result, suits: { hearts: weights.hearts * 100, diamonds: weights.diamonds * 100, clubs: weights.clubs * 100, spades: weights.spades * 100 } };
        } else {
            const weights = adjustDistribution({ ...result.ranks }, benefit.target, benefit.change);
            result = { ...result, ranks: { ace: weights.ace * 100, face: weights.face * 100, upper: weights.upper * 100, lower: weights.lower * 100 } };
        }
    }
    return result;
}
