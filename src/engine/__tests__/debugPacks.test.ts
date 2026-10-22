import { afterEach, describe, expect, it } from 'vitest';
import { createInitialState, getValidActions, processAction } from '../engine';
import type { GameState } from '../GameState';
import { PACKS, type PackId } from '../../logic/packs';
import { finishOpeningPack } from './fixtures';
import { useGameBridge } from '../../store/gameBridge';

const act = (state: GameState, action: Parameters<typeof processAction>[1]) => processAction(state, action).nextState;
const start = () => act(createInitialState(), {
    type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 42,
});
const ready = () => finishOpeningPack(start());

afterEach(() => useGameBridge.getState().reset());

describe('debug pack opening', () => {
    it.each(PACKS)('opens $name through the normal reveal choices and keeps its upgrades', pack => {
        const before = ready();
        const original = JSON.stringify(before);
        const result = processAction(before, { type: 'debug_open_pack', packId: pack.id });
        let state = result.nextState;
        expect(state.phase).toBe('pack_choice');
        expect(state.pendingPack).toEqual({ packId: pack.id, picksRemaining: pack.pickCount });
        expect([...state.pendingRaiseChoices, ...state.pendingPackChoices]).toHaveLength(pack.offerCount);
        expect(state.offeredPacks).toEqual([]);
        expect(result.events).toContainEqual({ type: 'pack_opened', packId: pack.id });
        expect(act(state, { type: 'finish_pack' })).toEqual(state);
        for (let pick = 0; pick < pack.pickCount; pick++) {
            const id = (pack.family === 'raise' ? state.pendingRaiseChoices : state.pendingPackChoices)[0];
            state = act(state, pack.family === 'raise' ? { type: 'choose_raise', raiseId: id } : { type: 'choose_pack_card', cardId: id });
        }
        const selected = state;
        state = act(state, { type: 'finish_pack' });
        expect(state.phase).toBe(before.phase);
        expect(state.debugPackReturn).toBeNull();
        expect(state.cash).toBe(before.cash);
        expect(state.ante).toBe(before.ante);
        expect(state.dealsTaken).toBe(before.dealsTaken);
        expect(state.challenges).toEqual(selected.challenges);
        expect(state.inventory).toEqual(selected.inventory);
        expect(state.handUpgrades).toEqual(selected.handUpgrades);
        expect(state.deckProbabilities).toEqual(selected.deckProbabilities);
        if (pack.family === 'challenge') expect(state.challenges).toHaveLength(before.challenges.length + pack.pickCount);
        if (pack.family === 'relic') expect(state.inventory).toHaveLength(pack.pickCount);
        if (pack.family === 'raise') expect(Object.keys(state.handUpgrades)).toHaveLength(pack.pickCount);
        if (pack.family === 'deck') expect(state.deckProbabilities).not.toEqual(before.deckProbabilities);
        expect(JSON.stringify(before)).toBe(original);
    });

    it('accepts debug pack input through the animated bridge queue and restores the waiting reward', async () => {
        const before = { ...start(), pendingPack: null, pendingPackChoices: [], offeredPacks: ['mixed_major' as const] };
        expect(useGameBridge.getState().loadGameState(JSON.stringify(before))).toBe(true);
        useGameBridge.setState({ headless: true });
        await useGameBridge.getState().dispatch({ type: 'debug_open_pack', packId: 'raise_mega' });
        expect(useGameBridge.getState().pendingPack).toEqual({ packId: 'raise_mega', picksRemaining: 2 });
        expect(useGameBridge.getState().pendingRaiseChoices).toHaveLength(5);
        expect(useGameBridge.getState().isProcessingEvents).toBe(false);
        await useGameBridge.getState().dispatch({ type: 'skip_pack' });
        await useGameBridge.getState().dispatch({ type: 'finish_pack' });
        expect(useGameBridge.getState().phase).toBe('pack_choice');
        expect(useGameBridge.getState().offeredPacks).toEqual(before.offeredPacks);
        expect(useGameBridge.getState().gameState.debugPackReturn).toBeNull();
    });

    it('preserves the normal three-pack reward when a debug pack is opened first', () => {
        const before = { ...start(), pendingPack: null, pendingPackChoices: [], offeredPacks: ['mixed_major' as const] };
        const opened = act(before, { type: 'debug_open_pack', packId: 'deck_mega' });
        const skipped = act(opened, { type: 'skip_pack' });
        const returned = act(skipped, { type: 'finish_pack' });
        expect(returned.phase).toBe('pack_choice');
        expect(returned.offeredPacks).toEqual(before.offeredPacks);
        expect(returned.packReturnPhase).toBe(before.packReturnPhase);
        expect(returned.debugPackReturn).toBeNull();
        expect(getValidActions(returned)).toEqual([...before.offeredPacks.map(packId => ({ type: 'open_pack', packId })), { type: 'skip_pack' }]);
        expect(finishOpeningPack(returned).phase).toBe('entering_casino');
    });

    it('resumes a round with the same drawn card and table-action targeting, including after import', () => {
        let before = act(ready(), { type: 'deal' });
        before = act(before, { type: 'draw' });
        before = { ...before, interactionMode: 'select_hand', activeTableActionId: 'hold' };
        const opened = act(before, { type: 'debug_open_pack', packId: 'raise_basic' });
        expect(useGameBridge.getState().loadGameState(JSON.stringify(opened))).toBe(true);
        let state = useGameBridge.getState().gameState;
        expect(state.debugPackReturn).toEqual(opened.debugPackReturn);
        const id = state.pendingRaiseChoices[0];
        state = act(state, { type: 'choose_raise', raiseId: id });
        state = act(state, { type: 'finish_pack' });
        expect(state).toMatchObject({ phase: 'playing', cash: before.cash,
            dealsTaken: before.dealsTaken, ante: before.ante, challenges: before.challenges,
            selectedDrawIndex: before.selectedDrawIndex, interactionMode: 'select_hand', activeTableActionId: 'hold' });
        expect(state.playerHands).toEqual(before.playerHands);
        expect(state.dealer).toEqual(before.dealer);
        expect(state.drawnCards).toEqual(before.drawnCards);
        expect(state.handUpgrades[id]).toBe(1);
    });

    it('supports repeated debug packs between rounds without granting or consuming a normal reward', () => {
        let state = { ...ready(), phase: 'deal_over' as const } as GameState;
        for (const pack of PACKS) {
            state = act(state, { type: 'debug_open_pack', packId: pack.id });
            state = act(state, { type: 'skip_pack' });
            state = act(state, { type: 'finish_pack' });
            expect(state).toMatchObject({ phase: 'deal_over', cash: 100, ante: 50, dealsTaken: 0 });
            expect(getValidActions(state)).toEqual([{ type: 'deal' }]);
        }
    });

    it('rejects an unknown pack and prevents replacing any unfinished pack', () => {
        const before = ready();
        expect(act(before, { type: 'debug_open_pack', packId: 'unknown' as PackId })).toEqual(before);
        const reward = start();
        const pendingReward = act(reward, { type: 'open_pack', packId: reward.offeredPacks[0] });
        const pendingDebug = act(before, { type: 'debug_open_pack', packId: 'relic_mega' });
        for (const state of [pendingReward, pendingDebug]) {
            expect(act(state, { type: 'debug_open_pack', packId: 'raise_basic' })).toEqual(state);
        }
    });

    it.each(['init', 'dealer_turn', 'resolving_outcomes', 'scoring', 'game_over', 'victory'] as const)('cannot interrupt %s', phase => {
        const state = { ...ready(), phase };
        expect(act(state, { type: 'debug_open_pack', packId: 'raise_basic' })).toEqual(state);
    });
});
