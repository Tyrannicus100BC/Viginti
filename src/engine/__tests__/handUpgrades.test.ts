import { describe, expect, it } from 'vitest';
import { createInitialState, getValidActions, processAction } from '../engine';
import type { GameState } from '../GameState';
import { HAND_TYPES, RAISES, getHandPayout } from '../../logic/handScoring';
import { evaluateHandScore } from '../../logic/scoring';
import { RelicManager } from '../../logic/relics/manager';
import { generateShopItems } from '../../logic/rewards/generator';
import { SeededRNG } from '../rng';
import { TUTORIAL_STEPS } from '../tutorial/definitions';
import { useGameBridge } from '../../store/gameBridge';
import type { Card } from '../../types';

const act = (state: GameState, action: Parameters<typeof processAction>[1]) => processAction(state, action).nextState;
const cards: Card[] = [
    { id: 'a', rank: '7', suit: 'hearts' },
    { id: 'b', rank: '7', suit: 'clubs' },
];
const stocked = (id = 'raise_pair_mult'): GameState => ({
    ...act(createInitialState(), { type: 'start_game', cityId: 'atlantic_city', gamblerId: 'newbie', seed: 42, globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id) }),
    phase: 'gift_shop', cash: 10000, shopStockInitialized: true,
    shopItems: [{ id, type: 'Raise', cost: RAISES.find(raise => raise.id === id)!.cost }],
});

describe('permanent hand scoring and Raises', () => {
    it('starts with five core hand types and no scoring relics to equip', () => {
        const state = stocked();
        expect(HAND_TYPES.map(hand => hand.id)).toEqual(['win', 'loss', 'pair', 'straight', 'flush']);
        expect(state.inventory).toEqual([]);
        expect(state.handUpgrades).toEqual({});
        expect(evaluateHandScore(cards, true).criteria.map(row => row.id)).toEqual(['win', 'pair']);
        expect(evaluateHandScore(cards, false, false, [], 0, undefined, 'loss').criteria.map(row => row.id)).toEqual(['loss', 'pair']);
    });

    it('adds mixed and repeated Raises before conditional relic bonuses', () => {
        const upgrades = { raise_pair_combo: 2, raise_pair_mult: 1, raise_flush_cash: 3 };
        const payout = getHandPayout('pair', upgrades);
        expect(payout).toMatchObject({ chips: 40, mult: 1.5, count: 3 });
        const score = evaluateHandScore(cards, true, false, [], 0, undefined, 'win', upgrades);
        expect(score.criteria.find(row => row.id === 'pair')).toMatchObject({ chips: 14 + payout.chips, multiplier: payout.mult });
        const medal = RelicManager.getRelicConfig('medal')!;
        const withRelic = evaluateHandScore(cards, true, false, [{ id: medal.id, state: { ...medal.properties } }], 0, undefined, 'win', upgrades);
        expect(withRelic.criteria.find(row => row.id === 'pair')?.chips).toBe(84);
        expect(getHandPayout('pair', upgrades)).toEqual(payout);
    });

    it('applies Win and Lose Raises to 21 and bust while pushes retain no outcome payout', () => {
        const upgrades = { raise_win_combo: 1, raise_loss_combo: 1 };
        const twentyOne: Card[] = [{ id: 'ace', rank: 'A', suit: 'hearts' }, { id: 'king', rank: 'K', suit: 'clubs' }];
        expect(evaluateHandScore(twentyOne, true, false, [], 0, undefined, 'win', upgrades).criteria[0]).toMatchObject({ id: 'viginti', chips: 45, multiplier: 0.5 });
        const bust = [...twentyOne, { id: 'extra', rank: 'K' as const, suit: 'spades' as const }];
        bust.push({ id: 'another', rank: 'K', suit: 'diamonds' });
        expect(evaluateHandScore(bust, false, false, [], 0, undefined, 'bust', upgrades).criteria[0]).toMatchObject({ id: 'bust', chips: 0, multiplier: 0.5 });
        expect(evaluateHandScore(cards, false, false, [], 0, undefined, 'push', upgrades).criteria.some(row => row.id === 'loss' || row.id === 'win')).toBe(false);
    });

    it('upgrades every pair, including all three pairs in a triple', () => {
        const triple = [...cards, { id: 'c', rank: '7' as const, suit: 'spades' as const }];
        const pairs = evaluateHandScore(triple, true, false, [], 0, undefined, 'win', { raise_pair_combo: 1 }).criteria.filter(row => row.id === 'pair');
        expect(pairs).toHaveLength(3);
        expect(pairs.every(row => row.chips === 34 && row.multiplier === 0.5)).toBe(true);
    });

    it('stacks purchases without slots, resale, or mutating previous state', () => {
        let state = stocked();
        state = { ...state, inventory: RelicManager.getAllRelics().slice(0, 10).map(config => ({ id: config.id, state: { ...config.properties } })) };
        const original = state;
        for (let i = 0; i < 25; i++) {
            state = { ...state, shopItems: state.shopItems.map(item => ({ ...item, purchased: false })) };
            expect(getValidActions(state)).toContainEqual({ type: 'buy_shop_item', itemId: 'raise_pair_mult' });
            state = act(state, { type: 'buy_shop_item', itemId: 'raise_pair_mult' });
        }
        expect(state.handUpgrades.raise_pair_mult).toBe(25);
        expect(getHandPayout('pair', state.handUpgrades).mult).toBe(12.5);
        expect(state.inventory).toEqual(original.inventory);
        expect(original.handUpgrades).toEqual({});
        expect(state.cash).toBe(original.cash - 25 * 60);
        expect(getValidActions(state).filter(action => action.type === 'sell_relic').some(action => action.relicId === 'raise_pair_mult')).toBe(false);
        expect(act(state, { type: 'buy_shop_item', itemId: 'raise_pair_mult' })).toEqual(state);
        expect(act(state, { type: 'start_game', cityId: 'atlantic_city', gamblerId: 'newbie' }).handUpgrades).toEqual({});
    });

    it('retains Raises through shop visits, restocks and state export/import', () => {
        let state = act(stocked(), { type: 'buy_shop_item', itemId: 'raise_pair_mult' });
        state = act(act(state, { type: 'leave_shop' }), { type: 'enter_gift_shop' });
        state = act(state, { type: 'restock_shop' });
        expect(state.handUpgrades).toEqual({ raise_pair_mult: 1 });
        expect(useGameBridge.getState().loadGameState(JSON.stringify(state))).toBe(true);
        expect(useGameBridge.getState().handUpgrades).toEqual(state.handUpgrades);
        const { handUpgrades: omitted, ...legacy } = state;
        expect(omitted).toBeDefined();
        expect(useGameBridge.getState().loadGameState(JSON.stringify(legacy))).toBe(true);
        expect(useGameBridge.getState().handUpgrades).toEqual({});
    });

    it('uses Raises in actual deal settlement, including losing hands', () => {
        const upgrades = { raise_pair_combo: 1 };
        const state: GameState = { ...stocked(), phase: 'scoring', cash: 0, comps: 7, handUpgrades: upgrades, runningSummary: { chips: 0, mult: 1 },
            playerHands: [{ id: 0, cards, blackjackValue: 14, isBust: false, isHeld: true, outcome: 'loss' }] };
        const result = processAction(state, { type: 'score_round' });
        // Lose −$10, Pair $14 + $20, starting 1× plus 0.5×.
        expect(result.nextState.cash).toBe(36);
        expect(result.nextState.playerHands[0].finalScore?.criteria.find(row => row.id === 'pair')).toMatchObject({ chips: 34, multiplier: 0.5 });
        expect(result.nextState.handUpgrades).toEqual(upgrades);
    });

    it('offers owned Raises again while excluding owned relics', () => {
        const stock = generateShopItems([{ type: 'Raise', count: 1, specificIds: ['raise_pair_mult'] }, { type: 'Score', count: 1, specificIds: ['medal'] }], [{ id: 'medal', state: {} }], undefined, new SeededRNG(42));
        expect(stock.map(item => item.id)).toEqual(['raise_pair_mult']);
    });

    it('uses one relic category and a shared four-slot limit', () => {
        for (const relic of RelicManager.getAllRelics()) {
            expect(relic.categories).toContain('Relic');
            expect(relic.categories).not.toContain('Control');
            expect(relic.categories).not.toContain('Score');
        }
        const relics = RelicManager.getAllRelics();
        const state: GameState = { ...stocked(),
            inventory: relics.slice(0, 4).map(relic => ({ id: relic.id, state: {} })),
            shopItems: [{ id: 'medal', type: 'Relic', cost: 40 }, { id: 'raise_pair_mult', type: 'Raise', cost: 60 }] };
        expect(act(state, { type: 'buy_shop_item', itemId: 'medal' })).toEqual(state);
        expect(getValidActions(state)).not.toContainEqual({ type: 'buy_shop_item', itemId: 'medal' });
        const expanded = act(state, { type: 'buy_relic_slot' });
        expect(expanded.relicSlots).toBe(5);
        expect(act(expanded, { type: 'buy_shop_item', itemId: 'medal' }).inventory).toHaveLength(5);
        expect(act(state, { type: 'buy_shop_item', itemId: 'raise_pair_mult' }).handUpgrades.raise_pair_mult).toBe(1);
    });
});
