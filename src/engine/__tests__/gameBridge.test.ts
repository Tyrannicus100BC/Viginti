/**
 * GameBridge integration tests.
 *
 * Tests the full flow: dispatch → processAction → EventPlayer → UI state.
 * Uses dispatchSync (headless) for fast, deterministic testing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameBridge } from '../../store/gameBridge';
import type { PlayerAction } from '../PlayerAction';
import type { GameEvent } from '../GameEvent';
import { processAction, getValidActions } from '../engine';
import { playEventsSync } from '../../store/EventPlayer';
import type { GameState } from '../GameState';
import { TUTORIAL_STEPS } from '../tutorial/definitions';

// ─── Helpers ────────────────────────────────────────────

function getBridge() {
    return useGameBridge.getState();
}

function dispatch(action: PlayerAction) {
    useGameBridge.getState().dispatchSync(action);
}

function startGame(seed = 42) {
    dispatch({ 
        type: 'start_game', 
        cityId: 'atlantic_city', 
        gamblerId: 'default', 
        seed,
        globalTutorialsCompleted: TUTORIAL_STEPS.map(s => s.id)
    });
}

// ─── Tests ──────────────────────────────────────────────

describe('GameBridge', () => {

    beforeEach(() => {
        useGameBridge.getState().reset();
    });

    describe('initialization', () => {
        it('starts in init phase', () => {
            expect(getBridge().phase).toBe('init');
            expect(getBridge().gameState.phase).toBe('init');
        });

        it('reset clears state', () => {
            startGame();
            expect(getBridge().phase).not.toBe('init');

            getBridge().reset();
            expect(getBridge().phase).toBe('init');
            expect(getBridge().eventLog).toEqual([]);
        });
    });

    describe('start_game', () => {
        it('transitions to entering_casino', () => {
            startGame();
            expect(getBridge().phase).toBe('entering_casino');
            expect(getBridge().deal).toBe(1);
            expect(getBridge().deck.length).toBeGreaterThan(0);
        });

        it('flattens state correctly', () => {
            startGame();
            const gs = getBridge().gameState;
            const bridge = getBridge();

            expect(bridge.phase).toBe(gs.phase);
            expect(bridge.deal).toBe(gs.deal);
            expect(bridge.deck.length).toBe(gs.deck.length);
            expect(bridge.targetScore).toBe(gs.targetScore);
            expect(bridge.inventory).toEqual(gs.inventory);
        });

        it('accumulates events in eventLog', () => {
            startGame();
            expect(getBridge().eventLog.length).toBeGreaterThan(0);
            expect(getBridge().eventLog.some(e => e.type === 'phase_changed')).toBe(true);
        });
    });

    describe('deal → draw → place flow', () => {
        it('can deal first hand', () => {
            startGame();
            dispatch({ type: 'deal' });

            const bridge = getBridge();
            expect(bridge.phase).toBe('playing');
            expect(bridge.playerHands.some(h => h.cards.length > 0)).toBe(true);
            expect(bridge.dealer.cards.length).toBe(2);
        });

        it('can draw cards', () => {
            startGame();
            dispatch({ type: 'deal' });
            dispatch({ type: 'draw' });

            const bridge = getBridge();
            expect(bridge.drawnCards.some(c => c !== null)).toBe(true);
        });

        it('can place card into hand', () => {
            startGame();
            dispatch({ type: 'deal' });
            dispatch({ type: 'draw' });

            const bridge = getBridge();
            const firstDraw = bridge.drawnCards.findIndex(c => c !== null);
            if (firstDraw >= 0) {
                dispatch({ type: 'select_drawn_card', drawIndex: firstDraw });
                dispatch({ type: 'place_card', handIndex: 0 });

                expect(getBridge().playerHands[0].cards.length).toBeGreaterThan(0);
            }
        });
    });

    describe('validActions', () => {
        it('returns valid actions for entering_casino', () => {
            startGame();
            const actions = getBridge().validActions();

            expect(actions.some(a => a.type === 'deal')).toBe(true);
        });

        it('matches engine getValidActions', () => {
            startGame();
            const bridgeActions = getBridge().validActions();
            const engineActions = getValidActions(getBridge().gameState);

            expect(bridgeActions.length).toBe(engineActions.length);
            expect(bridgeActions.map(a => a.type).sort())
                .toEqual(engineActions.map(a => a.type).sort());
        });
    });

    describe('EventPlayer integration', () => {
        it('UI state is updated by events', () => {
            // Manually test EventPlayer
            const patches: Record<string, any>[] = [];
            const events: GameEvent[] = [
                { type: 'dealer_reveal', card: { id: 'test', rank: 'A', suit: '♠', isFaceUp: true, value: 11 } as any, newValue: 11 },
            ];

            playEventsSync(events, (patch) => patches.push(patch));

            expect(patches.some(p => p.isDealerPlaying === true)).toBe(true);
        });

        it('scoring events update running summary', () => {
            const patches: Record<string, any>[] = [];
            const events: GameEvent[] = [
                { type: 'summary_update', chips: 10, mult: 3 },
            ];

            playEventsSync(events, (patch) => patches.push(patch));

            expect(patches.some(p => p.runningSummary?.chips === 10 && p.runningSummary?.mult === 3)).toBe(true);
        });

        it('deal scoring complete resets tracking', () => {
            const patches: Record<string, any>[] = [];
            const events: GameEvent[] = [
                { type: 'deal_scoring_complete', totalChips: 20, totalMult: 5, finalScore: 100 },
            ];

            playEventsSync(events, (patch) => patches.push(patch));

            expect(patches.some(p => p.dealSummary?.finalScore === 100)).toBe(true);
        });
    });

    describe('full game flow', () => {
        it('can play through deal → stand → score', () => {
            startGame(99);
            dispatch({ type: 'deal' });
            expect(getBridge().phase).toBe('playing');

            dispatch({ type: 'draw' });

            // Place cards until we can stand
            let maxIter = 30;
            while (getBridge().phase === 'playing' && maxIter-- > 0) {
                const state = getBridge();
                const hasDrawn = state.drawnCards.some(c => c !== null);

                if (!hasDrawn) {
                    dispatch({ type: 'draw' });
                    continue;
                }

                if (state.selectedDrawIndex === null) {
                    const idx = state.drawnCards.findIndex(c => c !== null);
                    if (idx >= 0) {
                        dispatch({ type: 'select_drawn_card', drawIndex: idx });
                        continue;
                    }
                }

                const target = state.playerHands.find(h =>
                    !h.isBust && !h.isHeld && h.blackjackValue !== 21
                );
                if (target && state.selectedDrawIndex !== null) {
                    dispatch({ type: 'place_card', handIndex: target.id });
                    continue;
                }

                break;
            }

            // Stand
            if (getBridge().phase === 'playing') {
                dispatch({ type: 'stand' });
            }

            // Should be in deal_over, casino_payout, or game_over
            const finalPhase = getBridge().phase;
            expect(['deal_over', 'casino_payout', 'game_over']).toContain(finalPhase);

            // Event log should have scoring events
            expect(getBridge().eventLog.some(e => e.type === 'dealer_reveal')).toBe(true);
        });

        it('game state and bridge state are always in sync', () => {
            startGame(42);
            dispatch({ type: 'deal' });
            dispatch({ type: 'draw' });

            const bridge = getBridge();
            const gs = bridge.gameState;

            // Core fields must match
            expect(bridge.phase).toBe(gs.phase);
            expect(bridge.deal).toBe(gs.deal);
            expect(bridge.totalScore).toBe(gs.totalScore);
            expect(bridge.comps).toBe(gs.comps);
            expect(bridge.deck.length).toBe(gs.deck.length);
            expect(bridge.playerHands.length).toBe(gs.playerHands.length);
        });
    });

    describe('gift shop flow', () => {
        it('can enter shop from casino_payout', () => {
            startGame(42);

            // Manually set to casino_payout
            const gs = getBridge().gameState;
            const winState = {
                ...gs,
                phase: 'casino_payout' as const,
                totalScore: 100,
                targetScore: 20,
                comps: 10,
            };
            // Use dispatchSync which goes through processAction
            useGameBridge.setState({ gameState: winState });
            dispatch({ type: 'enter_gift_shop' });

            expect(getBridge().phase).toBe('gift_shop');
            expect(getBridge().shopItems.length).toBeGreaterThan(0);
        });
    });
});
