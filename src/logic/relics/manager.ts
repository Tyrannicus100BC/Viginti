
import type { 
    RelicConfig, 
    RelicHooks, 
    GameContext, 
    PrioritizedHook
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
        const activeHooks: { instance: any; priority: number; handler: Function }[] = [];

        inventory.forEach(instance => {
            const config = RELIC_REGISTRY[instance.id];
            if (!config || !config.hooks[hookName]) return;

            const rawHook = config.hooks[hookName];
            // Typescript assumes rawHook could be any of the union types, so we cast to unknown then handle
            const normalized = normalizeHook(rawHook as any);
            
            activeHooks.push({
                instance: instance,
                priority: normalized.priority,
                handler: normalized.handler
            });
        });

        // Sort by Priority ASC, then by Inventory Order (FIFO)
        activeHooks.sort((a, b) => a.priority - b.priority);

        // Execute pipeline
        for (const hook of activeHooks) {
             try {
                // Pass relic state as the last argument
                currentValue = hook.handler(currentValue, context, hook.instance.state);
             } catch (e) {
                 console.error(`Error in relic hook ${hookName} for relic ${hook.instance.id}:`, e);
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
        const activeHooks: { instance: any; priority: number; handler: Function }[] = [];

        inventory.forEach(instance => {
            const config = RELIC_REGISTRY[instance.id];
            if (!config || !config.hooks[hookName]) return;

             const rawHook = config.hooks[hookName];
             const normalized = normalizeHook(rawHook as any);

            activeHooks.push({
                instance: instance,
                priority: normalized.priority,
                handler: normalized.handler
            });
        });

        activeHooks.sort((a, b) => a.priority - b.priority);

        for (const hook of activeHooks) {
            try {
                await hook.handler(context, hook.instance.state);
            } catch (e) {
                console.error(`Error in interrupt relic hook ${hookName} for relic ${hook.instance.id}:`, e);
            }
        }
    }
}
