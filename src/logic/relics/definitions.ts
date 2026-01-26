
import type { RelicDefinition } from './types';
import { Hooks } from './hooks';

export const RELIC_DEFINITIONS: RelicDefinition[] = [
    // HandTypes

    {
        name: 'Viginti',
        categories: ['Angle', 'Win', 'HandType'],
        description: 'Winning a hand earns {win.score}\nExactly 21 earns {viginti.score}',
        handType: { id: 'viginti', name: 'Viginti', chips: 50, mult: 1, order: 0 },
        extraHandTypes: {
            'win': { id: 'win', name: 'Win', chips: 10, mult: 1, order: 1 },
            'viginti': { id: 'viginti', name: 'Viginti', chips: 50, mult: 1, order: 0 }
        },
        hooks: Hooks.viginti_relic
    },
    // Rank Types
    {
        name: 'Rank Pair Chips',
        categories: ['Angle', 'Rank', 'HandType', 'Chips'],
        description: 'Highest [Rank Pair] earns Cards + <$${base_chips}>',
        handType: { id: 'rank_pair_chips', name: 'Rank Pair', chips: 0, mult: 0, order: 2, chipCards: true },
        hooks: Hooks.rank_pair,
        properties: { base_chips: 40, base_mult: 1 }
    },
    {
        name: 'Rank Pair Mult',
        categories: ['Angle', 'Rank', 'HandType', 'Mult'],
        description: 'Highest [Rank Pair] earns {x${base_mult}}',
        handType: { id: 'rank_pair_mult', name: 'Rank Pair', chips: 0, mult: 0, order: 2.1, chipCards: true },
        hooks: Hooks.rank_pair,
        properties: { base_chips: 0, base_mult: 2 }
    },
    {
        name: 'Rank Triple Chips',
        categories: ['Angle', 'Rank', 'HandType', 'Chips'],
        description: 'Highest [Rank Triple] earns Cards + <$${base_chips}>',
        handType: { id: 'rank_triple_chips', name: 'Rank Triple', chips: 0, mult: 0, order: 3, chipCards: true },
        hooks: Hooks.rank_triple,
        properties: { base_chips: 60, base_mult: 1 }
    },
    {
        name: 'Rank Triple Mult',
        categories: ['Angle', 'Rank', 'HandType', 'Mult'],
        description: 'Highest [Rank Triple] earns {x${base_mult}}',
        handType: { id: 'rank_triple_mult', name: 'Rank Triple', chips: 0, mult: 0, order: 3.1, chipCards: true },
        hooks: Hooks.rank_triple,
        properties: { base_chips: 0, base_mult: 3 }
    },
    {
        name: 'Rank Run Chips',
        categories: ['Angle', 'Rank', 'HandType', 'Chips'],
        description: 'Longest [Rank Run] earns Cards + <$${per_card_chips} / additional card>',
        handType: { id: 'rank_run_chips', name: 'Rank Run', chips: 0, mult: 0, order: 4, chipCards: true },
        hooks: Hooks.rank_run,
        properties: { base_chips: 0, base_mult: 1, per_card_chips: 15, per_card_mult: 0 }
    },
    {
        name: 'Rank Run Mult',
        categories: ['Angle', 'Rank', 'HandType', 'Mult'],
        description: 'Longest [Rank Run] earns {x${per_card_mult} / additional card}',
        handType: { id: 'rank_run_mult', name: 'Rank Run', chips: 0, mult: 0, order: 4.1, chipCards: true },
        hooks: Hooks.rank_run,
        properties: { base_chips: 0, base_mult: 1, per_card_chips: 0, per_card_mult: 0.5 }
    },

    // Flush Types
    {
        name: 'Flush Pair Chips',
        categories: ['Angle', 'Flush', 'HandType', 'Chips'],
        description: 'Highest [Flush Pair] earns Cards + <$${base_chips}>',
        handType: { id: 'flush_pair_chips', name: 'Flush Pair', chips: 0, mult: 0, order: 5, chipCards: true },
        hooks: Hooks.flush_pair,
        properties: { base_chips: 40, base_mult: 1 }
    },
    {
        name: 'Flush Pair Mult',
        categories: ['Angle', 'Flush', 'HandType', 'Mult'],
        description: 'Highest [Flush Pair] earns {x${base_mult}}',
        handType: { id: 'flush_pair_mult', name: 'Flush Pair', chips: 0, mult: 0, order: 5.1, chipCards: true },
        hooks: Hooks.flush_pair,
        properties: { base_chips: 0, base_mult: 2 }
    },
    {
        name: 'Flush Triple Chips',
        categories: ['Angle', 'Flush', 'HandType', 'Chips'],
        description: 'Highest [Flush Triple] earns Cards + <$${base_chips}>',
        handType: { id: 'flush_triple_chips', name: 'Flush Triple', chips: 0, mult: 0, order: 6, chipCards: true },
        hooks: Hooks.flush_triple,
        properties: { base_chips: 60, base_mult: 1 }
    },
    {
        name: 'Flush Triple Mult',
        categories: ['Angle', 'Flush', 'HandType', 'Mult'],
        description: 'Highest [Flush Triple] earns {x${base_mult}}',
        handType: { id: 'flush_triple_mult', name: 'Flush Triple', chips: 0, mult: 0, order: 6.1, chipCards: true },
        hooks: Hooks.flush_triple,
        properties: { base_chips: 0, base_mult: 3 }
    },
    {
        name: 'Flush Run Chips',
        categories: ['Angle', 'Flush', 'HandType', 'Chips'],
        description: 'Longest [Flush Run] earns Cards + <$${per_card_chips} / additional card>',
        handType: { id: 'flush_run_chips', name: 'Flush Run', chips: 0, mult: 0, order: 7, chipCards: true },
        hooks: Hooks.flush_run,
        properties: { base_chips: 0, base_mult: 1, per_card_chips: 15, per_card_mult: 0 }
    },
    {
        name: 'Flush Run Mult',
        categories: ['Angle', 'Flush', 'HandType', 'Mult'],
        description: 'Longest [Flush Run] earns {x${per_card_mult} / additional card}',
        handType: { id: 'flush_run_mult', name: 'Flush Run', chips: 0, mult: 0, order: 7.1, chipCards: true },
        hooks: Hooks.flush_run,
        properties: { base_chips: 0, base_mult: 1, per_card_chips: 0, per_card_mult: 0.5 }
    },

    // Straight Types
    {
        name: 'Straight Pair Chips',
        categories: ['Angle', 'Straight', 'HandType', 'Chips'],
        description: 'Highest [Straight Pair] earns Cards + <$${base_chips}>',
        handType: { id: 'straight_pair_chips', name: 'Straight Pair', chips: 0, mult: 0, order: 8, chipCards: true },
        hooks: Hooks.straight_pair,
        properties: { base_chips: 40, base_mult: 1 }
    },
    {
        name: 'Straight Pair Mult',
        categories: ['Angle', 'Straight', 'HandType', 'Mult'],
        description: 'Highest [Straight Pair] earns {x${base_mult}}',
        handType: { id: 'straight_pair_mult', name: 'Straight Pair', chips: 0, mult: 0, order: 8.1, chipCards: true },
        hooks: Hooks.straight_pair,
        properties: { base_chips: 0, base_mult: 2 }
    },
    {
        name: 'Straight Triple Chips',
        categories: ['Angle', 'Straight', 'HandType', 'Chips'],
        description: 'Highest [Straight Triple] earns Cards + <$${base_chips}>',
        handType: { id: 'straight_triple_chips', name: 'Straight Triple', chips: 0, mult: 0, order: 9, chipCards: true },
        hooks: Hooks.straight_triple,
        properties: { base_chips: 60, base_mult: 1 }
    },
    {
        name: 'Straight Triple Mult',
        categories: ['Angle', 'Straight', 'HandType', 'Mult'],
        description: 'Highest [Straight Triple] earns {x${base_mult}}',
        handType: { id: 'straight_triple_mult', name: 'Straight Triple', chips: 0, mult: 0, order: 9.1, chipCards: true },
        hooks: Hooks.straight_triple,
        properties: { base_chips: 0, base_mult: 3 }
    },
    {
        name: 'Straight Run Chips',
        categories: ['Angle', 'Straight', 'HandType', 'Chips'],
        description: 'Longest [Straight Run] earns Cards + <$${per_card_chips} / additional card>',
        handType: { id: 'straight_run_chips', name: 'Straight Run', chips: 0, mult: 0, order: 10, chipCards: true },
        hooks: Hooks.straight_run,
        properties: { base_chips: 0, base_mult: 1, per_card_chips: 15, per_card_mult: 0 }
    },
    {
        name: 'Straight Run Mult',
        categories: ['Angle', 'Straight', 'HandType', 'Mult'],
        description: 'Longest [Straight Run] earns {x${per_card_mult} / additional card}',
        handType: { id: 'straight_run_mult', name: 'Straight Run', chips: 0, mult: 0, order: 10.1, chipCards: true },
        hooks: Hooks.straight_run,
        properties: { base_chips: 0, base_mult: 1, per_card_chips: 0, per_card_mult: 0.5 }
    },
    
    // Actions
    {
        name: 'Double Down',
        categories: ['Charm', 'Action'],
        description: 'Double Down earns {hand.score}',
        handType: { id: 'double_down', name: 'Double Down', chips: 0, mult: 1, order: 1.5 },
        hooks: Hooks.double_down_relic
    },
    
    // Charms
    {
        name: 'Old Receipt',
        categories: ['Charm', 'Suite', 'Diamonds'],
        description: '[Diamonds] earn an extra x${bonus_mult}',
        properties: { bonus_mult: 3 },
        hooks: Hooks.old_receipt_diamonds
    },
    {
        name: 'Lucky Rock',
        categories: ['Charm', 'Suite', 'Hearts'],
        description: '[Hearts] earn an extra x${bonus_mult}',
        properties: { bonus_mult: 3 },
        hooks: Hooks.lucky_rock_hearts
    },
    {
        name: 'Burnt Match',
        categories: ['Charm', 'Suite', 'Clubs'],
        description: '[Clubs] earn an extra x${bonus_mult}',
        properties: { bonus_mult: 3 },
        hooks: Hooks.burnt_match_clubs
    },
    {
        name: 'Lost Key',
        categories: ['Charm', 'Suite', 'Spades'],
        description: '[Spades] earn an extra x${bonus_mult}',
        properties: { bonus_mult: 3 },
        hooks: Hooks.lost_key_spades
    },
    {
        name: 'Pocket Rock',
        categories: ['charm', 'Hands'],
        description: 'Hands with a single card earn an extra $${bonus_chips}',
        properties: { bonus_chips: 100 },
        hooks: Hooks.pocket_rock_single_card
    },
    {
        name: 'Feather',
        categories: ['charm', 'Hands'],
        description: 'When all hands have the same number of cards, earn an extra $${bonus_chips}',
        properties: { bonus_chips: 200 },
        hooks: Hooks.feather_same_hand_size
    },
    {
        name: 'Odd Sock',
        categories: ['Charm', 'Hands'],
        description: 'When all hands have two cards, earn an extra $${bonus_chips}',
        properties: { bonus_chips: 200 },
        hooks: Hooks.odd_sock_two_cards
    },
    {
        name: 'Star Bead',
        categories: ['Charm', 'Specific'],
        description: 'Each [9] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 9 },
        hooks: Hooks.star_bead_nines
    },
    {
        name: 'Heart Button',
        categories: ['Charm', 'Specific'],
        description: 'Each [10] and [4] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 6 },
        hooks: Hooks.heart_button_ten_four
    },
    {
        name: 'Lucky Acorn',
        categories: ['Charm', 'Specific'],
        description: 'Each [King] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 10 },
        hooks: Hooks.lucky_acorn_kings
    },
    {
        name: 'Faded Tag',
        categories: ['Charm', 'Global'],
        description: 'Earn an extra x${amount}, but decays by x2 each round',
        properties: { amount: 10 },
        hooks: Hooks.faded_tag_bonus
    },
    {
        name: 'Mini Shoe',
        categories: ['Charm', 'Global'],
        description: 'Earn an extra $${bonus_chips}',
        properties: { bonus_chips: 250 },
        hooks: Hooks.mini_shoe_bonus_chips
    },
    {
        name: 'Robe and Slippers Set',
        categories: ['Charm', 'Global'],
        description: 'Earn an extra x${bonus_mult}',
        properties: { bonus_mult: 10 },
        hooks: Hooks.robe_slippers_bonus_mult
    },
    {
        name: 'Key Ring',
        categories: ['Charm', 'Global'],
        description: 'On final draw, earn x${bonus_mult}',
        properties: { bonus_mult: 3 },
        hooks: Hooks.key_ring_final_draw
    },
    {
        name: 'Deft',
        categories: ['Charm', 'Global'],
        description: 'Extra draw per Casino',
        properties: { extra_draws: 1 },
        hooks: Hooks.deft_extra_draw
    },
    {
        name: 'Joker',
        categories: ['Charm', 'Global'],
        description: '[Jacks] are worth 10 or 5',
        hooks: Hooks.joker_adjust_bj
    },
    {
        name: 'Idiot',
        categories: ['Charm', 'Charm'],
        description: 'Dealer hits on ${stop_value}',
        properties: { stop_value: 16 },
        hooks: Hooks.idiot_dealer_stop
    },
    {
        name: 'One Armed',
        categories: ['Charm', 'Global'],
        description: 'Winning a single hand earns x${factor}',
        properties: { factor: 2 },
        hooks: Hooks.one_armed_win_bonus
    },
    {
        name: 'High Roller',
        categories: ['Charm', 'Global'],
        description: 'Winning all three hands earns $${amount}',
        properties: { amount: 10 },
        hooks: Hooks.high_roller_win_all
    },
    

    {
        name: 'Royalty',
        categories: ['Charm', 'JMarr'],
        description: 'Hands with two [Face] cards earn $${amount}',
        properties: { amount: 10 },
        hooks: Hooks.royalty_face_cards
    },
    {
        name: 'Flusher',
        categories: ['JMarr'],
        description: '[Flushes] earn an extra x${bonus_mult}',
        properties: { bonus_mult: 1 },
        hooks: Hooks.flusher_bonus
    }
];
