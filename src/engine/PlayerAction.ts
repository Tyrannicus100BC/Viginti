/**
 * Command pattern types for all player inputs.
 * Each variant represents a discrete action the player can take.
 * The game engine processes these to produce new state + events.
 */

export type PlayerAction =
    // === Game Setup ===
    | { type: 'start_game'; cityId: string; gamblerId: string; seed?: number; globalTutorialsCompleted?: string[]; skipAtlanticTutorials?: boolean }
    | { type: 'deal'; forceContinue?: boolean }
    | { type: 'leave_casino' }

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

    // === Gift Shop ===
    | { type: 'enter_gift_shop' }
    | { type: 'buy_shop_item'; itemId: string }
    | { type: 'restock_shop' }
    | { type: 'sell_relic'; relicId: string; index: number }
    | { type: 'leave_shop' }

    // === Deck Management (in gift shop) ===
    | { type: 'enhance_card'; cardId: string; enhancement: { type: 'chip' | 'mult' | 'score'; value: number } }
    | { type: 'destroy_card'; cardId: string }

    // === Debug (not available in CLI simulation) ===
    | { type: 'debug_win' }
    | { type: 'debug_undo' }
    | { type: 'debug_victory' }
    | { type: 'debug_add_relic'; relicId: string }
    | { type: 'debug_remove_relic'; relicId: string }
    | { type: 'debug_fill_charges'; relicId: string }
    | { type: 'debug_give_cash'; amount: number }
    | { type: 'debug_draw_card'; cardId: string }

    // === Tutorial & Animations ===
    | { type: 'acknowledge_tutorial'; stepId: string }
    | { type: 'signal_animation_complete'; animationId: string };
