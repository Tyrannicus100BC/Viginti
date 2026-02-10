import type { RewardConfig, ShopPriceOverrides } from '../cities/types';
import { RelicManager } from '../relics/manager';
import type { RelicInstance, RelicRarity } from '../relics/types';

export interface ShopItem {
    id: string;
    type: 'Charm' | 'Angle' | 'TableAction';
    purchased?: boolean;
    cost: number;
    nameOverride?: string;
}

const RELIC_COMP_COSTS: Record<RelicRarity, number> = {
    Common: 4,
    Uncommon: 7,
    Rare: 10
};

export const getRelicCompCost = (relicId: string): number => {
    const config = RelicManager.getRelicConfig(relicId);
    if (!config) return RELIC_COMP_COSTS.Uncommon;
    return RELIC_COMP_COSTS[config.rarity] ?? RELIC_COMP_COSTS.Uncommon;
};

export function generateShopItems(
    configList: RewardConfig[],
    currentInventory: RelicInstance[],
    priceOverrides?: ShopPriceOverrides
): ShopItem[] {
    const items: ShopItem[] = [];
    const currentIds = currentInventory.map(i => i.id);
    const pickedRelicIds = new Set<string>();

    for (const config of configList) {
        for (let i = 0; i < config.count; i++) {
            if (config.type !== 'Charm' && config.type !== 'Angle' && config.type !== 'TableAction') {
                continue;
            }

            let candidates = RelicManager.getAllRelics().filter(r => {
                const matchesType = config.type === 'TableAction'
                    ? !!r.tableAction
                    : r.categories.includes(config.type);

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
                        : r.categories.includes(config.type);

                    return matchesType && config.specificIds!.includes(r.id) && !pickedRelicIds.has(r.id);
                });
            }

            if (candidates.length === 0) {
                continue;
            }

            const pick = candidates[Math.floor(Math.random() * candidates.length)];

            items.push({
                id: pick.id,
                type: config.type,
                cost: getRelicCompCost(pick.id),
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
