import { afterEach, describe, expect, it } from 'vitest';
import { createInitialState, processAction } from '../engine';
import type { GameState } from '../GameState';
import { createChallenges } from '../challenges';
import { getBustLimit } from '../bosses';
import { TUTORIAL_STEPS } from '../tutorial/definitions';
import { finishOpeningPack } from './fixtures';
import { useGameBridge } from '../../store/gameBridge';

const act = (state: GameState, action: Parameters<typeof processAction>[1]) => processAction(state, action).nextState;
const start = () => act(finishOpeningPack(act(createInitialState(), {
    type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 42,
    globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id),
})), { type: 'deal' });

afterEach(() => useGameBridge.getState().reset());

describe('HUD debug progression', () => {
    it('adds one round and credits the round goal while preserving the current table and cash', () => {
        const state = start();
        const next = act(state, { type: 'debug_advance_round' });
        expect(next).toMatchObject({ deal: 2, dealsTaken: 2, cash: state.cash, ante: 50, phase: 'playing' });
        expect(next.playerHands).toBe(state.playerHands);
        expect(next.challenges.find(goal => goal.metric === 'rounds')?.progress).toBe(1);
    });

    it('awards the main and boss rewards once when skipped rounds complete a boss ante', () => {
        let state: GameState = { ...start(), bossId: 'high_limit', challengeStage: 2, challenges: createChallenges(2) };
        for (let i = 0; i < 5; i++) state = act(state, { type: 'debug_advance_round' });
        expect(state.challengeRewards).toHaveLength(2);
        expect(state.challengeRewards[1]).toMatchObject({ kind: 'table_action' });
        expect(state.challenges.find(goal => goal.main)).toMatchObject({ progress: 4, completed: true });
    });

    it('skips only the remaining rounds, updates the ante formula, and uses the normal boss cadence', () => {
        let state = act(start(), { type: 'debug_advance_round' });
        state = act(state, { type: 'debug_advance_ante' });
        expect(state).toMatchObject({ deal: 5, dealsTaken: 5, ante: 100, challengeStage: 1, bossId: null });
        expect(state.challenges.every(goal => goal.progress === 0)).toBe(true);
        state = act(state, { type: 'debug_advance_ante' });
        expect(state).toMatchObject({ deal: 9, dealsTaken: 9, ante: 175, challengeStage: 2, bossId: 'high_limit' });
        expect(getBustLimit(state)).toBe(25);
        state = act(state, { type: 'debug_advance_ante' });
        expect(state).toMatchObject({ dealsTaken: 13, challengeStage: 3, bossId: null });
    });

    it('keeps completed round numbering at the table until the next deal', () => {
        const state = { ...start(), phase: 'deal_over' as const, deal: 2, dealsTaken: 2,
            challenges: createChallenges().map(goal => goal.main ? { ...goal, progress: 2 } : goal) };
        const next = act(state, { type: 'debug_advance_ante' });
        expect(next).toMatchObject({ deal: 4, dealsTaken: 4, cash: state.cash, phase: 'deal_over' });
        expect(act({ ...next, cash: 1000 }, { type: 'deal' }).dealsTaken).toBe(5);
    });

    it('recalculates cards when leaving the boss ante and retains pack challenges and earned rewards', () => {
        const base = start();
        const cards = (['K', 'Q', '4'] as const).map((rank, i) => ({ id: `c${i}`, rank, suit: 'hearts', isFaceUp: true } as const));
        const extra = { ...createChallenges()[1], id: 'pack-goal', source: 'pack' as const, progress: 2 };
        const reward = { id: 'earned', title: 'Earned', tier: 'minor' as const };
        const state = { ...base, bossId: 'high_limit', challengeStage: 2,
            playerHands: [{ ...base.playerHands[0], cards, blackjackValue: 24 }],
            challenges: [...createChallenges(2), extra], challengeRewards: [reward] };
        const next = act(state, { type: 'debug_advance_ante' });
        expect(next.playerHands[0]).toMatchObject({ blackjackValue: 24, isBust: true });
        expect(next.challenges).toContainEqual(extra);
        expect(next.challengeRewards).toEqual([reward]);
    });

    it('does not alter an open pack or an ongoing scoring sequence', () => {
        for (const phase of ['pack_choice', 'scoring', 'dealer_turn'] as const) {
            const state = { ...start(), phase };
            for (const type of ['debug_advance_round', 'debug_advance_ante'] as const) {
                expect(act(state, { type })).toEqual(state);
            }
        }
    });

    it('dispatches through the bridge and supports undo', async () => {
        const state = start();
        useGameBridge.setState({ gameState: state, phase: state.phase, headless: true, debugEnabled: true, debugLedger: [] });
        await useGameBridge.getState().dispatch({ type: 'debug_advance_round' });
        expect(useGameBridge.getState().dealsTaken).toBe(2);
        await useGameBridge.getState().dispatch({ type: 'debug_advance_ante' });
        expect(useGameBridge.getState()).toMatchObject({ dealsTaken: 5, ante: 100 });
        await useGameBridge.getState().dispatch({ type: 'debug_undo' });
        expect(useGameBridge.getState()).toMatchObject({ dealsTaken: 2, ante: 50 });
    });
});
