import { describe, expect, it } from 'vitest';
import { createInitialState, getValidActions, processAction } from '../engine';
import type { GameState } from '../GameState';
import type { PlayerAction } from '../PlayerAction';
import { generateRaise, generateRaiseChoices, getHandPayout, getHandRaiseChanges, getRaise, HAND_TYPES, PACK_RAISES, RAISE_AFFIXES, RAISE_AFFIX_SLOTS, formatRaiseCash, formatRaiseMult } from '../../logic/handScoring';
import { getRelicSide, getSideSlotCount } from '../../logic/relics/inventory';
import { SeededRNG } from '../rng';
import { TUTORIAL_STEPS } from '../tutorial/definitions';
import { useGameBridge } from '../../store/gameBridge';
import { evaluateHandScore } from '../../logic/scoring';
import { PACKS, rollPackDefinition } from '../../logic/packs';
import { SMALL_UPGRADE_UNITS } from '../../logic/upgradeTuning';

const act = (state: GameState, action: PlayerAction) => processAction(state, action).nextState;
const shop = (): GameState => act(createInitialState(), {
    type: 'start_game', cityId: 'atlantic_city', gamblerId: 'newbie', seed: 17,
    globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id),
});

describe('relic slots and raise packs', () => {
    it('starts with six permanent slots, three per side', () => {
        expect(shop().relicSlots).toBe(6);
        expect(Array.from({ length: 6 }, (_, i) => getRelicSide(i))).toEqual(['left', 'left', 'left', 'left', 'left', 'left']);
        expect(getSideSlotCount('left', 6)).toBe(6);
        expect(getSideSlotCount('right', 6)).toBe(0);
    });

    it.each(PACKS.filter(pack => pack.family === 'raise'))('opens $name for free and applies exactly its allowed picks', pack => {
        const initial = { ...shop(), pendingPack: null, pendingPackChoices: [], offeredPacks: [pack.id] };
        let state = act(initial, { type: 'open_pack', packId: pack.id });
        expect(state.pendingRaiseChoices).toHaveLength(pack.offerCount);
        for (let pick = 0; pick < pack.pickCount; pick++) {
            expect(act(state, { type: 'finish_pack' })).toEqual(state);
            const id = state.pendingRaiseChoices[0];
            expect(getValidActions(state)).toContainEqual({ type: 'choose_raise', raiseId: id });
            const previous = state;
            state = act(state, { type: 'choose_raise', raiseId: id });
            expect(state.handUpgrades[id]).toBe(1);
            expect(previous.handUpgrades[id]).toBeUndefined();
            expect(act(state, { type: 'choose_raise', raiseId: id })).toEqual(state);
        }
        expect(state.pendingPack).toBeNull();
        expect(state.cash).toBe(initial.cash);
        expect(act(state, { type: 'open_pack', packId: pack.id })).toEqual(state);
        expect(act(state, { type: 'finish_pack' }).phase).toBe('entering_casino');
    });

    it('keeps the existing 60/30/10 pack size distribution', () => {
        expect([0, .599, .6, .899, .9, .999].map(roll => rollPackDefinition(roll).id))
            .toEqual(['raise_basic', 'raise_basic', 'raise_jumbo', 'raise_jumbo', 'raise_mega', 'raise_mega']);
    });

    it('settles decimal penalties without losing a dollar to floating point rounding', () => {
        const state: GameState = { ...shop(), phase: 'scoring', cash: 0,
            handUpgrades: { raise_win_cash: 1, raise_v2_1_pair_cash_2_trade: 3 },
            runningSummary: { chips: 0, mult: 1 },
            playerHands: [{ id: 0, cards: [{ id: 'a', rank: '7', suit: 'hearts' }, { id: 'b', rank: '8', suit: 'hearts' }],
                blackjackValue: 15, isBust: false, isHeld: true, outcome: 'win' }] };
        expect(act(state, { type: 'score_round' }).cash).toBe(85); // $100 * 0.85
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
            expect(raise.id).toMatch(/^raise_v5_/);
            expect(generateRaise(copy, rarity)).toEqual(raise);
            expect(copy.getState()).toBe(rng.getState());
            expect(raise.affixes!.reduce((total, affix) => total + affix.slotCost, 0)).toBe(RAISE_AFFIX_SLOTS[rarity]);
            const bonuses = raise.modifiers.flatMap(effect => [
                ...(effect.chips ? [`${effect.handTypeId}:chips`] : []),
                ...(effect.mult ? [`${effect.handTypeId}:mult`] : []),
            ]);
            expect(new Set(bonuses).size).toBe(bonuses.length);
            const negative = raise.modifiers.filter(effect => effect.chips < 0 || effect.mult < 0);
            penalties.add(negative.length);
            expect(negative.length).toBeLessThanOrEqual(1);
            for (const affix of raise.affixes!) {
                kinds.add(affix.kind);
                const benefit = affix.modifiers.filter(effect => effect.chips > 0 || effect.mult > 0);
                expect(benefit).toHaveLength(1);
                const unit = SMALL_UPGRADE_UNITS[benefit[0].handTypeId];
                const units = affix.kind === 'simple' ? 1 : 3;
                expect(benefit[0].chips || benefit[0].mult).toBeCloseTo(benefit[0].chips ? units * unit.cash : units * unit.multPercent / 100);
                for (const effect of affix.modifiers) {
                    expect(Number.isInteger(effect.chips)).toBe(true);
                    expect(effect.mult * 100).toBeCloseTo(Math.round(effect.mult * 100));
                }
                if (affix.kind === 'tradeoff') {
                    expect(affix.slotCost).toBe(1);
                    expect(affix.modifiers).toHaveLength(2);
                    const drawback = affix.modifiers[1];
                    expect(drawback.handTypeId).not.toBe(benefit[0].handTypeId);
                    const penaltyUnit = SMALL_UPGRADE_UNITS[drawback.handTypeId];
                    expect(drawback.chips || drawback.mult).toBeCloseTo(drawback.chips ? -penaltyUnit.cash : -penaltyUnit.multPercent / 100);
                } else {
                    expect(affix.modifiers).toHaveLength(1);
                    expect(affix.slotCost).toBe(affix.kind === 'double' ? 2 : 1);
                }
            }
        }
        expect(kinds).toEqual(new Set(rarity === 'Common' ? ['simple', 'tradeoff'] : ['simple', 'tradeoff', 'double']));
        expect(penalties).toEqual(new Set([0, 1]));
    });

    it.each([
        ['simple_pair_mult', 'tradeoff_pair_mult_flush_mult'],
        ['simple_pair_mult', 'tradeoff_flush_cash_pair_mult'],
        ['tradeoff_pair_mult_flush_mult', 'simple_pair_mult'],
        ['tradeoff_pair_mult_flush_mult', 'simple_flush_mult'],
        ['simple_pair_cash', 'simple_pair_cash'],
        ['simple_pair_mult', 'double_pair_mult'],
    ])('prevents %s from overlapping with %s on one card', (firstId, secondId) => {
        const first = RAISE_AFFIXES.find(affix => affix.id === firstId)!;
        const second = RAISE_AFFIXES.find(affix => affix.id === secondId)!;
        const pickRoll = (id: string, kind: typeof first.kind) => {
            const pool = RAISE_AFFIXES.filter(affix => affix.kind === kind);
            return (pool.findIndex(affix => affix.id === id) + 0.5) / pool.length;
        };
        const kindRoll = { simple: 0, tradeoff: 0.8, double: 0.99 };
        const rolls = [kindRoll[first.kind], pickRoll(firstId, first.kind), kindRoll[second.kind], pickRoll(secondId, second.kind)];
        const rng = new SeededRNG(1);
        rng.next = () => rolls.shift()!;
        const raise = generateRaise(rng, second.kind === 'double' ? 'Rare' : 'Uncommon');
        expect(raise.affixes![0].id).toBe(firstId);
        expect(raise.affixes![1].id).not.toBe(secondId);
        const bonuses = raise.modifiers.map(effect => `${effect.handTypeId}:${effect.chips ? 'chips' : 'mult'}`);
        expect(new Set(bonuses).size).toBe(bonuses.length);
    });

    it('allows chips and multiplier modifiers for the same hand on one card', () => {
        const rolls = [0, 0.45, 0, 0.5];
        const rng = new SeededRNG(1);
        rng.next = () => rolls.shift()!;
        expect(generateRaise(rng, 'Uncommon').modifiers).toEqual([
            { handTypeId: 'pair', chips: 4, mult: 0 },
            { handTypeId: 'pair', chips: 0, mult: 0.03 },
        ]);
    });

    it('rejects compositions with unknown affixes, an incorrect budget or two penalties', () => {
        for (const id of ['raise_v3_0_double_pair_cash', 'raise_v3_0_simple_unknown_cash',
            'raise_v3_1_tradeoff_pair_cash_flush_mult.tradeoff_win_mult_loss_cash', 'raise_v3_2_simple_pair_cash',
            'raise_v4_0_double_pair_cash', 'raise_v4_0_simple_unknown_cash',
            'raise_v4_1_tradeoff_pair_cash_flush_mult.tradeoff_win_mult_loss_cash', 'raise_v4_2_simple_pair_cash',
            'raise_v5_0_double_pair_cash', 'raise_v5_0_simple_unknown_cash',
            'raise_v5_1_tradeoff_pair_cash_flush_mult.tradeoff_win_mult_loss_cash', 'raise_v5_2_simple_pair_cash'])
            expect(getRaise(id)).toBeUndefined();
    });

    it('preserves every benefit and penalty from an earlier composed Raise', () => {
        const id = 'raise_v3_2_tradeoff_pair_cash_flush_mult.double_win_mult';
        const raise = getRaise(id)!;
        expect(raise.rarity).toBe('Rare');
        const state = { ...shop(), pendingRaiseChoices: [id], pendingPack: { packId: 'raise_basic' as const, picksRemaining: 1 } };
        const chosen = act(state, { type: 'choose_raise', raiseId: id });
        expect(getHandPayout('pair', chosen.handUpgrades)).toMatchObject({ chips: 20, mult: 0.05 });
        expect(getHandPayout('flush', chosen.handUpgrades)).toMatchObject({ mult: -0.05 });
        expect(getHandPayout('win', chosen.handUpgrades)).toMatchObject({ mult: 0.15, variant: { mult: 0.25 } });
        expect(getHandRaiseChanges('flush', chosen.handUpgrades).map(change => change.value)).toEqual([-0.05]);
        expect(useGameBridge.getState().loadGameState(JSON.stringify(chosen))).toBe(true);
        for (const hand of HAND_TYPES)
            expect(getHandPayout(hand.id, useGameBridge.getState().gameState.handUpgrades)).toEqual(getHandPayout(hand.id, chosen.handUpgrades));
    });

    it('uses the agreed whole-number units for all ten simple upgrades', () => {
        for (const [id, cash, multPercent] of [
            ['win', 3, 3], ['loss', 3, 3], ['pair', 4, 3], ['straight', 4, 3], ['flush', 3, 2],
        ] as const) {
            expect(getRaise(`raise_v5_0_simple_${id}_cash`)?.modifiers).toEqual([{ handTypeId: id, chips: cash, mult: 0 }]);
            expect(getRaise(`raise_v5_0_simple_${id}_mult`)?.modifiers).toEqual([{ handTypeId: id, chips: 0, mult: multPercent / 100 }]);
            expect(getRaise(`raise_v3_0_simple_${id}_cash`)?.chips).toBe(5);
            expect(getRaise(`raise_v3_0_simple_${id}_mult`)?.mult).toBe(0.05);
        }
    });

    it('scales each side of a tradeoff using its own unit and retains it through save/load', () => {
        const id = 'raise_v5_2_tradeoff_straight_cash_flush_mult.double_loss_mult';
        expect(getRaise(id)?.modifiers).toEqual([
            { handTypeId: 'straight', chips: 12, mult: 0 },
            { handTypeId: 'flush', chips: 0, mult: -0.02 },
            { handTypeId: 'loss', chips: 0, mult: 0.09 },
        ]);
        const pending = { ...shop(), pendingRaiseChoices: [id], pendingPack: { packId: 'raise_basic' as const, picksRemaining: 1 } };
        const chosen = act(pending, { type: 'choose_raise', raiseId: id });
        expect(getHandPayout('straight', chosen.handUpgrades).chips).toBe(22);
        expect(getHandPayout('flush', chosen.handUpgrades).mult).toBe(-0.02);
        expect(getHandPayout('loss', chosen.handUpgrades)).toMatchObject({ mult: 0.09, variant: { mult: -0.01 } });
        expect(useGameBridge.getState().loadGameState(JSON.stringify(chosen))).toBe(true);
        expect(useGameBridge.getState().gameState.handUpgrades).toEqual(chosen.handUpgrades);
        expect(getHandPayout('loss', useGameBridge.getState().gameState.handUpgrades)).toEqual(getHandPayout('loss', chosen.handUpgrades));
    });

    it('slows removal of Lose/Bust penalties while retaining earlier earned values', () => {
        const cash = 'raise_v5_0_simple_loss_cash', mult = 'raise_v5_0_simple_loss_mult';
        expect(getHandPayout('loss', { [cash]: 2 })).toMatchObject({ chips: -4, variant: { chips: -14 } });
        expect(getHandPayout('loss', { [mult]: 2 }).variant?.mult).toBe(-0.04);
        expect(getRaise('raise_v4_0_simple_loss_cash')?.chips).toBe(6);
        expect(getRaise('raise_v4_0_simple_loss_mult')?.mult).toBe(.06);
        expect(getHandPayout('loss', { raise_v4_0_simple_loss_cash: 2, [cash]: 1 }).chips).toBe(5);
        expect(getHandPayout('loss', { raise_v5_0_tradeoff_loss_cash_flush_mult: 1 }).chips).toBe(-1);
    });

    it('formats increases and decreases without visible signs', () => {
        expect(formatRaiseCash(15)).toBe('$15');
        expect(formatRaiseCash(-5)).toBe('$5');
        expect(formatRaiseMult(0.1)).toBe('x10%');
        expect(formatRaiseMult(-0.1)).toBe('x10%');
        expect(formatRaiseMult(0.1 + 0.2)).toBe('x30%');
    });

    it('applies a pair cash bonus and flush penalty together, stacks both and scores the drawback', () => {
        const raise = getRaise('raise_v2_1_pair_cash_2_trade')!;
        expect(raise.modifiers).toEqual([
            { handTypeId: 'pair', chips: 15, mult: 0 },
            { handTypeId: 'flush', chips: 0, mult: -0.05 },
        ]);
        const upgrades = { [raise.id]: 2 };
        expect(getHandPayout('pair', upgrades).chips).toBe(35);
        expect(getHandPayout('flush', upgrades).mult).toBe(-0.1);
        const scored = evaluateHandScore([{ id: 'a', rank: '7', suit: 'hearts' }, { id: 'b', rank: '8', suit: 'hearts' }],
            true, false, [], 0, undefined, 'win', upgrades);
        expect(scored.criteria.find(row => row.id === 'flush')?.multiplier).toBe(-0.1);
        expect(scored.totalMultiplier).toBe(-0.1);
        const settlement = processAction({ ...shop(), phase: 'scoring', cash: 0, handUpgrades: upgrades,
            runningSummary: { chips: 0, mult: 1 }, playerHands: [
                { id: 0, cards: [{ id: 'a', rank: '7', suit: 'hearts' }, { id: 'b', rank: '8', suit: 'hearts' }],
                    blackjackValue: 15, isBust: false, isHeld: true, outcome: 'win' },
            ] }, { type: 'score_round' });
        expect(settlement.events).toContainEqual({ type: 'scoring_row_mult', handIndex: 0, criterionId: 'flush', multiplier: -0.1 });
        expect(settlement.nextState.cash).toBe(45); // ($10 win + $25 straight + $15 flush) * 0.9

        const before = shop(), pending = { ...before, pendingRaiseChoices: [raise.id] };
        const picked = act(pending, { type: 'choose_raise', raiseId: raise.id });
        for (const hand of HAND_TYPES) {
            const payout = getHandPayout(hand.id, picked.handUpgrades);
            expect(Number.isFinite(payout.chips + payout.mult)).toBe(true);
        }
    });
});
