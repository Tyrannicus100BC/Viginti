import { describe, expect, it } from 'vitest';
import { createInitialState, getValidActions, processAction } from '../engine';
import type { GameState } from '../GameState';
import { HAND_TYPES, getHandPayout, getHandRaiseChanges } from '../../logic/handScoring';
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
    phase: 'pack_choice', cash: 10000, offeredPacks: [],
    pendingPack: { packId: 'raise_basic', picksRemaining: 1 }, pendingRaiseChoices: [id],
});

describe('permanent hand scoring and Raises', () => {
    it('uses the tuned base payouts for patterns and outcome variants', () => {
        expect(getHandPayout('win')).toMatchObject({ chips: 10, mult: 0, variant: { chips: 20, mult: 0.1 } });
        expect(getHandPayout('loss')).toMatchObject({ chips: -10, mult: 0, variant: { chips: -20, mult: -0.1 } });
        expect(evaluateHandScore(cards, false).criteria.find(row => row.id === 'pair')).toMatchObject({ chips: 19, multiplier: 0.05 });
        const twentyOne: Card[] = [{ id: 'ace', rank: 'A', suit: 'hearts' }, { id: 'king', rank: 'K', suit: 'clubs' }];
        expect(evaluateHandScore(twentyOne, true).criteria[0]).toMatchObject({ id: 'viginti', chips: 20, multiplier: 0.1 });
        expect(evaluateHandScore([...cards, { id: 'king', rank: 'K', suit: 'spades' }], false).criteria[0]).toMatchObject({ id: 'bust', chips: -20, multiplier: -0.1 });
    });

    it('lists only relevant raise effects individually, including duplicates and penalties', () => {
        const upgrades = { raise_v2_1_pair_cash_1_bonus: 1, raise_v2_1_pair_cash_2_trade: 1, raise_v2_0_pair_mult_1_bonus: 1 };
        expect(getHandRaiseChanges('pair', upgrades).map(({ stat, value }) => ({ stat, value }))).toEqual([
            { stat: 'chips', value: 10 }, { stat: 'chips', value: 15 }, { stat: 'mult', value: 0.05 },
        ]);
        expect(getHandRaiseChanges('flush', upgrades).map(change => change.value)).toEqual([-0.05]);
        expect(getHandRaiseChanges('win', upgrades)).toEqual([]);
        const repeated = { raise_pair_combo: 2, unknown_raise: 3, raise_flush_cash: 1 };
        expect(getHandRaiseChanges('pair', repeated).map(({ occurrence, stat, value }) => ({ occurrence, stat, value }))).toEqual([
            { occurrence: 0, stat: 'chips', value: 20 }, { occurrence: 0, stat: 'mult', value: 0.25 },
            { occurrence: 1, stat: 'chips', value: 20 }, { occurrence: 1, stat: 'mult', value: 0.25 },
        ]);
        for (const hand of HAND_TYPES) {
            const changes = getHandRaiseChanges(hand.id, repeated);
            const payout = getHandPayout(hand.id, repeated);
            expect(hand.chips + changes.filter(change => change.stat === 'chips').reduce((sum, change) => sum + change.value, 0)).toBe(payout.chips);
            expect(hand.mult + changes.filter(change => change.stat === 'mult').reduce((sum, change) => sum + change.value, 0)).toBeCloseTo(payout.mult);
        }
    });

    it('starts with five core hand types and no scoring relics to equip', () => {
        const state = stocked();
        expect(HAND_TYPES.map(hand => hand.id)).toEqual(['win', 'loss', 'pair', 'straight', 'flush']);
        expect(state.inventory).toEqual([]);
        expect(state.handUpgrades).toEqual({});
        expect(evaluateHandScore(cards, true).criteria.map(row => row.id)).toEqual(['win', 'pair']);
        expect(evaluateHandScore(cards, false, false, [], 0, undefined, 'loss').criteria.map(row => row.id)).toEqual(['loss', 'pair']);
    });

    it('adds mixed and repeated Raises alongside card relic bonuses', () => {
        const upgrades = { raise_pair_combo: 2, raise_pair_mult: 1, raise_flush_cash: 3 };
        const payout = getHandPayout('pair', upgrades);
        expect(payout).toMatchObject({ chips: 45, mult: 0.8, count: 3 });
        const score = evaluateHandScore(cards, true, false, [], 0, undefined, 'win', upgrades);
        expect(score.criteria.find(row => row.id === 'pair')).toMatchObject({ chips: 14 + payout.chips, multiplier: payout.mult });
        const bead = RelicManager.getRelicConfig('star_bead')!;
        const nines = cards.map(card => ({ ...card, rank: '9' as const }));
        const withRelic = evaluateHandScore(nines, true, false, [{ id: bead.id, state: { ...bead.properties } }], 0, undefined, 'win', upgrades);
        expect(withRelic.criteria.find(row => row.id === 'pair')).toMatchObject({ chips: 18 + payout.chips, multiplier: payout.mult });
        expect(withRelic.criteria.find(row => row.id === 'win')?.multiplier).toBe(0.2);
        expect(getHandPayout('pair', upgrades)).toEqual(payout);
    });

    it('applies Win and Lose Raises to 21 and bust while pushes retain no outcome payout', () => {
        const upgrades = { raise_win_combo: 1, raise_loss_combo: 1 };
        const twentyOne: Card[] = [{ id: 'ace', rank: 'A', suit: 'hearts' }, { id: 'king', rank: 'K', suit: 'clubs' }];
        expect(evaluateHandScore(twentyOne, true, false, [], 0, undefined, 'win', upgrades).criteria[0]).toMatchObject({ id: 'viginti', chips: 40, multiplier: 0.35 });
        const bust = [...twentyOne, { id: 'extra', rank: 'K' as const, suit: 'spades' as const }];
        bust.push({ id: 'another', rank: 'K', suit: 'diamonds' });
        expect(evaluateHandScore(bust, false, false, [], 0, undefined, 'bust', upgrades).criteria[0]).toMatchObject({ id: 'bust', chips: 0, multiplier: 0.15 });
        expect(evaluateHandScore(cards, false, false, [], 0, undefined, 'push', upgrades).criteria.some(row => row.id === 'loss' || row.id === 'win')).toBe(false);
    });

    it('upgrades every pair, including all three pairs in a triple', () => {
        const triple = [...cards, { id: 'c', rank: '7' as const, suit: 'spades' as const }];
        const pairs = evaluateHandScore(triple, true, false, [], 0, undefined, 'win', { raise_pair_combo: 1 }).criteria.filter(row => row.id === 'pair');
        expect(pairs).toHaveLength(3);
        expect(pairs.every(row => row.chips === 39 && row.multiplier === 0.3)).toBe(true);
    });

    it('stacks pack upgrades without using slots or mutating previous state', () => {
        let state = stocked();
        state = { ...state, inventory: RelicManager.getAllRelics().slice(0, 10).map(config => ({ id: config.id, state: { ...config.properties } })) };
        const original = state;
        for (let i = 0; i < 25; i++) {
            state = { ...state, pendingPack: { packId: 'raise_basic', picksRemaining: 1 }, pendingRaiseChoices: ['raise_pair_mult'] };
            expect(getValidActions(state)).toContainEqual({ type: 'choose_raise', raiseId: 'raise_pair_mult' });
            state = act(state, { type: 'choose_raise', raiseId: 'raise_pair_mult' });
        }
        expect(state.handUpgrades.raise_pair_mult).toBe(25);
        expect(getHandPayout('pair', state.handUpgrades).mult).toBe(6.3);
        expect(state.inventory).toEqual(original.inventory);
        expect(original.handUpgrades).toEqual({});
        expect(state.cash).toBe(original.cash);
        expect(act(state, { type: 'choose_raise', raiseId: 'raise_pair_mult' })).toEqual(state);
        expect(act(state, { type: 'start_game', cityId: 'atlantic_city', gamblerId: 'newbie' }).handUpgrades).toEqual({});
    });

    it('retains Raises through state export/import', () => {
        let state = act(stocked(), { type: 'choose_raise', raiseId: 'raise_pair_mult' });
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
        const state: GameState = { ...stocked(), phase: 'scoring', cash: 0, handUpgrades: upgrades, runningSummary: { chips: 0, mult: 1 },
            playerHands: [{ id: 0, cards, blackjackValue: 14, isBust: false, isHeld: true, outcome: 'loss' }] };
        const result = processAction(state, { type: 'score_round' });
        // Lose −$10, Pair $14 + $5 + $20, starting 100% plus 30%.
        expect(result.nextState.cash).toBe(37);
        expect(result.nextState.playerHands[0].finalScore?.criteria.find(row => row.id === 'pair')).toMatchObject({ chips: 39, multiplier: 0.3 });
        expect(result.nextState.handUpgrades).toEqual(upgrades);
    });

    it('offers owned Raises again while excluding owned relics', () => {
        const stock = generateShopItems([{ type: 'Raise', count: 1, specificIds: ['raise_pair_mult'] }, { type: 'Score', count: 1, specificIds: ['star_bead'] }], [{ id: 'star_bead', state: {} }], undefined, new SeededRNG(42));
        expect(stock.map(item => item.id)).toEqual(['raise_pair_mult']);
    });

    it('uses one relic category and a shared six-slot limit', () => {
        expect(stocked().relicSlots).toBe(6);
        for (const relic of RelicManager.getAllRelics()) {
            expect(relic.categories).toContain('Relic');
            expect(relic.categories).not.toContain('Control');
            expect(relic.categories).not.toContain('Score');
        }
    });
});
