/**
 * Viginti Game Engine
 * Pure game logic with no browser dependencies.
 * 
 * Usage:
 *   import { createInitialState, processAction, getValidActions } from './engine';
 * 
 *   let state = createInitialState();
 *   const { nextState, events } = processAction(state, { type: 'start_game', cityId: 'atlantic_city', gamblerId: 'standard' });
 *   state = nextState;
 *   // events[] tells the presentation layer what to animate
 */

export { processAction, getValidActions, createInitialState } from './engine';
export type { ActionResult } from './engine';

export type { GameState, GamePhase, GameModifiers, ShopItem, InteractionMode, RewardSummary, ScoredHand } from './GameState';
export { INITIAL_HAND_COUNT, BASE_DEALS_PER_CASINO } from './GameState';

export type { PlayerAction } from './PlayerAction';

export type { GameEvent } from './GameEvent';

export { SeededRNG } from './rng';
