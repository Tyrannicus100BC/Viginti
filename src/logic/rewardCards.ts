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
export const MAX_REWARD_LINES = 5;
const rowId = (row: RewardRow) => row.kind === 'raise' ? row.raiseId : row.kind === 'deck' ? row.cardId : row.relicId;
const rowLineCount = (row: RewardRow) => row.kind === 'raise' ? getRaise(row.raiseId)!.modifiers.length
    : row.kind === 'deck' ? getPackCard(row.cardId)!.benefits.length : 1;

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

/** Shared production composition for live offers and rarity-filtered previews. */
export function generateRewardCard(rng: SeededRNG, rarity: RelicRarity, probabilities: DeckProbabilities,
    inventory: readonly RelicInstance[], quality: PackQuality = 'average'): RewardCard {
    const relicId = generateRelicPackChoices(rng, 1, inventory, [], quality)[0];
    const kinds = rng.shuffle(relicId ? ['raise', 'deck', 'relic'] as const : ['raise', 'deck'] as const);
    const rows: RewardRow[] = [];
    let lineCount = 0;
    while (rows.length < REWARD_ROW_COUNTS[rarity]) {
        const kind = kinds[rows.length] ?? rng.pick(['raise', 'deck'] as const);
        const row: RewardRow = kind === 'raise' ? { kind, raiseId: generateRaise(rng, 'Common').id }
            : kind === 'deck' ? { kind, cardId: generatePackCard(rng, 'Common', probabilities).id }
            : { kind, relicId };
        const lines = rowLineCount(row);
        // Keep every tradeoff intact and reserve one visible line per remaining upgrade.
        const remaining = REWARD_ROW_COUNTS[rarity] - rows.length - 1;
        if (lineCount + lines + remaining > MAX_REWARD_LINES) continue;
        if (!rows.some(existing => rowId(existing) === rowId(row))) {
            rows.push(row);
            lineCount += lines;
        }
    }
    return createRewardCard(rarity, rows);
}

export function generateRewardCardChoices(rng: SeededRNG, count: number, probabilities: DeckProbabilities,
    inventory: readonly RelicInstance[], quality: PackQuality = 'average'): RewardCard[] {
    const choices: RewardCard[] = [];
    while (choices.length < count) {
        const card = generateRewardCard(rng, rollPackRarity(rng.next(), quality), probabilities, inventory, quality);
        if (!choices.some(choice => choice.id === card.id)) choices.push(card);
    }
    return choices;
}

export const getRewardLineCount = (card: RewardCard) => card.rows.reduce((total, row) =>
    total + rowLineCount(row), 0);
