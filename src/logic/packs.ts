import type { RelicRarity } from './relics/types';

export const PACK_FAMILIES = ['raise', 'deck', 'relic', 'mixed', 'challenge'] as const;
export type PackFamily = typeof PACK_FAMILIES[number];
export type PackQuality = 'average' | 'excellent' | 'exceptional';
type PackFormat = 'basic' | 'jumbo' | 'mega';
// Original IDs remain valid for saved runs; size names are internal only.
export type PackId = `${PackFamily}_${PackFormat}` | `${PackFamily}_${PackFormat}_${Exclude<PackQuality, 'average'>}`;
export type PackItemType = 'RaisePack' | 'DeckPack' | 'RelicPack' | 'MixedPack' | 'ChallengePack';
export const PACK_ITEM_TYPES: Readonly<Record<PackFamily, PackItemType>> = {
    raise: 'RaisePack', deck: 'DeckPack', relic: 'RelicPack', mixed: 'MixedPack', challenge: 'ChallengePack',
};
export const isPackItem = (item: { type: string }): boolean => item.type === 'SpecialPack' || Object.values(PACK_ITEM_TYPES).includes(item.type as PackItemType);

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
const FORMATS = [
    { format: 'basic', cost: 40, offerCount: 3, pickCount: 1, stockWeight: 60 },
    { format: 'jumbo', cost: 60, offerCount: 5, pickCount: 1, stockWeight: 30 },
    { format: 'mega', cost: 80, offerCount: 5, pickCount: 2, stockWeight: 10 },
] as const;
export const RAISE_PACK_COST = 40;
export const PACKS: readonly PackDefinition[] = PACK_FAMILIES.flatMap(family =>
    (['average', 'excellent', 'exceptional'] as const).flatMap((quality, tier) => FORMATS.map(({ format, ...counts }) => ({
        ...counts,
        id: `${family}_${format}${quality === 'average' ? '' : `_${quality}`}` as PackId,
        family, name: `${family[0].toUpperCase() + family.slice(1)} Pack`, quality,
        rarity: (['Common', 'Uncommon', 'Rare'] as const)[tier], cost: counts.cost + tier * 20,
    }))));

export const getPackDefinition = (id?: string | null): PackDefinition => PACKS.find(pack => pack.id === id?.replace(/^special_/, 'deck_')) ?? PACKS[0];

/** Roll quantity and quality independently. Omitting qualityRoll retains legacy average packs. */
export function rollPackDefinition(random: number, family: PackFamily = 'raise', qualityRoll = 0): PackDefinition {
    const format = random < .6 ? 'basic' : random < .9 ? 'jumbo' : 'mega';
    const quality = qualityRoll < .65 ? 'average' : qualityRoll < .9 ? 'excellent' : 'exceptional';
    return getPackDefinition(`${family}_${format}${quality === 'average' ? '' : `_${quality}`}`);
}

export interface PendingPack {
    readonly packId: PackId;
    readonly picksRemaining: number;
}
export const hasPendingPack = (state: { pendingRaiseChoices: readonly string[]; pendingPackChoices: readonly string[]; pendingPack?: PendingPack | null }): boolean => !!state.pendingPack || state.pendingRaiseChoices.length > 0 || state.pendingPackChoices.length > 0;
