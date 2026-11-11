import { afterEach, describe, expect, it } from 'vitest';
import { createInitialState, getValidActions, processAction } from '../engine';
import type { GameState } from '../GameState';
import { SeededRNG } from '../rng';
import { createRewardCard, generateRewardCardChoices, getRewardCard, REWARD_ROW_COUNTS } from '../../logic/rewardCards';
import { applyPackCard, getPackCard } from '../../logic/packCards';
import { getHandPayout, getRaise } from '../../logic/handScoring';
import { RelicManager } from '../../logic/relics/manager';
import { capRelicEffects } from '../../logic/relics/inventory';
import { useGameBridge } from '../../store/gameBridge';

const act = (state: GameState, action: Parameters<typeof processAction>[1]) => processAction(state, action).nextState;
const passives = RelicManager.getAllRelics().filter(relic => !relic.tableAction);
const pending = (id: string, overrides: Partial<GameState> = {}): GameState => ({ ...createInitialState(), ...overrides,
    phase: 'pack_choice', pendingPack: { packId: 'mixed_major', picksRemaining: 1 }, pendingPackChoices: [id] });
afterEach(() => useGameBridge.getState().reset());

describe('unified reward cards', () => {
    it('rolls reproducible, unique mixed cards with decodable rows', () => {
        const probabilities = createInitialState().deckProbabilities;
        const kinds = new Set<string>();
        const rarities = new Set<string>();
        let penalties = 0;
        for (let seed = 1; seed <= 100; seed++) {
            const cards = generateRewardCardChoices(new SeededRNG(seed), 6, probabilities, []);
            expect(cards).toEqual(generateRewardCardChoices(new SeededRNG(seed), 6, probabilities, []));
            expect(new Set(cards.map(card => card.id)).size).toBe(6);
            for (const card of cards) {
                expect(getRewardCard(card.id)).toEqual(card);
                expect(card.rows).toHaveLength(REWARD_ROW_COUNTS[card.rarity]);
                expect(new Set(card.rows.map(row => row.kind)).size).toBeGreaterThanOrEqual(2);
                expect(card.rows.filter(row => row.kind === 'relic').length).toBeLessThanOrEqual(1);
                rarities.add(card.rarity);
                card.rows.forEach(row => {
                    kinds.add(row.kind);
                    if (row.kind === 'raise') penalties += getRaise(row.raiseId)!.modifiers.filter(effect => effect.chips < 0 || effect.mult < 0).length;
                    if (row.kind === 'relic') expect(RelicManager.getRelicConfig(row.relicId)?.tableAction).toBeUndefined();
                });

            }
        }
        expect(kinds).toEqual(new Set(['raise', 'deck', 'relic']));
        expect(rarities).toEqual(new Set(['Common', 'Uncommon', 'Rare']));
        expect(penalties).toBeGreaterThan(0);
    });

    it('applies all rows once, retaining permanent raises and deck changes when effects expire', () => {
        const card = createRewardCard('Uncommon', [
            { kind: 'raise', raiseId: 'raise_v10_0_simple_pair_cash~2' },
            { kind: 'deck', cardId: 'deck_v3_0_0' },
            { kind: 'relic', relicId: passives[0].id },
        ]);
        const before = pending(card.id);
        const original = JSON.stringify(before);
        let state = act(before, { type: 'choose_pack_card', cardId: card.id });
        expect(JSON.stringify(before)).toBe(original);
        expect(state.handUpgrades).toEqual({ 'raise_v10_0_simple_pair_cash~2': 1 });
        expect(getHandPayout('pair', state.handUpgrades).chips).toBe(getHandPayout('pair').chips + 2);
        expect(state.deckProbabilities).toEqual(applyPackCard(before.deckProbabilities, getPackCard('deck_v3_0_0')!));
        expect(state.inventory).toEqual([{ id: passives[0].id, state: { ...passives[0].properties } }]);
        expect(state.pendingPack).toBeNull();
        expect(state.pendingPackChoices).toEqual([]);
        expect(act(state, { type: 'choose_pack_card', cardId: card.id })).toEqual(state);
        const upgrades = state.handUpgrades;
        const deck = state.deckProbabilities;
        for (const effect of passives.slice(1, 5)) {
            const next = createRewardCard('Common', [{ kind: 'deck', cardId: 'deck_v3_0_4' }, { kind: 'relic', relicId: effect.id }]);
            state = act(pending(next.id, state), { type: 'choose_pack_card', cardId: next.id });
        }
        expect(state.inventory.map(effect => effect.id)).toEqual(passives.slice(1, 5).map(effect => effect.id));
        expect(state.handUpgrades).toEqual(upgrades);
        expect(state.deckProbabilities.suits.hearts).toBeLessThan(deck.suits.hearts);
    });

    it('accepts every new effect at capacity, purges only the oldest, and preserves retained state', () => {
        const inventory = passives.slice(0, 4).map((relic, i) => ({ id: relic.id, state: { marker: i } }));
        const card = createRewardCard('Common', [{ kind: 'relic', relicId: passives[4].id }, { kind: 'deck', cardId: 'deck_v3_0_0' }]);
        const before = pending(card.id, { inventory });
        expect(getValidActions(before)).toContainEqual({ type: 'choose_pack_card', cardId: card.id });
        const after = act(before, { type: 'choose_pack_card', cardId: card.id });
        expect(after.relicSlots).toBe(4);
        expect(after.inventory).toHaveLength(4);
        expect(after.inventory.slice(0, 3)).toEqual(inventory.slice(1));
        expect(after.inventory.at(-1)?.id).toBe(passives[4].id);
        expect(before.inventory).toEqual(inventory);
    });

    it('preserves pending compositions and queue order through save/load, trimming old over-capacity saves', () => {
        const card = generateRewardCardChoices(new SeededRNG(12), 1, createInitialState().deckProbabilities, [])[0];
        const inventory = passives.slice(0, 6).map(relic => ({ id: relic.id, state: { ...relic.properties } }));
        const state = pending(card.id, { inventory, relicSlots: 6 });
        expect(useGameBridge.getState().loadGameState(JSON.stringify(state))).toBe(true);
        const loaded = useGameBridge.getState().gameState;
        expect(loaded.pendingPackChoices).toEqual([card.id]);
        expect(getRewardCard(loaded.pendingPackChoices[0])).toEqual(card);
        expect(loaded.relicSlots).toBe(4);
        expect(loaded.inventory.map(effect => effect.id)).toEqual(passives.slice(2, 6).map(effect => effect.id));
        expect(capRelicEffects(loaded.inventory)).toEqual(loaded.inventory);
    });

    it('stacks permanent rows and leaves the queue untouched when a card has no new effect', () => {
        const card = createRewardCard('Common', [{ kind: 'raise', raiseId: 'raise_v10_0_simple_pair_cash~2' },
            { kind: 'deck', cardId: 'deck_v3_0_0' }]);
        const inventory = passives.slice(0, 4).map(relic => ({ id: relic.id, state: {} }));
        const before = pending(card.id, { inventory });
        const first = act(before, { type: 'choose_pack_card', cardId: card.id });
        const second = act(pending(card.id, first), { type: 'choose_pack_card', cardId: card.id });
        expect(second.inventory).toEqual(inventory);
        expect(second.handUpgrades['raise_v10_0_simple_pair_cash~2']).toBe(2);
        expect(second.deckProbabilities).toEqual(applyPackCard(first.deckProbabilities, getPackCard('deck_v3_0_0')!));
    });

    it('falls back to mixed raise/deck rows when every passive effect is already owned', () => {
        const inventory = passives.map(relic => ({ id: relic.id, state: {} }));
        const cards = generateRewardCardChoices(new SeededRNG(42), 6, createInitialState().deckProbabilities, inventory);
        expect(cards).toHaveLength(6);
        expect(cards.every(card => card.rows.every(row => row.kind !== 'relic'))).toBe(true);
    });

    it('rejects unknown or malformed rows without applying partial effects', () => {
        for (const id of ['reward_v1_0_%', 'reward_v1_0_null', 'reward_v1_0_%5B%5D',
            createRewardCard('Common', [{ kind: 'raise', raiseId: 'missing' }, { kind: 'deck', cardId: 'deck_v3_0_0' }]).id]) {
            expect(getRewardCard(id)).toBeUndefined();
            const state = pending(id);
            expect(act(state, { type: 'choose_pack_card', cardId: id })).toEqual(state);
        }
    });
});
