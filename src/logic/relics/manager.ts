
import type { 
    RelicConfig, 
    RelicHooks, 
    GameContext, 
    PrioritizedHook,
    ScoreRowContext
} from './types';
import { RELIC_REGISTRY } from './registry';

// Helper to normalize hook to PrioritizedHook
function normalizeHook<T>(hook: T | PrioritizedHook<T>): PrioritizedHook<T> {
    if (typeof hook === 'object' && hook !== null && 'priority' in hook && 'handler' in hook) {
        return hook as PrioritizedHook<T>;
    }
    return { priority: 0, handler: hook as T };
}

export class RelicManager {
    static getRelicConfig(id: string): RelicConfig | undefined {
        return RELIC_REGISTRY[id];
    }

    // Execute a value hook across all active relics
    static executeValueHook<T, C extends GameContext>(
        hookName: keyof RelicHooks,
        initialValue: T,
        context: C
    ): T {
        const { inventory } = context;
        let currentValue = initialValue;

        // Collect all applicable hooks
        const activeHooks: { id: string; priority: number; handler: Function }[] = [];

        inventory.forEach(relicId => {
            const config = RELIC_REGISTRY[relicId];
            if (!config || !config.hooks[hookName]) return;

            const rawHook = config.hooks[hookName];
            // Typescript assumes rawHook could be any of the union types, so we cast to unknown then handle
            const normalized = normalizeHook(rawHook as any);
            
            activeHooks.push({
                id: relicId,
                priority: normalized.priority,
                handler: normalized.handler
            });
        });

        // Sort by Priority ASC, then by Inventory Order (FIFO)
        // Inventory order is implicit because we pushed them in inventory order.
        // Javascript's sort is stable, so we only need to sort by priority.
        activeHooks.sort((a, b) => a.priority - b.priority);

        // Execute pipeline
        for (const hook of activeHooks) {
             try {
                currentValue = hook.handler(currentValue, context);
             } catch (e) {
                 console.error(`Error in relic hook ${hookName} for relic ${hook.id}:`, e);
             }
        }

        return currentValue;
    }

    // Execute interrupt hooks (Async)
    static async executeInterruptHook<C extends GameContext>(
        hookName: keyof RelicHooks,
        context: C
    ): Promise<void> {
        const { inventory } = context;

        // Collect all applicable hooks
        const activeHooks: { id: string; priority: number; handler: Function }[] = [];

        inventory.forEach(relicId => {
            const config = RELIC_REGISTRY[relicId];
            if (!config || !config.hooks[hookName]) return;

             const rawHook = config.hooks[hookName];
             const normalized = normalizeHook(rawHook as any);

            activeHooks.push({
                id: relicId,
                priority: normalized.priority,
                handler: normalized.handler
            });
        });

        activeHooks.sort((a, b) => a.priority - b.priority);

        for (const hook of activeHooks) {
            try {
                await hook.handler(context);
            } catch (e) {
                console.error(`Error in interrupt relic hook ${hookName} for relic ${hook.id}:`, e);
            }
        }
    }
}
