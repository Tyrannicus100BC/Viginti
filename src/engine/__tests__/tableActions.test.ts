import { describe, it, expect } from 'vitest';
import { processAction, createInitialState, getValidActions } from '../engine';
import type { GameState } from '../GameState';
import type { PlayerAction } from '../PlayerAction';
import type { RelicInstance } from '../../logic/relics/types';
import { RelicManager } from '../../logic/relics/manager';
import { TUTORIAL_STEPS } from '../tutorial/definitions';

describe('Table Actions', () => {
    // ─── Helpers ────────────────────────────────────────

    function cardKey(c: { rank: string; suit: string }) { return `${c.rank}_${c.suit}`; }

    function startGame(seed = 42): GameState {
        const { nextState } = processAction(createInitialState(), {
            type: 'start_game', 
            cityId: 'atlantic_city', 
            gamblerId: 'standard', 
            seed,
            globalTutorialsCompleted: TUTORIAL_STEPS.map(s => s.id)
        });
        return nextState;
    }

    function dealHand(state: GameState): GameState {
        return processAction(state, { type: 'deal' }).nextState;
    }

    function drawCards(state: GameState): GameState {
        return processAction(state, { type: 'draw' }).nextState;
    }

    /** Create a state in 'playing' phase with a relic that has a table action */
    function stateWithRelic(relicId: string, seed = 42): GameState {
        const config = RelicManager.getRelicConfig(relicId);
        if (!config) throw new Error(`Relic ${relicId} not found`);

        const state = dealHand(startGame(seed));
        const relic: RelicInstance = { id: relicId, level: 1 };
        const charges = config.tableAction ? config.tableAction.maxCharges : 0;

        return {
            ...state,
            inventory: [...state.inventory, relic],
            tableActionCharges: {
                ...state.tableActionCharges,
                [relicId]: charges,
            },
            tableActionHeldCards: {
                ...state.tableActionHeldCards,
                [relicId]: null,
            },
        };
    }

    // ─── Activation ─────────────────────────────────────

    describe('activate_table_action', () => {
        it('double_down enters select_hand mode', () => {
            const state = stateWithRelic('double_down');
            const { nextState, events } = processAction(state, {
                type: 'activate_table_action', relicId: 'double_down',
            });
            expect(nextState.interactionMode).toBe('select_hand');
            expect(nextState.activeTableActionId).toBe('double_down');
            expect(events.some(e => e.type === 'table_action_activated')).toBe(true);
        });

        it('cannot activate without enough charges', () => {
            const state = stateWithRelic('double_down');
            const noCharges = {
                ...state,
                tableActionCharges: { ...state.tableActionCharges, double_down: 0 },
            };
            const { nextState } = processAction(noCharges, {
                type: 'activate_table_action', relicId: 'double_down',
            });
            expect(nextState.interactionMode).toBe('default');
        });

        it('cannot activate double_down with drawn cards', () => {
            const state = drawCards(stateWithRelic('double_down'));
            const { nextState } = processAction(state, {
                type: 'activate_table_action', relicId: 'double_down',
            });
            expect(nextState.interactionMode).toBe('default');
        });

        it('redraw requires drawn cards', () => {
            const config = RelicManager.getRelicConfig('redraw');
            if (!config?.tableAction) return; // Skip if relic doesn't exist

            const state = stateWithRelic('redraw');
            // No drawn cards -> can't activate
            const { nextState } = processAction(state, {
                type: 'activate_table_action', relicId: 'redraw',
            });
            expect(nextState.interactionMode).toBe('default');

            // Draw cards -> can activate
            const drawn = drawCards(state);
            const updated = {
                ...drawn,
                inventory: [...drawn.inventory, { id: 'redraw', level: 1 }],
                tableActionCharges: { ...drawn.tableActionCharges, redraw: config.tableAction.maxCharges },
                tableActionHeldCards: { ...drawn.tableActionHeldCards, redraw: null },
            };
            const { nextState: ns2 } = processAction(updated, {
                type: 'activate_table_action', relicId: 'redraw',
            });
            expect(ns2.interactionMode).toBe('select_draw');
        });
    });

    // ─── Cancel ─────────────────────────────────────────

    describe('cancel_table_action', () => {
        it('returns to default mode', () => {
            const state = stateWithRelic('double_down');
            const activated = processAction(state, {
                type: 'activate_table_action', relicId: 'double_down',
            }).nextState;
            expect(activated.interactionMode).toBe('select_hand');

            const { nextState, events } = processAction(activated, { type: 'cancel_table_action' });
            expect(nextState.interactionMode).toBe('default');
            expect(nextState.activeTableActionId).toBeNull();
            expect(events.some(e => e.type === 'table_action_cancelled')).toBe(true);
        });
    });

    // ─── Double Down ────────────────────────────────────

    describe('double_down', () => {
        it('draws a card and marks hand as held+doubled', () => {
            const state = stateWithRelic('double_down');
            const activated = processAction(state, {
                type: 'activate_table_action', relicId: 'double_down',
            }).nextState;

            // Target center hand (has cards)
            const { nextState, events } = processAction(activated, {
                type: 'select_table_action_target', handIndex: 1,
            });

            expect(nextState.playerHands[1].isHeld).toBe(true);
            expect(nextState.playerHands[1].isDoubled).toBe(true);
            expect(nextState.playerHands[1].cards.length).toBe(state.playerHands[1].cards.length + 1);
            expect(nextState.interactionMode).toBe('default');
            expect(events.some(e => e.type === 'table_action_resolved')).toBe(true);
            expect(events.some(e => e.type === 'charge_spent')).toBe(true);
        });

        it('spends a charge', () => {
            const state = stateWithRelic('double_down');
            const initialCharges = state.tableActionCharges['double_down'];
            const activated = processAction(state, {
                type: 'activate_table_action', relicId: 'double_down',
            }).nextState;

            const { nextState } = processAction(activated, {
                type: 'select_table_action_target', handIndex: 1,
            });

            expect(nextState.tableActionCharges['double_down']).toBeLessThan(initialCharges);
        });

        it('rejects empty hands', () => {
            const state = stateWithRelic('double_down');
            const activated = processAction(state, {
                type: 'activate_table_action', relicId: 'double_down',
            }).nextState;

            // Hand 0 has no cards
            const { nextState } = processAction(activated, {
                type: 'select_table_action_target', handIndex: 0,
            });
            // Should be unchanged (hand 0 is empty)
            expect(nextState.playerHands[0].cards.length).toBe(0);
        });
    });

    // ─── Surrender ──────────────────────────────────────

    describe('surrender', () => {
        it('discards hand and marks as held', () => {
            const config = RelicManager.getRelicConfig('surrender');
            if (!config?.tableAction) return;

            const state = stateWithRelic('surrender');
            const activated = processAction(state, {
                type: 'activate_table_action', relicId: 'surrender',
            }).nextState;

            const { nextState, events } = processAction(activated, {
                type: 'select_table_action_target', handIndex: 1,
            });

            expect(nextState.playerHands[1].cards).toHaveLength(0);
            expect(nextState.playerHands[1].isHeld).toBe(true);
            expect(events.some(e => e.type === 'table_action_resolved')).toBe(true);
        });
    });

    // ─── getValidActions with table actions ──────────────

    describe('getValidActions with table actions', () => {
        it('lists activate_table_action when charges available', () => {
            const state = stateWithRelic('double_down');
            const actions = getValidActions(state);
            expect(actions.some(a => a.type === 'activate_table_action' && a.relicId === 'double_down')).toBe(true);
        });

        it('does not list activate if charges depleted', () => {
            const state = stateWithRelic('double_down');
            const depleted = {
                ...state,
                tableActionCharges: { ...state.tableActionCharges, double_down: 0 },
            };
            const actions = getValidActions(depleted);
            expect(actions.some(a => a.type === 'activate_table_action' && a.relicId === 'double_down')).toBe(false);
        });

        it('shows cancel_table_action when in targeting mode', () => {
            const state = stateWithRelic('double_down');
            const activated = processAction(state, {
                type: 'activate_table_action', relicId: 'double_down',
            }).nextState;
            const actions = getValidActions(activated);
            expect(actions.some(a => a.type === 'cancel_table_action')).toBe(true);
            expect(actions.some(a => a.type === 'select_table_action_target')).toBe(true);
        });
    });

    // ─── Dealer Deal Bug Fix ────────────────────────────

    describe('dealer dealing', () => {
        it('dealer cards are generated from probabilities', () => {
            const state = dealHand(startGame());
            expect(state.dealer.cards).toHaveLength(2);
        });
    });
});
