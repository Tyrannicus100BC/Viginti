import { describe, expect, it } from 'vitest';
import { createInitialState, getValidActions, processAction } from '../engine';
import { canPlayHand } from '../economy';
import type { GameState } from '../GameState';
import type { Card } from '../../types';
import { finishOpeningPack } from './fixtures';
import { TUTORIAL_STEPS } from '../tutorial/definitions';

const card = (id: string): Card => ({ id, rank: '2', suit: 'hearts', isFaceUp: true });
function playing(cardCount = 4): GameState {
    const started = processAction(createInitialState(), {
        type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 42,
        globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id),
    }).nextState;
    const state = processAction(finishOpeningPack(started), { type: 'deal' }).nextState;
    return { ...state, playerHands: state.playerHands.map(hand => ({
        ...hand, cards: Array.from({ length: cardCount }, (_, i) => card(`${hand.id}-${i}`)),
        blackjackValue: cardCount * 2, isBust: false, isHeld: false,
    })) };
}

describe('five-card hand limit', () => {
    it('accepts a fifth card and rejects a sixth without consuming it', () => {
        const state = { ...playing(), drawnCards: [card('fifth')], selectedDrawIndex: 0 };
        expect(canPlayHand(state.playerHands[0])).toBe(true);
        const fifth = processAction(state, { type: 'place_card', handIndex: 0 }).nextState;
        expect(fifth.playerHands[0]).toMatchObject({ blackjackValue: 10, isBust: false, isHeld: false });
        expect(fifth.playerHands[0].cards).toHaveLength(5);
        expect(canPlayHand(fifth.playerHands[0])).toBe(false);
        const sixth = { ...fifth, drawnCards: [card('sixth')], selectedDrawIndex: 0 };
        expect(getValidActions(sixth)).not.toContainEqual({ type: 'place_card', handIndex: 0 });
        const result = processAction(sixth, { type: 'place_card', handIndex: 0 });
        expect(result.nextState).toEqual(sixth);
        expect(result.events).toEqual([]);
    });

    it('auto-stands and clears unused draws when the final hand reaches five', () => {
        const base = playing(5);
        const state = { ...base, playerHands: base.playerHands.map((hand, i) => i === 0
            ? { ...hand, cards: hand.cards.slice(0, 4), blackjackValue: 8 } : hand) };
        const result = processAction({ ...state, drawnCards: [card('fifth'), card('unused')], selectedDrawIndex: 0,
            modifiers: { ...state.modifiers, placeCountMod: 2 },
        }, { type: 'place_card', handIndex: 0 });
        expect(result.events).toContainEqual({ type: 'auto_stand_triggered' });
        expect(result.nextState.drawnCards).toEqual([]);
        expect(getValidActions(result.nextState)).not.toContainEqual({ type: 'draw' });
    });

    it.each(['hold', 'double_down'])('%s cannot add a sixth card or consume resources', relicId => {
        const state: GameState = { ...playing(5), inventory: [{ id: relicId, state: {} }],
            tableActionCharges: { [relicId]: 10 }, tableActionHeldCards: { hold: card('held') },
            interactionMode: 'select_hand', activeTableActionId: relicId,
        };
        expect(getValidActions(state)).not.toContainEqual({ type: 'select_table_action_target', handIndex: 0 });
        const result = processAction(state, { type: 'select_table_action_target', handIndex: 0 });
        expect(result.nextState).toEqual(state);
        expect(result.events).toEqual([]);
    });

    it.each(['hold', 'double_down'])('%s can add a fifth card', relicId => {
        const state: GameState = { ...playing(), inventory: [{ id: relicId, state: {} }],
            tableActionCharges: { [relicId]: 10 }, tableActionHeldCards: { hold: card('held') },
            interactionMode: 'select_hand', activeTableActionId: relicId,
        };
        expect(processAction(state, { type: 'select_table_action_target', handIndex: 0 }).nextState.playerHands[0].cards).toHaveLength(5);
    });

    it('does not offer Double Down when all hands are full', () => {
        const state: GameState = { ...playing(5), inventory: [{ id: 'double_down', state: {} }],
            tableActionCharges: { double_down: 10 },
        };
        expect(getValidActions(state)).not.toContainEqual({ type: 'activate_table_action', relicId: 'double_down' });
        expect(processAction(state, { type: 'activate_table_action', relicId: 'double_down' }).nextState).toEqual(state);
    });

    it('allows placement again after a card is discarded from a full hand', () => {
        const state: GameState = { ...playing(5), inventory: [{ id: 'discard', state: {} }],
            tableActionCharges: { discard: 10 }, interactionMode: 'select_card', activeTableActionId: 'discard',
        };
        const result = processAction(state, { type: 'select_table_action_card', target: 'player', handIndex: 0, cardId: '0-0' });
        expect(result.nextState.playerHands[0].cards).toHaveLength(4);
        expect(canPlayHand(result.nextState.playerHands[0])).toBe(true);
    });
});
