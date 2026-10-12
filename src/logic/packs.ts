import type { RelicRarity } from './relics/types';

export type PackFamily = 'raise' | 'deck' | 'relic';
export type PackId = `${PackFamily}_${'basic' | 'jumbo' | 'mega'}`;
export type PackItemType = 'RaisePack' | 'DeckPack' | 'RelicPack';
export const PACK_ITEM_TYPES: Readonly<Record<PackFamily, PackItemType>> = { raise: 'RaisePack', deck: 'DeckPack', relic: 'RelicPack' };
export const isPackItem = (item: { type: string }): boolean => item.type === 'SpecialPack' || Object.values(PACK_ITEM_TYPES).includes(item.type as PackItemType);

/** Shared pack catalog; additional content families can be added here. */
export interface PackDefinition {
    readonly id: PackId;
    readonly family: PackFamily;
    readonly name: string;
    readonly rarity: RelicRarity;
    readonly cost: number;
    readonly offerCount: number;
    readonly pickCount: number;
    readonly stockWeight: number;
}

export const RAISE_PACK_COST = 40;
export const PACKS: readonly PackDefinition[] = (['raise', 'deck', 'relic'] as const).flatMap(family => {
    const label = family[0].toUpperCase() + family.slice(1);
    return [
        { id: `${family}_basic` as PackId, family, name: `Basic ${label} Pack`, rarity: 'Common' as const, cost: 40, offerCount: 3, pickCount: 1, stockWeight: 60 },
        { id: `${family}_jumbo` as PackId, family, name: `Jumbo ${label} Pack`, rarity: 'Uncommon' as const, cost: 60, offerCount: 5, pickCount: 1, stockWeight: 30 },
        { id: `${family}_mega` as PackId, family, name: `Mega ${label} Pack`, rarity: 'Rare' as const, cost: 80, offerCount: 5, pickCount: 2, stockWeight: 10 },
    ];
});

// Older runs without pack metadata retain the original three-choose-one rules.
export const getPackDefinition = (id?: string | null): PackDefinition => PACKS.find(pack => pack.id === id?.replace(/^special_/, 'deck_')) ?? PACKS[0];

export function rollPackDefinition(random: number, family: PackFamily = 'raise'): PackDefinition {
    const candidates = PACKS.filter(pack => pack.family === family);
    let roll = random * candidates.reduce((total, pack) => total + pack.stockWeight, 0);
    for (const pack of candidates) {
        roll -= pack.stockWeight;
        if (roll < 0) return pack;
    }
    return candidates[candidates.length - 1];
}

export interface PendingPack {
    readonly packId: PackId;
    readonly picksRemaining: number;
}

export const hasPendingPack = (state: { pendingRaiseChoices: readonly string[]; pendingPackChoices: readonly string[]; pendingPack?: PendingPack | null }): boolean => !!state.pendingPack || state.pendingRaiseChoices.length > 0 || state.pendingPackChoices.length > 0;
