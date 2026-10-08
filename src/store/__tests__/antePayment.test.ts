import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, processAction } from '../../engine/engine';
import { TUTORIAL_STEPS } from '../../engine/tutorial/definitions';
import { useGameBridge } from '../gameBridge';

afterEach(() => {
    useGameBridge.getState().reset();
    vi.useRealTimers();
});

describe('last affordable ante', () => {
    it.each(['entering_casino', 'deal_over'] as const)('keeps the animated round playable at $0 after dealing from %s', async phase => {
        vi.useFakeTimers();
        const started = processAction(createInitialState(), {
            type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 42,
            globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id),
        }).nextState;
        useGameBridge.getState().loadGameState(JSON.stringify({ ...started, phase, cash: 65, ante: 65, comps: 0 }));
        useGameBridge.setState({ headless: false });
        const deal = useGameBridge.getState().dispatch({ type: 'deal' });
        await vi.runAllTimersAsync();
        await deal;
        expect(useGameBridge.getState()).toMatchObject({ phase: 'playing', cash: 0, ante: 65, isProcessingEvents: false });
        expect(useGameBridge.getState().gameState).toMatchObject({ phase: 'playing', cash: 0 });
        expect(useGameBridge.getState().eventLog.some(event => event.type === 'game_over')).toBe(false);

        const draw = useGameBridge.getState().dispatch({ type: 'draw' });
        await vi.runAllTimersAsync();
        await draw;
        expect(useGameBridge.getState()).toMatchObject({ phase: 'playing', cash: 0 });
        expect(useGameBridge.getState().drawnCards.some(card => card !== null)).toBe(true);
    });
});
