import { describe, expect, it } from 'vitest';
import { createInitialState, getValidActions, processAction } from '../engine';
import type { GameState } from '../GameState';
import type { PlayerAction } from '../PlayerAction';
import { generateRaiseChoices, getHandPayout, getRaise, HAND_TYPES, PACK_RAISES } from '../../logic/handScoring';
import { getRelicSide, getSideSlotCount } from '../../logic/relics/inventory';
import { SeededRNG } from '../rng';
import { TUTORIAL_STEPS } from '../tutorial/definitions';
import { useGameBridge } from '../../store/gameBridge';
import { evaluateHandScore } from '../../logic/scoring';

const act = (state: GameState, action: PlayerAction) => processAction(state, action).nextState;
const shop = (): GameState => act(act(createInitialState(), {
    type: 'start_game', cityId: 'atlantic_city', gamblerId: 'newbie', seed: 17,
    globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id),
}), { type: 'enter_gift_shop' });

describe('relic slots and raise packs', () => {
    it('starts with four slots, alternates sides and charges escalating slot costs', () => {
        const initial = shop();
        expect(initial.relicSlots).toBe(4);
        expect(Array.from({ length: 6 }, (_, i) => getRelicSide(i))).toEqual(['left', 'right', 'left', 'right', 'left', 'right']);
        expect(getSideSlotCount('left', 5)).toBe(3);
        expect(getSideSlotCount('right', 5)).toBe(2);
        let state = act({ ...initial, cash: 200 }, { type: 'buy_relic_slot' });
        expect(state).toMatchObject({ relicSlots: 5, cash: 160 });
        state = act(state, { type: 'buy_relic_slot' });
        expect(state).toMatchObject({ relicSlots: 6, cash: 100 });
        expect(act({ ...state, cash: 79 }, { type: 'buy_relic_slot' })).toEqual({ ...state, cash: 79 });
        const playing = { ...state, phase: 'playing' as const };
        expect(act(playing, { type: 'buy_relic_slot' })).toEqual(playing);
    });

    it('stocks four unified relics and two packs, then pays once and applies exactly one choice', () => {
        const original = shop();
        expect(original.shopItems.filter(item => item.type === 'Relic')).toHaveLength(4);
        expect(original.shopItems.filter(item => item.type === 'RaisePack')).toHaveLength(2);
        const pack = original.shopItems.find(item => item.type === 'RaisePack')!;
        const opened = act(original, { type: 'buy_shop_item', itemId: pack.id });
        expect(opened.cash).toBe(original.cash - pack.cost);
        expect(opened.handUpgrades).toEqual({});
        expect(opened.pendingRaiseChoices).toHaveLength(3);
        expect(new Set(opened.pendingRaiseChoices).size).toBe(3);
        expect(getValidActions(opened)).toEqual(opened.pendingRaiseChoices.map(raiseId => ({ type: 'choose_raise', raiseId })));
        for (const action of [
            { type: 'leave_shop' }, { type: 'restock_shop' }, { type: 'buy_relic_slot' },
            { type: 'buy_shop_item', itemId: pack.id }, { type: 'choose_raise', raiseId: 'fake' },
        ] as PlayerAction[]) expect(act(opened, action)).toEqual(opened);
        const chosenId = opened.pendingRaiseChoices[1];
        const chosen = act(opened, { type: 'choose_raise', raiseId: chosenId });
        expect(chosen.pendingRaiseChoices).toEqual([]);
        expect(chosen.handUpgrades).toEqual({ [chosenId]: 1 });
        expect(chosen.cash).toBe(opened.cash);
        expect(chosen.inventory).toEqual(original.inventory);
        expect(act(chosen, { type: 'choose_raise', raiseId: chosenId })).toEqual(chosen);
        expect(act(original, { type: 'buy_shop_item', itemId: pack.id })).toEqual(opened);
    });

    it('preserves pending choices, slots and RNG across export/import without rerolling', () => {
        const state = shop(), pack = state.shopItems.find(item => item.type === 'RaisePack')!;
        const opened = act(act(state, { type: 'buy_relic_slot' }), { type: 'buy_shop_item', itemId: pack.id });
        expect(useGameBridge.getState().loadGameState(JSON.stringify(opened))).toBe(true);
        const loaded = useGameBridge.getState().gameState;
        expect(loaded.pendingRaiseChoices).toEqual(opened.pendingRaiseChoices);
        expect(loaded.relicSlots).toBe(5);
        expect(loaded.rngState).toBe(opened.rngState);
        const next = act(loaded, { type: 'choose_raise', raiseId: loaded.pendingRaiseChoices[0] });
        expect(Object.keys(next.handUpgrades)).toHaveLength(1);
    });

    it('settles decimal penalties without losing a dollar to floating point rounding', () => {
        const state: GameState = { ...shop(), phase: 'scoring', cash: 0,
            handUpgrades: { raise_win_cash: 1, raise_v2_1_pair_cash_2_trade: 3 },
            runningSummary: { chips: 0, mult: 1 },
            playerHands: [{ id: 0, cards: [{ id: 'a', rank: '7', suit: 'hearts' }, { id: 'b', rank: '8', suit: 'hearts' }],
                blackjackValue: 15, isBust: false, isHeld: true, outcome: 'win' }] };
        expect(act(state, { type: 'score_round' }).cash).toBe(63); // $90 * 0.7
    });

    it('migrates old shop stock to relics and packs while retaining earned upgrades', () => {
        const legacy = { ...shop(), handUpgrades: { raise_pair_cash: 2 },
            inventory: Array.from({ length: 6 }, (_, i) => ({ id: ['redraw', 'surrender', 'discard', 'switch', 'double_down', 'ruler'][i], state: {} })),
            shopItems: [{ id: 'medal', type: 'Score', cost: 70 }, { id: 'raise_pair_mult', type: 'Raise', cost: 60 }] };
        const { relicSlots: omittedSlots, pendingRaiseChoices: omittedChoices, ...oldState } = legacy;
        expect(omittedSlots).toBeDefined();
        expect(omittedChoices).toBeDefined();
        expect(useGameBridge.getState().loadGameState(JSON.stringify(oldState))).toBe(true);
        const loaded = useGameBridge.getState().gameState;
        expect(loaded.relicSlots).toBe(6);
        expect(loaded.pendingRaiseChoices).toEqual([]);
        expect(loaded.handUpgrades).toEqual({ raise_pair_cash: 2 });
        expect(loaded.shopItems.map(item => item.type)).toEqual(['Relic', 'RaisePack']);
    });

    it('generates all rarities, one to three effects, benefits and occasional drawbacks', () => {
        const rarityCounts = new Set<string>(), effectCounts = new Set<number>();
        let drawbacks = 0;
        for (let seed = 1; seed <= 100; seed++) {
            for (const raise of generateRaiseChoices(new SeededRNG(seed))) {
                rarityCounts.add(raise.rarity);
                effectCounts.add(raise.modifiers.length);
                expect(raise.modifiers.some(effect => effect.chips > 0 || effect.mult > 0)).toBe(true);
                if (raise.modifiers.some(effect => effect.chips < 0 || effect.mult < 0)) drawbacks++;
            }
        }
        expect(rarityCounts).toEqual(new Set(['Common', 'Uncommon', 'Rare']));
        expect(effectCounts).toEqual(new Set([1, 2, 3]));
        expect(drawbacks).toBeGreaterThan(0);
        expect(drawbacks).toBeLessThan(100);
        expect(new Set(PACK_RAISES.map(raise => raise.id)).size).toBe(PACK_RAISES.length);
    });

    it('applies a pair cash bonus and flush penalty together, stacks both and scores the drawback', () => {
        const raise = getRaise('raise_v2_1_pair_cash_2_trade')!;
        expect(raise.modifiers).toEqual([
            { handTypeId: 'pair', chips: 15, mult: 0 },
            { handTypeId: 'flush', chips: 0, mult: -0.1 },
        ]);
        const upgrades = { [raise.id]: 2 };
        expect(getHandPayout('pair', upgrades).chips).toBe(30);
        expect(getHandPayout('flush', upgrades).mult).toBe(-0.2);
        const scored = evaluateHandScore([{ id: 'a', rank: '7', suit: 'hearts' }, { id: 'b', rank: '8', suit: 'hearts' }],
            true, false, [], 0, undefined, 'win', upgrades);
        expect(scored.criteria.find(row => row.id === 'flush')?.multiplier).toBe(-0.2);
        expect(scored.totalMultiplier).toBe(-0.2);
        const settlement = processAction({ ...shop(), phase: 'scoring', cash: 0, handUpgrades: upgrades,
            runningSummary: { chips: 0, mult: 1 }, playerHands: [
                { id: 0, cards: [{ id: 'a', rank: '7', suit: 'hearts' }, { id: 'b', rank: '8', suit: 'hearts' }],
                    blackjackValue: 15, isBust: false, isHeld: true, outcome: 'win' },
            ] }, { type: 'score_round' });
        expect(settlement.events).toContainEqual({ type: 'scoring_row_mult', handIndex: 0, criterionId: 'flush', multiplier: -0.2 });
        expect(settlement.nextState.cash).toBe(32); // ($10 win + $15 straight + $15 flush) * 0.8

        const before = shop(), pending = { ...before, pendingRaiseChoices: [raise.id] };
        const picked = act(pending, { type: 'choose_raise', raiseId: raise.id });
        for (const hand of HAND_TYPES) {
            const payout = getHandPayout(hand.id, picked.handUpgrades);
            expect(Number.isFinite(payout.chips + payout.mult)).toBe(true);
        }
    });
});
