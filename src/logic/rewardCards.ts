import { generateRaise, getRaise } from './handScoring';
import { generatePackCard, getPackCard } from './packCards';
import { rollPackRarity, type PackQuality } from './packs';
import { generateRelicPackChoices } from './relicPacks';
import { RelicManager } from './relics/manager';
import type { RelicInstance, RelicRarity } from './relics/types';
import type { DeckProbabilities } from '../engine/GameState';
import type { SeededRNG } from '../engine/rng';

export type RewardRow = { readonly kind: 'raise'; readonly raiseId: string }
    | { readonly kind: 'deck'; readonly cardId: string }
    | { readonly kind: 'relic'; readonly relicId: string };
export interface RewardCard {
    readonly id: string;
    readonly name: 'Reward';
    readonly rarity: RelicRarity;
    readonly rows: readonly RewardRow[];
}

const RARITIES = ['Common', 'Uncommon', 'Rare'] as const;
export const REWARD_ROW_COUNTS = { Common: 2, Uncommon: 3, Rare: 4 } as const;
const rowId = (row: RewardRow) => row.kind === 'raise' ? row.raiseId : row.kind === 'deck' ? row.cardId : row.relicId;

/** The complete composition lives in the ID, so offers survive export/import. */
export function createRewardCard(rarity: RelicRarity, rows: readonly RewardRow[]): RewardCard {
    return { id: `reward_v1_${RARITIES.indexOf(rarity)}_${encodeURIComponent(JSON.stringify(rows))}`,
        name: 'Reward', rarity, rows };
}

export function getRewardCard(id: string): RewardCard | undefined {
    const match = /^reward_v1_([012])_(.+)$/.exec(id);
    if (!match) return undefined;
    try {
        const rows: RewardRow[] = JSON.parse(decodeURIComponent(match[2]));
        const rarity = RARITIES[Number(match[1])];
        if (!Array.isArray(rows) || rows.length !== REWARD_ROW_COUNTS[rarity]
            || rows.some(row => !row || (row.kind === 'raise' ? !getRaise(row.raiseId)
                : row.kind === 'deck' ? !getPackCard(row.cardId)
                : row.kind === 'relic' ? !RelicManager.getRelicConfig(row.relicId) || !!RelicManager.getRelicConfig(row.relicId)?.tableAction
                : true))
            || new Set(rows.map(rowId)).size !== rows.length
            || new Set(rows.map(row => row.kind)).size < 2
            || rows.filter(row => row.kind === 'relic').length > 1) return undefined;
        return createRewardCard(rarity, rows);
    } catch { return undefined; }
}

export function generateRewardCardChoices(rng: SeededRNG, count: number, probabilities: DeckProbabilities,
    inventory: readonly RelicInstance[], quality: PackQuality = 'average'): RewardCard[] {
    const choices: RewardCard[] = [];
    while (choices.length < count) {
        const rarity = rollPackRarity(rng.next(), quality);
        const relicId = generateRelicPackChoices(rng, 1, inventory, [], quality)[0];
        const kinds = rng.shuffle(relicId ? ['raise', 'deck', 'relic'] as const : ['raise', 'deck'] as const);
        const rows: RewardRow[] = [];
        while (rows.length < REWARD_ROW_COUNTS[rarity]) {
            const kind = kinds[rows.length] ?? rng.pick(['raise', 'deck'] as const);
            const row: RewardRow = kind === 'raise' ? { kind, raiseId: generateRaise(rng, 'Common').id }
                : kind === 'deck' ? { kind, cardId: generatePackCard(rng, 'Common', probabilities).id }
                : { kind, relicId };
            if (!rows.some(existing => rowId(existing) === rowId(row))) rows.push(row);
        }
        const card = createRewardCard(rarity, rows);
        if (!choices.some(choice => choice.id === card.id)) choices.push(card);
    }
    return choices;
}

export const getRewardLineCount = (card: RewardCard) => card.rows.reduce((total, row) =>
    total + (row.kind === 'raise' ? getRaise(row.raiseId)!.modifiers.length : row.kind === 'deck' ? getPackCard(row.cardId)!.benefits.length : 1), 0);
