import type { Card, ScoringDetail } from '../types';
import { POKER_ORDER, RANK_VALUES } from './rules';
import type { Relic, RelicRarity } from './relics/types';
import type { SeededRNG } from '../engine/rng';

export type HandTypeId = 'win' | 'loss' | 'pair' | 'straight' | 'flush';
// Counts retain the history of every Raise without occupying relic slots.
export type HandUpgrades = Readonly<Record<string, number>>;

interface HandTypeDefinition {
    id: HandTypeId;
    name: string;
    icon: string;
    chips: number;
    mult: number;
    description: string;
    chipCards: boolean;
    compTickets?: number;
    variant?: { id: 'viginti' | 'bust'; name: string; chips: number };
}

export const HAND_TYPES: readonly HandTypeDefinition[] = [
    { id: 'win', name: 'Win', icon: '🏆', chips: 10, mult: 0, compTickets: 1, description: 'Beat the dealer. Exactly 21 has a higher base payout. Win or Viginti earns +1 comp ticket.', chipCards: false, variant: { id: 'viginti', name: '21', chips: 25 } },
    { id: 'loss', name: 'Lose', icon: '💥', chips: -10, mult: 0, description: 'Lose to the dealer. Busts have a larger base penalty. A push has no outcome payout.', chipCards: false, variant: { id: 'bust', name: 'Bust', chips: -20 } },
    { id: 'pair', name: 'Pair', icon: '🎴', chips: 0, mult: 0, description: 'Every two cards of the same rank. Three of a kind contains three pairs.', chipCards: true },
    { id: 'straight', name: 'Straight', icon: '📈', chips: 0, mult: 0, description: 'Every separate run of two or more ranks. Aces can be high or low.', chipCards: true },
    { id: 'flush', name: 'Flush', icon: '♠', chips: 0, mult: 0, description: 'Every suit group of two or more cards.', chipCards: true },
] as const;

export interface RaiseModifier {
    handTypeId: HandTypeId;
    chips: number;
    mult: number;
}

export interface Raise extends Relic {
    modifiers: readonly RaiseModifier[];
    handTypeId: HandTypeId;
    chips: number;
    mult: number;
    cost: number;
}

// Keep old IDs and payouts valid in imported runs. New packs use PACK_RAISES.
const LEGACY_RAISES: readonly Raise[] = HAND_TYPES.flatMap(hand => [
    { suffix: 'cash', label: 'Cash', chips: 50, mult: 0, cost: 40 },
    { suffix: 'mult', label: 'Multiplier', chips: 0, mult: 0.5, cost: 60 },
    { suffix: 'combo', label: 'Double', chips: 20, mult: 0.5, cost: 80 },
].map(boost => ({
    id: `raise_${hand.id}_${boost.suffix}`,
    name: `${hand.name} ${boost.label} Raise`,
    rarity: 'Uncommon' as const,
    categories: ['Raise'],
    icon: hand.icon,
    description: `Permanently: [${hand.name}] ${[boost.chips ? `<+$${boost.chips}>` : '', boost.mult ? `{+x${boost.mult}}` : ''].filter(Boolean).join(' · ')}\nStacks for this run · No slot needed.`,
    modifiers: [{ handTypeId: hand.id, chips: boost.chips, mult: boost.mult }],
    handTypeId: hand.id,
    chips: boost.chips,
    mult: boost.mult,
    cost: boost.cost,
})));

export const RAISE_PACK_COST = 40;
export const formatRaiseCash = (value: number) => `${value < 0 ? '−' : '+'}$${Math.abs(value)}`;
export const formatRaiseMult = (value: number) => `${value < 0 ? '−' : '+'}${Number(Math.abs(value).toFixed(2))}×`;

// Rarity sets the number of effects. Drawbacks trade a smaller penalty for a
// stronger primary bonus; every offer has at least one positive modifier.
export const PACK_RAISES: readonly Raise[] = (['Common', 'Uncommon', 'Rare'] as const).flatMap((rarity, tier) =>
    HAND_TYPES.flatMap((hand, handIndex) => (['cash', 'mult'] as const).flatMap(stat =>
        Array.from({ length: tier === 0 ? 1 : 4 }, (_, offset) => offset + 1).flatMap(offset =>
            (tier === 0 ? [false] : [false, true]).map(drawback => {
                const primary = tier + 1 + (drawback ? 1 : 0);
                const modifiers: RaiseModifier[] = [{ handTypeId: hand.id, chips: stat === 'cash' ? 5 * primary : 0, mult: stat === 'mult' ? primary / 10 : 0 }];
                const second = HAND_TYPES[(handIndex + offset) % HAND_TYPES.length];
                if (tier > 0) modifiers.push({ handTypeId: second.id, chips: stat === 'mult' ? (drawback ? -5 : 5) : 0, mult: stat === 'cash' ? (drawback ? -0.1 : 0.1) : 0 });
                if (tier > 1) {
                    const third = HAND_TYPES[(handIndex + offset % 4 + 1) % HAND_TYPES.length];
                    modifiers.push({ handTypeId: third.id, chips: stat === 'cash' ? 5 : 0, mult: stat === 'mult' ? 0.1 : 0 });
                }
                return {
                    id: `raise_v2_${tier}_${hand.id}_${stat}_${offset}_${drawback ? 'trade' : 'bonus'}`,
                    name: `${hand.name} Raise`, rarity, categories: ['Raise'], icon: hand.icon,
                    description: modifiers.map(effect => `[${HAND_TYPES.find(type => type.id === effect.handTypeId)!.name}] ${effect.chips ? formatRaiseCash(effect.chips) : formatRaiseMult(effect.mult)}`).join(' · '),
                    modifiers, handTypeId: hand.id, chips: modifiers[0].chips, mult: modifiers[0].mult, cost: RAISE_PACK_COST,
                };
            })
        )
    ))
);

export const RAISES: readonly Raise[] = [...LEGACY_RAISES, ...PACK_RAISES];
export const getRaise = (id: string) => RAISES.find(raise => raise.id === id);

export function generateRaiseChoices(rng: SeededRNG): Raise[] {
    const choices: Raise[] = [];
    for (let i = 0; i < 3; i++) {
        const roll = rng.next();
        const rarity: RelicRarity = roll < 0.6 ? 'Common' : roll < 0.9 ? 'Uncommon' : 'Rare';
        const candidates = PACK_RAISES.filter(raise => raise.rarity === rarity && !choices.some(choice => choice.id === raise.id));
        const drawback = rng.next() < 1 / 3;
        const pool = candidates.filter(raise => raise.modifiers.some(effect => effect.chips < 0 || effect.mult < 0) === drawback);
        choices.push(rng.pick(pool.length ? pool : candidates));
    }
    return choices;
}

export function getHandPayout(id: HandTypeId, upgrades: HandUpgrades = {}) {
    const hand = HAND_TYPES.find(hand => hand.id === id)!;
    let chips: number = hand.chips;
    let mult: number = hand.mult;
    let count = 0;
    for (const [raiseId, owned] of Object.entries(upgrades)) {
        const raise = getRaise(raiseId);
        const modifiers = raise?.modifiers.filter(effect => effect.handTypeId === id) ?? [];
        for (const modifier of modifiers) {
            chips += owned * modifier.chips;
            mult += owned * modifier.mult;
        }
        if (modifiers.length) count += owned;
    }
    mult = Number(mult.toFixed(2));
    return { ...hand, chips, mult, count, variant: hand.variant ? { ...hand.variant, chips: hand.variant.chips + chips - hand.chips } : undefined };
}

export function evaluateBaseHands(cards: Card[], isWin: boolean, blackjackValue: number, outcome?: 'win' | 'loss' | 'bust' | 'push' | null, upgrades: HandUpgrades = {}): ScoringDetail[] {
    if (!cards.length) return [];
    const criteria: ScoringDetail[] = [];
    const add = (id: HandTypeId, group: Card[], variant?: 'viginti' | 'bust') => {
        const hand = getHandPayout(id, upgrades);
        criteria.push({
            id: variant ?? id,
            name: variant === 'viginti' ? 'Viginti' : variant === 'bust' ? 'Bust' : hand.name,
            count: 1,
            chips: (variant ? hand.variant!.chips : hand.chips) + (hand.chipCards ? group.reduce((sum, card) => sum + RANK_VALUES[card.rank], 0) : 0),
            multiplier: hand.mult,
            ...(hand.compTickets ? { compTickets: hand.compTickets } : {}),
            cardIds: group.map(card => card.id),
        });
    };
    if (blackjackValue > 21 || outcome === 'bust') add('loss', cards, 'bust');
    else if (isWin) add('win', cards, blackjackValue === 21 ? 'viginti' : undefined);
    else if (outcome === 'loss') add('loss', cards);

    const standard = cards.filter(card => !card.type || card.type === 'standard');
    for (let i = 0; i < standard.length; i++) {
        for (let j = i + 1; j < standard.length; j++) {
            if (standard[i].rank === standard[j].rank) add('pair', [standard[i], standard[j]]);
        }
    }
    for (const suit of ['hearts', 'diamonds', 'clubs', 'spades']) {
        const group = standard.filter(card => card.suit === suit);
        if (group.length >= 2) add('flush', group);
    }
    const runs = new Map<string, Card[]>();
    for (const lowAce of [false, true]) {
        const value = (card: Card) => lowAce && card.rank === 'A' ? 1 : POKER_ORDER[card.rank];
        const sorted = [...standard].sort((a, b) => value(a) - value(b));
        let run: Card[] = [];
        const storeRun = () => {
            if (run.length >= 2) runs.set(run.map(card => card.id).sort().join(','), run);
        };
        for (const card of sorted) {
            const previous = run.at(-1);
            if (previous && value(card) === value(previous)) continue;
            if (previous && value(card) !== value(previous) + 1) { storeRun(); run = []; }
            run.push(card);
        }
        storeRun();
    }
    const allRuns = [...runs.values()];
    for (const run of allRuns) {
        if (!allRuns.some(other => other.length > run.length && run.every(card => other.some(candidate => candidate.id === card.id)))) add('straight', run);
    }
    return criteria;
}
