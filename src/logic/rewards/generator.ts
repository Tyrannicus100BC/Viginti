
import type { RewardConfig } from '../cities/types';
import { RelicManager } from '../relics/manager';
import { createStandardDeck } from '../deck';
import type { Card } from '../../types';
import type { RelicInstance } from '../relics/types';

export interface ShopItem {
    id: string;
    type: 'Charm' | 'Angle' | 'Card';
    card?: Card;
    purchased?: boolean;
    cost?: number;
    nameOverride?: string;
}

export function generateShopItems(configList: RewardConfig[], currentInventory: RelicInstance[]): ShopItem[] {
    const items: ShopItem[] = [];
    const currentIds = currentInventory.map(i => i.id);

    for (const config of configList) {
        for (let i = 0; i < config.count; i++) {
            if (config.type === 'Card') {
                const fullDeck = createStandardDeck();
                const idx = Math.floor(Math.random() * fullDeck.length);
                const card = fullDeck[idx];
                card.isFaceUp = true;
                card.origin = 'shop';

                let itemCost = config.cost ?? 1;
                let itemName = 'Standard Card';
                let itemId = `shop_card_${config.forceSpecialCard ? 'special' : 'standard'}_${items.length}_${i}`;

                if (config.forceSpecialCard) {
                    const effects = [
                        { type: 'mult' as const, value: 1 }, { type: 'mult' as const, value: 2 },
                        { type: 'chip' as const, value: 5 }, { type: 'chip' as const, value: 10 }
                    ];
                    card.specialEffect = effects[Math.floor(Math.random() * effects.length)];
                    itemCost = config.cost ?? 2;
                    itemName = 'Special Card';
                }

                items.push({
                    id: itemId,
                    type: 'Card',
                    card: card,
                    cost: itemCost,
                    nameOverride: itemName
                });

            } else if (config.type === 'Charm' || config.type === 'Angle') {
                // Filter Logic
                let candidates = RelicManager.getAllRelics().filter(r => 
                    r.categories.includes(config.type) && !currentIds.includes(r.id)
                );

                if (config.categories && config.categories.length > 0) {
                     candidates = candidates.filter(r => {
                        // If matchAllCategories is true, needs all. Else needs at least one.
                        // Default to AT LEAST ONE matches logic of "from Suite, Global, Cards"
                        // But wait, "Random charms, from Suite, Global, Cards" usually means strict subset?
                        // "from the categories of Suite, Global, and Cards" -> Union.
                         return config.categories!.some(cat => r.categories.includes(cat));
                     });
                }
                
                if (config.excludeCategories && config.excludeCategories.length > 0) {
                     candidates = candidates.filter(r => {
                         return !config.excludeCategories!.some(cat => r.categories.includes(cat));
                     });
                }

                if (config.specificIds && config.specificIds.length > 0) {
                    // Logic: If specific IDs are requested, we MUST try to find them.
                    // But usually generating "N" counts.
                    // If specificIds are provided, maybe "Count" applies to how many FROM that list?
                    // Or if specificIds are provided, they override the random pool?
                    // User: "The second rewards only offers two choices between Double Down and Surrender"
                    // This implies the candidates are ONLY Double Down and Surrender.
                    candidates = candidates.filter(r => config.specificIds!.includes(r.id));
                    
                    // Also relax the "currentIds" check if we want to allow buying charges?
                    // "Double Down" and "Surrender" are charms. If you have them, do they stack?
                    // The Relic definitions don't explicitly say "stackable".
                    // However, `gameStore` logic for DD checks `doubleDownCharges`.
                    // If you buy it again, does it add charges?
                    // `confirmShopSelection` -> `newInventory.push(newInstance)`.
                    // It pushes a NEW instance.
                    // `gameStore.ts`: `surrenders: initialInventory.some(r => r.id === 'surrender') ? 3 : 0`
                    // It seems it checks if you HAVE it.
                    // If we want to allow buying it again to refill, we need to handle that.
                    // For now, let's assume we can see it even if we have it IF it's in specificIds.
                     if (config.specificIds) {
                        // Re-add candidates that were filtered out by !currentIds if they are in specificIds
                        const specificCandidates = RelicManager.getAllRelics().filter(r => config.specificIds!.includes(r.id));
                        // Merge?
                        // Let's just reset candidates to specific ones if specificIds is set
                         candidates = RelicManager.getAllRelics().filter(r => config.specificIds!.includes(r.id));
                    }
                }

                // Pick Random
                if (candidates.length > 0) {
                    const pickIndex = Math.floor(Math.random() * candidates.length);
                    const pick = candidates[pickIndex];
                    
                    items.push({
                        id: pick.id,
                        type: config.type,
                        cost: config.cost ?? (config.type === 'Angle' ? 8 : 5),
                        nameOverride: pick.name
                    });

                    // Remove from candidates to avoid dupes in same shop?
                    // Or duplicates are allowed if inventory allows?
                    // Usually shops don't have dupes.
                }
            } else if (config.type === 'Action') {
                 // Action maps to specific Charms usually (Double Down, Surrender)
                 // treat as Charm but look up by ID?
                 // User used "Action" in my types.ts but relic defs have "Action".
                 // Let's treat Action as Charm for now if the system expects Charms/Angles categories.
                 // Actually my `RewardConfig` has `type: 'Charm' | 'Angle' | 'Card' | 'Action'`.
                 // But `ShopItem` has `type: 'Charm' | 'Angle' | 'Card'`.
                 
                 // If type is Action, we probably mean "Unlockable Ability" which are Charms in the system.
                  let candidates = RelicManager.getAllRelics().filter(r => 
                    r.categories.includes('Action') || (config.specificIds && config.specificIds.includes(r.id))
                );
                 // Filter specific
                 if (config.specificIds) {
                     candidates = candidates.filter(r => config.specificIds!.includes(r.id));
                 }

                 if (candidates.length > 0) {
                     // If we need to offer "Two choices between DD and Surrender", and count is 1?
                     // Config said: "offeres two choices between Double Down and Surrender".
                     // So count should be 2? Or we run this loop 1 time and pick 2?
                     // My loop runs `count` times.
                     // The config I wrote was:
                     // return [{ type: 'Action', count: 1, specificIds: ['double_down', 'surrender'], cost: 5 }];
                     // Wait, if I want TWO choices, count should be 2?
                     // No, "offers rewards... choices".
                     // The user said "second rewards only offers two choices".
                     // Meaning the shop has 2 items.
                     // So I probably want:
                     // `[{ type: 'Action', count: 1, specificIds: ['double_down'], ... }, { type: 'Action', count: 1, specificIds: ['surrender'], ... }]`?
                     // OR `[{ type: 'Action', count: 2, specificIds: ['double_down', 'surrender'], ... }]`.
                     // If candidates has 2 items, and count is 2.
                     // 1st iteration: picks random (say DD).
                     // 2nd iteration: picks random.
                     // To avoid dupes, I should remove picked from candidates.
                     
                    const pickIndex = Math.floor(Math.random() * candidates.length);
                    const pick = candidates[pickIndex];
                    
                    items.push({
                        id: pick.id,
                        type: 'Charm', // Treat action as Charm in ShopItem
                        cost: config.cost ?? 5,
                        nameOverride: pick.name
                    });
                     // Remove pick from future candidates in this loop if we want unique items
                     // But `candidates` is scoped to loop.
                     // I should define candidates unique logic outside.
                 }
            }
        }
    }
    
    // De-duplication of IDs in the generated list
    // (A bit hacky, better to manage candidates statefully, but this works for now)
    const uniqueItems: ShopItem[] = [];
    const seenIds = new Set<string>();
    
    // Bias towards preserving first items
    for(const item of items) {
        if(item.type === 'Card') {
            uniqueItems.push(item); // Cards are unique by instance usually
        } else {
            if(!seenIds.has(item.id)) {
                seenIds.add(item.id);
                uniqueItems.push(item);
            }
        }
    }

    return uniqueItems;
}
