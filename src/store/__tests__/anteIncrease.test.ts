import { afterEach, describe, expect, it, vi } from 'vitest';
import { playEvents } from '../EventPlayer';
import type { GameEvent } from '../../engine/GameEvent';
import { createInitialState, processAction } from '../../engine/engine';
import { TUTORIAL_STEPS } from '../../engine/tutorial/definitions';
import { useGameBridge } from '../gameBridge';

afterEach(() => {
    useGameBridge.getState().reset();
    vi.useRealTimers();
});

describe('ante increase presentation', () => {
    it('finishes collection, keeps the popup visible without a timeout, and advances only after dismissal', async () => {
        vi.useFakeTimers();
        const patches: Record<string, unknown>[] = [];
        const events: GameEvent[] = [
            { type: 'deal_scoring_complete', totalChips: 25, totalMult: 1, finalScore: 25 },
            { type: 'chip_collection', amount: 25, newTotalScore: 25, newCash: 115 },
            { type: 'ante_increased', previousAnte: 50, ante: 65, handsUntilAnteIncrease: 4 },
            { type: 'phase_changed', from: 'scoring', to: 'deal_over' },
        ];
        let dismiss: (() => void) | undefined;
        const playing = playEvents(events, {
            updateUI: patch => patches.push(patch), sfx: null, getSpeed: () => 1,
            waitForAnteContinue: () => new Promise<void>(resolve => { dismiss = resolve; }),
        });
        await vi.advanceTimersByTimeAsync(1100);
        expect(patches).toContainEqual({ isCollectingChips: false });
        expect(patches.some(patch => patch.anteIncrease)).toBe(false);
        await vi.advanceTimersByTimeAsync(200);
        expect(patches.at(-1)).toMatchObject({ anteIncrease: { previousAnte: 50, ante: 65 }, ante: 65, handsUntilAnteIncrease: 4 });
        expect(patches.some(patch => patch.phase === 'deal_over')).toBe(false);
        await vi.advanceTimersByTimeAsync(60000);
        expect(patches.at(-1)).toMatchObject({ anteIncrease: { previousAnte: 50, ante: 65 } });
        expect(patches.some(patch => patch.phase === 'deal_over')).toBe(false);
        expect(dismiss).toBeDefined();
        dismiss!();
        await vi.runAllTimersAsync();
        await playing;
        const show = patches.findIndex(patch => !!patch.anteIncrease);
        const hide = patches.findIndex(patch => patch.anteIncrease === null);
        const phase = patches.findIndex(patch => patch.phase === 'deal_over');
        expect(show).toBeGreaterThan(patches.findIndex(patch => patch.isCollectingChips === false));
        expect(hide).toBeGreaterThan(show);
        expect(phase).toBeGreaterThan(hide);
        expect(patches).toContainEqual(expect.objectContaining({ cash: 115 }));
    });

    it('unblocks the bridge action queue when the player continues, without dealing another hand', async () => {
        vi.useFakeTimers();
        const started = processAction(createInitialState(), {
            type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 42,
            globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id),
        }).nextState;
        const state = { ...started, phase: 'scoring' as const, handsUntilAnteIncrease: 1 };
        useGameBridge.setState({ gameState: state, phase: state.phase, anteIncrease: null });
        const scoring = useGameBridge.getState().dispatch({ type: 'score_round' });
        await vi.runAllTimersAsync();
        await vi.advanceTimersByTimeAsync(60000);
        expect(useGameBridge.getState()).toMatchObject({
            phase: 'scoring', anteIncrease: { previousAnte: 50, ante: 65 }, isProcessingEvents: true,
        });
        useGameBridge.getState().continueAnteIncrease();
        await vi.runAllTimersAsync();
        await scoring;
        expect(useGameBridge.getState()).toMatchObject({ phase: 'deal_over', anteIncrease: null, isProcessingEvents: false });
        expect(useGameBridge.getState().gameState.dealsTaken).toBe(state.dealsTaken);
        expect(useGameBridge.getState().gameState.cash).toBe(state.cash);
    });

    it('skips the acknowledgment in headless play', async () => {
        const waitForAnteContinue = vi.fn(() => new Promise<void>(() => {}));
        const patches: Record<string, unknown>[] = [];
        await playEvents([
            { type: 'ante_increased', previousAnte: 50, ante: 65, handsUntilAnteIncrease: 4 },
            { type: 'phase_changed', from: 'scoring', to: 'deal_over' },
        ], { updateUI: patch => patches.push(patch), sfx: null, getSpeed: () => 1, headless: true, waitForAnteContinue });
        expect(waitForAnteContinue).not.toHaveBeenCalled();
        expect(patches).toContainEqual({ anteIncrease: null });
        expect(patches).toContainEqual(expect.objectContaining({ phase: 'deal_over' }));
    });
});
