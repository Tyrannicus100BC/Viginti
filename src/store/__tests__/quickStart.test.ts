import { processAction, getValidActions } from '../../engine/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { startRunFromUrl } from '../quickStart';
import { useGameBridge } from '../gameBridge';
import { finishOpeningPack } from '../../engine/__tests__/fixtures';

afterEach(() => useGameBridge.getState().reset());

describe('quick-start URL', () => {
    it.each(['', '?quickstart=0', '?quickstart=false', '?quickstart=', '?other=1', '?skippack=1'])('keeps the title screen for %s', search => {
        const before = useGameBridge.getState().gameState;
        expect(startRunFromUrl(search)).toBe(false);
        expect(useGameBridge.getState().gameState).toBe(before);
        expect(useGameBridge.getState().phase).toBe('init');
    });

    it.each(['?quickstart=1', '?other=value&quickstart=1&another=value', '?quickstart=1&skippack=0', '?quickstart=1&skippack=false'])('starts directly at the opening pack choice for %s', search => {
        expect(startRunFromUrl(search)).toBe(true);
        const bridge = useGameBridge.getState();
        expect(bridge.gameState).toMatchObject({ phase: 'pack_choice', selectedCityId: 'las_vegas',
            selectedGamblerId: 'default', cash: 100, ante: 50, dealsTaken: 0 });
        expect(bridge.phase).toBe('pack_choice');
        expect(bridge.offeredPacks).toHaveLength(3);
        expect(bridge.pendingPack).toBeNull();
        expect(bridge.isProcessingEvents).toBe(false);
        expect(bridge.eventLog.filter(event => event.type === 'phase_changed')).toHaveLength(1);
    });

    it('bypasses both setup screens and deals exactly one playable round without an upgrade', () => {
        expect(startRunFromUrl('?quickstart=1&skippack=1')).toBe(true);
        const bridge = useGameBridge.getState();
        expect(bridge.gameState).toMatchObject({ phase: 'playing', cash: 50, ante: 50,
            dealsTaken: 1, handsUntilAnteIncrease: 4, inventory: [], handUpgrades: {},
            offeredPacks: [], pendingPack: null, pendingRaiseChoices: [], pendingPackChoices: [] });
        expect(bridge.phase).toBe('playing');
        expect(bridge.playerHands[1].cards).toHaveLength(1);
        expect(bridge.dealer.cards).toHaveLength(2);
        expect(bridge.isInitialDeal).toBe(false);
        expect(bridge.isProcessingEvents).toBe(false);
        expect(bridge.eventLog.filter(event => event.type === 'deal_started')).toHaveLength(1);
        expect(getValidActions(bridge.gameState)).toContainEqual({ type: 'draw' });
        const before = bridge.gameState;
        expect(startRunFromUrl('?quickstart=1&skippack=1')).toBe(false);
        expect(useGameBridge.getState().gameState).toBe(before);
    });

    it('still grants the normal pack reward at the first ante increase', () => {
        startRunFromUrl('?quickstart=1&skippack=1');
        let state = useGameBridge.getState().gameState;
        for (let round = 1; round <= 4; round++) {
            state = processAction({ ...state, phase: 'scoring', playerHands: [],
                runningSummary: { chips: 0, mult: 1 } }, { type: 'score_round' }).nextState;
        }
        expect(state).toMatchObject({ phase: 'pack_choice', ante: 75, handsUntilAnteIncrease: 4 });
        expect(state.offeredPacks).toHaveLength(3);
    });

    it('does not start twice if bootstrap is called again', () => {
        startRunFromUrl('?quickstart=1');
        const before = useGameBridge.getState();
        expect(startRunFromUrl('?quickstart=1')).toBe(false);
        expect(useGameBridge.getState().gameState).toBe(before.gameState);
        expect(useGameBridge.getState().eventLog).toEqual(before.eventLog);
    });

    it('preserves an active game', () => {
        startRunFromUrl('?quickstart=1');
        const ready = finishOpeningPack(useGameBridge.getState().gameState);
        useGameBridge.getState().loadGameState(JSON.stringify(ready));
        useGameBridge.getState().dispatchSync({ type: 'deal' });
        const before = useGameBridge.getState().gameState;
        expect(before.phase).toBe('playing');
        expect(startRunFromUrl('?quickstart=1')).toBe(false);
        expect(useGameBridge.getState().gameState).toBe(before);
    });
});
