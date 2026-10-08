import type { PlayerHand } from '../types';

/** Prototype tuning values shared by the engine and presentation. */
export const STARTING_COMP_TICKETS = 10;
export const STARTING_CASH = 100;
export const BASE_ANTE = 50;
export const ANTE_INCREASE_AMOUNT = 10;
export const HANDS_PER_ANTE = 5;
export const BASE_SHOP_RESTOCK_COST = 30;
export const ENHANCE_CASH_COSTS = [10, 30, 50, 70];
export const getRemovalCashCost = (removalCount: number) => 20 + removalCount * 20;

/** Unopened side hands require a ticket for their first card. */
export const canPlayHand = (hand: PlayerHand, comps = 0): boolean =>
    !hand.isBust && !hand.isHeld && hand.blackjackValue !== 21 && (!hand.isInactive || comps >= 1);
