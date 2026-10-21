
import type { RelicDefinition } from './types';
import { Hooks } from './hooks';

export const RELIC_DEFINITIONS: RelicDefinition[] = [
    // Actions
    {
        name: 'Double Down',
        rarity: 'Rare',
        categories: ['Relic', 'Action'],
        description: 'Draw one card and hold the hand.\nDouble Down earns {hand.score}\nThree uses; refills every two rounds',
        handType: { id: 'double_down', name: 'Double Down', chips: 0, mult: 1, order: 1.5 },
        properties: { rounds_since_recharge: 0 },
        tableAction: {
            label: 'DOUBLE\nDOWN',
            accentColor: '#ff4444',
            maxCharges: 3,
            chargeCost: 1,
            recharge: 'rounds',
            prompt: 'Select hand to Double Down'
        },
        hooks: Hooks.double_down_relic,
        icon: '⏬'
    },
    {
        name: 'Surrender',
        rarity: 'Rare',
        categories: ['Relic', 'Action'],
        description: 'Surrender a hand to discard it\nThree uses; refills every two rounds',
        properties: { rounds_since_recharge: 0 },
        tableAction: {
            label: 'SURRENDER',
            accentColor: '#4d74ff',
            maxCharges: 3,
            chargeCost: 1,
            recharge: 'rounds',
            prompt: 'Select hand to Surrender'
        },
        icon: '🏳️'
    },
    {
        name: 'Discard',
        rarity: 'Rare',
        categories: ['Relic', 'Action'],
        description: 'Discard a card from any live hand\nOne use; refills every two rounds',
        properties: { rounds_since_recharge: 0 },
        tableAction: {
            label: 'DISCARD',
            accentColor: '#ff8a3d',
            maxCharges: 3,
            chargeCost: 3,
            recharge: 'rounds',
            prompt: 'Select card to Discard'
        },
        icon: '🗑️'
    },
    {
        name: 'Redraw',
        rarity: 'Rare',
        categories: ['Relic', 'Action'],
        description: 'Redraw a card from the draw area\nThree uses; refills every two rounds',
        properties: { rounds_since_recharge: 0 },
        tableAction: {
            label: 'REDRAW',
            accentColor: '#36a2ff',
            maxCharges: 3,
            chargeCost: 1,
            recharge: 'rounds',
            prompt: 'Select draw card to Redraw'
        },
        icon: '🔁'
    },
    {
        name: 'Hold',
        rarity: 'Rare',
        categories: ['Relic', 'Action'],
        description: 'Hold a drawn card for later placement\nOne use; refills every two rounds',
        properties: { rounds_since_recharge: 0 },
        tableAction: {
            label: 'HOLD',
            accentColor: '#35d49a',
            maxCharges: 1,
            chargeCost: 1,
            recharge: 'rounds',
            prompt: 'Select draw card to Hold',
            promptWhenHeld: 'Select hand for Held Card'
        },
        icon: '✋'
    },
    {
        name: 'Switch',
        rarity: 'Rare',
        categories: ['Relic', 'Action'],
        description: 'Swap a player card with the dealer face-up card\nOne use; refills every two rounds',
        properties: { rounds_since_recharge: 0 },
        tableAction: {
            label: 'SWITCH',
            accentColor: '#ff5d7d',
            maxCharges: 1,
            chargeCost: 1,
            recharge: 'rounds',
            prompt: 'Select player card to Switch'
        },
        icon: '🔀'
    },

    // Scoring effects

    // Cards
    {
        name: 'Star Bead',
        rarity: 'Uncommon',
        categories: ['Relic', 'Cards'],
        description: 'Each winning [9] earns x${bonus_mult}',
        properties: { bonus_mult: 0.1 },
        hooks: Hooks.star_bead_nines,
        icon: '⭐️'
    },
    {
        name: 'Heart Button',
        rarity: 'Uncommon',
        categories: ['Relic', 'Cards'],
        description: 'Each winning [10] or [4] earns x${bonus_mult}',
        properties: { bonus_mult: 0.05 },
        hooks: Hooks.heart_button_ten_four,
        icon: '🩷'
    },
    {
        name: 'Lucky Acorn',
        rarity: 'Uncommon',
        categories: ['Relic', 'Cards'],
        description: 'Each winning [King] earns x${bonus_mult}',
        properties: { bonus_mult: 0.1 },
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
        description: 'Earn an extra x${amount}, but decays by x${decay_amount} each round',
        properties: { amount: 0.25, decay_amount: 0.05 },
        hooks: Hooks.faded_tag_bonus,
        icon: '🏷️'
    },
    {
        name: 'Faded Bill',
        rarity: 'Common',
        categories: ['Relic', 'Global'],
        description: 'Earn an extra $${amount}, but decays by $${decay_amount} each round',
        properties: { amount: 50, decay_amount: 10 },
        hooks: Hooks.faded_bill_bonus,
        icon: '💵'
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
        name: 'Cozy Socks',
        rarity: 'Common',
        categories: ['Relic', 'Global'],
        description: 'Earn an extra x${bonus_mult}',
        properties: { bonus_mult: 0.05 },
        hooks: Hooks.robe_slippers_bonus_mult,
        icon: '🧦'
    },
    {
        name: 'Robe and Slippers Set',
        rarity: 'Uncommon',
        categories: ['Relic', 'Global'],
        description: 'Earn an extra x${bonus_mult}',
        properties: { bonus_mult: 0.1 },
        hooks: Hooks.robe_slippers_bonus_mult,
        icon: '👘'
    },
    // Meta
    {
        name: 'Photocopier',
        rarity: 'Rare',
        categories: ['Relic', 'Meta', 'New'],
        description: 'Draw +{extra_draws} card every other draw',
        properties: { extra_draws: 1, draws_taken: 0 },
        hooks: Hooks.cloning_machine_draw,
        icon: '📠'
    },
    {
        name: 'Second Chance',
        rarity: 'Rare',
        categories: ['Relic', 'Meta', 'New'],
        description: 'If you Bust, next draw is +{extra_draw} card',
        properties: { extra_draw: 1, pending_bonus: false },
        hooks: Hooks.redemption_bust_bonus,
        icon: '♻️'
    },
    {
        name: 'Safety Net',
        rarity: 'Uncommon',
        categories: ['Relic', 'Meta', 'New'],
        description: 'First hand of 20 is discarded and [Wins] earn x${bonus_mult}',
        properties: { bonus_mult: 0.05, armed: false },
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
