import type { PackId } from '../logic/packs';
/**
 * Command pattern types for all player inputs.
 * Each variant represents a discrete action the player can take.
 * The game engine processes these to produce new state + events.
 */

export type PlayerAction =
    // === Game Setup ===
    | { type: 'start_game'; cityId: string; gamblerId: string; seed?: number; globalTutorialsCompleted?: string[]; skipAtlanticTutorials?: boolean }
    | { type: 'deal'; forceContinue?: boolean }

    // === Core Gameplay ===
    | { type: 'draw' }
    | { type: 'select_drawn_card'; drawIndex: number }
    | { type: 'place_card'; handIndex: number }
    | { type: 'stand' }
    | { type: 'double_down'; handIndex: number }
    | { type: 'resolve_dealer_turn' }
    | { type: 'resolve_hand_outcome' }
    | { type: 'score_round' }

    // === Table Actions (Relics with charges) ===
    | { type: 'activate_table_action'; relicId: string }
    | { type: 'select_table_action_target'; handIndex: number }
    | { type: 'select_table_action_card'; target: 'player' | 'dealer'; handIndex?: number; cardId: string }
    | { type: 'select_table_action_draw_card'; drawIndex: number }
    | { type: 'cancel_table_action' }
    | { type: 'complete_deal_early' }

    // === Pack Rewards ===
    | { type: 'open_pack'; packId: PackId }
    | { type: 'choose_raise'; raiseId: string }
    | { type: 'choose_pack_card'; cardId: string }
    | { type: 'skip_pack' }
    | { type: 'finish_pack' }

    // === Debug (not available in CLI simulation) ===
    | { type: 'debug_open_pack'; packId: PackId }
    | { type: 'debug_win' }
    | { type: 'debug_undo' }
    | { type: 'debug_victory' }
    | { type: 'debug_add_relic'; relicId: string }
    | { type: 'debug_remove_relic'; relicId: string }
    | { type: 'debug_fill_charges'; relicId: string }
    | { type: 'debug_give_cash'; amount?: number }
    | { type: 'debug_draw_card'; cardId: string }

    // === Tutorial & Animations ===
    | { type: 'acknowledge_tutorial'; stepId: string };
