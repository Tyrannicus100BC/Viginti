
import type { RelicDefinition } from './types';
import { Hooks } from './hooks';

export const RELIC_DEFINITIONS: RelicDefinition[] = [
    // HandTypes
    {
        name: 'Win',
        categories: ['HandType', 'Win', 'Angle'],
        description: 'Winning a hand earns {hand.score}',
        handType: { id: 'win', name: 'Win', chips: 10, mult: 1, order: 1 },
        hooks: Hooks.win_relic
    },
    {
        name: 'Viginti',
        categories: ['HandType', 'Win', 'Angle'],
        description: 'Scoring exactly 21 earns {hand.score}',
        handType: { id: 'viginti', name: 'Viginti', chips: 50, mult: 1, order: 0 },
        hooks: Hooks.viginti_relic
    },
    {
        name: 'Rank Pairs',
        categories: ['HandType', 'Angle'],
        description: 'Every [Rank Pair] earns {hand.score}',
        handType: { id: 'pair', name: 'Pair', chips: 0, mult: 0.5, order: 2, chipCards: true },
        hooks: Hooks.every_pair
    },
    {
        name: 'Straight Pairs',
        categories: ['HandType', 'Angle'],
        description: 'Every [Straight Pair] earns {hand.score}',
        handType: { id: 'straight', name: 'Straight', chips: 0, mult: 0.5, order: 3, chipCards: true },
        hooks: Hooks.every_straight
    },
    {
        name: 'Flush Pairs',
        categories: ['HandType', 'Angle'],
        description: 'Every [Flush Pair] earns {hand.score}',
        handType: { id: 'flush', name: 'Flush', chips: 0, mult: 0.5, order: 4, chipCards: true },
        hooks: Hooks.every_flush
    },
    {
        name: 'A Rank Pair',
        categories: ['HandType', 'Angle'],
        description: 'Highest [Rank Pair] earns {hand.score}',
        handType: { id: 'pair', name: 'Pair', chips: 10, mult: 1, order: 5, chipCards: true },
        hooks: Hooks.single_pair
    },
    {
        name: 'A Straight Pair',
        categories: ['HandType', 'Straight', 'Angle'],
        description: 'Highest [Straight] earns {hand.score}',
        handType: { id: 'straight', name: 'Straight', chips: 30, mult: 2, order: 6, chipCards: true },
        hooks: Hooks.single_straight
    },
    {
        name: 'Single Flush',
        categories: ['HandType', 'Flush', 'Angle'],
        description: 'First [Flush] earns {hand.score}',
        handType: { id: 'flush', name: 'Flush', chips: 20, mult: 1.5, order: 7, chipCards: true },
        hooks: Hooks.single_flush
    },
    {
        name: 'Three of a Kind',
        categories: ['HandType', 'Angle'],
        description: 'Hands with [Three of a Kind] earn {hand.score}',
        handType: { id: 'three_of_a_kind', name: 'Three of a Kind', chips: 60, mult: 1.5, order: 8, chipCards: true },
        hooks: Hooks.bent_clip_three_kind
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
    
    // Disabled
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
        name: 'Royalty',
        categories: ['JMarr'],
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
