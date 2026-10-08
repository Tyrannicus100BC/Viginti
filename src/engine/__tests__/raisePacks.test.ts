import { describe, expect, it } from 'vitest';
import { createInitialState, getValidActions, processAction } from '../engine';
import type { GameState } from '../GameState';
import type { PlayerAction } from '../PlayerAction';
import { generateRaise, generateRaiseChoices, getHandPayout, getHandRaiseChanges, getRaise, HAND_TYPES, PACK_RAISES, RAISE_AFFIX_SLOTS, formatRaiseCash, formatRaiseMult } from '../../logic/handScoring';
import { getRelicSide, getSideSlotCount } from '../../logic/relics/inventory';
import { SeededRNG } from '../rng';
import { TUTORIAL_STEPS } from '../tutorial/definitions';
import { useGameBridge } from '../../store/gameBridge';
import { evaluateHandScore } from '../../logic/scoring';
import { getPackDefinition, PACKS, rollPackDefinition } from '../../logic/packs';

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
        const original = { ...shop(), shopItems: shop().shopItems.map(item => item.type === 'RaisePack' ? { ...item, packId: 'raise_basic' as const, cost: 40 } : item) };
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

    it.each(PACKS)('opens $name with its offer and selection counts', pack => {
        const state = { ...shop(), cash: 1000, shopItems: [{ id: 'pack', type: 'RaisePack' as const, packId: pack.id, cost: pack.cost }] };
        const opened = act(state, { type: 'buy_shop_item', itemId: 'pack' });
        expect(opened.pendingRaiseChoices).toHaveLength(pack.offerCount);
        expect(new Set(opened.pendingRaiseChoices).size).toBe(pack.offerCount);
        expect(opened.pendingPack).toEqual({ packId: pack.id, picksRemaining: pack.pickCount });
        expect(opened.cash).toBe(1000 - pack.cost);
        let current = opened;
        for (let i = 0; i < pack.pickCount; i++) {
            const id = current.pendingRaiseChoices[0];
            const rngState = current.rngState;
            current = act(current, { type: 'choose_raise', raiseId: id });
            expect(current.handUpgrades[id]).toBe(1);
            expect(current.cash).toBe(opened.cash);
            expect(current.rngState).toBe(rngState);
            expect(act(current, { type: 'choose_raise', raiseId: id })).toEqual(current);
            if (i < pack.pickCount - 1) {
                expect(current.pendingRaiseChoices).toEqual(opened.pendingRaiseChoices.filter(choice => choice !== id));
                expect(current.pendingPack?.picksRemaining).toBe(1);
                for (const action of [{ type: 'leave_shop' }, { type: 'restock_shop' }, { type: 'buy_relic_slot' }, { type: 'buy_shop_item', itemId: 'pack' }] as PlayerAction[])
                    expect(act(current, action)).toEqual(current);
                // Resuming a partially opened pack must preserve its last pick and offers.
                expect(useGameBridge.getState().loadGameState(JSON.stringify(current))).toBe(true);
                expect(useGameBridge.getState().gameState.pendingPack).toEqual(current.pendingPack);
                expect(useGameBridge.getState().gameState.pendingRaiseChoices).toEqual(current.pendingRaiseChoices);
                current = useGameBridge.getState().gameState;
            }
        }
        expect(current.pendingRaiseChoices).toEqual([]);
        expect(current.pendingPack).toBeNull();
        expect(Object.keys(current.handUpgrades)).toHaveLength(pack.pickCount);
        expect(current.shopItems[0].purchased).toBe(true);
        expect(act(current, { type: 'buy_shop_item', itemId: 'pack' })).toEqual(current);
    });

    it('uses common, uncommon and rare pack availability without changing legacy packs', () => {
        expect([0, 0.599, 0.6, 0.899, 0.9, 0.999].map(roll => rollPackDefinition(roll).id))
            .toEqual(['raise_basic', 'raise_basic', 'raise_jumbo', 'raise_jumbo', 'raise_mega', 'raise_mega']);
        expect(getPackDefinition()).toEqual(PACKS[0]);
        const state = { ...shop(), shopItems: [{ id: 'legacy_pack', type: 'RaisePack' as const, cost: 40 }] };
        const opened = act(state, { type: 'buy_shop_item', itemId: 'legacy_pack' });
        expect(opened.pendingRaiseChoices).toHaveLength(3);
        expect(opened.pendingPack).toEqual({ packId: 'raise_basic', picksRemaining: 1 });
        const { pendingPack: omittedPack, ...oldPending } = opened;
        expect(omittedPack).toBeDefined();
        expect(useGameBridge.getState().loadGameState(JSON.stringify(oldPending))).toBe(true);
        expect(useGameBridge.getState().gameState.pendingPack).toEqual({ packId: 'raise_basic', picksRemaining: 1 });
    });

    it('settles decimal penalties without losing a dollar to floating point rounding', () => {
        const state: GameState = { ...shop(), phase: 'scoring', cash: 0,
            handUpgrades: { raise_win_cash: 1, raise_v2_1_pair_cash_2_trade: 3 },
            runningSummary: { chips: 0, mult: 1 },
            playerHands: [{ id: 0, cards: [{ id: 'a', rank: '7', suit: 'hearts' }, { id: 'b', rank: '8', suit: 'hearts' }],
                blackjackValue: 15, isBust: false, isHeld: true, outcome: 'win' }] };
        expect(act(state, { type: 'score_round' }).cash).toBe(70); // $100 * 0.7
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

    it('generates unique offers across all rarities, with benefits and at most one drawback', () => {
        const rarityCounts = new Set<string>(), effectCounts = new Set<number>();
        let drawbacks = 0;
        for (let seed = 1; seed <= 100; seed++) {
            const offers = generateRaiseChoices(new SeededRNG(seed), 5);
            expect(new Set(offers.map(raise => raise.id)).size).toBe(5);
            expect(new Set(offers.map(raise => `${raise.rarity}:${raise.modifiers.map(effect => JSON.stringify(effect)).sort().join('|')}`)).size).toBe(5);
            for (const raise of offers) {
                rarityCounts.add(raise.rarity);
                effectCounts.add(raise.modifiers.length);
                expect(raise.modifiers.some(effect => effect.chips > 0 || effect.mult > 0)).toBe(true);
                expect(raise.modifiers.filter(effect => effect.chips < 0 || effect.mult < 0).length).toBeLessThanOrEqual(1);
                expect(getRaise(raise.id)).toEqual(raise);
                if (raise.modifiers.some(effect => effect.chips < 0 || effect.mult < 0)) drawbacks++;
            }
        }
        expect(rarityCounts).toEqual(new Set(['Common', 'Uncommon', 'Rare']));
        expect(effectCounts).toEqual(new Set([1, 2, 3, 4]));
        expect(drawbacks).toBeGreaterThan(0);
        expect(drawbacks).toBeLessThan(500);
        expect(new Set(PACK_RAISES.map(raise => raise.id)).size).toBe(PACK_RAISES.length);
    });

    it.each(['Common', 'Uncommon', 'Rare'] as const)('spends exactly the %s affix budget and binds penalties to strong bonuses', rarity => {
        const kinds = new Set<string>();
        const penalties = new Set<number>();
        for (let seed = 1; seed <= 300; seed++) {
            const rng = new SeededRNG(seed);
            const copy = rng.clone();
            const raise = generateRaise(rng, rarity);
            expect(generateRaise(copy, rarity)).toEqual(raise);
            expect(copy.getState()).toBe(rng.getState());
            expect(raise.affixes!.reduce((total, affix) => total + affix.slotCost, 0)).toBe(RAISE_AFFIX_SLOTS[rarity]);
            const negative = raise.modifiers.filter(effect => effect.chips < 0 || effect.mult < 0);
            penalties.add(negative.length);
            expect(negative.length).toBeLessThanOrEqual(1);
            for (const affix of raise.affixes!) {
                kinds.add(affix.kind);
                const benefit = affix.modifiers.filter(effect => effect.chips > 0 || effect.mult > 0);
                expect(benefit).toHaveLength(1);
                expect(benefit[0].chips || benefit[0].mult).toBe(affix.kind === 'simple' ? (benefit[0].chips ? 5 : 0.1) : (benefit[0].chips ? 15 : 0.3));
                if (affix.kind === 'tradeoff') {
                    expect(affix.slotCost).toBe(1);
                    expect(affix.modifiers).toHaveLength(2);
                    const drawback = affix.modifiers[1];
                    expect(drawback.handTypeId).not.toBe(benefit[0].handTypeId);
                    expect(drawback.chips || drawback.mult).toBe(drawback.chips ? -5 : -0.1);
                } else {
                    expect(affix.modifiers).toHaveLength(1);
                    expect(affix.slotCost).toBe(affix.kind === 'double' ? 2 : 1);
                }
            }
        }
        expect(kinds).toEqual(new Set(rarity === 'Common' ? ['simple', 'tradeoff'] : ['simple', 'tradeoff', 'double']));
        expect(penalties).toEqual(new Set([0, 1]));
    });

    it('rejects compositions with unknown affixes, an incorrect budget or two penalties', () => {
        for (const id of ['raise_v3_0_double_pair_cash', 'raise_v3_0_simple_unknown_cash',
            'raise_v3_1_tradeoff_pair_cash_flush_mult.tradeoff_win_mult_loss_cash', 'raise_v3_2_simple_pair_cash'])
            expect(getRaise(id)).toBeUndefined();
    });

    it('applies and saves every benefit and penalty from a new composed Raise', () => {
        const id = 'raise_v3_2_tradeoff_pair_cash_flush_mult.double_win_mult';
        const raise = getRaise(id)!;
        expect(raise.rarity).toBe('Rare');
        const state = { ...shop(), pendingRaiseChoices: [id], pendingPack: { packId: 'raise_basic' as const, picksRemaining: 1 } };
        const chosen = act(state, { type: 'choose_raise', raiseId: id });
        expect(getHandPayout('pair', chosen.handUpgrades)).toMatchObject({ chips: 15, mult: 0.1 });
        expect(getHandPayout('flush', chosen.handUpgrades)).toMatchObject({ mult: -0.1 });
        expect(getHandPayout('win', chosen.handUpgrades)).toMatchObject({ mult: 0.3, variant: { mult: 0.4 } });
        expect(getHandRaiseChanges('flush', chosen.handUpgrades).map(change => change.value)).toEqual([-0.1]);
        expect(useGameBridge.getState().loadGameState(JSON.stringify(chosen))).toBe(true);
        for (const hand of HAND_TYPES)
            expect(getHandPayout(hand.id, useGameBridge.getState().gameState.handUpgrades)).toEqual(getHandPayout(hand.id, chosen.handUpgrades));
    });

    it('formats increases without a plus and places x after a decrease sign', () => {
        expect(formatRaiseCash(15)).toBe('$15');
        expect(formatRaiseCash(-5)).toBe('−$5');
        expect(formatRaiseMult(0.1)).toBe('x0.1');
        expect(formatRaiseMult(-0.1)).toBe('−x0.1');
        expect(formatRaiseMult(0.1 + 0.2)).toBe('x0.3');
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
        expect(settlement.nextState.cash).toBe(40); // ($10 win + $25 straight + $15 flush) * 0.8

        const before = shop(), pending = { ...before, pendingRaiseChoices: [raise.id] };
        const picked = act(pending, { type: 'choose_raise', raiseId: raise.id });
        for (const hand of HAND_TYPES) {
            const payout = getHandPayout(hand.id, picked.handUpgrades);
            expect(Number.isFinite(payout.chips + payout.mult)).toBe(true);
        }
    });
});
