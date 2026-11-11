import { RelicManager } from './manager';
import type { RelicInstance } from './types';

export const INITIAL_RELIC_SLOTS = 4;
export type RelicSide = 'left' | 'right';
export const getRelicSide = (_index: number): RelicSide => 'left';
export const getSideSlotCount = (side: RelicSide, slots: number) => side === 'left' ? slots : 0;

export function canAcquireRelic(id: string, inventory: readonly RelicInstance[], _slots = INITIAL_RELIC_SLOTS): boolean {
    const config = RelicManager.getRelicConfig(id);
    return !!config && !inventory.some(instance => instance.id === id);
}

/** Keep the newest four passive effects. Legacy table actions retain their own controls. */
export function capRelicEffects(inventory: readonly RelicInstance[]): RelicInstance[] {
    const effects = inventory.filter(instance => !RelicManager.getRelicConfig(instance.id)?.tableAction);
    const keep = new Set(effects.slice(-INITIAL_RELIC_SLOTS));
    return inventory.filter(instance => !!RelicManager.getRelicConfig(instance.id)?.tableAction || keep.has(instance));
}

export function acquireRelicEffect(inventory: readonly RelicInstance[], id: string): RelicInstance[] {
    const config = RelicManager.getRelicConfig(id);
    if (!config || inventory.some(instance => instance.id === id)) return [...inventory];
    return capRelicEffects([...inventory, { id, state: { ...config.properties } }]);
}
