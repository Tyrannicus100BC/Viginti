import { describe, expect, it } from 'vitest';
import { createInitialState, getValidActions, processAction } from '../engine';
import type { GameState } from '../GameState';
import type { PlayerAction } from '../PlayerAction';
import { generateRaise, generateRaiseChoices, getHandPayout, getHandRaiseChanges, getRaise, HAND_TYPES, RAISE_HAND_TYPES, PACK_RAISES, RAISE_AFFIX_SLOTS, formatRaiseCash, formatRaiseMult } from '../../logic/handScoring';
import { getRelicSide, getSideSlotCount } from '../../logic/relics/inventory';
import { SeededRNG } from '../rng';
import { generateShopItems } from '../../logic/rewards/generator';
import { TUTORIAL_STEPS } from '../tutorial/definitions';
import { useGameBridge } from '../../store/gameBridge';
import { evaluateHandScore } from '../../logic/scoring';
import { PACKS, rollPackDefinition } from '../../logic/packs';
import { RAISE_BONUS_RANGES, V9_RAISE_BONUS_RANGES, RAISE_LOSS_PENALTY_RANGES, RAISE_VALUE_WEIGHTS } from '../../logic/upgradeTuning';

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
                expect(raise.affixes!.every(affix => affix.modifiers[0].chips >= 0 && affix.modifiers[0].mult >= 0)).toBe(true);
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
            expect(raise.id).toMatch(/^raise_v10_/);
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
                const benefit = [affix.modifiers[0]];
                expect(benefit[0].chips).toBeGreaterThanOrEqual(0);
                expect(benefit[0].mult).toBeGreaterThanOrEqual(0);
                expect(['loss', 'bust']).not.toContain(benefit[0].handTypeId);
                const ranges = RAISE_BONUS_RANGES[benefit[0].handTypeId as keyof typeof RAISE_BONUS_RANGES][affix.kind === 'simple' ? 'regular' : 'strong'];
                const [min, max] = benefit[0].chips ? ranges.cash : ranges.multPercent;
                const amount = benefit[0].chips || Math.round(benefit[0].mult * 100);
                expect(amount).toBeGreaterThanOrEqual(min);
                expect(amount).toBeLessThanOrEqual(max);
                for (const effect of affix.modifiers) {
                    expect(Number.isInteger(effect.chips)).toBe(true);
                    expect(effect.mult * 100).toBeCloseTo(Math.round(effect.mult * 100));
                }
                if (affix.kind === 'tradeoff') {
                    expect(affix.slotCost).toBe(1);
                    expect(affix.modifiers).toHaveLength(2);
                    const drawback = affix.modifiers[1];
                    expect(drawback.handTypeId).not.toBe(benefit[0].handTypeId);
                    const penaltyRanges = drawback.handTypeId === 'loss' || drawback.handTypeId === 'bust' ? RAISE_LOSS_PENALTY_RANGES : V9_RAISE_BONUS_RANGES[drawback.handTypeId].regular;
                    const [min, max] = drawback.chips ? penaltyRanges.cash : penaltyRanges.multPercent;
                    const amount = -(drawback.chips || Math.round(drawback.mult * 100));
                    expect(amount).toBeGreaterThanOrEqual(min);
                    expect(amount).toBeLessThanOrEqual(max);
                } else {
                    expect(affix.modifiers).toHaveLength(1);
                    expect(affix.slotCost).toBe(affix.kind === 'double' ? 2 : 1);
                }
            }
        }
        expect(kinds).toEqual(new Set(rarity === 'Common' ? ['simple', 'tradeoff'] : ['simple', 'tradeoff', 'double']));
        expect(penalties).toEqual(new Set([0, 1]));
    });

    it('uses ranged cards for direct Raise rewards and excludes historical positive Lose offers', () => {
        for (let seed = 1; seed <= 100; seed++) {
            const rewards = generateShopItems([{ type: 'Raise', count: 3 }], [], undefined, new SeededRNG(seed));
            expect(rewards).toHaveLength(3);
            expect(new Set(rewards.map(item => item.id)).size).toBe(3);
            for (const item of rewards) {
                expect(item.id).toMatch(/^raise_v10_/);
                expect(getRaise(item.id)!.modifiers.some(effect => (effect.handTypeId === 'loss' || effect.handTypeId === 'bust') && (effect.chips > 0 || effect.mult > 0))).toBe(false);
            }
        }
        expect(generateShopItems([{ type: 'Raise', count: 1, specificIds: ['raise_loss_cash', 'raise_v5_0_simple_loss_mult'] }], [], undefined, new SeededRNG(1))).toEqual([]);
    });

    it('splits drawbacks 25% Lose / 25% Bust / 50% other and varies amounts across the full ranges', () => {
        let lossPenalties = 0, bustPenalties = 0, penalties = 0;
        const seen = new Map<string, Set<number>>();
        for (let seed = 1; seed <= 10000; seed++) {
            const raise = generateRaise(new SeededRNG(seed), 'Rare');
            expect(getRaise(raise.id)).toEqual(raise);
            for (const affix of raise.affixes!) for (const [index, effect] of affix.modifiers.entries()) {
                const penalty = index > 0;
                if (penalty) {
                    penalties++;
                    if (effect.handTypeId === 'loss') lossPenalties++;
                    if (effect.handTypeId === 'bust') bustPenalties++;
                } else expect(['loss', 'bust']).not.toContain(effect.handTypeId);
                const key = `${effect.handTypeId}:${effect.chips ? 'cash' : 'multPercent'}:${penalty ? 'penalty' : affix.kind === 'simple' ? 'regular' : 'strong'}`;
                if (!seen.has(key)) seen.set(key, new Set());
                seen.get(key)!.add(Math.abs(effect.chips || Math.round(effect.mult * 100)));
            }
        }
        expect(penalties).toBeGreaterThan(3000);
        for (const count of [lossPenalties, bustPenalties]) {
            expect(count / penalties).toBeGreaterThan(.22);
            expect(count / penalties).toBeLessThan(.28);
        }
        expect((penalties - lossPenalties - bustPenalties) / penalties).toBeGreaterThan(.47);
        expect((penalties - lossPenalties - bustPenalties) / penalties).toBeLessThan(.53);
        for (const [hand, ranges] of Object.entries(RAISE_BONUS_RANGES)) {
            for (const strength of ['regular', 'strong'] as const) for (const stat of ['cash', 'multPercent'] as const) {
                const [min, max] = ranges[strength][stat];
                expect(seen.get(`${hand}:${stat}:${strength}`)).toEqual(new Set(Array.from({ length: max - min + 1 }, (_, i) => min + i)));
            }
        }
    });

    it.each([
        ['Common', 0, .45, [2, 3, 4, 5], [0, .16, .50, .84]],
        ['Uncommon', .99, .45, [8, 9, 10, 11, 12], [0, .16, .36, .64, .84]],
        ['Common', 0, .99, [1, 2, 3], [0, .42, .84]],
    ] as const)('uses exact weighted boundaries for %s rolls (%s, %s)', (rarity, kindRoll, pickRoll, amounts, boundaries) => {
        for (let index = 0; index < amounts.length; index++) {
            for (const valueRoll of [boundaries[index], (boundaries[index + 1] ?? 1) - .000001]) {
                const rolls = [kindRoll, pickRoll, valueRoll];
                const rng = new SeededRNG(1);
                rng.next = () => rolls.shift()!;
                const raise = generateRaise(rng, rarity);
                const effect = raise.modifiers[0];
                expect(effect.chips || Math.round(effect.mult * 100)).toBe(amounts[index]);
                expect(getRaise(raise.id)).toEqual(raise);
            }
        }
    });

    it('favors central values and rolls Flush multipliers at 42/42/16 percent without zeros', () => {
        const counts = new Map<number, number>();
        const flushCounts = new Map<number, number>();
        for (let seed = 1; seed <= 30000; seed++) {
            const raise = generateRaise(new SeededRNG(seed), 'Common');
            if (raise.affixes![0].kind !== 'simple') continue;
            const effect = raise.modifiers[0];
            if (effect.handTypeId === 'pair' && effect.chips) counts.set(effect.chips, (counts.get(effect.chips) ?? 0) + 1);
            if (effect.handTypeId === 'flush' && effect.chips === 0) {
                expect(effect.mult).toBeGreaterThanOrEqual(.01);
                const amount = Math.round(effect.mult * 100);
                flushCounts.set(amount, (flushCounts.get(amount) ?? 0) + 1);
            }
        }
        const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
        for (const [index, amount] of [2, 3, 4, 5].entries()) {
            expect((counts.get(amount) ?? 0) / total).toBeCloseTo(RAISE_VALUE_WEIGHTS[4][index] / 100, 1);
        }
        const flushTotal = [...flushCounts.values()].reduce((sum, count) => sum + count, 0);
        expect(new Set(flushCounts.keys())).toEqual(new Set([1, 2, 3]));
        for (const [index, amount] of [1, 2, 3].entries()) {
            expect((flushCounts.get(amount) ?? 0) / flushTotal).toBeCloseTo(RAISE_VALUE_WEIGHTS[3][index] / 100, 1);
        }
    });

    it('reduces both Pair benefit ranges while preserving earlier cards and current drawbacks', () => {
        expect(RAISE_BONUS_RANGES.pair).toEqual({ regular: { cash: [2, 5], multPercent: [1, 4] }, strong: { cash: [8, 12], multPercent: [6, 10] } });
        expect(getRaise('raise_v9_0_simple_pair_cash~6')?.chips).toBe(6);
        expect(getRaise('raise_v9_1_double_pair_mult~11')?.mult).toBe(.11);
        expect(getRaise('raise_v10_0_simple_pair_cash~2')?.chips).toBe(2);
        expect(getRaise('raise_v10_0_simple_pair_mult~1')?.mult).toBe(.01);
        expect(getRaise('raise_v10_1_double_pair_cash~12')?.chips).toBe(12);
        expect(getRaise('raise_v10_0_tradeoff_pair_mult_bust_cash~10~7')?.mult).toBe(.1);
        expect(getRaise('raise_v10_0_tradeoff_flush_cash_pair_mult~6~5')?.modifiers[1].mult).toBe(-.05);
        expect(getRaise('raise_v10_0_simple_pair_cash~6')).toBeUndefined();
        expect(getRaise('raise_v10_1_double_pair_mult~11')).toBeUndefined();
        for (const hand of ['win', 'viginti', 'straight', 'flush'] as const) expect(RAISE_BONUS_RANGES[hand]).toEqual(V9_RAISE_BONUS_RANGES[hand]);
        const upgrades = { 'raise_v10_0_simple_win_cash~4': 1, 'raise_v10_0_tradeoff_pair_cash_loss_mult~10~4': 1 };
        expect(getHandPayout('win', upgrades)).toMatchObject({ chips: 14, variant: { chips: 20 } });
        expect(getHandPayout('loss', upgrades)).toMatchObject({ mult: -.04, variant: { mult: -.1 } });
    });

    it('rejects zero-strength new Flush cards while preserving previously saved zero rolls', () => {
        expect(getRaise('raise_v9_0_simple_flush_mult~0')).toBeUndefined();
        expect(getRaise('raise_v9_0_tradeoff_pair_cash_flush_mult~11~0')).toBeUndefined();
        expect(getRaise('raise_v8_0_simple_flush_mult~0')?.mult).toBe(0);
        expect(getRaise('raise_v8_0_tradeoff_pair_cash_flush_mult~11~0')?.modifiers[1].mult).toBeCloseTo(0);
        for (let seed = 1; seed <= 500; seed++) {
            const raise = generateRaise(new SeededRNG(seed), 'Rare');
            expect(raise.modifiers.every(effect => effect.chips !== 0 || effect.mult !== 0)).toBe(true);
        }
        const upgrades = { 'raise_v9_0_simple_win_cash~4': 1, 'raise_v9_0_tradeoff_pair_cash_bust_mult~11~5': 1 };
        expect(getHandPayout('win', upgrades)).toMatchObject({ chips: 14, variant: { chips: 20 } });
        expect(getHandPayout('loss', upgrades)).toMatchObject({ mult: 0, variant: { mult: -.15 } });
    });

    it('increases Lose/Bust penalties and preserves earlier v6 cards unchanged', () => {
        expect(RAISE_LOSS_PENALTY_RANGES).toEqual({ cash: [4, 7], multPercent: [2, 6] });
        const id = 'raise_v7_0_tradeoff_pair_cash_loss_mult~12~5';
        expect(getRaise(id)?.modifiers).toEqual([
            { handTypeId: 'pair', chips: 12, mult: 0 }, { handTypeId: 'loss', chips: 0, mult: -.05 },
        ]);
        const upgrades = { [id]: 2 };
        expect(getHandPayout('loss', upgrades)).toMatchObject({ chips: -10, mult: -.1, variant: { chips: -20, mult: -.2 } });
        expect(getRaise('raise_v6_0_tradeoff_pair_cash_loss_cash~11~3')?.modifiers[1].chips).toBe(-3);
        expect(getRaise('raise_v6_0_tradeoff_pair_cash_loss_mult~11~2')?.modifiers[1].mult).toBe(-.02);
        expect(getRaise('raise_v7_0_tradeoff_pair_cash_loss_cash~11~7')?.modifiers[1].chips).toBe(-7);
        expect(getRaise('raise_v7_0_simple_flush_mult~0')?.mult).toBe(0);
        expect(getRaise('raise_v6_0_simple_flush_mult~0')).toBeUndefined();
        for (const badId of ['raise_v7_0_simple_loss_cash~5', 'raise_v7_0_simple_pair_cash~2',
            'raise_v7_0_simple_pair_cash~7', 'raise_v7_0_tradeoff_pair_cash_loss_cash~11~3',
            'raise_v7_0_simple_flush_mult~00', 'raise_v7_0_simple_flush_mult~-1']) expect(getRaise(badId)).toBeUndefined();
    });

    it('rolls Viginti benefits and independent Viginti / Bust drawbacks across all rarities', () => {
        expect(RAISE_HAND_TYPES.map(hand => hand.id)).toEqual(['win', 'viginti', 'loss', 'bust', 'pair', 'straight', 'flush']);
        for (const rarity of ['Common', 'Uncommon', 'Rare'] as const) {
            const targets = new Set<string>();
            for (let seed = 1; seed <= 2000; seed++) {
                const raise = generateRaise(new SeededRNG(seed), rarity);
                for (const affix of raise.affixes!) for (const [index, effect] of affix.modifiers.entries()) {
                    targets.add(`${index === 0 ? 'benefit' : 'penalty'}:${effect.handTypeId}`);
                }
            }
            for (const target of ['benefit:win', 'benefit:viginti', 'penalty:viginti', 'penalty:loss', 'penalty:bust']) expect(targets).toContain(target);
            expect(targets).not.toContain('benefit:loss');
            expect(targets).not.toContain('benefit:bust');
        }
    });

    it.each([
        [0, 'loss'], [.249999, 'loss'], [.25, 'bust'], [.499999, 'bust'], [.5, 'viginti'], [.999999, 'viginti'],
    ] as const)('selects the correct drawback group at roll %s', (penaltyRoll, expected) => {
        // First affix within each group: Win benefit, Viginti ordinary penalty.
        const rolls = [.8, penaltyRoll, 0, .5, .5];
        const rng = new SeededRNG(1);
        rng.next = () => rolls.shift()!;
        const raise = generateRaise(rng, 'Common');
        expect(raise.affixes![0].kind).toBe('tradeoff');
        expect(raise.modifiers[1].handTypeId).toBe(expected);
    });

    it('scores and persists Win, Viginti, Lose and Bust Raises independently', () => {
        const ids = [
            'raise_v8_0_simple_win_cash~4', 'raise_v8_0_simple_viginti_mult~3',
            'raise_v8_0_tradeoff_pair_cash_loss_cash~11~6',
            'raise_v8_0_tradeoff_straight_mult_bust_mult~7~5',
        ];
        const upgrades = Object.fromEntries(ids.map(id => [id, 1]));
        expect(getHandPayout('win', upgrades)).toMatchObject({ chips: 14, mult: 0, variant: { chips: 20, mult: .13 } });
        expect(getHandPayout('loss', upgrades)).toMatchObject({ chips: -16, mult: 0, variant: { chips: -20, mult: -.15 } });
        expect(getHandRaiseChanges('win', upgrades).map(change => change.value)).toEqual([4]);
        expect(getHandRaiseChanges('viginti', upgrades).map(change => change.value)).toEqual([.03]);
        expect(getHandRaiseChanges('loss', upgrades).map(change => change.value)).toEqual([-6]);
        expect(getHandRaiseChanges('bust', upgrades).map(change => change.value)).toEqual([-.05]);
        const cards = [{ id: 'ten', rank: '10' as const, suit: 'hearts' as const }, { id: 'nine', rank: '9' as const, suit: 'clubs' as const }];
        const score = (cards: Parameters<typeof evaluateHandScore>[0], win: boolean, outcome: 'win' | 'loss' | 'bust', values = upgrades) => evaluateHandScore(cards, win, false, [], 0, undefined, outcome, values).criteria[0];
        const twentyOne = [...cards, { id: 'two', rank: '2' as const, suit: 'spades' as const }];
        const bust = [...cards, { id: 'three', rank: '3' as const, suit: 'spades' as const }];
        expect(score(cards, true, 'win')).toMatchObject({ id: 'win', chips: 14, multiplier: 0 });
        expect(score(twentyOne, true, 'win')).toMatchObject({ id: 'viginti', chips: 20, multiplier: .13 });
        expect(score(cards, false, 'loss')).toMatchObject({ id: 'loss', chips: -16, multiplier: 0 });
        expect(score(bust, false, 'bust')).toMatchObject({ id: 'bust', chips: -20, multiplier: -.15 });
        const drawback = { 'raise_v8_0_tradeoff_pair_cash_viginti_cash~11~4': 1 };
        expect(score(cards, true, 'win', drawback)).toMatchObject({ id: 'win', chips: 10 });
        expect(score(twentyOne, true, 'win', drawback)).toMatchObject({ id: 'viginti', chips: 16 });
        let state = shop();
        for (const id of ids) {
            const pending = { ...state, phase: 'pack_choice' as const, pendingRaiseChoices: [id], pendingPack: { packId: 'raise_basic' as const, picksRemaining: 1 } };
            state = act(pending, { type: 'choose_raise', raiseId: id });
        }
        expect(state.handUpgrades).toEqual(upgrades);
        expect(useGameBridge.getState().loadGameState(JSON.stringify(state))).toBe(true);
        expect(useGameBridge.getState().gameState.handUpgrades).toEqual(upgrades);
        expect(getHandPayout('loss', useGameBridge.getState().gameState.handUpgrades)).toEqual(getHandPayout('loss', upgrades));
        for (const id of ['raise_v7_0_simple_viginti_cash~4', 'raise_v7_0_tradeoff_pair_cash_bust_cash~11~6',
            'raise_v8_0_simple_bust_cash~5', 'raise_v8_0_double_bust_mult~7', 'raise_v8_0_tradeoff_bust_cash_win_mult~6~2']) expect(getRaise(id)).toBeUndefined();
    });

    it('allows cash and multiplier bonuses for the same hand on one card', () => {
        let found = false;
        for (let seed = 1; seed <= 500; seed++) {
            const raise = generateRaise(new SeededRNG(seed), 'Uncommon');
            if (raise.modifiers.some(effect => effect.handTypeId === 'pair' && effect.chips > 0)
                && raise.modifiers.some(effect => effect.handTypeId === 'pair' && effect.mult > 0)) found = true;
        }
        expect(found).toBe(true);
    });

    it('stores rolled values in IDs through choosing, stacking, export and import', () => {
        const id = 'raise_v6_2_tradeoff_pair_cash_loss_mult~11~3.double_win_mult~7';
        const raise = getRaise(id)!;
        expect(raise.modifiers).toEqual([
            { handTypeId: 'pair', chips: 11, mult: 0 },
            { handTypeId: 'loss', chips: 0, mult: -.03 },
            { handTypeId: 'win', chips: 0, mult: .07 },
        ]);
        const pending = { ...shop(), pendingRaiseChoices: [id], pendingPack: { packId: 'raise_basic' as const, picksRemaining: 1 } };
        const chosen = act(pending, { type: 'choose_raise', raiseId: id });
        expect(chosen.handUpgrades[id]).toBe(1);
        expect(useGameBridge.getState().loadGameState(JSON.stringify(chosen))).toBe(true);
        const upgrades = { ...useGameBridge.getState().gameState.handUpgrades, [id]: 2 };
        expect(getHandPayout('pair', upgrades).chips).toBe(27);
        expect(getHandPayout('loss', upgrades)).toMatchObject({ chips: -10, mult: -.06, variant: { chips: -20, mult: -.16 } });
        expect(getHandRaiseChanges('loss', upgrades).map(change => change.value)).toEqual([-.03, -.03]);
        const cards = [{ id: 'a', rank: 'K' as const, suit: 'hearts' as const }, { id: 'b', rank: '9' as const, suit: 'spades' as const }];
        expect(evaluateHandScore(cards, false, false, [], 0, undefined, 'loss', upgrades).criteria.find(row => row.id === 'loss'))
            .toMatchObject({ chips: -10, multiplier: -.06 });
        expect(evaluateHandScore([...cards, { id: 'c', rank: '5', suit: 'clubs' }], false, false, [], 0, undefined, 'bust', upgrades).criteria.find(row => row.id === 'bust'))
            .toMatchObject({ chips: -20, multiplier: -.16 });
    });

    it('rejects malformed ranged cards, positive Lose rolls, overlapping stats and out-of-range values', () => {
        for (const id of [
            'raise_v6_0_simple_loss_cash~3', 'raise_v6_0_tradeoff_loss_cash_pair_mult~9~3',
            'raise_v6_0_simple_pair_cash~3', 'raise_v6_0_simple_pair_cash~6', 'raise_v6_0_simple_pair_cash~4.5',
            'raise_v6_0_simple_pair_cash~04', 'raise_v6_0_simple_pair_cash~4~5',
            'raise_v6_0_double_pair_cash~11', 'raise_v6_0_tradeoff_pair_cash_loss_mult~11~4',
            'raise_v6_1_simple_pair_cash~4.simple_pair_cash~5',
            'raise_v6_1_tradeoff_pair_cash_flush_mult~11~1.simple_flush_mult~2',
            'raise_v6_1_tradeoff_pair_cash_loss_mult~11~3.tradeoff_win_mult_flush_cash~7~2',
        ]) expect(getRaise(id)).toBeUndefined();
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
        expect(formatRaiseMult(0.1)).toBe('10%');
        expect(formatRaiseMult(-0.1)).toBe('10%');
        expect(formatRaiseMult(0.1 + 0.2)).toBe('30%');
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
