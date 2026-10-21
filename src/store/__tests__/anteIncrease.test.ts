import { afterEach, describe, expect, it, vi } from 'vitest';
import { playEvents } from '../EventPlayer';
import type { GameEvent } from '../../engine/GameEvent';
import { createInitialState, processAction } from '../../engine/engine';
import { TUTORIAL_STEPS } from '../../engine/tutorial/definitions';
import { createChallenges } from '../../engine/challenges';
import { useGameBridge } from '../gameBridge';

afterEach(() => {
    useGameBridge.getState().reset();
    vi.useRealTimers();
});

describe('ante increase presentation', () => {
    it('keeps the ante popup visible after the last pack until dismissed', async () => {
        vi.useFakeTimers();
        const patches: Record<string, unknown>[] = [];
        const events: GameEvent[] = [
            { type: 'ante_increased', previousAnte: 50, ante: 100 },
            { type: 'phase_changed', from: 'pack_choice', to: 'deal_over' },
        ];
        let dismiss: (() => void) | undefined;
        const playing = playEvents(events, {
            updateUI: patch => patches.push(patch), sfx: null, getSpeed: () => 1,
            waitForAnteContinue: () => new Promise<void>(resolve => { dismiss = resolve; }),
        });
        await vi.advanceTimersByTimeAsync(200);
        expect(patches.at(-1)).toMatchObject({ anteIncrease: { previousAnte: 50, ante: 100 }, ante: 100 });
        expect(patches.some(patch => patch.phase === 'deal_over')).toBe(false);
        await vi.advanceTimersByTimeAsync(60000);
        expect(patches.at(-1)).toMatchObject({ anteIncrease: { previousAnte: 50, ante: 100 } });
        expect(dismiss).toBeDefined();
        dismiss!();
        await vi.runAllTimersAsync();
        await playing;
        const hide = patches.findIndex(patch => patch.anteIncrease === null);
        const phase = patches.findIndex(patch => patch.phase === 'deal_over');
        expect(phase).toBeGreaterThan(hide);
    });

    it('waits at the score, opens rewards on advance, and raises the ante only after the last pack', async () => {
        vi.useFakeTimers();
        const started = processAction(createInitialState(), {
            type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 42,
            globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id),
        }).nextState;
        const state = { ...started, phase: 'scoring' as const, playerHands: [], offeredPacks: [],
            runningSummary: { chips: 25, mult: 1 },
            challenges: createChallenges().map(challenge => challenge.metric === 'rounds' ? { ...challenge, progress: 3 } : challenge) };
        useGameBridge.setState({ gameState: state, phase: state.phase, anteIncrease: null, headless: false });
        const scoring = useGameBridge.getState().dispatch({ type: 'score_round' });
        await vi.runAllTimersAsync();
        await scoring;
        await vi.advanceTimersByTimeAsync(60000);
        expect(useGameBridge.getState()).toMatchObject({ phase: 'deal_over', ante: 50, anteIncrease: null,
            isProcessingEvents: false, cash: state.cash + 25 });
        expect(useGameBridge.getState().runningSummary).toEqual({ chips: 25, mult: 1 });
        expect(useGameBridge.getState().challengeRewards).toHaveLength(1);
        expect(useGameBridge.getState().eventLog.some(event => event.type === 'ante_increased')).toBe(false);

        await useGameBridge.getState().dispatch({ type: 'deal' });
        expect(useGameBridge.getState()).toMatchObject({ phase: 'pack_choice', ante: 50, cash: state.cash + 25,
            runningSummary: null, dealSummary: null, scoringCriteria: {}, scoringRowValues: {}, visibleScoringRowIndices: {} });
        const packId = useGameBridge.getState().offeredPacks[0];
        await useGameBridge.getState().dispatch({ type: 'open_pack', packId });
        await useGameBridge.getState().dispatch({ type: 'skip_pack' });
        const finishing = useGameBridge.getState().dispatch({ type: 'finish_pack' });
        await vi.runAllTimersAsync();
        expect(useGameBridge.getState()).toMatchObject({ phase: 'pack_choice',
            anteIncrease: { previousAnte: 50, ante: 100 }, isProcessingEvents: true });
        useGameBridge.getState().continueAnteIncrease();
        await vi.runAllTimersAsync();
        await finishing;
        expect(useGameBridge.getState()).toMatchObject({ phase: 'deal_over', ante: 100,
            anteIncrease: null, isProcessingEvents: false });
        expect(useGameBridge.getState().gameState.dealsTaken).toBe(state.dealsTaken);
        expect(useGameBridge.getState().cash).toBe(state.cash + 25);
        expect(useGameBridge.getState().dealSummary).toBeNull();
        expect(useGameBridge.getState().runningSummary).toBeNull();
        expect(useGameBridge.getState().playerHands.every(hand => hand.cards.length === 0)).toBe(true);
        expect(useGameBridge.getState().challenges.every(challenge => challenge.progress === 0)).toBe(true);
    });

    it('skips the acknowledgment in headless play', async () => {
        const waitForAnteContinue = vi.fn(() => new Promise<void>(() => {}));
        const patches: Record<string, unknown>[] = [];
        await playEvents([
            { type: 'ante_increased', previousAnte: 50, ante: 100 },
            { type: 'phase_changed', from: 'pack_choice', to: 'deal_over' },
        ], { updateUI: patch => patches.push(patch), sfx: null, getSpeed: () => 1, headless: true, waitForAnteContinue });
        expect(waitForAnteContinue).not.toHaveBeenCalled();
        expect(patches).toContainEqual({ anteIncrease: null });
        expect(patches).toContainEqual(expect.objectContaining({ phase: 'deal_over' }));
    });
});
