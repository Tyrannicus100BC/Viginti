import { getRaise } from '../../logic/handScoring';
import { getChallengeCard } from '../../logic/challengeCards';
import { describe, expect, it } from 'vitest';
import { createInitialState, getValidActions, processAction } from '../engine';
import type { GameState } from '../GameState';
import type { PlayerAction } from '../PlayerAction';
import { SeededRNG } from '../rng';
import { TUTORIAL_STEPS } from '../tutorial/definitions';
import { useGameBridge } from '../../store/gameBridge';
import { getPackDefinition, PACKS, type PackId } from '../../logic/packs';
import { applyPackCard, changeProbability, generatePackCard, generatePackCardChoices, getPackCard, type ProbabilityChange } from '../../logic/packCards';
import { drawCardFromProbabilities } from '../../logic/deck';
import { RelicManager } from '../../logic/relics/manager';

const act = (state: GameState, action: PlayerAction) => processAction(state, action).nextState;
const shop = (seed = 17) => act(createInitialState(), {
    type: 'start_game', cityId: 'atlantic_city', gamblerId: 'newbie', seed,
    globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id),
});
const open = (packId: PackId, overrides: Partial<GameState> = {}) => {
    const initial = { ...shop(), cash: 1000, ...overrides, offeredPacks: [packId] };
    return { initial, state: act(initial, { type: 'open_pack', packId }) };
};

describe('Card packs', () => {
    it('offers three different pack families reproducibly', () => {
        for (let seed = 1; seed <= 60; seed++) {
            const state = shop(seed);
            expect(state.offeredPacks).toHaveLength(3);
            expect(new Set(state.offeredPacks.map(id => getPackDefinition(id).family)).size).toBe(3);
            expect(shop(seed)).toEqual(state);
        }
    });

    it.each(PACKS.filter(pack => pack.family !== 'raise'))('completes $name with resumable choices', pack => {
        const { state: opened } = open(pack.id);
        let state = opened;
        expect(state.cash).toBe(1000);
        expect(state.pendingPackChoices).toHaveLength(pack.offerCount);
        expect(new Set(state.pendingPackChoices).size).toBe(pack.offerCount);
        expect(getValidActions(state)).toEqual([...state.pendingPackChoices.map(cardId => ({ type: 'choose_pack_card', cardId })), { type: 'skip_pack' }]);
        const blocked: PlayerAction[] = [{ type: 'finish_pack' }, { type: 'open_pack', packId: pack.id },
            { type: 'deal' }, { type: 'choose_pack_card', cardId: 'fake' }];
        for (let pick = 0; pick < pack.pickCount; pick++) {
            blocked.forEach(action => expect(act(state, action)).toEqual(state));
            expect(useGameBridge.getState().loadGameState(JSON.stringify(state))).toBe(true);
            const loaded = useGameBridge.getState().gameState;
            expect(loaded).toEqual(state);
            const cardId = state.pendingPackChoices[0];
            const previous = state;
            state = act(loaded, { type: 'choose_pack_card', cardId });
            expect(state.rngState).toBe(previous.rngState);
            expect(state.cash).toBe(1000);
            if (getPackCard(cardId)) {
                expect(state.deckProbabilities).toEqual(applyPackCard(previous.deckProbabilities, getPackCard(cardId)!));
                expect(state.inventory).toEqual(previous.inventory);
            } else if (getRaise(cardId)) {
                expect(state.handUpgrades[cardId]).toBe((previous.handUpgrades[cardId] ?? 0) + 1);
            } else if (getChallengeCard(cardId)) {
                expect(state.challenges.at(-1)).toEqual(getChallengeCard(cardId)!.challenge);
            } else {
                expect(state.inventory).toHaveLength(previous.inventory.length + 1);
                expect(state.inventory.at(-1)).toEqual({ id: cardId, state: RelicManager.getRelicConfig(cardId)?.properties ?? {} });
            }
            expect(state.pendingPackChoices).not.toContain(cardId);
            expect(act(state, { type: 'choose_pack_card', cardId })).toEqual(state);
        }
        expect(state.pendingPack).toBeNull();
        expect(state.pendingPackChoices).toEqual([]);
        expect(act(state, { type: 'open_pack', packId: pack.id })).toEqual(state);
    });

    it.each(PACKS)('can skip all choices in $name without refunding or applying effects', pack => {
        const { initial, state } = open(pack.id);
        const result = processAction(state, { type: 'skip_pack' });
        expect(result.events).toEqual([{ type: 'pack_skipped' }]);
        expect(result.nextState).toMatchObject({ pendingPack: null, pendingPackChoices: [], pendingRaiseChoices: [], cash: 1000 });
        expect(result.nextState.inventory).toEqual(initial.inventory);
        expect(result.nextState.deckProbabilities).toEqual(initial.deckProbabilities);
        expect(result.nextState.handUpgrades).toEqual(initial.handUpgrades);
        expect(result.nextState.offeredPacks).toEqual([]);
        expect(act(result.nextState, { type: 'skip_pack' })).toEqual(result.nextState);
    });

    it.each(PACKS.filter(pack => pack.pickCount === 2))('can keep one selection and skip the remainder of $name', pack => {
        const opened = open(pack.id).state;
        const id = (pack.family === 'raise' ? opened.pendingRaiseChoices : opened.pendingPackChoices)[0];
        const picked = act(opened, pack.family === 'raise' ? { type: 'choose_raise', raiseId: id } : { type: 'choose_pack_card', cardId: id });
        expect(picked.pendingPack?.picksRemaining).toBe(1);
        const skipped = act(picked, { type: 'skip_pack' });
        expect(skipped.inventory).toEqual(picked.inventory);
        expect(skipped.handUpgrades).toEqual(picked.handUpgrades);
        expect(skipped.deckProbabilities).toEqual(picked.deckProbabilities);
        expect(skipped.pendingPack).toBeNull();
    });

    it('blocks relic choices at capacity and permits skipping, including after filling the last slot', () => {
        const inventory = RelicManager.getAllRelics().slice(0, 6).map(relic => ({ id: relic.id, state: { ...relic.properties } }));
        const full = open('relic_mega', { inventory }).state;
        expect(full.pendingPackChoices.every(id => !inventory.some(owned => owned.id === id))).toBe(true);
        expect(getValidActions(full)).toEqual([{ type: 'skip_pack' }]);
        expect(act(full, { type: 'choose_pack_card', cardId: full.pendingPackChoices[0] })).toEqual(full);
        expect(act(act(full, { type: 'skip_pack' }), { type: 'finish_pack' }).phase).toBe('entering_casino');
        const oneSlot = open('relic_mega', { inventory: inventory.slice(0, 5) }).state;
        const picked = act(oneSlot, { type: 'choose_pack_card', cardId: oneSlot.pendingPackChoices[0] });
        expect(picked.inventory).toHaveLength(6);
        expect(getValidActions(picked)).toEqual([{ type: 'skip_pack' }]);
        expect(act(picked, { type: 'skip_pack' }).inventory).toEqual(picked.inventory);
    });

    it('initializes acquired table action charges and held cards', () => {
        const opened = open('relic_basic').state;
        const id = 'switch';
        const state = { ...opened, pendingPackChoices: [id] };
        const chosen = act(state, { type: 'choose_pack_card', cardId: id });
        const action = RelicManager.getRelicConfig(id)!.tableAction!;
        expect(chosen.tableActionCharges[id]).toBe(action.maxCharges);
        expect(chosen.tableActionHeldCards[id]).toBeNull();
    });

    it('supports skipping an empty relic offer when every relic is already owned', () => {
        const inventory = RelicManager.getAllRelics().map(relic => ({ id: relic.id, state: {} }));
        const state = open('relic_basic', { inventory, relicSlots: inventory.length }).state;
        expect(state.pendingPackChoices).toEqual([]);
        expect(getValidActions(state)).toEqual([{ type: 'skip_pack' }]);
        expect(useGameBridge.getState().loadGameState(JSON.stringify(state))).toBe(true);
        expect(useGameBridge.getState().gameState.pendingPack).toEqual(state.pendingPack);
        expect(act(state, { type: 'finish_pack' })).toEqual(state);
        expect(act(state, { type: 'skip_pack' }).pendingPack).toBeNull();
    });

    it('merges all three modifier kinds and all four change strengths into Deck cards', () => {
        const kinds = new Set<string>(), changes = new Set<string>();
        for (const [rarity, count] of [['Common', 1], ['Uncommon', 2], ['Rare', 3]] as const) {
            for (let seed = 1; seed <= 80; seed++) {
                const card = generatePackCard(new SeededRNG(seed), rarity);
                expect(card.benefits).toHaveLength(count);
                expect(getPackCard(card.id)).toEqual(card);
                card.benefits.forEach(benefit => { kinds.add(benefit.kind); changes.add(benefit.change); });
            }
        }
        expect([...kinds].sort()).toEqual(['rank', 'special', 'suit']);
        const probabilities = { ...shop().deckProbabilities, specialWeights: [{ type: 'chip' as const, chance: 0.1 }] };
        for (let seed = 1; seed < 80; seed++) {
            const choices = generatePackCardChoices(new SeededRNG(seed), 5, probabilities);
            expect(new Set(choices.map(card => card.id)).size).toBe(5);
            choices.flatMap(card => card.benefits).forEach(benefit => changes.add(benefit.change));
        }
        expect([...changes].sort()).toEqual(['far fewer', 'far more', 'fewer', 'more']);
    });

    it('does not offer fewer of a special card whose current rate is zero', () => {
        for (let seed = 1; seed <= 100; seed++) {
            const card = generatePackCard(new SeededRNG(seed), 'Rare', shop().deckProbabilities);
            expect(card.benefits.filter(benefit => benefit.kind === 'special').every(benefit => benefit.change.endsWith('more'))).toBe(true);
        }
    });

    it('migrates previous Special packs to Deck packs and preserves their pending offers', () => {
        const state = open('deck_jumbo').state;
        const legacy = { ...state, pendingPack: { packId: 'special_jumbo', picksRemaining: 1 }, pendingPackChoices: ['special_v1_0_0'],
            shopItems: [{ id: 'old', type: 'SpecialPack', cost: 60, packId: 'special_jumbo' }] };
        expect(useGameBridge.getState().loadGameState(JSON.stringify(legacy))).toBe(true);
        const loaded = useGameBridge.getState().gameState;
        expect(loaded.pendingPack).toEqual({ packId: 'deck_jumbo', picksRemaining: 1 });
        expect(act(loaded, { type: 'choose_pack_card', cardId: 'special_v1_0_0' }).deckProbabilities.specialWeights).toContainEqual({ type: 'chip', chance: 0.05 });
        expect(getPackCard('deck_v1_1_6.9')?.family).toBe('deck');
        for (const id of ['deck_v2_2_0', 'deck_v2_1_0.1', 'special_v1_1_0.0', 'special_v1_0_99']) expect(getPackCard(id)).toBeUndefined();
    });
});

describe('Deck probability changes', () => {
    it.each<[number, ProbabilityChange, number]>([
        [0.3, 'more', 0.35], [0.3, 'fewer', 0.25], [0.3, 'far more', 0.4], [0.3, 'far fewer', 0.2],
        [0.1, 'fewer', 0.1 * 2 / 3], [0.15, 'far fewer', 0.1], [0.11, 'fewer', 0.06], [0.16, 'far fewer', 0.06],
    ])('changes %s with %s to %s', (p, change, expected) => expect(changeProbability(p, change)).toBeCloseTo(expected));

    it.each(['more', 'far more'] as const)('slows %s above its high threshold and never reaches 100%', change => {
        const step = change === 'more' ? 0.05 : 0.1;
        const threshold = change === 'more' ? 0.8 : 0.7;
        let p = threshold + 0.001;
        for (let repeat = 0; repeat < 200; repeat++) {
            const next = changeProbability(p, change);
            expect(next).toBeLessThan(1);
            expect(next).toBeGreaterThanOrEqual(p);
            expect(next - p).toBeLessThan(step);
            p = next;
        }
    });

    it.each(['fewer', 'far fewer'] as const)('slows %s at low rates', change => {
        let p = change === 'fewer' ? 0.1 : 0.15;
        for (let repeat = 0; repeat < 100; repeat++) {
            const next = changeProbability(p, change);
            expect(next).toBeCloseTo(p * 2 / 3);
            expect(next).toBeGreaterThan(0);
            p = next;
        }
    });

    it('changes actual suit and rank probabilities while keeping their totals at 100%', () => {
        const original = shop().deckProbabilities;
        const changed = applyPackCard(original, getPackCard('deck_v2_1_12.18')!); // More spades; fewer aces.
        expect(changed.suits.spades).toBeCloseTo(30);
        expect(changed.ranks.ace).toBeCloseTo(10 * 2 / 3);
        expect(Object.values(changed.suits).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(100);
        expect(Object.values(changed.ranks).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(100);
        expect(original.suits.spades).toBe(25);
        expect(original.ranks.ace).toBe(10);
    });

    it('enables all strengths of each special type and permits reducing its pooled rate again', () => {
        const original = shop().deckProbabilities;
        for (let target = 8; target < 11; target++) {
            const card = getPackCard(`deck_v3_0_${target * 4}`)!;
            const changed = applyPackCard(original, card);
            const effect = changed.specialWeights[0];
            expect(effect.chance).toBeCloseTo(0.05);
            const draws = Array.from({ length: 10000 }, (_, seed) => drawCardFromProbabilities(changed, new SeededRNG(seed + 1)));
            const strengths = [...new Set(draws.filter(draw => draw.type === effect.type).map(draw => effect.type === 'mult' ? draw.mult : draw.chips))].sort((a, b) => a! - b!);
            expect(strengths).toEqual(effect.type === 'chip' ? [5, 10, 20, 50] : [1, 2, 3, 4]);
            const reduced = applyPackCard(changed, getPackCard(`deck_v3_0_${target * 4 + 2}`)!);
            expect(reduced.specialWeights[0].chance).toBeCloseTo(0.05 * 2 / 3);
        }
        expect(original.specialWeights).toEqual([]);
    });

    it('redistributes saturated special chances without starving newly added effects', () => {
        const probabilities = { ...shop().deckProbabilities, specialWeights: [{ type: 'chip' as const, chance: 0.99 }] };
        const changed = applyPackCard(probabilities, getPackCard('deck_v2_0_48')!); // More +1 Mult.
        const total = changed.specialWeights.reduce((sum, effect) => sum + effect.chance, 0);
        expect(total).toBeCloseTo(1);
        expect(total).toBeLessThan(1);
        expect(changed.specialWeights.find(effect => effect.type === 'mult')?.chance).toBeCloseTo(0.05);
        expect(changed.specialWeights.every(effect => effect.chance > 0 && effect.chance < 1)).toBe(true);
    });
});
