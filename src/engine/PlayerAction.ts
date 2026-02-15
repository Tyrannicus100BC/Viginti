/**
 * Command pattern types for all player inputs.
 * Each variant represents a discrete action the player can take.
 * The game engine processes these to produce new state + events.
 */

export type PlayerAction =
    // === Game Setup ===
    | { type: 'start_game'; cityId: string; gamblerId: string; seed?: number }
    | { type: 'deal' }

    // === Core Gameplay ===
    | { type: 'draw' }
    | { type: 'select_drawn_card'; drawIndex: number }
    | { type: 'place_card'; handIndex: number }
    | { type: 'stand' }
    | { type: 'double_down'; handIndex: number }

    // === Table Actions (Relics with charges) ===
    | { type: 'activate_table_action'; relicId: string }
    | { type: 'select_table_action_target'; handIndex: number }
    | { type: 'select_table_action_card'; target: 'player' | 'dealer'; handIndex?: number; cardId: string }
    | { type: 'select_table_action_draw_card'; drawIndex: number }
    | { type: 'cancel_table_action' }

    // === Round Progression ===
    | { type: 'next_round'; forceContinue?: boolean }
    | { type: 'complete_round_early' }

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
    | { type: 'debug_add_relic'; relicId: string }
    | { type: 'debug_fill_charges'; relicId: string };
