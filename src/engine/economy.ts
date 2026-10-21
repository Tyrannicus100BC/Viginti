import type { PlayerHand } from '../types';

/** Prototype tuning values shared by the engine and presentation. */
export const STARTING_CASH = 100;
export const BASE_ANTE = 50;
export const ANTE_INCREASE_RATE = 0.5;
export const ANTE_INCREASE_BONUS = 25;
/** Round each compounded increase to the nearest $5 (halfway rounds up). */
export const getNextAnte = (ante: number) => Math.round((ante * (1 + ANTE_INCREASE_RATE) + ANTE_INCREASE_BONUS) / 5) * 5;
export const ENHANCE_CASH_COSTS = [10, 30, 50, 70];
export const getRemovalCashCost = (removalCount: number) => 20 + removalCount * 20;

/** Every hand is available without an opening cost. */
export const canPlayHand = (hand: PlayerHand): boolean =>
    !hand.isBust && !hand.isHeld && hand.blackjackValue !== 21;
