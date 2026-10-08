import { RelicManager } from './manager';
import type { RelicInstance } from './types';

export const INITIAL_RELIC_SLOTS = 4;
export type RelicSide = 'left' | 'right';
export const getRelicSide = (index: number): RelicSide => index % 2 === 0 ? 'left' : 'right';
export const getSideSlotCount = (side: RelicSide, slots: number) => side === 'left' ? Math.ceil(slots / 2) : Math.floor(slots / 2);
export const getRelicSlotCost = (slots: number) => 40 + Math.max(0, slots - INITIAL_RELIC_SLOTS) * 20;

export function canAcquireRelic(id: string, inventory: readonly RelicInstance[], slots = INITIAL_RELIC_SLOTS): boolean {
    return !!RelicManager.getRelicConfig(id) && !inventory.some(instance => instance.id === id) && inventory.length < slots;
}
