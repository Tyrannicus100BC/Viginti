/**
 * Shop Actions tests — validate the pure gift shop action pipeline.
 */
import { describe, it, expect } from 'vitest';
import { processAction, getValidActions } from '../engine';
import type { GameState } from '../GameState';
import type { GameEvent } from '../GameEvent';
import type { PlayerAction } from '../PlayerAction';
import type { Card, PlayerHand } from '../../types';
import type { RelicInstance } from '../../logic/relics/types';

// ─── Helpers ────────────────────────────────────────────

function startGame(seed?: number): GameState {
    const { nextState } = processAction(
        { phase: 'init' } as GameState,
        { type: 'start_game', cityId: 'atlantic_city', gamblerId: 'default', seed: seed ?? 42 }
    );
    return nextState;
}

/** Play through a full round to reach casino_win / round_over */
function playToRoundEnd(seed?: number): { state: GameState; events: GameEvent[] } {
    let state = startGame(seed ?? 99);
    let allEvents: GameEvent[] = [];

    // Deal
    const deal = processAction(state, { type: 'deal' });
    state = deal.nextState;
    allEvents.push(...deal.events);

    // Draw
    const draw = processAction(state, { type: 'draw' });
    state = draw.nextState;
    allEvents.push(...draw.events);

    // Place cards into hands until we can stand
    let maxIter = 50;
    while (state.phase === 'playing' && maxIter-- > 0) {
        const hasDrawn = state.drawnCards.some(c => c !== null);

        if (!hasDrawn) {
            // Draw more
            const drawResult = processAction(state, { type: 'draw' });
            state = drawResult.nextState;
            allEvents.push(...drawResult.events);
            continue;
        }

        // Select first available drawn card
        if (state.selectedDrawIndex === null) {
            const firstIdx = state.drawnCards.findIndex(c => c !== null);
            if (firstIdx >= 0) {
                const sel = processAction(state, { type: 'select_drawn_card', drawIndex: firstIdx });
                state = sel.nextState;
                allEvents.push(...sel.events);
                continue;
            }
        }

        // Place into first playable hand
        const playable = state.playerHands.find(h => !h.isBust && !h.isHeld && h.blackjackValue !== 21);
        if (playable && state.selectedDrawIndex !== null) {
            const place = processAction(state, { type: 'place_card', handIndex: playable.id });
            state = place.nextState;
            allEvents.push(...place.events);

            // Check if auto-stand triggered
            if (state.phase !== 'playing') break;
            continue;
        }

        // Stand if no more can be placed
        break;
    }

    // Stand
    if (state.phase === 'playing') {
        const stand = processAction(state, { type: 'stand' });
        state = stand.nextState;
        allEvents.push(...stand.events);
    }

    return { state, events: allEvents };
}

/** Get to casino_win phase by manipulating state */
function createCasinoWinState(seed?: number): GameState {
    const state = startGame(seed ?? 42);
    // Manually set to casino_win with a known state
    return {
        ...state,
        phase: 'casino_win' as const,
        totalScore: 100,
        targetScore: 20,
        comps: 10,
    };
}

/** Get a gift_shop state by entering from casino_win */
function createGiftShopState(seed?: number): GameState {
    const casinoWin = createCasinoWinState(seed);
    const { nextState } = processAction(casinoWin, { type: 'enter_gift_shop' });
    return nextState;
}

// ─── Tests ──────────────────────────────────────────────

describe('Shop Actions', () => {

    describe('enter_gift_shop', () => {
        it('transitions from casino_win to gift_shop', () => {
            const casinoWin = createCasinoWinState();
            const { nextState, events } = processAction(casinoWin, { type: 'enter_gift_shop' });

            expect(nextState.phase).toBe('gift_shop');
            expect(events.some(e => e.type === 'shop_entered')).toBe(true);
        });

        it('calculates rewards and adds comps', () => {
            const casinoWin = createCasinoWinState();
            const { nextState, events } = processAction(casinoWin, { type: 'enter_gift_shop' });

            expect(nextState.comps).toBeGreaterThan(casinoWin.comps);
            expect(nextState.shopRewardSummary).toBeTruthy();
            expect(nextState.shopRewardSummary!.total).toBeGreaterThan(0);

            const compsEvent = events.find(e => e.type === 'comps_earned');
            expect(compsEvent).toBeTruthy();
        });

        it('generates shop items', () => {
            const casinoWin = createCasinoWinState();
            const { nextState } = processAction(casinoWin, { type: 'enter_gift_shop' });

            expect(nextState.shopItems.length).toBeGreaterThan(0);
        });

        it('resets restock cost and removal count', () => {
            const casinoWin = { ...createCasinoWinState(), giftShopRestockCost: 9, removalCount: 3 };
            const { nextState } = processAction(casinoWin, { type: 'enter_gift_shop' });

            expect(nextState.giftShopRestockCost).toBe(3);
            expect(nextState.removalCount).toBe(0);
        });

        it('does nothing if phase is not casino_win', () => {
            const state = startGame();
            const { nextState } = processAction(state, { type: 'enter_gift_shop' });

            expect(nextState.phase).toBe(state.phase);
        });
    });

    describe('buy_shop_item', () => {
        it('purchases an item and adds relic to inventory', () => {
            const shopState = createGiftShopState();

            const item = shopState.shopItems.find(i => !i.purchased && shopState.comps >= i.cost);
            if (!item) return; // Skip if no affordable item

            const { nextState, events } = processAction(shopState, { type: 'buy_shop_item', itemId: item.id });

            expect(nextState.comps).toBe(shopState.comps - item.cost);
            expect(nextState.inventory.length).toBe(shopState.inventory.length + 1);
            expect(nextState.inventory.some(i => i.id === item.id)).toBe(true);
            expect(nextState.shopItems.find(i => i.id === item.id)!.purchased).toBe(true);
            expect(events.some(e => e.type === 'item_purchased')).toBe(true);
        });

        it('does not buy if insufficient comps', () => {
            const shopState = { ...createGiftShopState(), comps: 0 };
            const item = shopState.shopItems[0];
            if (!item) return;

            const { nextState } = processAction(shopState, { type: 'buy_shop_item', itemId: item.id });
            expect(nextState.comps).toBe(0);
            expect(nextState.inventory.length).toBe(shopState.inventory.length);
        });

        it('does not buy already purchased items', () => {
            const shopState = createGiftShopState();
            const item = shopState.shopItems[0];
            if (!item) return;

            // Buy first time
            const first = processAction(shopState, { type: 'buy_shop_item', itemId: item.id });
            // Try to buy again
            const second = processAction(
                { ...first.nextState, comps: 100 },
                { type: 'buy_shop_item', itemId: item.id }
            );

            // Inventory should not have grown
            expect(second.nextState.inventory.length).toBe(first.nextState.inventory.length);
        });
    });

    describe('restock_shop', () => {
        it('generates new shop items and costs comps', () => {
            const shopState = createGiftShopState();
            if (shopState.comps < shopState.giftShopRestockCost) return;

            const { nextState, events } = processAction(shopState, { type: 'restock_shop' });

            expect(nextState.comps).toBe(shopState.comps - shopState.giftShopRestockCost);
            expect(nextState.giftShopRestockCost).toBe(shopState.giftShopRestockCost + 3);
            expect(events.some(e => e.type === 'shop_restocked')).toBe(true);
        });

        it('does not restock if insufficient comps', () => {
            const shopState = { ...createGiftShopState(), comps: 0 };
            const { nextState } = processAction(shopState, { type: 'restock_shop' });

            expect(nextState.comps).toBe(0);
            expect(nextState.giftShopRestockCost).toBe(shopState.giftShopRestockCost);
        });

        it('escalates restock cost each time', () => {
            let shopState = { ...createGiftShopState(), comps: 100 };
            expect(shopState.giftShopRestockCost).toBe(3);

            const r1 = processAction(shopState, { type: 'restock_shop' });
            expect(r1.nextState.giftShopRestockCost).toBe(6);

            const r2 = processAction(r1.nextState, { type: 'restock_shop' });
            expect(r2.nextState.giftShopRestockCost).toBe(9);
        });
    });

    describe('sell_relic', () => {
        it('removes relic and refunds comps', () => {
            // Buy a relic first, then sell it
            const shopState = createGiftShopState();
            const item = shopState.shopItems.find(i => !i.purchased && shopState.comps >= i.cost);
            if (!item) return;

            const bought = processAction(shopState, { type: 'buy_shop_item', itemId: item.id });
            const boughtState = bought.nextState;

            const relicIdx = boughtState.inventory.findIndex(r => r.id === item.id);
            expect(relicIdx).toBeGreaterThanOrEqual(0);

            const { nextState, events } = processAction(
                boughtState,
                { type: 'sell_relic', relicId: item.id, index: relicIdx }
            );

            expect(nextState.inventory.length).toBe(boughtState.inventory.length - 1);
            expect(nextState.comps).toBeGreaterThan(boughtState.comps);
            expect(events.some(e => e.type === 'relic_sold')).toBe(true);
        });

        it('does not sell if index/id mismatch', () => {
            const shopState = createGiftShopState();
            const { nextState } = processAction(
                shopState,
                { type: 'sell_relic', relicId: 'nonexistent', index: 0 }
            );

            expect(nextState.inventory.length).toBe(shopState.inventory.length);
        });
    });

    describe('leave_shop', () => {
        it('advances to next casino', () => {
            const shopState = createGiftShopState();
            const { nextState, events } = processAction(shopState, { type: 'leave_shop' });

            expect(nextState.phase).toBe('entering_casino');
            expect(nextState.round).toBe(shopState.round + 1);
            expect(nextState.dealsTaken).toBe(0);
            expect(nextState.discardPile).toEqual([]);
            expect(nextState.shopItems).toEqual([]);
            expect(events.some(e => e.type === 'shop_left')).toBe(true);
            expect(events.some(e => e.type === 'next_casino_setup')).toBe(true);
        });

        it('resets player hands and dealer', () => {
            const shopState = createGiftShopState();
            const { nextState } = processAction(shopState, { type: 'leave_shop' });

            expect(nextState.playerHands.length).toBe(3);
            expect(nextState.playerHands.every(h => h.cards.length === 0)).toBe(true);
            expect(nextState.dealer.cards.length).toBe(0);
        });

        it('calculates new target score', () => {
            const shopState = createGiftShopState();
            const { nextState } = processAction(shopState, { type: 'leave_shop' });

            expect(nextState.targetScore).toBeGreaterThan(0);
        });

        it('triggers victory when all casinos cleared', () => {
            // Atlantic City has 4 casinos, so round 4 = last
            const shopState = { ...createGiftShopState(), round: 4 };
            const { nextState, events } = processAction(shopState, { type: 'leave_shop' });

            expect(nextState.phase).toBe('victory');
            expect(events.some(e => e.type === 'game_over' && e.won === true)).toBe(true);
        });
    });

    describe('enhance_card', () => {
        it('applies enhancement to deck card', () => {
            const shopState = { ...createGiftShopState(), comps: 100 };
            const card = shopState.deck[0];
            if (!card) return;

            const enhancement = { type: 'chip' as const, value: 5 };
            const { nextState, events } = processAction(
                shopState,
                { type: 'enhance_card', cardId: card.id, enhancement }
            );

            const enhanced = nextState.deck.find(c => c.id === card.id);
            expect(enhanced?.specialEffect).toEqual(enhancement);
            expect(nextState.comps).toBe(99); // Cost of level 0 chip = 1
            expect(events.some(e => e.type === 'card_enhanced')).toBe(true);
        });

        it('does not enhance if insufficient comps', () => {
            const shopState = { ...createGiftShopState(), comps: 0 };
            const card = shopState.deck[0];
            if (!card) return;

            const { nextState } = processAction(
                shopState,
                { type: 'enhance_card', cardId: card.id, enhancement: { type: 'chip', value: 5 } }
            );

            const unchanged = nextState.deck.find(c => c.id === card.id);
            expect(unchanged?.specialEffect).toBeUndefined();
        });
    });

    describe('destroy_card', () => {
        it('removes card from deck', () => {
            const shopState = { ...createGiftShopState(), comps: 100 };
            const card = shopState.deck[0];
            if (!card) return;

            const { nextState, events } = processAction(
                shopState,
                { type: 'destroy_card', cardId: card.id }
            );

            expect(nextState.deck.length).toBe(shopState.deck.length - 1);
            expect(nextState.deck.find(c => c.id === card.id)).toBeUndefined();
            expect(nextState.comps).toBe(98); // Cost = 2 + 0*2 = 2
            expect(nextState.removalCount).toBe(shopState.removalCount + 1);
            expect(events.some(e => e.type === 'card_destroyed')).toBe(true);
        });

        it('escalates removal cost', () => {
            const shopState = { ...createGiftShopState(), comps: 100, removalCount: 2 };
            const card = shopState.deck[0];
            if (!card) return;

            const { nextState } = processAction(
                shopState,
                { type: 'destroy_card', cardId: card.id }
            );

            // Cost = 2 + 2*2 = 6
            expect(nextState.comps).toBe(94);
        });

        it('does not destroy if insufficient comps', () => {
            const shopState = { ...createGiftShopState(), comps: 0 };
            const card = shopState.deck[0];
            if (!card) return;

            const { nextState } = processAction(
                shopState,
                { type: 'destroy_card', cardId: card.id }
            );

            expect(nextState.deck.length).toBe(shopState.deck.length);
        });
    });

    describe('getValidActions in gift_shop', () => {
        it('always includes leave_shop', () => {
            const shopState = createGiftShopState();
            const actions = getValidActions(shopState);

            expect(actions.some(a => a.type === 'leave_shop')).toBe(true);
        });

        it('includes buyable items', () => {
            const shopState = { ...createGiftShopState(), comps: 100 };
            const actions = getValidActions(shopState);

            const buyActions = actions.filter(a => a.type === 'buy_shop_item');
            const unpurchased = shopState.shopItems.filter(i => !i.purchased);
            expect(buyActions.length).toBe(unpurchased.length);
        });

        it('respects disabled buttons from city config', () => {
            // Atlantic City casino 0 disables sell, enhance, destroy, restock
            const shopState = createGiftShopState();
            const actions = getValidActions(shopState);

            // Should NOT have sell, enhance, destroy, restock (disabled for AC casino 0)
            expect(actions.some(a => a.type === 'sell_relic')).toBe(false);
            expect(actions.some(a => a.type === 'enhance_card')).toBe(false);
            expect(actions.some(a => a.type === 'destroy_card')).toBe(false);
            expect(actions.some(a => a.type === 'restock_shop')).toBe(false);
        });

        it('includes restock when enabled and affordable', () => {
            // Use las_vegas which doesn't define getGiftShopDisabledButtons (defaults to [])
            const shopState = { ...createGiftShopState(), selectedCityId: 'las_vegas', round: 1, comps: 100 };
            const actions = getValidActions(shopState);

            expect(actions.some(a => a.type === 'restock_shop')).toBe(true);
        });
    });

    describe('deterministic shop generation', () => {
        it('same rng state produces same shop items', () => {
            const casinoWin1 = createCasinoWinState(42);
            const casinoWin2 = createCasinoWinState(42);

            const r1 = processAction(casinoWin1, { type: 'enter_gift_shop' });
            const r2 = processAction(casinoWin2, { type: 'enter_gift_shop' });

            expect(r1.nextState.shopItems).toEqual(r2.nextState.shopItems);
        });
    });
});
