
import type { RelicDefinition } from './types';
import { Hooks } from './hooks';

export const RELIC_DEFINITIONS: RelicDefinition[] = [
    // Angles

    {
        name: 'Viginti',
        rarity: 'Uncommon',
        categories: ['Angle', 'Win', 'HandType'],
        description: 'Winning hands earn {win.score}\nExactly 21 earn {viginti.score}',
        handType: { id: 'viginti', name: 'Viginti', chips: 25, mult: 0, order: 0 },
        extraHandTypes: {
            'win': { id: 'win', name: 'Win', chips: 10, mult: 0, order: 1 },
            'viginti': { id: 'viginti', name: 'Viginti', chips: 25, mult: 0, order: 0 }
        },
        hooks: Hooks.viginti_relic,
        icon: '🏛️'
    },
    {
        name: 'Standard',
        rarity: 'Uncommon',
        categories: ['Angle', 'HandType'],
        description: 'Each [Pair], [Flush], and [Straight] earn <Cards>',
        handType: { id: 'standard', name: 'Standard', chips: 0, mult: 1, order: 2 },
        extraHandTypes: {
            'pair': { id: 'pair', name: 'Pair', chips: 0, mult: 0, order: 1, chipCards: true },
            'flush': { id: 'flush', name: 'Flush', chips: 0, mult: 0, order: 1.1, chipCards: true },
            'straight': { id: 'straight', name: 'Straight', chips: 0, mult: 0, order: 1.2, chipCards: true }
        },
        hooks: Hooks.standard_relic,
        icon: '🎴'
    },
    // Rank Types
    {
        name: 'Rank Pair Chips',
        rarity: 'Uncommon',
        categories: ['Angle', 'Rank', 'HandType', 'Chips'],
        description: 'Highest [Rank Pair] earns {hand.score}',
        handType: { id: 'rank_pair_chips', name: 'Rank Pair', chips: 40, mult: 1, order: 2, chipCards: true },
        hooks: Hooks.rank_pair,
        icon: '/relics/angle_rank_pair_chips.png'

    },
    {
        name: 'Rank Pair Mult',
        rarity: 'Uncommon',
        categories: ['Angle', 'Rank', 'HandType', 'Mult'],
        description: 'Highest [Rank Pair] earns {hand.score}',
        handType: { id: 'rank_pair_mult', name: 'Rank Pair', chips: 0, mult: 2, order: 2.1 },
        hooks: Hooks.rank_pair,
        icon: '/relics/angle_rank_pair_mult.png'

    },
    {
        name: 'Rank Triple Chips',
        rarity: 'Uncommon',
        categories: ['Angle', 'Rank', 'HandType', 'Chips', 'Triple'],
        description: 'Highest [Rank Triple] earns {hand.score}',
        handType: { id: 'rank_triple_chips', name: 'Rank Triple', chips: 60, mult: 0, order: 3 },
        hooks: Hooks.rank_triple,
        icon: '/relics/angle_rank_triple_chips.png'

    },
    {
        name: 'Rank Triple Mult',
        rarity: 'Uncommon',
        categories: ['Angle', 'Rank', 'HandType', 'Mult', 'Triple'],
        description: 'Highest [Rank Triple] earns {hand.score}',
        handType: { id: 'rank_triple_mult', name: 'Rank Triple', chips: 0, mult: 3, order: 3.1 },
        hooks: Hooks.rank_triple,
        icon: '/relics/angle_rank_triple_mult.png'

    },
    {
        name: 'Rank Run Chips',
        rarity: 'Uncommon',
        categories: ['Angle', 'Rank', 'HandType', 'Chips'],
        description: 'Longest [Rank Run] earns {hand.score}',
        handType: { id: 'rank_run_chips', name: 'Rank Run', chips: 0, mult: 0, order: 4, chipCards: true, chipRun: 15 },
        hooks: Hooks.rank_run,
        icon: '/relics/angle_rank_run_chips.png'

    },
    {
        name: 'Rank Run Mult',
        rarity: 'Uncommon',
        categories: ['Angle', 'Rank', 'HandType', 'Mult'],
        description: 'Longest [Rank Run] earns {hand.score}',
        handType: { id: 'rank_run_mult', name: 'Rank Run', chips: 0, mult: 0, order: 4.1, multRun: 0.5 },
        hooks: Hooks.rank_run,
        icon: '/relics/angle_rank_run_mult.png'

    },
    // Flush Types
    {
        name: 'Flush Pair Chips',
        rarity: 'Uncommon',
        categories: ['Angle', 'Flush', 'HandType', 'Chips'],
        description: 'Highest [Flush Pair] earns {hand.score}',
        handType: { id: 'flush_pair_chips', name: 'Flush Pair', chips: 40, mult: 0, order: 5, chipCards: true },
        hooks: Hooks.flush_pair,
        icon: '/relics/angle_flush_pair_chips.png'

    },
    {
        name: 'Flush Pair Mult',
        rarity: 'Uncommon',
        categories: ['Angle', 'Flush', 'HandType', 'Mult'],
        description: 'Highest [Flush Pair] earns {hand.score}',
        handType: { id: 'flush_pair_mult', name: 'Flush Pair', chips: 0, mult: 2, order: 5.1 },
        hooks: Hooks.flush_pair,
        icon: '/relics/angle_flush_pair_mult.png'

    },
    {
        name: 'Flush Triple Chips',
        rarity: 'Uncommon',
        categories: ['Angle', 'Flush', 'HandType', 'Chips', 'Triple'],
        description: 'Highest [Flush Triple] earns {hand.score}',
        handType: { id: 'flush_triple_chips', name: 'Flush Triple', chips: 60, mult: 0, order: 6, chipCards: true },
        hooks: Hooks.flush_triple,
        icon: '/relics/angle_flush_triple_chips.png'

    },
    {
        name: 'Flush Triple Mult',
        rarity: 'Uncommon',
        categories: ['Angle', 'Flush', 'HandType', 'Mult', 'Triple'],
        description: 'Highest [Flush Triple] earns {hand.score}',
        handType: { id: 'flush_triple_mult', name: 'Flush Triple', chips: 0, mult: 3, order: 6.1 },
        hooks: Hooks.flush_triple,
        icon: '/relics/angle_flush_triple_mult.png'

    },
    {
        name: 'Flush Run Chips',
        rarity: 'Uncommon',
        categories: ['Angle', 'Flush', 'HandType', 'Chips'],
        description: 'Longest [Flush Run] earns {hand.score}',
        handType: { id: 'flush_run_chips', name: 'Flush Run', chips: 0, mult: 0, order: 7, chipCards: true, chipRun: 15 },
        hooks: Hooks.flush_run,
        icon: '/relics/angle_flush_run_chips.png'

    },
    {
        name: 'Flush Run Mult',
        rarity: 'Uncommon',
        categories: ['Angle', 'Flush', 'HandType', 'Mult'],
        description: 'Longest [Flush Run] earns {hand.score}',
        handType: { id: 'flush_run_mult', name: 'Flush Run', chips: 0, mult: 0, order: 7.1, multRun: 0.5 },
        hooks: Hooks.flush_run,
        icon: '/relics/angle_flush_run_mult.png'

    },
    // Straight Types
    {
        name: 'Straight Pair Chips',
        rarity: 'Uncommon',
        categories: ['Angle', 'Straight', 'HandType', 'Chips'],
        description: 'Highest [Straight Pair] earns {hand.score}',
        handType: { id: 'straight_pair_chips', name: 'Straight Pair', chips: 40, mult: 0, order: 8, chipCards: true },
        hooks: Hooks.straight_pair,
        icon: '/relics/angle_straight_pair_chips.png'

    },
    {
        name: 'Straight Pair Mult',
        rarity: 'Uncommon',
        categories: ['Angle', 'Straight', 'HandType', 'Mult'],
        description: 'Highest [Straight Pair] earns {hand.score}',
        handType: { id: 'straight_pair_mult', name: 'Straight Pair', chips: 0, mult: 2, order: 8.1 },
        hooks: Hooks.straight_pair,
        icon: '/relics/angle_straight_pair_mult.png'

    },
    {
        name: 'Straight Triple Chips',
        rarity: 'Uncommon',
        categories: ['Angle', 'Straight', 'HandType', 'Chips', 'Triple'],
        description: 'Highest [Straight Triple] earns {hand.score}',
        handType: { id: 'straight_triple_chips', name: 'Straight Triple', chips: 60, mult: 0, order: 9, chipCards: true },
        hooks: Hooks.straight_triple,
        icon: '/relics/angle_straight_triple_chips.png'

    },
    {
        name: 'Straight Triple Mult',
        rarity: 'Uncommon',
        categories: ['Angle', 'Straight', 'HandType', 'Mult', 'Triple'],
        description: 'Highest [Straight Triple] earns {hand.score}',
        handType: { id: 'straight_triple_mult', name: 'Straight Triple', chips: 0, mult: 3, order: 9.1 },
        hooks: Hooks.straight_triple,
        icon: '/relics/angle_straight_triple_mult.png'

    },
    {
        name: 'Straight Run Chips',
        rarity: 'Uncommon',
        categories: ['Angle', 'Straight', 'HandType', 'Chips'],
        description: 'Longest [Straight Run] earns {hand.score}',
        handType: { id: 'straight_run_chips', name: 'Straight Run', chips: 0, mult: 0, order: 10, chipCards: true, chipRun: 15 },
        hooks: Hooks.straight_run,
        icon: '/relics/angle_straight_run_chips.png'

    },
    {
        name: 'Straight Run Mult',
        rarity: 'Uncommon',
        categories: ['Angle', 'Straight', 'HandType', 'Mult'],
        description: 'Longest [Straight Run] earns {hand.score}',
        handType: { id: 'straight_run_mult', name: 'Straight Run', chips: 0, mult: 0, order: 10.1, multRun: 0.5 },
        hooks: Hooks.straight_run,
        icon: '/relics/angle_straight_run_mult.png'

    },
    // Actions
    {
        name: 'Double Down',
        rarity: 'Rare',
        categories: ['Charm', 'Action'],
        description: 'Double Down earns {hand.score}',
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
        categories: ['Charm', 'Action'],
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
        categories: ['Charm', 'Action'],
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
        categories: ['Charm', 'Action'],
        description: 'Redraw a card from the draw area\nThree uses per casino',
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
        categories: ['Charm', 'Action'],
        description: 'Hold a drawn card for later placement\nOne use per casino',
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
        categories: ['Charm', 'Action'],
        description: 'Swap a player card with the dealer face-up card\nOne use per casino',
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

    // Charms

    // Flushes
    {
        name: 'Flusher',
        rarity: 'Uncommon',
        categories: ['Charm', 'Flush', 'New'],
        description: 'Having only one [Flush] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 0.5 },
        hooks: Hooks.flusher_bonus,
        icon: '🚽'
    },
    {
        name: 'Soap',
        rarity: 'Common',
        categories: ['Charm', 'Flush', 'New'],
        description: 'Each [Flush] earns an extra $${bonus_chips}',
        properties: { bonus_chips: 10 },
        hooks: Hooks.flusher_chips,
        icon: '🧼'
    },
    // Rank
    {
        name: 'Badge',
        rarity: 'Uncommon',
        categories: ['Charm', 'Rank', 'New'],
        description: 'Having only one [Pair] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 1 },
        hooks: Hooks.rank_mult,
        icon: '📛'
    },
    {
        name: 'Medal',
        rarity: 'Common',
        categories: ['Charm', 'Rank', 'New'],
        description: 'Each [Pair] earns an extra $${bonus_chips}',
        properties: { bonus_chips: 30 },
        hooks: Hooks.rank_chips,
        icon: '🏅'
    },
    // Straight
    {
        name: 'Ruler',
        rarity: 'Uncommon',
        categories: ['Charm', 'Straight', 'New'],
        description: 'Having only one [Straight] earns an extra x${bonus_mult}',
        properties: { bonus_mult: 0.5 },
        hooks: Hooks.straight_mult,
        icon: '📏'

    },
    {
        name: 'Protractor',
        rarity: 'Common',
        categories: ['Charm', 'Straight', 'New'],
        description: 'Each [Straight] earns an extra $${bonus_chips}',
        properties: { bonus_chips: 15 },
        hooks: Hooks.straight_chips,
        icon: '📐'
    },
    // Suits
    {
        name: 'Old Receipt',
        rarity: 'Common',
        categories: ['Charm', 'Suite', 'Diamonds', 'New'],
        description: 'Each [Diamond] in winning hands earn $${bonus_chips}',
        properties: { bonus_chips: 5 },
        hooks: Hooks.old_receipt_diamonds,
        icon: '🧾'
    },
    {
        name: 'Lucky Rock',
        rarity: 'Common',
        categories: ['Charm', 'Suite', 'Hearts', 'New'],
        description: 'Each [Hearts] in winning hands earn $${bonus_chips}',
        properties: { bonus_chips: 5 },
        hooks: Hooks.lucky_rock_hearts,
        icon: '🪨'
    },
    {
        name: 'Burnt Match',
        rarity: 'Common',
        categories: ['Charm', 'Suite', 'Clubs', 'New'],
        description: 'Each [Club] in winning hands earn $${bonus_chips}',
        properties: { bonus_chips: 5 },
        hooks: Hooks.burnt_match_clubs,
        icon: '🧨'
    },
    {
        name: 'Lost Key',
        rarity: 'Common',
        categories: ['Charm', 'Suite', 'Spades', 'New'],
        description: 'Each [Spade] in winning hands earn $${bonus_chips}',
        properties: { bonus_chips: 5 },
        hooks: Hooks.lost_key_spades,
        icon: '🔑'
    },
    // Cards
    {
        name: 'Star Bead',
        rarity: 'Uncommon',
        categories: ['Charm', 'Cards'],
        description: 'Each [9] in winning hands earn x${bonus_mult}',
        properties: { bonus_mult: 1 },
        hooks: Hooks.star_bead_nines,
        icon: '⭐️'
    },
    {
        name: 'Heart Button',
        rarity: 'Uncommon',
        categories: ['Charm', 'Cards'],
        description: 'Each [10] and [4] in winning hands earn x${bonus_mult}',
        properties: { bonus_mult: 0.5 },
        hooks: Hooks.heart_button_ten_four,
        icon: '🩷'
    },
    {
        name: 'Lucky Acorn',
        rarity: 'Uncommon',
        categories: ['Charm', 'Cards'],
        description: 'Each [King] in winning hands earn x${bonus_mult}',
        properties: { bonus_mult: 1},
        hooks: Hooks.lucky_acorn_kings,
        icon: '🌰'
    },
    {
        name: 'Joker',
        rarity: 'Rare',
        categories: ['Charm', 'Cards', 'New'],
        description: '[Jacks] are worth 11, 10, 5, or 1',
        hooks: Hooks.joker_adjust_bj,
        icon: '🃏'
    },
    // Hands
    {
        name: 'Feather',
        rarity: 'Common',
        categories: ['charm', 'Hands', 'New'],
        description: 'When all hands have the same number of cards, earn $${bonus_chips}',
        properties: { bonus_chips: 100 },
        hooks: Hooks.feather_same_hand_size,
        icon: '🪶'
    },
    {
        name: 'Odd Sock',
        rarity: 'Common',
        categories: ['Charm', 'Hands', 'New'],
        description: 'When all hands have two cards, earn $${bonus_chips}',
        properties: { bonus_chips: 100 },
        hooks: Hooks.odd_sock_two_cards,
        icon: '🧦'
    },
    {
        name: 'High Roller',
        rarity: 'Common',
        categories: ['Charm', 'Hands', 'New'],
        description: 'Winning all three hands earns $${amount}',
        properties: { amount: 100 },
        hooks: Hooks.high_roller_win_all,
        icon: '🎩'
    },
    {
        name: 'One Armed',
        rarity: 'Uncommon',
        categories: ['Charm', 'Hands', 'New'],
        description: 'Winning a single hand earns x${factor}',
        properties: { factor: 2 },
        hooks: Hooks.one_armed_win_bonus,
        icon: '🎰'
    },
    {
        name: 'Royalty',
        rarity: 'Common',
        categories: ['Charm', 'Hands'],
        description: 'Hands with two [Face] cards earn $${amount}',
        properties: { amount: 25 },
        hooks: Hooks.royalty_face_cards,
        icon: '👑'
    },
    // Dealer
    {
        name: 'Idiot',
        rarity: 'Uncommon',
        categories: ['Charm', 'Dealer', 'New'],
        description: 'Dealer hits on ${stop_value}',
        properties: { stop_value: 16 },
        hooks: Hooks.idiot_dealer_stop,
        icon: '🤡'
    },
    // Global
    {
        name: 'Faded Tag',
        rarity: 'Uncommon',
        categories: ['Charm', 'Global'],
        description: 'Earn an extra x${amount}, but decreases by x${decay_amount} each round',
        properties: { amount: 4, decay_amount: 0.5 },
        hooks: Hooks.faded_tag_bonus,
        icon: '🏷️'
    },
    {
        name: 'Mini Shoe',
        rarity: 'Common',
        categories: ['Charm', 'Global', 'New'],
        description: 'Earn an extra $${bonus_chips}',
        properties: { bonus_chips: 20 },
        hooks: Hooks.mini_shoe_bonus_chips,
        icon: '👞'
    },
    {
        name: 'Robe and Slippers Set',
        rarity: 'Uncommon',
        categories: ['Charm', 'Global'],
        description: 'Earn an extra x${bonus_mult}',
        properties: { bonus_mult: 0.5 },
        hooks: Hooks.robe_slippers_bonus_mult,
        icon: '👘'
    },
    {
        name: 'Key Ring',
        rarity: 'Common',
        categories: ['Charm', 'Global', 'New'],
        description: 'On final deal, earn x${bonus_mult}',
        properties: { bonus_mult: 2 },
        hooks: Hooks.key_ring_final_draw,
        icon: '🗝️'
    },
    // Meta
    {
        name: 'Deft',
        rarity: 'Rare',
        categories: ['Charm', 'Meta', 'New'],
        description: 'Extra draw per Casino',
        properties: { extra_draws: 1 },
        hooks: Hooks.deft_extra_draw,
        icon: '🤹'
    },
    {
        name: 'Photocopier',
        rarity: 'Rare',
        categories: ['Charm', 'Meta', 'New'],
        description: 'Draw +{extra_draws} card each time you draw',
        properties: { extra_draws: 1 },
        hooks: Hooks.cloning_machine_draw,
        icon: '📠'
    },
    {
        name: 'Second Chance',
        rarity: 'Rare',
        categories: ['Charm', 'Meta', 'New'],
        description: 'If you Bust, next draw is +{extra_draw} cards and place {extra_place} card',
        properties: { extra_draw: 2, extra_place: 1, pending_bonus: false, active_bonus: false },
        hooks: Hooks.redemption_bust_bonus,
        icon: '♻️'
    },
    {
        name: 'Safety Net',
        rarity: 'Uncommon',
        categories: ['Charm', 'Meta', 'New'],
        description: 'First hand of 20 is discarded and [Wins] earns $${bonus_chips}',
        properties: { bonus_chips: 20, armed: false },
        hooks: Hooks.safety_net_20,
        icon: '🕸️'
    },
    {
        name: 'Mulligan',
        rarity: 'Rare',
        categories: ['Charm', 'Meta', 'New'],
        description: 'Once per round, if you Bust, discard the last card',
        properties: { used_this_round: false },
        hooks: Hooks.mulligan_bust,
        icon: '⛳️'
    },
    {
        name: 'Spyglass',
        rarity: 'Common',
        categories: ['Charm', 'Meta'],
        description: 'The Dealer\'s hidden card is always revealed',
        hooks: Hooks.spyglass_always,
        icon: '🔭'
    }
];
