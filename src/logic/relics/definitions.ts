
import type { RelicDefinition } from './types';
import { Hooks } from './hooks';

export const RELIC_DEFINITIONS: RelicDefinition[] = [
    {
        name: 'Deft',
        categories: ['JMarr'],
        description: 'Extra draw per Casino',
        properties: { extra_draws: 1 },
        hooks: Hooks.deft_extra_draw
    },
    {
        name: 'Royalty',
        categories: ['JMarr'],
        description: 'Hands with two [Face] cards earn $${amount}',
        properties: { amount: 10 },
        hooks: Hooks.royalty_face_cards
    },
    {
        name: 'Joker',
        categories: ['JMarr'],
        description: '[Jacks] are worth 10 or 5',
        hooks: Hooks.joker_adjust_bj
    },
    {
        name: 'Idiot',
        categories: ['JMarr'],
        description: 'Dealer hits on ${stop_value}', 
        properties: { stop_value: 16 }, 
        hooks: Hooks.idiot_dealer_stop
    },
    {
        name: 'Flusher',
        categories: ['JMarr', 'Flush'],
        description: '[Flushes] earn an extra x${bonus_mult}',
        properties: { bonus_mult: 1 },
        hooks: Hooks.flusher_bonus
    },
    {
        name: 'One Armed',
        categories: ['JMarr'],
        description: 'Winning a single hand earns x${factor}',
        properties: { factor: 2 },
        hooks: Hooks.one_armed_win_bonus
    },
    {
        name: 'High Roller',
        categories: ['JMarr'],
        description: 'Winning all three hands earns $${amount}',
        properties: { amount: 10 },
        hooks: Hooks.high_roller_win_all
    },
    {
        name: 'Win',
        categories: ['Scoring', 'Win'],
        description: 'Winning a hand earns {hand.score}',
        handType: { id: 'win', name: 'Win', chips: 10, mult: 1, order: 1, includesCards: true },
        hooks: Hooks.win_relic
    },
    {
        name: 'Viginti',
        categories: ['Scoring', 'Win'], 
        description: 'Scoring exactly 21 earns {hand.score}',
        handType: { id: 'viginti', name: 'Viginti', chips: 50, mult: 1, order: 0, includesCards: true },
        hooks: Hooks.viginti_relic
    },
    {
        name: 'Double Down',
        categories: ['Scoring', 'Win'],
        description: 'Double Down earns {hand.score}',
        handType: { id: 'double_down', name: 'Double Down', chips: 0, mult: 1, order: 1.5, includesCards: true },
        hooks: Hooks.double_down_relic
    },
    {
        name: 'Pair',
        // Original ID: pair_sc
        id: 'pair_sc', 
        categories: ['Scoring', 'Pair'],
        description: 'Every [Pair] earns {hand.score}',
        handType: { id: 'pair', name: 'Pair', chips: 0, mult: 0.5, order: 2, includesCards: true },
        hooks: Hooks.every_pair
    },
    {
        name: 'Straight',
        // Original ID: straight_sc
        categories: ['Scoring', 'Straight'],
        description: 'Every [Straight] earns {hand.score}',
        handType: { id: 'straight', name: 'Straight', chips: 0, mult: 0.5, order: 3, includesCards: true },
        hooks: Hooks.every_straight
    },
    {
        name: 'Flush',
        // Original ID: flush_sc
        categories: ['Scoring', 'Flush'],
        description: 'Every [Flush] earns {hand.score}',
        handType: { id: 'flush', name: 'Flush', chips: 0, mult: 0.5, order: 4, includesCards: true },
        hooks: Hooks.every_flush
    },
    {
        name: 'Single Pair',
        categories: ['Scoring', 'Pair'],
        description: 'First [Pair] earns {hand.score}',
        handType: { id: 'pair', name: 'Pair', chips: 10, mult: 1, order: 5, includesCards: true },
        hooks: Hooks.single_pair
    },
    {
        name: 'Single Straight',
        categories: ['Scoring', 'Straight'],
        description: 'First [Straight] earns {hand.score}',
        handType: { id: 'straight', name: 'Straight', chips: 30, mult: 2, order: 6, includesCards: true },
        hooks: Hooks.single_straight
    },
    {
        name: 'Single Flush',
        categories: ['Scoring', 'Flush'],
        description: 'First [Flush] earns {hand.score}',
        handType: { id: 'flush', name: 'Flush', chips: 20, mult: 1.5, order: 7, includesCards: true },
        hooks: Hooks.single_flush
    },
    {
        name: 'Lucky Coin',
        categories: ['Face', 'Pair'],
        description: 'Having a [Pair] earns an extra $${bonus_chips}',
        properties: { bonus_chips: 50 },
        hooks: Hooks.lucky_coin_pair_chips
    },
    {
        name: 'Rabbit Foot',
        categories: ['Face', 'Pair'],
        description: 'Having a [Pair] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 8 },
        hooks: Hooks.rabbit_foot_pair_mult
    },
    {
        name: 'Bent Clip',
        categories: ['Face', 'Three of a Kind'],
        description: 'Hands with [Three of a Kind] earn x${bonus_mult}',
        properties: { bonus_mult: 3 },
        hooks: Hooks.bent_clip_three_kind
    },
    {
        name: 'Horseshoe',
        categories: ['Straight'],
        description: 'Having a [Straight] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 12 },
        hooks: Hooks.horseshoe_straight_mult
    },
    {
        name: 'Red String',
        categories: ['Straight'],
        description: 'Having a [Straight] earns an extra $${bonus_chips}',
        properties: { bonus_chips: 200 },
        hooks: Hooks.red_string_straight_chips
    },
    {
        name: 'Jade Charm',
        categories: ['Straight'],
        description: '[Straights] earn an extra x${bonus_mult}',
        properties: { bonus_mult: 3 },
        hooks: Hooks.jade_charm_straight_mult
    },
    {
        name: 'Wishbone',
        categories: ['Flush'],
        description: 'Having a [Flush] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 10 },
        hooks: Hooks.wishbone_flush_mult
    },
    {
        name: 'Ladybug',
        categories: ['Flush'],
        description: 'Having a [Flush] earns an extra $${bonus_chips}',
        properties: { bonus_chips: 250 },
        hooks: Hooks.ladybug_flush_chips
    },
    {
        name: 'Dice Pair',
        categories: ['Flush'],
        description: '[Flushes] earn an extra x${bonus_mult}',
        properties: { bonus_mult: 2 },
        hooks: Hooks.dice_pair_flush_mult
    },
    {
        name: 'Old Receipt',
        categories: ['Suite', 'Diamonds'],
        description: '[Diamonds] earn an extra x${bonus_mult}',
        properties: { bonus_mult: 3 },
        hooks: Hooks.old_receipt_diamonds
    },
    {
        name: 'Lucky Rock',
        categories: ['Suite', 'Hearts'],
        description: '[Hearts] earn an extra x${bonus_mult}',
        properties: { bonus_mult: 3 },
        hooks: Hooks.lucky_rock_hearts
    },
    {
        name: 'Burnt Match',
        categories: ['Suite', 'Clubs'],
        description: '[Clubs] earn an extra x${bonus_mult}',
        properties: { bonus_mult: 3 },
        hooks: Hooks.burnt_match_clubs
    },
    {
        name: 'Lost Key',
        categories: ['Suite', 'Spades'],
        description: '[Spades] earn an extra x${bonus_mult}',
        properties: { bonus_mult: 3 },
        hooks: Hooks.lost_key_spades
    },
    {
        name: 'Pocket Rock',
        categories: ['Hands'],
        description: 'Hands with a single card earn an extra $${bonus_chips}',
        properties: { bonus_chips: 100 },
        hooks: Hooks.pocket_rock_single_card
    },
    {
        name: 'Feather',
        categories: ['Hands'],
        description: 'When all hands have the same number of cards, earn an extra $${bonus_chips}',
        properties: { bonus_chips: 200 },
        hooks: Hooks.feather_same_hand_size
    },
    {
        name: 'Odd Sock',
        categories: ['Hands'],
        description: 'When all hands have two cards, earn an extra $${bonus_chips}',
        properties: { bonus_chips: 200 },
        hooks: Hooks.odd_sock_two_cards
    },
    {
        name: 'Star Bead',
        categories: ['Specific'],
        description: 'Each [9] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 9 },
        hooks: Hooks.star_bead_nines
    },
    {
        name: 'Heart Button',
        categories: ['Specific'],
        description: 'Each [10] and [4] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 6 },
        hooks: Hooks.heart_button_ten_four
    },
    {
        name: 'Lucky Acorn',
        categories: ['Specific'],
        description: 'Each [King] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 10 },
        hooks: Hooks.lucky_acorn_kings
    },
    {
        name: 'Faded Tag',
        categories: ['Global'],
        description: 'Earn an extra x${amount}, but decays by x2 each round',
        properties: { amount: 10 },
        hooks: Hooks.faded_tag_bonus
    },
    {
        name: 'Mini Shoe',
        categories: ['Global'],
        description: 'Earn an extra $${bonus_chips}',
        properties: { bonus_chips: 250 },
        hooks: Hooks.mini_shoe_bonus_chips
    },
    {
        name: 'Robe and Slippers Set',
        // Old ID: robe_slippers. Logic will generate 'robe_and_slippers_set'.
        categories: ['Global'],
        description: 'Earn an extra x${bonus_mult}',
        properties: { bonus_mult: 10 },
        hooks: Hooks.robe_slippers_bonus_mult
    },
    {
        name: 'Key Ring',
        categories: ['Global'],
        description: 'On final draw, earn x${bonus_mult}',
        properties: { bonus_mult: 3 },
        hooks: Hooks.key_ring_final_draw
    }
];
