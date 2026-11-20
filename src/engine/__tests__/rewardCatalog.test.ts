import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, processAction } from '../engine';
import { SeededRNG } from '../rng';
import { PACKS, PACK_RARITY_WEIGHTS, type PackId } from '../../logic/packs';
import { generateRewardCard, generateRewardCardChoices, getRewardCard, getRewardLineCount, MAX_REWARD_LINES, REWARD_ROW_COUNTS } from '../../logic/rewardCards';
import { RelicManager } from '../../logic/relics/manager';
import { useGameBridge } from '../../store/gameBridge';

const start = () => processAction(createInitialState(), {
    type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 42,
}).nextState;
afterEach(() => { vi.restoreAllMocks(); useGameBridge.getState().reset(); });

describe('current reward catalog', () => {
    it('contains only major, minor and boss rewards and rejects retired packs', () => {
        expect(PACKS.map(pack => pack.id)).toEqual(['mixed_major', 'mixed_minor', 'relic_boss']);
        for (const packId of ['raise_basic', 'deck_mega', 'challenge_basic', 'relic_basic', 'mixed_basic']) {
            const state = { ...start(), pendingPack: null, pendingPackChoices: [], offeredPacks: [packId as PackId] };
            expect(processAction(state, { type: 'open_pack', packId: packId as PackId }).nextState).toEqual(state);
        }
    });

    it.each(['Common', 'Uncommon', 'Rare'] as const)('generates production compositions for %s gallery previews', rarity => {
        for (let seed = 1; seed <= 50; seed++) {
            const card = generateRewardCard(new SeededRNG(seed), rarity, createInitialState().deckProbabilities, []);
            expect(card.rarity).toBe(rarity);
            expect(card.rows).toHaveLength(REWARD_ROW_COUNTS[rarity]);
            expect(getRewardCard(card.id)).toEqual(card);
        }
    });

    it.each(['average', 'excellent', 'exceptional'] as const)('preserves %s reward rarity odds', quality => {
        const counts = { Common: 0, Uncommon: 0, Rare: 0 };
        for (let ticket = 0; ticket < 100; ticket++) {
            const rng = new SeededRNG(42);
            vi.spyOn(rng, 'next').mockReturnValueOnce((ticket + .5) / 100);
            counts[generateRewardCardChoices(rng, 1, createInitialState().deckProbabilities, [], quality)[0].rarity]++;
        }
        expect(counts).toEqual(PACK_RARITY_WEIGHTS[quality]);
    });

    it.each([false, true])('caps visible rows at five, including tradeoff drawbacks (all effects owned: %s)', allOwned => {
        const inventory = allOwned ? RelicManager.getAllRelics().filter(relic => !relic.tableAction)
            .map(relic => ({ id: relic.id, state: {} })) : [];
        const counts = new Set<number>();
        for (const rarity of ['Common', 'Uncommon', 'Rare'] as const) {
            for (let seed = 1; seed <= 200; seed++) {
                const card = generateRewardCard(new SeededRNG(seed), rarity, createInitialState().deckProbabilities, inventory);
                expect(card.rows).toHaveLength(REWARD_ROW_COUNTS[rarity]);
                expect(getRewardCard(card.id)).toEqual(card);
                expect(getRewardLineCount(card)).toBeLessThanOrEqual(MAX_REWARD_LINES);
                counts.add(getRewardLineCount(card));
            }
        }
        expect(counts.has(5)).toBe(true);
    });

    it('normalizes a saved debug return screen so retired offers cannot strand a run', () => {
        const legacy = { ...start(), debugPackReturn: { phase: 'pack_choice',
            offeredPacks: ['raise_basic', 'deck_basic'], packReturnPhase: 'entering_casino' } };
        expect(useGameBridge.getState().loadGameState(JSON.stringify(legacy))).toBe(true);
        const loaded = useGameBridge.getState().gameState;
        const skipped = processAction(loaded, { type: 'skip_pack' }).nextState;
        const returned = processAction(skipped, { type: 'finish_pack' }).nextState;
        expect(returned.offeredPacks).toEqual(['mixed_major']);
        expect(processAction(returned, { type: 'open_pack', packId: 'mixed_major' }).nextState.pendingPackChoices).toHaveLength(6);
    });

    it.each(['raise_basic', 'deck_mega', 'challenge_basic', 'mixed_basic', 'relic_basic'])('replaces saved %s offers while preserving earned progress', packId => {
        const state = start();
        const legacy = { ...state, pendingPack: { packId, picksRemaining: 2 },
            pendingRaiseChoices: packId.startsWith('raise') ? ['raise_pair_cash'] : [],
            pendingPackChoices: ['retired_offer'], handUpgrades: { raise_pair_cash: 3 } };
        expect(useGameBridge.getState().loadGameState(JSON.stringify(legacy))).toBe(true);
        const loaded = useGameBridge.getState().gameState;
        expect(loaded.pendingPack).toEqual({ packId: 'mixed_major', picksRemaining: 1 });
        expect(loaded.pendingPackChoices).toHaveLength(6);
        expect(loaded.pendingPackChoices.every(id => !!getRewardCard(id))).toBe(true);
        expect(loaded).not.toHaveProperty('pendingRaiseChoices');
        expect(loaded).toMatchObject({ handUpgrades: legacy.handUpgrades, ante: state.ante, cash: state.cash,
            challenges: state.challenges, deckProbabilities: state.deckProbabilities });
        expect(loaded.rngState).not.toBe(state.rngState);
        expect(useGameBridge.getState().loadGameState(JSON.stringify(legacy))).toBe(true);
        expect(useGameBridge.getState().gameState).toEqual(loaded);
        expect(useGameBridge.getState().loadGameState(JSON.stringify(loaded))).toBe(true);
        expect(useGameBridge.getState().gameState).toEqual(loaded);
        const picked = processAction(loaded, { type: 'choose_pack_card', cardId: loaded.pendingPackChoices[0] }).nextState;
        expect(picked.pendingPack).toBeNull();
    });
});
