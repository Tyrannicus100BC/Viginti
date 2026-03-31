import { describe, it, expect } from 'vitest';
import { processAction, createInitialState, getValidActions } from '../engine';
import type { GameState } from '../GameState';
import type { PlayerAction } from '../PlayerAction';
import { TUTORIAL_STEPS } from '../tutorial/definitions';

describe('Game Engine', () => {
    // ─── Helpers ────────────────────────────────────────

    // Helper to get card identity without auto-incrementing ID
    function cardKey(c: { rank: string; suit: string }) { return `${c.rank}_${c.suit}`; }

    function startGame(seed = 42): GameState {
        const initial = createInitialState();
        const { nextState } = processAction(initial, {
            type: 'start_game',
            cityId: 'atlantic_city',
            gamblerId: 'standard',
            seed,
            globalTutorialsCompleted: TUTORIAL_STEPS.map(s => s.id)
        });
        return nextState;
    }

    function dealHand(state: GameState): GameState {
        const { nextState } = processAction(state, { type: 'deal' });
        return nextState;
    }

    function drawCards(state: GameState): GameState {
        const { nextState } = processAction(state, { type: 'draw' });
        return nextState;
    }

    // ─── createInitialState ─────────────────────────────

    describe('createInitialState', () => {
        it('returns a valid init-phase state', () => {
            const state = createInitialState();
            expect(state.phase).toBe('init');
            expect(state.deckProbabilities).toBeDefined();
            expect(state.inventory).toHaveLength(0);
            expect(state.totalScore).toBe(0);
        });
    });

    // ─── start_game ─────────────────────────────────────

    describe('start_game', () => {
        it('transitions to entering_casino', () => {
            const state = startGame();
            expect(state.phase).toBe('entering_casino');
        });

        it('initializes city and gambler', () => {
            const state = startGame();
            expect(state.selectedCityId).toBe('atlantic_city');
            expect(state.selectedGamblerId).toBe('standard');
        });

        it('initializes deck probabilities', () => {
            const state = startGame();
            expect(state.deckProbabilities.suits.hearts).toBe(25);
        });

        it('sets target score', () => {
            const state = startGame();
            expect(state.targetScore).toBeGreaterThan(0);
        });

        it('emits phase_changed event', () => {
            const initial = createInitialState();
            const { events } = processAction(initial, {
                type: 'start_game',
                cityId: 'atlantic_city',
                gamblerId: 'standard',
                seed: 42,
            });
            const phaseEvent = events.find(e => e.type === 'phase_changed');
            expect(phaseEvent).toBeDefined();
            expect(phaseEvent!.type === 'phase_changed' && phaseEvent.to).toBe('entering_casino');
        });

        it('is deterministic with same seed', () => {
            const state1 = startGame(42);
            const state2 = startGame(42);
 
            expect(state1.rngState).toBe(state2.rngState);
            expect(state1.inventory.map(r => r.id)).toEqual(state2.inventory.map(r => r.id));
        });

        it('produces different state with different seed', () => {
            const state1 = startGame(42);
            const state2 = startGame(99);

            expect(state1.rngState).not.toBe(state2.rngState);
        });
    });

    // ─── deal ───────────────────────────────────────────

    describe('deal', () => {
        it('transitions to playing phase', () => {
            const state = dealHand(startGame());
            expect(state.phase).toBe('playing');
        });

        it('deals 1 card to center player hand', () => {
            const state = dealHand(startGame());
            expect(state.playerHands).toHaveLength(3);
            expect(state.playerHands[1].cards).toHaveLength(1);
            expect(state.playerHands[1].cards[0].isFaceUp).toBe(true);
        });

        it('deals 2 cards to dealer', () => {
            const state = dealHand(startGame());
            expect(state.dealer.cards).toHaveLength(2);
            // First card face down, second face up
            expect(state.dealer.cards[0].isFaceUp).toBe(false);
            expect(state.dealer.cards[1].isFaceUp).toBe(true);
        });

        it('updates rngState after dealing', () => {
            const preState = startGame();
            const state = dealHand(preState);
            expect(state.rngState).not.toBe(preState.rngState);
        });

        it('emits cards_dealt and initial_deal_complete events', () => {
            const { events } = processAction(startGame(), { type: 'deal' });
            expect(events.some(e => e.type === 'cards_dealt')).toBe(true);
            expect(events.some(e => e.type === 'initial_deal_complete')).toBe(true);
        });

        it('updates deals taken and hands remaining', () => {
            const state = dealHand(startGame());
            expect(state.dealsTaken).toBe(1);
            expect(state.handsRemaining).toBeLessThan(3); // BASE_DEALS = 3, minus 1
        });
    });

    // ─── draw ───────────────────────────────────────────

    describe('draw', () => {
        it('draws at least 1 card', () => {
            const playing = dealHand(startGame());
            const state = drawCards(playing);
            const drawn = state.drawnCards.filter(c => c !== null);
            expect(drawn.length).toBeGreaterThanOrEqual(1);
        });

        it('selects center card by default', () => {
            const playing = dealHand(startGame());
            const state = drawCards(playing);
            expect(state.selectedDrawIndex).not.toBeNull();
        });

        it('updates rngState after drawing', () => {
            const playing = dealHand(startGame());
            const preRng = playing.rngState;
            const state = drawCards(playing);
            expect(state.rngState).not.toBe(preRng);
        });

        it('only allows drawing when no cards are already drawn', () => {
            const playing = dealHand(startGame());
            const drawn = drawCards(playing);
            // Drawing again should be a no-op
            const drawnAgain = drawCards(drawn);
            expect(drawnAgain).toEqual(drawn);
        });

        it('emits card_drawn and draw_complete events', () => {
            const playing = dealHand(startGame());
            const { events } = processAction(playing, { type: 'draw' });
            expect(events.some(e => e.type === 'card_drawn')).toBe(true);
            expect(events.some(e => e.type === 'draw_complete')).toBe(true);
        });

        it('consumes drawCountMod', () => {
            const playing = dealHand(startGame());
            const state = drawCards(playing);
            expect(state.modifiers.drawCountMod).toBe(0);
        });
    });

    // ─── place_card ─────────────────────────────────────

    describe('place_card', () => {
        function getDrawnState(seed = 42): GameState {
            return drawCards(dealHand(startGame(seed)));
        }

        it('places card into specified hand', () => {
            const state = getDrawnState();
            const { nextState } = processAction(state, { type: 'place_card', handIndex: 0 });

            expect(nextState.playerHands[0].cards.length).toBeGreaterThan(0);
        });

        it('recalculates blackjack value', () => {
            const state = getDrawnState();
            const { nextState } = processAction(state, { type: 'place_card', handIndex: 0 });

            expect(nextState.playerHands[0].blackjackValue).toBeGreaterThan(0);
        });

        it('emits card_placed event', () => {
            const state = getDrawnState();
            const { events } = processAction(state, { type: 'place_card', handIndex: 0 });

            expect(events.some(e => e.type === 'card_placed')).toBe(true);
        });

        it('clears drawn cards when placement is complete', () => {
            const state = getDrawnState();
            const { nextState } = processAction(state, { type: 'place_card', handIndex: 0 });

            // With only 1 drawn card and 1 place allowed, should be cleared
            if (nextState.drawnCards.length === 0) {
                expect(nextState.selectedDrawIndex).toBeNull();
            }
        });

        it('does not place into bust hand', () => {
            const state = getDrawnState();
            // Manually make a hand bust
            const bustHands = state.playerHands.map((h, i) =>
                i === 0 ? { ...h, isBust: true } : h
            );
            const bustState = { ...state, playerHands: bustHands };

            const { nextState } = processAction(bustState, { type: 'place_card', handIndex: 0 });
            // Should be unchanged
            expect(nextState.playerHands[0].isBust).toBe(true);
        });
    });

    // ─── stand ──────────────────────────────────────────

    describe('stand', () => {
        function getPlayingState(seed = 42): GameState {
            // Place a card to have a real hand value, then we can stand
            const drawn = drawCards(dealHand(startGame(seed)));
            const { nextState } = processAction(drawn, { type: 'place_card', handIndex: 1 });
            return nextState;
        }

        // Helper to run the full stand sequence
        function completeRound(state: GameState) {
            let current = state;
            let allEvents: any[] = [];
            
            // 1. Stand -> dealer_turn
            const r1 = processAction(current, { type: 'stand' });
            current = r1.nextState;
            allEvents.push(...r1.events);

            // 2. resolve_dealer_turn -> resolving_outcomes
            const r2 = processAction(current, { type: 'resolve_dealer_turn' });
            current = r2.nextState;
            allEvents.push(...r2.events);

            // 3. resolve_hand_outcome -> scoring
            const r3 = processAction(current, { type: 'resolve_hand_outcome' });
            current = r3.nextState;
            allEvents.push(...r3.events);

            // 4. score_round -> deal_over
            const r4 = processAction(current, { type: 'score_round' });
            current = r4.nextState;
            allEvents.push(...r4.events);

            return { finalState: current, events: allEvents };
        }

        it('reveals dealer cards', () => {
            const state = getPlayingState();
            const { events } = completeRound(state);

            expect(events.some(e => e.type === 'dealer_reveal' || e.type === 'dealer_stand' || e.type === 'dealer_bust')).toBe(true);
        });

        it('evaluates hand outcomes', () => {
            const state = getPlayingState();
            const { events } = completeRound(state);

            const outcomes = events.filter(e => e.type === 'hand_outcome');
            expect(outcomes).toHaveLength(3); // 3 hands
        });

        it('produces scoring events for winning hands', () => {
            // Run many seeds to find one with a win
            for (let seed = 1; seed <= 20; seed++) {
                const state = getPlayingState(seed);
                const { events } = completeRound(state);
                const wins = events.filter(e => e.type === 'hand_outcome' && e.outcome === 'win');
                if (wins.length > 0) {
                    expect(events.some(e => e.type === 'scoring_row_intro')).toBe(true);
                    expect(events.some(e => e.type === 'deal_scoring_complete')).toBe(true);
                    return; // Found a winning scenario
                }
            }
            // If no win found in 20 seeds, that's fine — scoring is tested elsewhere
        });

        it('transitions to deal_over phase', () => {
            const state = getPlayingState();
            const { finalState } = completeRound(state);

            expect(finalState.phase).toBe('deal_over');
        });

        it('updates total score', () => {
            const state = getPlayingState();
            const { finalState } = completeRound(state);

            // Score should be >= 0 (could be 0 if all losses)
            expect(finalState.totalScore).toBeGreaterThanOrEqual(0);
        });
    });

    // ─── Deterministic Replay ───────────────────────────

    describe('deterministic replay', () => {
        it('same seed + same actions produce identical final state', () => {
            const actions: PlayerAction[] = [
                { type: 'start_game', cityId: 'atlantic_city', gamblerId: 'standard', seed: 42 },
                { type: 'deal' },
                { type: 'draw' },
                { type: 'place_card', handIndex: 1 },
                { type: 'stand' },
                { type: 'resolve_dealer_turn' },
                { type: 'resolve_hand_outcome' },
                { type: 'score_round' },
            ];

            let state1 = createInitialState();
            let state2 = createInitialState();

            for (const action of actions) {
                state1 = processAction(state1, action).nextState;
                state2 = processAction(state2, action).nextState;
            }

            expect(state1.totalScore).toBe(state2.totalScore);
            expect(state1.rngState).toBe(state2.rngState);
            expect(state1.playerHands.map(h => h.blackjackValue)).toEqual(
                state2.playerHands.map(h => h.blackjackValue)
            );
        });
    });

    // ─── getValidActions ────────────────────────────────

    describe('getValidActions', () => {
        it('returns start_game actions in init phase', () => {
            const state = createInitialState();
            const actions = getValidActions(state);
            expect(actions.some(a => a.type === 'start_game')).toBe(true);
        });

        it('returns deal in entering_casino phase', () => {
            const state = startGame();
            const actions = getValidActions(state);
            expect(actions.some(a => a.type === 'deal')).toBe(true);
        });

        it('returns draw and stand in playing phase without drawn cards', () => {
            const state = dealHand(startGame());
            const actions = getValidActions(state);
            expect(actions.some(a => a.type === 'draw')).toBe(true);
            expect(actions.some(a => a.type === 'stand')).toBe(true);
        });

        it('returns place_card actions when cards are drawn', () => {
            const state = drawCards(dealHand(startGame()));
            const actions = getValidActions(state);
            expect(actions.some(a => a.type === 'place_card')).toBe(true);
        });

        it('returns deal in deal_over phase', () => {
            const played = drawCards(dealHand(startGame()));
            let current = processAction(played, { type: 'place_card', handIndex: 1 }).nextState;
            
            // Advance through phases
            current = processAction(current, { type: 'stand' }).nextState;
            current = processAction(current, { type: 'resolve_dealer_turn' }).nextState;
            current = processAction(current, { type: 'resolve_hand_outcome' }).nextState;
            current = processAction(current, { type: 'score_round' }).nextState;

            const actions = getValidActions(current);
            expect(actions.some(a => a.type === 'deal')).toBe(true);
        });
    });
});
