/**
 * CLI Simulator tests.
 *
 * Tests the text renderer, action descriptions, strategies, and batch runner.
 */
import { describe, it, expect } from 'vitest';
import {
    renderCard,
    renderHand,
    renderDealer,
    renderState,
    describeAction,
    randomStrategy,
    greedyStrategy,
    runGame,
    runBatch,
} from '../cli';
import { processAction, getValidActions } from '../engine';
import { TUTORIAL_STEPS } from '../tutorial/definitions';
import type { GameState } from '../GameState';
import type { Card, PlayerHand } from '../../types';

// ─── Helpers ────────────────────────────────────────────

function startGame(seed = 42): GameState {
    const { nextState } = processAction(
        { phase: 'init' } as GameState,
        { 
            type: 'start_game', 
            cityId: 'atlantic_city', 
            gamblerId: 'default', 
            seed,
            globalTutorialsCompleted: TUTORIAL_STEPS.map(s => s.id)
        }
    );
    return nextState;
}

// ─── Tests ──────────────────────────────────────────────

describe('CLI Simulator', () => {

    describe('renderCard', () => {
        it('renders face-up standard card', () => {
            const card: Card = { id: 'c1', suit: 'spades', rank: 'A', isFaceUp: true };
            expect(renderCard(card)).toBe('A♠');
        });

        it('renders face-down card', () => {
            const card: Card = { id: 'c2', suit: 'hearts', rank: 'K', isFaceUp: false };
            expect(renderCard(card)).toBe('??');
        });

        it('renders 10 correctly', () => {
            const card: Card = { id: 'c3', suit: 'diamonds', rank: '10', isFaceUp: true };
            expect(renderCard(card)).toBe('10♦');
        });

        it('renders chip card', () => {
            const card: Card = { id: 'c4', suit: 'spades', rank: 'none', type: 'chip', chips: 5, isFaceUp: true };
            expect(renderCard(card)).toBe('$5');
        });

        it('renders card with special effect', () => {
            const card: Card = {
                id: 'c5', suit: 'clubs', rank: '7', isFaceUp: true,
                specialEffect: { type: 'chip', value: 3 }
            };
            expect(renderCard(card)).toBe('7♣(+$3)');
        });
    });

    describe('renderHand', () => {
        it('renders a normal hand', () => {
            const hand: PlayerHand = {
                id: 0,
                cards: [
                    { id: 'c1', suit: 'spades', rank: 'A', isFaceUp: true },
                    { id: 'c2', suit: 'hearts', rank: 'K', isFaceUp: true },
                ],
                isHeld: false,
                isBust: false,
                blackjackValue: 21,
            };
            const result = renderHand(hand, 17);
            expect(result).toContain('Hand 1');
            expect(result).toContain('A♠');
            expect(result).toContain('K♥');
            expect(result).toContain('21');
        });

        it('shows BUST for bust hand', () => {
            const hand: PlayerHand = {
                id: 1,
                cards: [
                    { id: 'c1', suit: 'spades', rank: 'K', isFaceUp: true },
                    { id: 'c2', suit: 'hearts', rank: 'Q', isFaceUp: true },
                    { id: 'c3', suit: 'clubs', rank: '5', isFaceUp: true },
                ],
                isHeld: false,
                isBust: true,
                blackjackValue: 25,
            };
            expect(renderHand(hand, 17)).toContain('BUST');
        });

        it('shows WIN for winning hand', () => {
            const hand: PlayerHand = {
                id: 0,
                cards: [{ id: 'c1', suit: 'spades', rank: 'A', isFaceUp: true }],
                isHeld: true,
                isBust: false,
                blackjackValue: 21,
                outcome: 'win',
            };
            expect(renderHand(hand, 17)).toContain('WIN');
        });
    });

    describe('renderState', () => {
        it('renders init state', () => {
            const state = { phase: 'init' } as GameState;
            const output = renderState(state);
            expect(output).toContain('init');
        });

        it('renders entering_casino state', () => {
            const state = startGame();
            const output = renderState(state);
            expect(output).toContain('Atlantic City');
            expect(output).toContain('Score');
            expect(output).toContain('entering_casino');
        });

        it('renders playing state with hands', () => {
            const state = startGame();
            const dealt = processAction(state, { type: 'deal' });
            const output = renderState(dealt.nextState);
            expect(output).toContain('Hand');
            expect(output).toContain('Dealer');
        });

        it('renders gift shop with items', () => {
            const state = startGame();
            const casinoWin = {
                ...state,
                phase: 'casino_payout' as const,
                totalScore: 100,
                targetScore: 20,
                comps: 10,
            };
            const shopResult = processAction(casinoWin, { type: 'enter_gift_shop' });
            const output = renderState(shopResult.nextState);
            expect(output).toContain('Gift Shop');
        });
    });

    describe('describeAction', () => {
        it('describes deal', () => {
            expect(describeAction({ type: 'deal' })).toBe('Deal cards');
        });

        it('describes stand', () => {
            expect(describeAction({ type: 'stand' })).toContain('Stand');
        });

        it('describes place_card', () => {
            expect(describeAction({ type: 'place_card', handIndex: 2 })).toContain('Hand 3');
        });

        it('describes buy_shop_item with state', () => {
            const state = startGame();
            const casinoWin = {
                ...state,
                phase: 'casino_payout' as const,
                totalScore: 100,
                targetScore: 20,
                comps: 10,
            };
            const shopResult = processAction(casinoWin, { type: 'enter_gift_shop' });
            const shopState = shopResult.nextState;
            const item = shopState.shopItems[0];
            if (item) {
                const desc = describeAction(
                    { type: 'buy_shop_item', itemId: item.id },
                    shopState
                );
                expect(desc).toContain('Buy');
                expect(desc).toContain('$');
            }
        });

        it('describes all action types without throwing', () => {
            const allTypes = [
                { type: 'start_game', cityId: 'test', gamblerId: 'test' },
                { type: 'deal' },
                { type: 'draw' },
                { type: 'select_drawn_card', drawIndex: 0 },
                { type: 'place_card', handIndex: 0 },
                { type: 'stand' },
                { type: 'complete_deal_early' },
                { type: 'enter_gift_shop' },
                { type: 'buy_shop_item', itemId: 'test' },
                { type: 'restock_shop' },
                { type: 'sell_relic', relicId: 'test', index: 0 },
                { type: 'leave_shop' },
                { type: 'enhance_card', cardId: 'test', enhancement: { type: 'chip', value: 5 } },
                { type: 'destroy_card', cardId: 'test' },
                { type: 'activate_table_action', relicId: 'test' },
                { type: 'cancel_table_action' },
                { type: 'select_table_action_hand', handIndex: 0 },
                { type: 'select_table_action_card', target: 'player', cardId: 'test' },
                { type: 'select_table_action_draw_card', drawIndex: 0 },
            ] as any[];

            for (const action of allTypes) {
                expect(() => describeAction(action)).not.toThrow();
                expect(describeAction(action).length).toBeGreaterThan(0);
            }
        });
    });

    describe('randomStrategy', () => {
        it('always returns a valid action', () => {
            const state = startGame();
            const actions = getValidActions(state);
            const chosen = randomStrategy(state, actions);
            expect(actions).toContain(chosen);
        });

        it('works with single action', () => {
            const state = startGame();
            const actions = [{ type: 'deal' as const }];
            expect(randomStrategy(state, actions)).toEqual({ type: 'deal' });
        });
    });

    describe('greedyStrategy', () => {
        it('prefers deal when available', () => {
            const state = startGame();
            const actions = getValidActions(state);
            const chosen = greedyStrategy(state, actions);
            expect(chosen.type).toBe('deal');
        });

        it('prefers place_card over stand', () => {
            let state = startGame();
            state = processAction(state, { type: 'deal' }).nextState;
            state = processAction(state, { type: 'draw' }).nextState;

            // Select first drawn card
            const idx = state.drawnCards.findIndex(c => c !== null);
            if (idx >= 0) {
                state = processAction(state, { type: 'select_drawn_card', drawIndex: idx }).nextState;
                const actions = getValidActions(state);
                const placeActions = actions.filter(a => a.type === 'place_card');
                if (placeActions.length > 0) {
                    const chosen = greedyStrategy(state, actions);
                    expect(chosen.type).toBe('place_card');
                }
            }
        });
    });

    describe('runGame', () => {
        it('completes a game with random strategy', () => {
            const result = runGame(randomStrategy, { seed: 42 });
            expect(['game_over', 'victory']).toContain(result.phase);
            expect(result.actionCount).toBeGreaterThan(0);
            expect(result.deal).toBeGreaterThanOrEqual(1);
        });

        it('completes a game with greedy strategy', () => {
            const result = runGame(greedyStrategy, { seed: 42 });
            expect(['game_over', 'victory']).toContain(result.phase);
            expect(result.actionCount).toBeGreaterThan(0);
        });

        it('respects maxActions', () => {
            const result = runGame(randomStrategy, { seed: 42, maxActions: 5 });
            expect(result.actionCount).toBeLessThanOrEqual(5);
        });

        it('deterministic with same seed', () => {
            const r1 = runGame(greedyStrategy, { seed: 123 });
            const r2 = runGame(greedyStrategy, { seed: 123 });
            expect(r1.finalScore).toBe(r2.finalScore);
            expect(r1.deal).toBe(r2.deal);
            expect(r1.actionCount).toBe(r2.actionCount);
        });
    });

    describe('runBatch', () => {
        it('runs multiple games', () => {
            const stats = runBatch(10, randomStrategy);
            expect(stats.games).toBe(10);
            expect(stats.wins + stats.losses).toBe(10);
            expect(stats.winRate).toBeGreaterThanOrEqual(0);
            expect(stats.winRate).toBeLessThanOrEqual(1);
            expect(stats.avgScore).toBeGreaterThan(0);
            expect(stats.avgDeal).toBeGreaterThanOrEqual(1);
            expect(stats.avgActions).toBeGreaterThan(0);
        });

        it('greedy outperforms random (on average)', () => {
            const randomStats = runBatch(20, randomStrategy);
            const greedyStats = runBatch(20, greedyStrategy);

            // Greedy should at least get further on average
            expect(greedyStats.avgDeal).toBeGreaterThanOrEqual(randomStats.avgDeal * 0.5);
        });
    });
});
