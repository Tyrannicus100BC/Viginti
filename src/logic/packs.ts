import type { RelicRarity } from './relics/types';

export type PackFamily = 'mixed' | 'relic';
export type PackQuality = 'average' | 'excellent' | 'exceptional';
export type PackId = 'mixed_major' | 'mixed_minor' | 'relic_boss';

export const PACK_QUALITY_LABELS: Record<PackQuality, string> = { average: 'Average', excellent: 'Great', exceptional: 'Exceptional' };
export const PACK_RARITY_WEIGHTS: Readonly<Record<PackQuality, Readonly<Record<RelicRarity, number>>>> = {
    average: { Common: 70, Uncommon: 25, Rare: 5 },
    excellent: { Common: 35, Uncommon: 45, Rare: 20 },
    exceptional: { Common: 10, Uncommon: 40, Rare: 50 },
};
export function rollPackRarity(random: number, quality: PackQuality = 'average'): RelicRarity {
    const weights = PACK_RARITY_WEIGHTS[quality];
    const roll = random * 100;
    return roll < weights.Common ? 'Common' : roll < weights.Common + weights.Uncommon ? 'Uncommon' : 'Rare';
}
export const describePackChoices = (pack: PackDefinition) => `Choose ${pack.pickCount} of ${pack.offerCount} · ${PACK_QUALITY_LABELS[pack.quality]} choices`;

export interface PackDefinition {
    readonly id: PackId;
    readonly family: PackFamily;
    readonly name: string;
    readonly quality: PackQuality;
    readonly rarity: RelicRarity;
    readonly cost: number;
    readonly offerCount: number;
    readonly pickCount: number;
    readonly stockWeight: number;
}
export const RAISE_PACK_COST = 40;
export const PACKS: readonly PackDefinition[] = [
    { id: 'mixed_major', family: 'mixed', name: 'Major Reward', quality: 'average', rarity: 'Common', cost: 0, offerCount: 6, pickCount: 1, stockWeight: 0 },
    { id: 'mixed_minor', family: 'mixed', name: 'Minor Reward', quality: 'average', rarity: 'Common', cost: 0, offerCount: 3, pickCount: 1, stockWeight: 0 },
    { id: 'relic_boss', family: 'relic', name: 'Boss Reward', quality: 'average', rarity: 'Common', cost: 0, offerCount: 2, pickCount: 1, stockWeight: 0 },
];

export const getPackDefinition = (id?: string | null): PackDefinition => PACKS.find(pack => pack.id === id) ?? PACKS[0];

export interface PendingPack {
    readonly packId: PackId;
    readonly picksRemaining: number;
}
export const hasPendingPack = (state: { pendingPackChoices: readonly string[]; pendingPack?: PendingPack | null }): boolean => !!state.pendingPack || state.pendingPackChoices.length > 0;
