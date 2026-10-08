import { describe, it, expect } from 'vitest';
import { createInitialState, processAction, getValidActions } from '../engine';
import type { GameState } from '../GameState';
import { TUTORIAL_STEPS } from '../tutorial/definitions';

const act = (state: GameState, action: Parameters<typeof processAction>[1]) => processAction(state, action).nextState;
function start(): GameState {
    return act(createInitialState(), {
        type: 'start_game', cityId: 'atlantic_city', gamblerId: 'default', seed: 42,
        globalTutorialsCompleted: TUTORIAL_STEPS.map(s => s.id),
    });
}
function shop(): GameState {
    return act({ ...start(), cash: 1000 }, { type: 'enter_gift_shop' });
}

describe('Cash gift shop', () => {
    it('opens from a ready table without paying casino rewards', () => {
        const state = start();
        const result = processAction(state, { type: 'enter_gift_shop' });
        expect(result.nextState.phase).toBe('gift_shop');
        expect(result.nextState.shopItems).toHaveLength(6);
        expect(result.nextState.cash).toBe(state.cash);
        expect(result.nextState.comps).toBe(state.comps);
        expect(result.events.some(e => e.type === 'comps_earned')).toBe(false);
    });

    it('cannot abandon a live hand or visit after game over', () => {
        for (const phase of ['playing', 'dealer_turn', 'scoring', 'game_over', 'casino_payout'] as const) {
            const state = { ...start(), phase };
            expect(act(state, { type: 'enter_gift_shop' }).phase).toBe(phase);
        }
    });

    it('purchases with cash and preserves tickets and lifetime winnings', () => {
        const state = shop();
        const item = state.shopItems[0];
        const bought = act(state, { type: 'buy_shop_item', itemId: item.id });
        expect(bought.cash).toBe(state.cash - item.cost);
        expect(bought.comps).toBe(state.comps);
        expect(bought.totalScore).toBe(state.totalScore);
        expect(bought.inventory.some(r => r.id === item.id)).toBe(true);
        expect(bought.shopItems[0].purchased).toBe(true);
        expect(act(bought, { type: 'buy_shop_item', itemId: item.id })).toEqual(bought);
    });

    it('cannot spend tickets in place of cash', () => {
        const state = { ...shop(), cash: 0, comps: 1000 };
        expect(act(state, { type: 'buy_shop_item', itemId: state.shopItems[0].id })).toEqual(state);
        expect(act(state, { type: 'restock_shop' })).toEqual(state);
        const actions = getValidActions(state);
        expect(actions.some(a => a.type === 'buy_shop_item' || a.type === 'restock_shop')).toBe(false);
        expect(actions.some(a => a.type === 'leave_shop')).toBe(true);
    });

    it('preserves bought stock, charges, held cards and restock fees across visits', () => {
        let state = shop();
        state = act(state, { type: 'buy_shop_item', itemId: state.shopItems[0].id });
        state = act(state, { type: 'restock_shop' });
        const before = state;
        state = act(state, { type: 'leave_shop' });
        expect(state.phase).toBe('entering_casino');
        state = act(state, { type: 'enter_gift_shop' });
        expect(state.shopItems).toEqual(before.shopItems);
        expect(state.rngState).toBe(before.rngState);
        expect(state.cash).toBe(before.cash);
        expect(state.comps).toBe(before.comps);
        expect(state.tableActionCharges).toEqual(before.tableActionCharges);
        expect(state.tableActionHeldCards).toEqual(before.tableActionHeldCards);
        expect(state.giftShopRestockCost).toBe(60);
    });

    it('returns to the completed deal without starting a new deal or a casino', () => {
        const state = { ...start(), phase: 'deal_over' as const, deal: 40, dealsTaken: 40 };
        const inShop = act(state, { type: 'enter_gift_shop' });
        const back = act(inShop, { type: 'leave_shop' });
        expect(back.phase).toBe('deal_over');
        expect(back.dealsTaken).toBe(40);
        expect(back.playerHands).toEqual(state.playerHands);
        expect(back.comps).toBe(state.comps);
    });

    it('doubles paid restock costs without moving the five-deal threshold', () => {
        let state = shop();
        for (const fee of [30, 60, 120]) {
            const before = state;
            state = act(state, { type: 'restock_shop' });
            expect(state.cash).toBe(before.cash - fee);
            expect(state.giftShopRestockCost).toBe(fee * 2);
            expect(state.shopDealsAtLastFreeRestock).toBe(0);
            expect(state.comps).toBe(before.comps);
        }
    });

    it('refreshes stock and resets fees at ante increase, before any shop visit', () => {
        const state = { ...shop(), giftShopRestockCost: 240, dealsTaken: 5, handsUntilAnteIncrease: 1, phase: 'scoring' as const };
        const result = processAction(state, { type: 'score_round' });
        expect(result.events).toContainEqual(expect.objectContaining({ type: 'shop_restocked', cost: 0 }));
        expect(result.nextState.cash).toBe(state.cash);
        expect(result.nextState.shopDealsAtLastFreeRestock).toBe(5);
        expect(result.nextState.giftShopRestockCost).toBe(30);
        const reopened = act(act(act(result.nextState, { type: 'enter_gift_shop' }), { type: 'leave_shop' }), { type: 'enter_gift_shop' });
        expect(reopened.rngState).toBe(result.nextState.rngState);
        expect(reopened.shopItems).toEqual(result.nextState.shopItems);
    });

    it('shop visits alone do not trigger a restock or move the ante countdown', () => {
        const state = { ...shop(), dealsTaken: 12, giftShopRestockCost: 120, phase: 'deal_over' as const };
        const result = act(state, { type: 'enter_gift_shop' });
        expect(result.shopItems).toEqual(state.shopItems);
        expect(result.rngState).toBe(state.rngState);
        expect(result.handsUntilAnteIncrease).toBe(state.handsUntilAnteIncrease);
        expect(result.giftShopRestockCost).toBe(120);
    });

    it('permits visiting the shop without tickets', () => {
        expect(act({ ...start(), comps: 0 }, { type: 'enter_gift_shop' }).phase).toBe('gift_shop');
    });

    it('ends the run on leaving the shop if spending leaves cash below ante', () => {
        const result = processAction({ ...shop(), cash: 9, ante: 10 }, { type: 'leave_shop' });
        expect(result.nextState.phase).toBe('game_over');
        expect(result.events).toContainEqual(expect.objectContaining({ type: 'game_over', won: false }));
    });

    it('selling, enhancement and removal use cash, leaving tickets unchanged', () => {
        const state = shop();
        const item = state.shopItems[0];
        const bought = act(state, { type: 'buy_shop_item', itemId: item.id });
        const index = bought.inventory.length - 1;
        const sold = act(bought, { type: 'sell_relic', relicId: item.id, index });
        expect(sold.cash).toBeGreaterThan(bought.cash);
        expect(sold.comps).toBe(state.comps);
        expect(sold.inventory).toEqual(state.inventory);
        const enhanced = act(state, { type: 'enhance_card', cardId: 'probability', enhancement: { type: 'chip', value: 5 } });
        expect(enhanced.cash).toBe(state.cash - 10);
        expect(enhanced.deckProbabilities.specialWeights).toContainEqual({ type: 'chip', value: 5, chance: 0.05 });
        expect(enhanced.comps).toBe(state.comps);
        const removed = act(state, { type: 'destroy_card', cardId: 'card' });
        expect(removed.cash).toBe(state.cash - 20);
        expect(removed.removalCount).toBe(1);
        expect(removed.comps).toBe(state.comps);
    });

    it('generates deterministic stock from the same seed', () => {
        expect(shop()).toEqual(shop());
    });
});
