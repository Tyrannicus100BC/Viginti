import type { GameState } from '../GameState';
import { processAction } from '../engine';

/** Gameplay tests pass the opening reward explicitly without applying upgrades. */
export function finishOpeningPack(state: GameState): GameState {
    if (state.phase !== 'pack_choice') return state;
    let current = state;
    if (current.offeredPacks.length) current = processAction(current, { type: 'open_pack', packId: current.offeredPacks[0] }).nextState;
    if (current.pendingPack) current = processAction(current, { type: 'skip_pack' }).nextState;
    return processAction(current, { type: 'finish_pack' }).nextState;
}
