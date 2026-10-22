import { RelicManager } from './manager';
import type { RelicInstance } from './types';

export const INITIAL_RELIC_SLOTS = 6;
export type RelicSide = 'left' | 'right';
export const getRelicSide = (_index: number): RelicSide => 'left';
export const getSideSlotCount = (side: RelicSide, slots: number) => side === 'left' ? slots : 0;

export function canAcquireRelic(id: string, inventory: readonly RelicInstance[], slots = INITIAL_RELIC_SLOTS): boolean {
    const config = RelicManager.getRelicConfig(id);
    const passiveCount = inventory.filter(instance => !RelicManager.getRelicConfig(instance.id)?.tableAction).length;
    return !!config && !inventory.some(instance => instance.id === id) && (!!config.tableAction || passiveCount < slots);
}
