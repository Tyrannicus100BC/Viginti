import type { RewardConfig, ShopPriceOverrides } from '../cities/types';
import { RelicManager } from '../relics/manager';
import type { RelicInstance, RelicRarity } from '../relics/types';
import type { SeededRNG } from '../../engine/rng';
import { RAISES, getRaise } from '../handScoring';
import { rollPackDefinition, type PackId } from '../packs';

export interface ShopItem {
    id: string;
    type: 'Relic' | 'RaisePack' | 'Control' | 'Score' | 'Raise' | 'TableAction';
    purchased?: boolean;
    cost: number;
    nameOverride?: string;
    packId?: PackId;
}

const RELIC_CASH_COSTS: Record<RelicRarity, number> = {
    Common: 40,
    Uncommon: 70,
    Rare: 100
};

export const getRelicCashCost = (relicId: string): number => {
    const raise = getRaise(relicId);
    if (raise) return raise.cost;
    const config = RelicManager.getRelicConfig(relicId);
    if (!config) return RELIC_CASH_COSTS.Uncommon;
    return RELIC_CASH_COSTS[config.rarity] ?? RELIC_CASH_COSTS.Uncommon;
};

export const getRelicSellCashValue = (relicId: string): number => {
    const rarity = RelicManager.getRelicConfig(relicId)?.rarity ?? 'Common';
    return { Common: 20, Uncommon: 40, Rare: 60 }[rarity];
};

export function generateShopItems(
    configList: RewardConfig[],
    currentInventory: RelicInstance[],
    priceOverrides?: ShopPriceOverrides,
    rng?: SeededRNG,
    excludedRelicIds: readonly string[] = []
): ShopItem[] {
    const items: ShopItem[] = [];
    const currentIds = [...currentInventory.map(i => i.id), ...excludedRelicIds];
    const pickedRelicIds = new Set<string>();

    // Use seeded RNG if provided, otherwise fall back to Math.random()
    const nextRandom = rng ? () => rng.next() : () => Math.random();

    for (const config of configList) {
        for (let i = 0; i < config.count; i++) {
            if (config.type === 'RaisePack') {
                const pack = rollPackDefinition(nextRandom());
                items.push({ id: `raise_pack_${items.length}`, type: 'RaisePack', packId: pack.id, cost: pack.cost, nameOverride: pack.name });
                continue;
            }
            if (config.type === 'Raise') {
                const candidates = RAISES.filter(raise => !pickedRelicIds.has(raise.id) && (!config.specificIds?.length || config.specificIds.includes(raise.id)));
                if (!candidates.length) continue;
                const pick = candidates[Math.floor(nextRandom() * candidates.length)];
                items.push({ id: pick.id, type: 'Raise', cost: pick.cost, nameOverride: pick.name });
                pickedRelicIds.add(pick.id);
                continue;
            }
            if (config.type !== 'Relic' && config.type !== 'Control' && config.type !== 'Score' && config.type !== 'TableAction') {
                continue;
            }

            let candidates = RelicManager.getAllRelics().filter(r => {
                const matchesType = config.type === 'TableAction'
                    ? !!r.tableAction
                    : config.type === 'Relic' || r.categories.includes(config.type);

                return matchesType && !currentIds.includes(r.id) && !pickedRelicIds.has(r.id);
            });

            if (config.categories && config.categories.length > 0) {
                candidates = candidates.filter(r => config.categories!.some(cat => r.categories.includes(cat)));
            }

            if (config.excludeCategories && config.excludeCategories.length > 0) {
                candidates = candidates.filter(r => !config.excludeCategories!.some(cat => r.categories.includes(cat)));
            }

            if (config.specificIds && config.specificIds.length > 0) {
                candidates = RelicManager.getAllRelics().filter(r => {
                    const matchesType = config.type === 'TableAction'
                        ? !!r.tableAction
                        : config.type === 'Relic' || r.categories.includes(config.type);

                    return matchesType && config.specificIds!.includes(r.id) && !currentIds.includes(r.id) && !pickedRelicIds.has(r.id);
                });
            }

            if (candidates.length === 0) {
                continue;
            }

            const pick = candidates[Math.floor(nextRandom() * candidates.length)];

            items.push({
                id: pick.id,
                type: config.type,
                cost: getRelicCashCost(pick.id),
                nameOverride: pick.name
            });
            pickedRelicIds.add(pick.id);
        }
    }

    if (!priceOverrides) return items;

    return items.map(item => {
        const overrideCost = priceOverrides[item.id];
        if (overrideCost === undefined) return item;
        return { ...item, cost: Math.max(0, overrideCost) };
    });
}
