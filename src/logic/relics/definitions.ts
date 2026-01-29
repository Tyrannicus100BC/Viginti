
import type { RelicDefinition } from './types';
import { Hooks } from './hooks';

export const RELIC_DEFINITIONS: RelicDefinition[] = [
    // Angles

    {
        name: 'Viginti',
        categories: ['Angle', 'Win', 'HandType'],
        description: 'Winning hands earn {win.score}\nExactly 21 earn {viginti.score}',
        handType: { id: 'viginti', name: 'Viginti', chips: 50, mult: 1, order: 0 },
        extraHandTypes: {
            'win': { id: 'win', name: 'Win', chips: 10, mult: 1, order: 1 },
            'viginti': { id: 'viginti', name: 'Viginti', chips: 50, mult: 1, order: 0 }
        },
        hooks: Hooks.viginti_relic,
        icon: '🏛️'
    },
    // Rank Types
    {
        name: 'Rank Pair Chips',
        categories: ['Angle', 'Rank', 'HandType', 'Chips'],
        description: 'Highest [Rank Pair] earns {hand.score}',
        handType: { id: 'rank_pair_chips', name: 'Rank Pair', chips: 40, mult: 1, order: 2, chipCards: true },
        hooks: Hooks.rank_pair,
        icon: '/relics/angle_rank_pair_chips.png'

    },
    {
        name: 'Rank Pair Mult',
        categories: ['Angle', 'Rank', 'HandType', 'Mult'],
        description: 'Highest [Rank Pair] earns {hand.score}',
        handType: { id: 'rank_pair_mult', name: 'Rank Pair', chips: 0, mult: 2, order: 2.1 },
        hooks: Hooks.rank_pair,
        icon: '/relics/angle_rank_pair_mult.png'

    },
    {
        name: 'Rank Triple Chips',
        categories: ['Angle', 'Rank', 'HandType', 'Chips'],
        description: 'Highest [Rank Triple] earns {hand.score}',
        handType: { id: 'rank_triple_chips', name: 'Rank Triple', chips: 60, mult: 0, order: 3 },
        hooks: Hooks.rank_triple,
        icon: '/relics/angle_rank_triple_chips.png'

    },
    {
        name: 'Rank Triple Mult',
        categories: ['Angle', 'Rank', 'HandType', 'Mult'],
        description: 'Highest [Rank Triple] earns {hand.score}',
        handType: { id: 'rank_triple_mult', name: 'Rank Triple', chips: 0, mult: 3, order: 3.1 },
        hooks: Hooks.rank_triple,
        icon: '/relics/angle_rank_triple_mult.png'

    },
    {
        name: 'Rank Run Chips',
        categories: ['Angle', 'Rank', 'HandType', 'Chips'],
        description: 'Longest [Rank Run] earns {hand.score}',
        handType: { id: 'rank_run_chips', name: 'Rank Run', chips: 0, mult: 0, order: 4, chipCards: true, chipRun: 15 },
        hooks: Hooks.rank_run,
        icon: '/relics/angle_rank_run_chips.png'

    },
    {
        name: 'Rank Run Mult',
        categories: ['Angle', 'Rank', 'HandType', 'Mult'],
        description: 'Longest [Rank Run] earns {hand.score}',
        handType: { id: 'rank_run_mult', name: 'Rank Run', chips: 0, mult: 0, order: 4.1, multRun: 0.5 },
        hooks: Hooks.rank_run,
        icon: '/relics/angle_rank_run_mult.png'

    },
    // Flush Types
    {
        name: 'Flush Pair Chips',
        categories: ['Angle', 'Flush', 'HandType', 'Chips'],
        description: 'Highest [Flush Pair] earns {hand.score}',
        handType: { id: 'flush_pair_chips', name: 'Flush Pair', chips: 40, mult: 0, order: 5, chipCards: true },
        hooks: Hooks.flush_pair,
        icon: '/relics/angle_flush_pair_chips.png'

    },
    {
        name: 'Flush Pair Mult',
        categories: ['Angle', 'Flush', 'HandType', 'Mult'],
        description: 'Highest [Flush Pair] earns {hand.score}',
        handType: { id: 'flush_pair_mult', name: 'Flush Pair', chips: 0, mult: 2, order: 5.1 },
        hooks: Hooks.flush_pair,
        icon: '/relics/angle_flush_pair_mult.png'

    },
    {
        name: 'Flush Triple Chips',
        categories: ['Angle', 'Flush', 'HandType', 'Chips'],
        description: 'Highest [Flush Triple] earns {hand.score}',
        handType: { id: 'flush_triple_chips', name: 'Flush Triple', chips: 60, mult: 0, order: 6, chipCards: true },
        hooks: Hooks.flush_triple,
        icon: '/relics/angle_flush_triple_chips.png'

    },
    {
        name: 'Flush Triple Mult',
        categories: ['Angle', 'Flush', 'HandType', 'Mult'],
        description: 'Highest [Flush Triple] earns {hand.score}',
        handType: { id: 'flush_triple_mult', name: 'Flush Triple', chips: 0, mult: 3, order: 6.1 },
        hooks: Hooks.flush_triple,
        icon: '/relics/angle_flush_triple_mult.png'

    },
    {
        name: 'Flush Run Chips',
        categories: ['Angle', 'Flush', 'HandType', 'Chips'],
        description: 'Longest [Flush Run] earns {hand.score}',
        handType: { id: 'flush_run_chips', name: 'Flush Run', chips: 0, mult: 0, order: 7, chipCards: true, chipRun: 15 },
        hooks: Hooks.flush_run,
        icon: '/relics/angle_flush_run_chips.png'

    },
    {
        name: 'Flush Run Mult',
        categories: ['Angle', 'Flush', 'HandType', 'Mult'],
        description: 'Longest [Flush Run] earns {hand.score}',
        handType: { id: 'flush_run_mult', name: 'Flush Run', chips: 0, mult: 0, order: 7.1, multRun: 0.5 },
        hooks: Hooks.flush_run,
        icon: '/relics/angle_flush_run_mult.png'

    },
    // Straight Types
    {
        name: 'Straight Pair Chips',
        categories: ['Angle', 'Straight', 'HandType', 'Chips'],
        description: 'Highest [Straight Pair] earns {hand.score}',
        handType: { id: 'straight_pair_chips', name: 'Straight Pair', chips: 40, mult: 0, order: 8, chipCards: true },
        hooks: Hooks.straight_pair,
        icon: '/relics/angle_straight_pair_chips.png'

    },
    {
        name: 'Straight Pair Mult',
        categories: ['Angle', 'Straight', 'HandType', 'Mult'],
        description: 'Highest [Straight Pair] earns {hand.score}',
        handType: { id: 'straight_pair_mult', name: 'Straight Pair', chips: 0, mult: 2, order: 8.1 },
        hooks: Hooks.straight_pair,
        icon: '/relics/angle_straight_pair_mult.png'

    },
    {
        name: 'Straight Triple Chips',
        categories: ['Angle', 'Straight', 'HandType', 'Chips'],
        description: 'Highest [Straight Triple] earns {hand.score}',
        handType: { id: 'straight_triple_chips', name: 'Straight Triple', chips: 60, mult: 0, order: 9, chipCards: true },
        hooks: Hooks.straight_triple,
        icon: '/relics/angle_straight_triple_chips.png'

    },
    {
        name: 'Straight Triple Mult',
        categories: ['Angle', 'Straight', 'HandType', 'Mult'],
        description: 'Highest [Straight Triple] earns {hand.score}',
        handType: { id: 'straight_triple_mult', name: 'Straight Triple', chips: 0, mult: 3, order: 9.1 },
        hooks: Hooks.straight_triple,
        icon: '/relics/angle_straight_triple_mult.png'

    },
    {
        name: 'Straight Run Chips',
        categories: ['Angle', 'Straight', 'HandType', 'Chips'],
        description: 'Longest [Straight Run] earns {hand.score}',
        handType: { id: 'straight_run_chips', name: 'Straight Run', chips: 0, mult: 0, order: 10, chipCards: true, chipRun: 15 },
        hooks: Hooks.straight_run,
        icon: '/relics/angle_straight_run_chips.png'

    },
    {
        name: 'Straight Run Mult',
        categories: ['Angle', 'Straight', 'HandType', 'Mult'],
        description: 'Longest [Straight Run] earns {hand.score}',
        handType: { id: 'straight_run_mult', name: 'Straight Run', chips: 0, mult: 0, order: 10.1, multRun: 0.5 },
        hooks: Hooks.straight_run,
        icon: '/relics/angle_straight_run_mult.png'

    },
    // Actions
    {
        name: 'Double Down',
        categories: ['Charm', 'Action'],
        description: 'Double Down earns {hand.score}',
        handType: { id: 'double_down', name: 'Double Down', chips: 0, mult: 1, order: 1.5 },
        hooks: Hooks.double_down_relic,
        icon: '⏬'
    },
    {
        name: 'Surrender',
        categories: ['Charm', 'Action'],
        description: 'Surrender a hand to discard it',
        icon: '🏳️'
    },

    // Charms

    // Flushes
    {
        name: 'Flusher',
        categories: ['Charm', 'Flush'],
        description: '[Flushes] earn an extra x${bonus_mult}',
        properties: { bonus_mult: 0.5 },
        hooks: Hooks.flusher_bonus,
        icon: '🚽'
    },
    {
        name: 'Soap',
        categories: ['Charm', 'Flush'],
        description: '[Flushes] earn an extra $${bonus_chips}',
        properties: { bonus_chips: 15 },
        hooks: Hooks.flusher_chips,
        icon: '🧼'
    },
    // Rank
    {
        name: 'Badge',
        categories: ['Charm', 'Rank'],
        description: '[Rank] hands earn an extra x${bonus_mult}',
        properties: { bonus_mult: 0.5 },
        hooks: Hooks.rank_mult,
        icon: '📛'
    },
    {
        name: 'Medal',
        categories: ['Charm', 'Rank'],
        description: '[Rank] hands earn an extra $${bonus_chips}',
        properties: { bonus_chips: 15 },
        hooks: Hooks.rank_chips,
        icon: '🏅'
    },
    // Straight
    {
        name: 'Ruler',
        categories: ['Charm', 'Straight'],
        description: '[Straights] earn an extra x${bonus_mult}',
        properties: { bonus_mult: 0.5 },
        hooks: Hooks.straight_mult,
        icon: '📏'

    },
    {
        name: 'Protractor',
        categories: ['Charm', 'Straight'],
        description: '[Straights] earn an extra $${bonus_chips}',
        properties: { bonus_chips: 15 },
        hooks: Hooks.straight_chips,
        icon: '📐'
    },
    // Suits
    {
        name: 'Old Receipt',
        categories: ['Charm', 'Suite', 'Diamonds'],
        description: 'Each [Diamond] earns $${bonus_chips} when scored',
        properties: { bonus_chips: 5 },
        hooks: Hooks.old_receipt_diamonds,
        icon: '🧾'
    },
    {
        name: 'Lucky Rock',
        categories: ['Charm', 'Suite', 'Hearts'],
        description: 'Each [Hearts] earns $${bonus_chips} when scored',
        properties: { bonus_chips: 5 },
        hooks: Hooks.lucky_rock_hearts,
        icon: '🪨'
    },
    {
        name: 'Burnt Match',
        categories: ['Charm', 'Suite', 'Clubs'],
        description: 'Each [Club] earns $${bonus_chips} when scored',
        properties: { bonus_chips: 5 },
        hooks: Hooks.burnt_match_clubs,
        icon: '🧨'
    },
    {
        name: 'Lost Key',
        categories: ['Charm', 'Suite', 'Spades'],
        description: 'Each [Spade] earns $${bonus_chips} when scored',
        properties: { bonus_chips: 5 },
        hooks: Hooks.lost_key_spades,
        icon: '🔑'
    },
    // Cards
    {
        name: 'Star Bead',
        categories: ['Charm', 'Cards'],
        description: 'Each [9] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 0.5 },
        hooks: Hooks.star_bead_nines,
        icon: '⭐️'
    },
    {
        name: 'Heart Button',
        categories: ['Charm', 'Cards'],
        description: 'Each [10] and [4] earn an extra x${bonus_mult}',
        properties: { bonus_mult: 0.5 },
        hooks: Hooks.heart_button_ten_four,
        icon: '🩷'
    },
    {
        name: 'Lucky Acorn',
        categories: ['Charm', 'Cards'],
        description: 'Each [King] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 0.5 },
        hooks: Hooks.lucky_acorn_kings,
        icon: '🌰'
    },
    {
        name: 'Joker',
        categories: ['Charm', 'Cards'],
        description: '[Jacks] are worth 10 or 5 to win',
        hooks: Hooks.joker_adjust_bj,
        icon: '🃏'
    },
    // Hands
    {
        name: 'Feather',
        categories: ['charm', 'Hands'],
        description: 'When all hands have the same number of cards, earn $${bonus_chips}',
        properties: { bonus_chips: 200 },
        hooks: Hooks.feather_same_hand_size,
        icon: '🪶'
    },
    {
        name: 'Odd Sock',
        categories: ['Charm', 'Hands'],
        description: 'When all hands have two cards, earn $${bonus_chips}',
        properties: { bonus_chips: 200 },
        hooks: Hooks.odd_sock_two_cards,
        icon: '🧦'
    },
    {
        name: 'High Roller',
        categories: ['Charm', 'Hands'],
        description: 'Winning all three hands earns $${amount}',
        properties: { amount: 10 },
        hooks: Hooks.high_roller_win_all,
        icon: '🎩'
    },
    {
        name: 'One Armed',
        categories: ['Charm', 'Hands'],
        description: 'Winning a single hand earns x${factor}',
        properties: { factor: 2 },
        hooks: Hooks.one_armed_win_bonus,
        icon: '🎰'
    },
    {
        name: 'Royalty',
        categories: ['Charm', 'Hands'],
        description: 'Hands with two [Face] cards earn $${amount}',
        properties: { amount: 10 },
        hooks: Hooks.royalty_face_cards,
        icon: '👑'
    },
    // Dealer
    {
        name: 'Idiot',
        categories: ['Charm', 'Dealer'],
        description: 'Dealer hits on ${stop_value}',
        properties: { stop_value: 16 },
        hooks: Hooks.idiot_dealer_stop,
        icon: '🤡'
    },
    // Global
    {
        name: 'Faded Tag',
        categories: ['Charm', 'Global'],
        description: 'Earn an extra x${amount}, but decays by x2 each round',
        properties: { amount: 10 },
        hooks: Hooks.faded_tag_bonus,
        icon: '🏷️'
    },
    {
        name: 'Mini Shoe',
        categories: ['Charm', 'Global'],
        description: 'Earn an extra $${bonus_chips}',
        properties: { bonus_chips: 20 },
        hooks: Hooks.mini_shoe_bonus_chips,
        icon: '👞'
    },
    {
        name: 'Robe and Slippers Set',
        categories: ['Charm', 'Global'],
        description: 'Earn an extra x${bonus_mult}',
        properties: { bonus_mult: 0.5 },
        hooks: Hooks.robe_slippers_bonus_mult,
        icon: '👘'
    },
    {
        name: 'Key Ring',
        categories: ['Charm', 'Global'],
        description: 'On final draw, earn x${bonus_mult}',
        properties: { bonus_mult: 0.5 },
        hooks: Hooks.key_ring_final_draw,
        icon: '🗝️'
    },
    // Meta
    {
        name: 'Deft',
        categories: ['Charm', 'Meta'],
        description: 'Extra draw per Casino',
        properties: { extra_draws: 1 },
        hooks: Hooks.deft_extra_draw,
        icon: '🤹'
    },
    {
        name: 'Photocopier',
        categories: ['Charm', 'Meta'],
        description: 'Draw +{extra_draws} card each time you draw',
        properties: { extra_draws: 1 },
        hooks: Hooks.cloning_machine_draw,
        icon: '📠'
    },
    {
        name: 'Second Chance',
        categories: ['Charm', 'Meta'],
        description: 'If you Bust, next draw is +{extra_draw} cards and place {extra_place} card',
        properties: { extra_draw: 2, extra_place: 1, pending_bonus: false, active_bonus: false },
        hooks: Hooks.redemption_bust_bonus,
        icon: '♻️'
    },
    {
        name: 'Safety Net',
        categories: ['Charm', 'Meta'],
        description: 'First hand of 20 is discarded and [Wins] earns $${bonus_chips}',
        properties: { bonus_chips: 20, armed: false },
        hooks: Hooks.safety_net_20,
        icon: '🕸️'
    },
    {
        name: 'Mulligan',
        categories: ['Charm', 'Meta'],
        description: 'Once per round, if you Bust, discard the last card',
        properties: { used_this_round: false },
        hooks: Hooks.mulligan_bust,
        icon: '⛳️'
    },
    {
        name: 'Spyglass',
        categories: ['Charm', 'Meta'],
        description: 'If a hand reaches 13, reveal the Dealer\'s hidden card',
        properties: { used_this_round: false },
        hooks: Hooks.spyglass_13,
        icon: '🔭'
    }
];
