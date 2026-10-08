import type { Card, ScoringDetail } from '../types';
import { POKER_ORDER, RANK_VALUES } from './rules';
import type { Relic, RelicRarity } from './relics/types';
import type { SeededRNG } from '../engine/rng';
import { RAISE_PACK_COST } from './packs';
export { RAISE_PACK_COST } from './packs';

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
    variant?: { id: 'viginti' | 'bust'; name: string; chips: number; mult: number };
}

export const HAND_TYPES: readonly HandTypeDefinition[] = [
    { id: 'win', name: 'Win', icon: '🏆', chips: 10, mult: 0, compTickets: 1, description: 'Beat the dealer. Exactly 21 has a higher base payout. Win or Viginti earns +1 comp ticket.', chipCards: false, variant: { id: 'viginti', name: '21', chips: 20, mult: 0.1 } },
    { id: 'loss', name: 'Lose', icon: '💥', chips: -10, mult: 0, description: 'Lose to the dealer. Busts have a larger base penalty. A push has no outcome payout.', chipCards: false, variant: { id: 'bust', name: 'Bust', chips: -20, mult: -0.1 } },
    { id: 'pair', name: 'Pair', icon: '🎴', chips: 0, mult: 0.1, description: 'Every two cards of the same rank. Three of a kind contains three pairs.', chipCards: true },
    { id: 'straight', name: 'Straight', icon: '📈', chips: 10, mult: 0, description: 'Every separate run of two or more ranks. Aces can be high or low.', chipCards: true },
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
    affixes?: readonly RaiseAffix[];
}

export interface RaiseAffix {
    readonly id: string;
    readonly kind: 'simple' | 'tradeoff' | 'double';
    readonly slotCost: 1 | 2;
    readonly modifiers: readonly RaiseModifier[];
}

export const formatRaiseCash = (value: number) => `${value < 0 ? '−' : ''}$${Math.abs(value)}`;
export const formatRaiseMult = (value: number) => `${value < 0 ? '−' : ''}x${Number(Math.abs(value).toFixed(2))}`;

export const RAISE_AFFIX_SLOTS: Readonly<Record<RelicRarity, number>> = { Common: 1, Uncommon: 2, Rare: 3 };
const AFFIX_KIND_WEIGHTS = { simple: 60, tradeoff: 25, double: 15 } as const;
const RAISE_RARITIES = ['Common', 'Uncommon', 'Rare'] as const;
const modifier = (handTypeId: HandTypeId, stat: 'cash' | 'mult', units: number): RaiseModifier => ({
    handTypeId, chips: stat === 'cash' ? units * 5 : 0, mult: stat === 'mult' ? units / 10 : 0,
});

export const RAISE_AFFIXES: readonly RaiseAffix[] = HAND_TYPES.flatMap(hand => (['cash', 'mult'] as const).flatMap(stat => [
    { id: `simple_${hand.id}_${stat}`, kind: 'simple' as const, slotCost: 1 as const, modifiers: [modifier(hand.id, stat, 1)] },
    { id: `double_${hand.id}_${stat}`, kind: 'double' as const, slotCost: 2 as const, modifiers: [modifier(hand.id, stat, 3)] },
    ...HAND_TYPES.filter(other => other.id !== hand.id).flatMap(other => (['cash', 'mult'] as const).map(penaltyStat => ({
        id: `tradeoff_${hand.id}_${stat}_${other.id}_${penaltyStat}`,
        kind: 'tradeoff' as const, slotCost: 1 as const,
        modifiers: [modifier(hand.id, stat, 3), modifier(other.id, penaltyStat, -1)],
    }))),
]));
const AFFIX_BY_ID = new Map(RAISE_AFFIXES.map(affix => [affix.id, affix]));

function buildAffixRaise(rarity: RelicRarity, affixes: readonly RaiseAffix[]): Raise {
    const modifiers = affixes.flatMap(affix => affix.modifiers);
    const primary = modifiers[0];
    const hand = HAND_TYPES.find(hand => hand.id === primary.handTypeId)!;
    return {
        // Versioned composition IDs keep rolled values intact across save/import.
        id: `raise_v3_${RAISE_RARITIES.indexOf(rarity)}_${affixes.map(affix => affix.id).join('.')}`,
        name: `${hand.name} Raise`, rarity, categories: ['Raise'], icon: hand.icon,
        description: modifiers.map(effect => `[${HAND_TYPES.find(hand => hand.id === effect.handTypeId)!.name}] ${effect.chips ? formatRaiseCash(effect.chips) : formatRaiseMult(effect.mult)}`).join(' · '),
        affixes, modifiers, handTypeId: primary.handTypeId, chips: primary.chips, mult: primary.mult, cost: RAISE_PACK_COST,
    };
}

function decodeAffixRaise(id: string): Raise | undefined {
    const match = /^raise_v3_([012])_(.+)$/.exec(id);
    if (!match) return undefined;
    const rarity = RAISE_RARITIES[Number(match[1])];
    const affixes = match[2].split('.').map(id => AFFIX_BY_ID.get(id));
    if (affixes.some(affix => !affix)) return undefined;
    const valid = affixes as RaiseAffix[];
    if (valid.reduce((slots, affix) => slots + affix.slotCost, 0) !== RAISE_AFFIX_SLOTS[rarity]
        || valid.filter(affix => affix.kind === 'tradeoff').length > 1) return undefined;
    return buildAffixRaise(rarity, valid);
}

export function generateRaise(rng: SeededRNG, rarity: RelicRarity): Raise {
    const affixes: RaiseAffix[] = [];
    let remaining = RAISE_AFFIX_SLOTS[rarity];
    let hasPenalty = false;
    while (remaining > 0) {
        const kinds = (['simple', 'tradeoff', 'double'] as const)
            .filter(kind => (kind !== 'double' || remaining >= 2) && (kind !== 'tradeoff' || !hasPenalty));
        let roll = rng.next() * kinds.reduce((total, kind) => total + AFFIX_KIND_WEIGHTS[kind], 0);
        const kind = kinds.find(kind => { roll -= AFFIX_KIND_WEIGHTS[kind]; return roll < 0; })!;
        const affix = rng.pick(RAISE_AFFIXES.filter(affix => affix.kind === kind));
        affixes.push(affix);
        remaining -= affix.slotCost;
        if (kind === 'tradeoff') hasPenalty = true;
    }
    return buildAffixRaise(rarity, affixes);
}

// Keep old IDs and payouts valid in imported runs. New packs roll affixes.
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
    description: `Permanently: [${hand.name}] ${[boost.chips ? `<$${boost.chips}>` : '', boost.mult ? `{x${boost.mult}}` : ''].filter(Boolean).join(' · ')}\nStacks for this run · No slot needed.`,
    modifiers: [{ handTypeId: hand.id, chips: boost.chips, mult: boost.mult }],
    handTypeId: hand.id,
    chips: boost.chips,
    mult: boost.mult,
    cost: boost.cost,
})));

// Version-two definitions stay available for already earned/pending Raises.
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
const RAISE_BY_ID = new Map(RAISES.map(raise => [raise.id, raise]));
export const getRaise = (id: string) => RAISE_BY_ID.get(id) ?? decodeAffixRaise(id);

export interface HandRaiseChange {
    raiseId: string;
    occurrence: number;
    stat: 'chips' | 'mult';
    value: number;
}

// Show each earned effect separately, including repeated Raises and drawbacks.
export function getHandRaiseChanges(id: HandTypeId, upgrades: HandUpgrades = {}): HandRaiseChange[] {
    const changes: HandRaiseChange[] = [];
    for (const [raiseId, owned] of Object.entries(upgrades)) {
        const modifiers = getRaise(raiseId)?.modifiers.filter(effect => effect.handTypeId === id) ?? [];
        for (let occurrence = 0; occurrence < owned; occurrence++) {
            for (const modifier of modifiers) {
                if (modifier.chips) changes.push({ raiseId, occurrence, stat: 'chips', value: modifier.chips });
                if (modifier.mult) changes.push({ raiseId, occurrence, stat: 'mult', value: modifier.mult });
            }
        }
    }
    return changes;
}

export function generateRaiseChoices(rng: SeededRNG, count = 3): Raise[] {
    const choices: Raise[] = [];
    const offeredEffects = new Set<string>();
    while (choices.length < count) {
        const roll = rng.next();
        const rarity: RelicRarity = roll < 0.6 ? 'Common' : roll < 0.9 ? 'Uncommon' : 'Rare';
        const raise = generateRaise(rng, rarity);
        // Different roll orders can produce the same displayed card.
        const effects = `${rarity}:${raise.modifiers.map(effect => `${effect.handTypeId}:${effect.chips}:${effect.mult}`).sort().join('|')}`;
        if (!offeredEffects.has(effects)) {
            choices.push(raise);
            offeredEffects.add(effects);
        }
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
    return { ...hand, chips, mult, count, variant: hand.variant ? {
        ...hand.variant,
        chips: hand.variant.chips + chips - hand.chips,
        mult: Number((hand.variant.mult + mult - hand.mult).toFixed(2)),
    } : undefined };
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
            multiplier: variant ? hand.variant!.mult : hand.mult,
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
