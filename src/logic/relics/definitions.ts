
import type { RelicDefinition } from './types';
import { Hooks } from './hooks';

export const RELIC_DEFINITIONS: RelicDefinition[] = [
    // Actions
    {
        name: 'Double Down',
        rarity: 'Rare',
        categories: ['Relic', 'Action'],
        description: 'Draw one card and hold the hand.\nDouble Down earns {hand.score}',
        handType: { id: 'double_down', name: 'Double Down', chips: 0, mult: 1, order: 1.5 },
        tableAction: {
            label: 'DOUBLE\nDOWN',
            accentColor: '#ff4444',
            maxCharges: 3,
            chargeCost: 1,
            recharge: 'bust_or_loss',
            prompt: 'Select hand to Double Down'
        },
        hooks: Hooks.double_down_relic,
        icon: '⏬'
    },
    {
        name: 'Surrender',
        rarity: 'Rare',
        categories: ['Relic', 'Action'],
        description: 'Surrender a hand to discard it',
        tableAction: {
            label: 'SURRENDER',
            accentColor: '#4d74ff',
            maxCharges: 3,
            chargeCost: 1,
            recharge: 'casino',
            prompt: 'Select hand to Surrender'
        },
        icon: '🏳️'
    },
    {
        name: 'Discard',
        rarity: 'Rare',
        categories: ['Relic', 'Action'],
        description: 'Discard a card from any live hand\nCharges on busts and losses. Costs 3 charges.',
        tableAction: {
            label: 'DISCARD',
            accentColor: '#ff8a3d',
            maxCharges: 3,
            chargeCost: 3,
            recharge: 'bust_or_loss',
            prompt: 'Select card to Discard'
        },
        icon: '🗑️'
    },
    {
        name: 'Redraw',
        rarity: 'Rare',
        categories: ['Relic', 'Action'],
        description: 'Redraw a card from the draw area\nThree uses; refills every four deals',
        tableAction: {
            label: 'REDRAW',
            accentColor: '#36a2ff',
            maxCharges: 3,
            chargeCost: 1,
            recharge: 'casino',
            prompt: 'Select draw card to Redraw'
        },
        icon: '🔁'
    },
    {
        name: 'Hold',
        rarity: 'Rare',
        categories: ['Relic', 'Action'],
        description: 'Hold a drawn card for later placement\nOne use; refills every four deals',
        tableAction: {
            label: 'HOLD',
            accentColor: '#35d49a',
            maxCharges: 1,
            chargeCost: 1,
            recharge: 'casino',
            prompt: 'Select draw card to Hold',
            promptWhenHeld: 'Select hand for Held Card'
        },
        icon: '✋'
    },
    {
        name: 'Switch',
        rarity: 'Rare',
        categories: ['Relic', 'Action'],
        description: 'Swap a player card with the dealer face-up card\nOne use; refills every four deals',
        tableAction: {
            label: 'SWITCH',
            accentColor: '#ff5d7d',
            maxCharges: 1,
            chargeCost: 1,
            recharge: 'casino',
            prompt: 'Select player card to Switch'
        },
        icon: '🔀'
    },

    // Scoring effects

    // Flushes
    {
        name: 'Flusher',
        rarity: 'Uncommon',
        categories: ['Relic', 'Flush', 'New'],
        description: 'Having only one [Flush] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 0.5 },
        hooks: Hooks.flusher_bonus,
        icon: '🚽'
    },
    {
        name: 'Soap',
        rarity: 'Common',
        categories: ['Relic', 'Flush', 'New'],
        description: 'Each [Flush] earns an extra $${bonus_chips}',
        properties: { bonus_chips: 10 },
        hooks: Hooks.flusher_chips,
        icon: '🧼'
    },
    // Rank
    {
        name: 'Badge',
        rarity: 'Uncommon',
        categories: ['Relic', 'Rank', 'New'],
        description: 'Having only one [Pair] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 1 },
        hooks: Hooks.rank_mult,
        icon: '📛'
    },
    {
        name: 'Medal',
        rarity: 'Common',
        categories: ['Relic', 'Rank', 'New'],
        description: 'Each [Pair] earns an extra $${bonus_chips}',
        properties: { bonus_chips: 30 },
        hooks: Hooks.rank_chips,
        icon: '🏅'
    },
    // Straight
    {
        name: 'Ruler',
        rarity: 'Uncommon',
        categories: ['Relic', 'Straight', 'New'],
        description: 'Having only one [Straight] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 0.5 },
        hooks: Hooks.straight_mult,
        icon: '📏'

    },
    {
        name: 'Protractor',
        rarity: 'Common',
        categories: ['Relic', 'Straight', 'New'],
        description: 'Each [Straight] earns an extra $${bonus_chips}',
        properties: { bonus_chips: 15 },
        hooks: Hooks.straight_chips,
        icon: '📐'
    },
    // Suits
    {
        name: 'Old Receipt',
        rarity: 'Common',
        categories: ['Relic', 'Suite', 'Diamonds', 'New'],
        description: 'Each [Diamond] in winning hands earn $${bonus_chips}',
        properties: { bonus_chips: 5 },
        hooks: Hooks.old_receipt_diamonds,
        icon: '🧾'
    },
    {
        name: 'Lucky Rock',
        rarity: 'Common',
        categories: ['Relic', 'Suite', 'Hearts', 'New'],
        description: 'Each [Hearts] in winning hands earn $${bonus_chips}',
        properties: { bonus_chips: 5 },
        hooks: Hooks.lucky_rock_hearts,
        icon: '🪨'
    },
    {
        name: 'Burnt Match',
        rarity: 'Common',
        categories: ['Relic', 'Suite', 'Clubs', 'New'],
        description: 'Each [Club] in winning hands earn $${bonus_chips}',
        properties: { bonus_chips: 5 },
        hooks: Hooks.burnt_match_clubs,
        icon: '🧨'
    },
    {
        name: 'Lost Key',
        rarity: 'Common',
        categories: ['Relic', 'Suite', 'Spades', 'New'],
        description: 'Each [Spade] in winning hands earn $${bonus_chips}',
        properties: { bonus_chips: 5 },
        hooks: Hooks.lost_key_spades,
        icon: '🔑'
    },
    // Cards
    {
        name: 'Star Bead',
        rarity: 'Uncommon',
        categories: ['Relic', 'Cards'],
        description: 'Each [9] in winning hands earn x${bonus_mult}',
        properties: { bonus_mult: 1 },
        hooks: Hooks.star_bead_nines,
        icon: '⭐️'
    },
    {
        name: 'Heart Button',
        rarity: 'Uncommon',
        categories: ['Relic', 'Cards'],
        description: 'Each [10] and [4] in winning hands earn x${bonus_mult}',
        properties: { bonus_mult: 0.5 },
        hooks: Hooks.heart_button_ten_four,
        icon: '🩷'
    },
    {
        name: 'Lucky Acorn',
        rarity: 'Uncommon',
        categories: ['Relic', 'Cards'],
        description: 'Each [King] in winning hands earn x${bonus_mult}',
        properties: { bonus_mult: 1},
        hooks: Hooks.lucky_acorn_kings,
        icon: '🌰'
    },
    {
        name: 'Joker',
        rarity: 'Rare',
        categories: ['Relic', 'Cards', 'New'],
        description: '[Jacks] are worth 11, 10, 5, or 1',
        hooks: Hooks.joker_adjust_bj,
        icon: '🃏'
    },
    // Hands
    {
        name: 'Feather',
        rarity: 'Common',
        categories: ['Relic', 'Hands', 'New'],
        description: 'When all hands have the same number of cards, earn $${bonus_chips}',
        properties: { bonus_chips: 100 },
        hooks: Hooks.feather_same_hand_size,
        icon: '🪶'
    },
    {
        name: 'Odd Sock',
        rarity: 'Common',
        categories: ['Relic', 'Hands', 'New'],
        description: 'When all hands have two cards, earn $${bonus_chips}',
        properties: { bonus_chips: 100 },
        hooks: Hooks.odd_sock_two_cards,
        icon: '🧦'
    },
    {
        name: 'High Roller',
        rarity: 'Common',
        categories: ['Relic', 'Hands', 'New'],
        description: 'Winning all three hands earns $${amount}',
        properties: { amount: 100 },
        hooks: Hooks.high_roller_win_all,
        icon: '🎩'
    },
    {
        name: 'One Armed',
        rarity: 'Uncommon',
        categories: ['Relic', 'Hands', 'New'],
        description: 'Winning a single hand earns x${factor}',
        properties: { factor: 2 },
        hooks: Hooks.one_armed_win_bonus,
        icon: '🎰'
    },
    {
        name: 'Royalty',
        rarity: 'Common',
        categories: ['Relic', 'Hands'],
        description: 'Hands with two [Face] cards earn $${amount}',
        properties: { amount: 25 },
        hooks: Hooks.royalty_face_cards,
        icon: '👑'
    },
    // Dealer
    {
        name: 'Idiot',
        rarity: 'Uncommon',
        categories: ['Relic', 'Dealer', 'New'],
        description: 'Dealer hits on ${stop_value}',
        properties: { stop_value: 16 },
        hooks: Hooks.idiot_dealer_stop,
        icon: '🤡'
    },
    // Global
    {
        name: 'Faded Tag',
        rarity: 'Uncommon',
        categories: ['Relic', 'Global'],
        description: 'Earn an extra x${amount}, but decreases by x${decay_amount} each round',
        properties: { amount: 4, decay_amount: 0.5 },
        hooks: Hooks.faded_tag_bonus,
        icon: '🏷️'
    },
    {
        name: 'Mini Shoe',
        rarity: 'Common',
        categories: ['Relic', 'Global', 'New'],
        description: 'Earn an extra $${bonus_chips}',
        properties: { bonus_chips: 20 },
        hooks: Hooks.mini_shoe_bonus_chips,
        icon: '👞'
    },
    {
        name: 'Robe and Slippers Set',
        rarity: 'Uncommon',
        categories: ['Relic', 'Global'],
        description: 'Earn an extra x${bonus_mult}',
        properties: { bonus_mult: 0.5 },
        hooks: Hooks.robe_slippers_bonus_mult,
        icon: '👘'
    },
    {
        name: 'Key Ring',
        rarity: 'Common',
        categories: ['Relic', 'Global', 'New'],
        description: 'With no tickets left, earn x${bonus_mult}',
        properties: { bonus_mult: 2 },
        hooks: Hooks.key_ring_final_draw,
        icon: '🗝️'
    },
    // Meta
    {
        name: 'Deft',
        rarity: 'Rare',
        categories: ['Relic', 'Meta', 'New'],
        description: 'Gain {extra_draws} comp ticket every four deals',
        properties: { extra_draws: 1 },
        hooks: Hooks.deft_extra_draw,
        icon: '🤹'
    },
    {
        name: 'Photocopier',
        rarity: 'Rare',
        categories: ['Relic', 'Meta', 'New'],
        description: 'Draw +{extra_draws} card each time you draw',
        properties: { extra_draws: 1 },
        hooks: Hooks.cloning_machine_draw,
        icon: '📠'
    },
    {
        name: 'Second Chance',
        rarity: 'Rare',
        categories: ['Relic', 'Meta', 'New'],
        description: 'If you Bust, next draw is +{extra_draw} cards and place {extra_place} card',
        properties: { extra_draw: 2, extra_place: 1, pending_bonus: false, active_bonus: false },
        hooks: Hooks.redemption_bust_bonus,
        icon: '♻️'
    },
    {
        name: 'Safety Net',
        rarity: 'Uncommon',
        categories: ['Relic', 'Meta', 'New'],
        description: 'First hand of 20 is discarded and [Wins] earns $${bonus_chips}',
        properties: { bonus_chips: 20, armed: false },
        hooks: Hooks.safety_net_20,
        icon: '🕸️'
    },
    {
        name: 'Mulligan',
        rarity: 'Rare',
        categories: ['Relic', 'Meta', 'New'],
        description: 'Once per round, if you Bust, discard the last card',
        properties: { used_this_round: false },
        hooks: Hooks.mulligan_bust,
        icon: '⛳️'
    },
    {
        name: 'Spyglass',
        rarity: 'Common',
        categories: ['Relic', 'Meta'],
        description: 'The Dealer\'s hidden card is always revealed',
        hooks: Hooks.spyglass_always,
        icon: '🔭'
    }
];
