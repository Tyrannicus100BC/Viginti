import type { RewardConfig, ShopPriceOverrides } from '../cities/types';
import { RelicManager } from '../relics/manager';
import { pickRandomRelic } from '../relics/selection';
import type { RelicInstance, RelicRarity } from '../relics/types';
import { SeededRNG } from '../../engine/rng';
import { generateRaiseChoices, getRaise } from '../handScoring';
import { rollPackDefinition, isPackItem, PACK_ITEM_TYPES, type PackId, type PackItemType } from '../packs';

export interface ShopItem {
    id: string;
    type: 'Relic' | PackItemType | 'SpecialPack' | 'Control' | 'Score' | 'Raise' | 'TableAction';
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
            if (isPackItem(config)) {
                const family = config.type === 'RelicPack' ? 'relic' : config.type === 'DeckPack' || config.type === 'SpecialPack' ? 'deck' : 'raise';
                const pack = rollPackDefinition(nextRandom(), family);
                items.push({ id: `${family}_pack_${items.length}`, type: PACK_ITEM_TYPES[family], packId: pack.id, cost: pack.cost, nameOverride: pack.name });
                continue;
            }
            if (config.type === 'Raise') {
                const candidates = config.specificIds?.length
                    ? config.specificIds.map(getRaise).filter(raise => raise && !pickedRelicIds.has(raise.id)
                        && !raise.modifiers.some(effect => (effect.handTypeId === 'loss' || effect.handTypeId === 'bust') && (effect.chips > 0 || effect.mult > 0)))
                    : generateRaiseChoices(rng ?? SeededRNG.random(), 1);
                if (!candidates.length) continue;
                let pick = candidates[Math.floor(nextRandom() * candidates.length)]!;
                while (pickedRelicIds.has(pick.id)) pick = generateRaiseChoices(rng ?? SeededRNG.random(), 1)[0];
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

                return matchesType && !r.tableAction && !currentIds.includes(r.id) && !pickedRelicIds.has(r.id);
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

                    return matchesType && !r.tableAction && config.specificIds!.includes(r.id) && !currentIds.includes(r.id) && !pickedRelicIds.has(r.id);
                });
            }

            if (candidates.length === 0) {
                continue;
            }

            const pick = pickRandomRelic(candidates, nextRandom);
            if (!pick) continue;

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
