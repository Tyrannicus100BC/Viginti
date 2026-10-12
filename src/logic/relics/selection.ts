import type { RelicConfig, RelicRarity } from './types';

const RARITY_WEIGHTS: Record<RelicRarity, number> = { Common: 70, Uncommon: 25, Rare: 5 };
const RARITIES: RelicRarity[] = ['Common', 'Uncommon', 'Rare'];

/** Roll rarity first, then pick uniformly within it, regardless of catalogue size. */
export function pickRandomRelic(candidates: readonly RelicConfig[], nextRandom: () => number): RelicConfig | undefined {
    const pools = RARITIES.map(rarity => ({
        weight: RARITY_WEIGHTS[rarity],
        relics: candidates.filter(relic => relic.rarity === rarity),
    })).filter(pool => pool.relics.length > 0);
    if (!pools.length) return undefined;

    // Empty rarities contribute no weight, so exhausted pools cannot leave an empty offer.
    const totalWeight = pools.reduce((sum, pool) => sum + pool.weight, 0);
    let roll = nextRandom() * totalWeight;
    for (const pool of pools) {
        if (roll < pool.weight) {
            return pool.relics[Math.floor(nextRandom() * pool.relics.length)];
        }
        roll -= pool.weight;
    }
    return undefined;
}
