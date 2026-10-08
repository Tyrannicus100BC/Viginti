import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, processAction } from '../../engine/engine';
import { TUTORIAL_STEPS } from '../../engine/tutorial/definitions';
import type { PlayerAction } from '../../engine/PlayerAction';
import type { Card } from '../../types';
import { useGameBridge } from '../gameBridge';

function card(id: string, rank: Card['rank'], suit: Card['suit']): Card {
    return { id, rank, suit, type: 'standard', isFaceUp: true };
}

function prepareScoring() {
    let state = createInitialState();
    const actions: PlayerAction[] = [
        {
            type: 'start_game', cityId: 'atlantic_city', gamblerId: 'standard', seed: 99,
            globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id),
        },
        { type: 'deal' },
        { type: 'stand' },
        { type: 'resolve_dealer_turn' },
        { type: 'resolve_hand_outcome' },
    ];
    for (const action of actions) state = processAction(state, action).nextState;
    expect(state.phase).toBe('scoring');
    state = {
        ...state,
        playerHands: [
            { id: 0, cards: [card('7h', '7', 'hearts'), card('7s', '7', 'spades')], blackjackValue: 14, isHeld: true, isBust: false, outcome: 'loss' },
            { id: 1, cards: [card('Kh', 'K', 'hearts'), card('10h', '10', 'hearts'), card('5h', '5', 'hearts')], blackjackValue: 25, isHeld: true, isBust: true, outcome: 'loss' },
            { id: 2, cards: [card('Ad', 'A', 'diamonds'), card('10d', '10', 'diamonds')], blackjackValue: 21, isHeld: true, isBust: false, outcome: 'win' },
        ],
    };
    useGameBridge.setState({
        gameState: state,
        phase: state.phase,
        comps: state.comps,
        visibleScoringRowIndices: {},
        scoringRowValues: {},
        scoringCriteria: {},
    });
}

afterEach(() => {
    vi.useRealTimers();
    useGameBridge.getState().reset();
    useGameBridge.setState({ sfx: null });
});

describe('score row presentation', () => {
    it('hides the dealer before the first scoring row in an all-loss round and keeps it hidden after settlement', async () => {
        vi.useFakeTimers();
        prepareScoring();
        const base = useGameBridge.getState().gameState;
        const dealer = { cards: [card('dealer_k', 'K', 'clubs'), card('dealer_7', '7', 'diamonds')], blackjackValue: 17, isRevealed: true };
        const state = {
            ...base, cash: 1000, phase: 'resolving_outcomes' as const, dealer,
            playerHands: base.playerHands.map((hand, index) => ({
                ...hand, cards: [card(`loss_${index}_7`, '7', 'spades'), card(`loss_${index}_6`, '6', 'hearts')],
                blackjackValue: 13, isBust: false, isInactive: false,
            })),
        };
        useGameBridge.setState({ gameState: state, phase: state.phase, dealer, dealerVisible: true });
        const dealerVisibleAtScore: boolean[] = [];
        useGameBridge.getState().setSfx({ play(id) {
            if (id === 'score') dealerVisibleAtScore.push(useGameBridge.getState().dealerVisible);
        } });
        const resolving = useGameBridge.getState().dispatch({ type: 'resolve_hand_outcome' });
        await vi.runAllTimersAsync();
        await resolving;
        expect(dealerVisibleAtScore.length).toBeGreaterThan(0);
        expect(dealerVisibleAtScore.every(visible => !visible)).toBe(true);
        expect(useGameBridge.getState()).toMatchObject({ phase: 'deal_over', dealerVisible: false, dealer: { cards: [] } });
    });

    it('increments tickets as each winning row appears, before cash collection, without double awards', async () => {
        vi.useFakeTimers();
        prepareScoring();
        const state = useGameBridge.getState().gameState;
        useGameBridge.setState({ gameState: {
            ...state,
            playerHands: state.playerHands.map((hand, index) => index === 0 ? { ...hand, outcome: 'win' } : hand),
        } });
        const snapshots: { tickets: number; awarded: number; collecting: boolean }[] = [];
        useGameBridge.getState().setSfx({ play(id) {
            if (id !== 'score') return;
            const ui = useGameBridge.getState();
            snapshots.push({
                tickets: ui.comps,
                awarded: Object.values(ui.scoringCriteria).flat().reduce((total, row) => total + (row.compTickets ?? 0), 0),
                collecting: ui.isCollectingChips,
            });
        } });
        const scoring = useGameBridge.getState().dispatch({ type: 'score_round' });
        await vi.runAllTimersAsync();
        await scoring;

        expect(snapshots.some(snapshot => snapshot.awarded === 1)).toBe(true);
        expect(snapshots.some(snapshot => snapshot.awarded === 2)).toBe(true);
        for (const snapshot of snapshots) {
            expect(snapshot.tickets).toBe(state.comps + snapshot.awarded);
            expect(snapshot.collecting).toBe(false);
        }
        expect(useGameBridge.getState().comps).toBe(state.comps + 2);
        expect(useGameBridge.getState().gameState.comps).toBe(state.comps + 2);
    });

    it('plays once as each row appears, raises pitch across hands, and resets next deal', async () => {
        vi.useFakeTimers();
        const visibleRowsAtSound: number[] = [];
        const play = vi.fn<(id: string, options?: { playbackRate?: number }) => void>((id) => {
            if (id === 'score') {
                const rows = useGameBridge.getState().visibleScoringRowIndices;
                visibleRowsAtSound.push(Object.values(rows).reduce((total, indices) => total + indices.length, 0));
            }
        });
        useGameBridge.getState().setSfx({ play });

        for (let deal = 0; deal < 2; deal++) {
            prepareScoring();
            play.mockClear();
            visibleRowsAtSound.length = 0;
            const scoring = useGameBridge.getState().dispatch({ type: 'score_round' });
            await vi.runAllTimersAsync();
            await scoring;

            const state = useGameBridge.getState();
            const rowCount = Object.values(state.scoringCriteria).reduce((total, rows) => total + rows.length, 0);
            expect(Object.keys(state.scoringCriteria)).toHaveLength(3);
            expect(rowCount).toBeGreaterThan(0);
            expect(visibleRowsAtSound).toEqual(Array.from({ length: rowCount }, (_, i) => i + 1));
            const scoreCalls = play.mock.calls.filter(([id]) => id === 'score');
            expect(scoreCalls).toHaveLength(rowCount);
            scoreCalls.forEach((call, index) => {
                expect(call).toEqual(['score', { playbackRate: expect.closeTo(Math.min(1.3, 1 + index * 0.04)) }]);
            });
        }
    });
});
