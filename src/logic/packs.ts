import type { RelicRarity } from './relics/types';

export type PackId = 'raise_basic' | 'raise_jumbo' | 'raise_mega';

/** Shared pack catalog; additional content families can be added here. */
export interface PackDefinition {
    readonly id: PackId;
    readonly family: 'raise';
    readonly name: string;
    readonly rarity: RelicRarity;
    readonly cost: number;
    readonly offerCount: number;
    readonly pickCount: number;
    readonly stockWeight: number;
}

export const RAISE_PACK_COST = 40;
export const PACKS: readonly PackDefinition[] = [
    { id: 'raise_basic', family: 'raise', name: 'Basic Raise Pack', rarity: 'Common', cost: RAISE_PACK_COST, offerCount: 3, pickCount: 1, stockWeight: 60 },
    { id: 'raise_jumbo', family: 'raise', name: 'Jumbo Raise Pack', rarity: 'Uncommon', cost: 60, offerCount: 5, pickCount: 1, stockWeight: 30 },
    { id: 'raise_mega', family: 'raise', name: 'Mega Raise Pack', rarity: 'Rare', cost: 80, offerCount: 5, pickCount: 2, stockWeight: 10 },
];

// Older runs without pack metadata retain the original three-choose-one rules.
export const getPackDefinition = (id?: string | null): PackDefinition => PACKS.find(pack => pack.id === id) ?? PACKS[0];

export function rollPackDefinition(random: number): PackDefinition {
    let roll = random * PACKS.reduce((total, pack) => total + pack.stockWeight, 0);
    for (const pack of PACKS) {
        roll -= pack.stockWeight;
        if (roll < 0) return pack;
    }
    return PACKS[PACKS.length - 1];
}

export interface PendingPack {
    readonly packId: PackId;
    readonly picksRemaining: number;
}
