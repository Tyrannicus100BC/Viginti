import type { GameState, DeckProbabilities } from '../engine/GameState';
import type { PlayerAction } from '../engine/PlayerAction';
import { canPlayHand } from '../engine/economy';
import { SeededRNG } from '../engine/rng';
import { RANKS, SUITS } from '../logic/deck';
import { getHandPayout, getRaise, type HandUpgrades, type RaiseHandTypeId } from '../logic/handScoring';
import { evaluateHandScore, getBlackjackScore } from '../logic/scoring';
import { RANK_VALUES } from '../logic/rules';
import type { Card, PlayerHand } from '../types';
import { observe, type BotObservation } from './bot';

export const BUILD_STRATEGIES = ['random', 'pair', 'straight', 'flush', 'pair-straight', 'adaptive'] as const;
export type BuildStrategy = typeof BUILD_STRATEGIES[number];
export const PATTERNS = ['pair', 'straight', 'flush'] as const;
export type Pattern = typeof PATTERNS[number];
export type RowCounts = Record<RaiseHandTypeId, number>;
export const INITIAL_ROW_COUNTS: RowCounts = { win: 1.4, viginti: .4, loss: .8, bust: .4, pair: 1, straight: 1.5, flush: 2 };

export type RaiseObservation = BotObservation & Pick<GameState, 'deckProbabilities'>;
export const observeRaises = (state: GameState): RaiseObservation => ({ ...observe(state), deckProbabilities: state.deckProbabilities });

/** Public distribution, sampled with replacement exactly as the production deck. */
export function ordinaryCards(probabilities: DeckProbabilities): { card: Card; probability: number }[] {
    const ranks = probabilities.ranks;
    const totalRanks = Object.values(ranks).reduce((a, b) => a + b, 0);
    const totalSuits = Object.values(probabilities.suits).reduce((a, b) => a + b, 0);
    return RANKS.flatMap(rank => SUITS.map(suit => ({
        card: { id: `forecast-${rank}-${suit}`, rank, suit, isFaceUp: true },
        probability: (rank === 'A' ? ranks.ace : ['10', 'J', 'Q', 'K'].includes(rank) ? ranks.face / 4
            : Number(rank) >= 6 ? ranks.upper / 4 : ranks.lower / 4) / totalRanks * probabilities.suits[suit] / totalSuits,
    }))).filter(item => item.probability > 0);
}

/** Integrate the unknown dealer card and subsequent hits; never read its actual rank. */
export function dealerDistribution(observation: RaiseObservation): { value: number; probability: number }[] {
    const limit = observation.bustLimit ?? 21;
    const cards = ordinaryCards(observation.deckProbabilities);
    // Aggregate suits separately so this also works with a zero Hearts weight.
    const rankWeights = RANKS.map(rank => ({ rank, probability: cards
        .filter(item => item.card.rank === rank).reduce((sum, item) => sum + item.probability, 0) }));
    const memo = new Map<string, Map<number, number>>();
    const finish = (raw: number, aces: number): Map<number, number> => {
        const key = `${raw}:${aces}`;
        const cached = memo.get(key); if (cached) return cached;
        let value = raw, soft = aces;
        while (value > limit && soft > 0) { value -= 10; soft--; }
        if (value >= 17) return new Map([[value, 1]]);
        const result = new Map<number, number>();
        for (const item of rankWeights) if (item.probability) {
            for (const [end, probability] of finish(raw + RANK_VALUES[item.rank], aces + Number(item.rank === 'A'))) {
                result.set(end, (result.get(end) ?? 0) + probability * item.probability);
            }
        }
        memo.set(key, result); return result;
    };
    const raw = observation.dealerCards.reduce((sum, card) => sum + RANK_VALUES[card.rank], 0);
    const aces = observation.dealerCards.filter(card => card.rank === 'A').length;
    // One face-up card still requires the initial hidden card, even if visible Ace
    // is valued unusually by a boss. Two visible cards may already stand.
    if (observation.dealerCards.length >= 2) return [...finish(raw, aces)].map(([value, probability]) => ({ value, probability }));
    const result = new Map<number, number>();
    for (const item of rankWeights) if (item.probability) for (const [value, probability] of finish(raw + RANK_VALUES[item.rank], aces + Number(item.rank === 'A'))) {
        result.set(value, (result.get(value) ?? 0) + probability * item.probability);
    }
    return [...result].map(([value, probability]) => ({ value, probability }));
}

export function payoutTable(upgrades: HandUpgrades): Record<RaiseHandTypeId, { chips: number; mult: number }> {
    const win = getHandPayout('win', upgrades), loss = getHandPayout('loss', upgrades);
    return { win, loss, viginti: win.variant!, bust: loss.variant!, pair: getHandPayout('pair', upgrades),
        straight: getHandPayout('straight', upgrades), flush: getHandPayout('flush', upgrades) };
}

/** Build-aware expectimax. Settlement is always done by processAction, never this estimate.
 * Restricted to ordinary cards without relics to isolate Raises. No fixed stand
 * threshold or artificial bust penalty: an upgraded pattern may justify a bust.
 */
export class RaisePlayPolicy {
    private readonly cards;
    private readonly dealer;
    private readonly payouts;
    private readonly base = payoutTable({});
    private readonly cache = new Map<string, { value: number; chips: number; mult: number }>();
    private readonly limit;

    constructor(observation: RaiseObservation) {
        if (observation.inventory.length || observation.deckProbabilities.specialChance || observation.deckProbabilities.specialWeights.some(weight => weight.chance > 0)) {
            throw new Error('Raise isolation policy requires ordinary cards and no relics.');
        }
        this.cards = ordinaryCards(observation.deckProbabilities);
        this.dealer = dealerDistribution(observation);
        this.payouts = payoutTable(observation.handUpgrades);
        this.limit = observation.bustLimit ?? 21;
    }

    private hand(cards: Card[]) {
        // With a pair cap, card order determines which matching ranks score.
        const key = cards.map(card => `${card.rank}:${card.suit}`).join('|');
        const cached = this.cache.get(key); if (cached) return cached;
        // Obtain pattern membership/base values from production scoring, then use
        // production payout totals compiled once per round for the earned Raises.
        const patterns = evaluateHandScore(cards, false).criteria;
        let chips = 0, mult = 0;
        for (const row of patterns) {
            if (!PATTERNS.includes(row.id as Pattern)) continue;
            const id = row.id as Pattern;
            chips += row.chips + this.payouts[id].chips - this.base[id].chips;
            mult += row.multiplier + this.payouts[id].mult - this.base[id].mult;
        }
        const result = { value: getBlackjackScore(cards, [], false, this.limit), chips, mult };
        this.cache.set(key, result); return result;
    }

    expectedPayout(hands: readonly PlayerHand[]): number {
        const scores = hands.map(hand => hand.cards.length ? this.hand(hand.cards) : null);
        let expected = 0;
        for (const dealer of this.dealer) {
            let chips = 0, mult = 1;
            for (const hand of scores) if (hand) {
                const outcome = hand.value > this.limit ? 'bust'
                    : dealer.value > this.limit || hand.value >= dealer.value ? hand.value === 21 ? 'viginti' : 'win' : 'loss';
                chips += hand.chips + this.payouts[outcome].chips;
                mult += hand.mult + this.payouts[outcome].mult;
            }
            expected += Math.floor(Number((chips * mult).toFixed(8))) * dealer.probability;
        }
        return expected;
    }

    private place(hands: readonly PlayerHand[], card: Card, index: number): PlayerHand[] {
        return hands.map((hand, i) => {
            if (i !== index) return hand;
            const cards = [...hand.cards, { ...card, id: `forecast-${hand.cards.length}-${card.id}` }];
            const value = this.hand(cards).value;
            return { ...hand, cards, blackjackValue: value, isBust: value > this.limit };
        });
    }

    expectedDraw(hands: readonly PlayerHand[]): number {
        const playable = hands.flatMap((hand, index) => canPlayHand(hand) ? [index] : []);
        if (!playable.length) return this.expectedPayout(hands);
        let expected = 0;
        for (const item of this.cards) {
            const best = Math.max(...playable.map(index => this.expectedPayout(this.place(hands, item.card, index))));
            expected += best * item.probability;
        }
        return expected;
    }

    choose(observation: RaiseObservation): PlayerAction {
        const hands = observation.playerHands;
        const available = observation.drawnCards.flatMap((card, index) => card ? [{ card, index }] : []);
        if (!available.length) return { type: this.expectedDraw(hands) > this.expectedPayout(hands) + .01 ? 'draw' : 'stand' };
        let best = -Infinity, drawIndex = -1, handIndex = -1;
        for (const item of available) for (let index = 0; index < hands.length; index++) if (canPlayHand(hands[index])) {
            const next = this.place(hands, item.card, index);
            const immediate = this.expectedPayout(next);
            // One optional further draw values setting up a future pattern. This
            // uses all 52 public card probabilities, not the live engine RNG.
            const value = immediate + .7 * Math.max(0, this.expectedDraw(next) - immediate);
            if (value > best) { best = value; drawIndex = item.index; handIndex = hands[index].id; }
        }
        if (drawIndex < 0) throw new Error('No legal pattern placement.');
        return observation.selectedDrawIndex !== drawIndex ? { type: 'select_drawn_card', drawIndex } : { type: 'place_card', handIndex };
    }
}

export function buildWeights(strategy: BuildStrategy, upgrades: HandUpgrades): Partial<Record<Pattern, number>> {
    if (strategy === 'pair-straight') return { pair: 2.5, straight: 2.5 };
    if (PATTERNS.includes(strategy as Pattern)) return { [strategy]: 3 };
    if (strategy !== 'adaptive') return {};
    const table = payoutTable(upgrades), base = payoutTable({});
    const strengths = PATTERNS.map(id => ({ id, strength: Math.max(0, table[id].chips - base[id].chips) + Math.max(0, table[id].mult - base[id].mult) * 100 }));
    const max = Math.max(...strengths.map(item => item.strength));
    return max ? Object.fromEntries(strengths.map(item => [item.id, 1 + 2 * (item.strength / max) ** 2])) : {};
}

/** Marginal shared-pot value includes every drawback and the chip×mult cross term.
 * Focus increases projected pattern frequency, rather than ignoring penalties or
 * giving a flat bonus for matching a label. Actual frequencies update every round.
 */
export function rankRaiseOffers(ids: readonly string[], strategy: BuildStrategy, upgrades: HandUpgrades, counts: RowCounts) {
    const weights = buildWeights(strategy, upgrades);
    const frequencies = Object.fromEntries(Object.entries(counts).map(([id, count]) => [id, Math.max(.15, count) * (weights[id as Pattern] ?? 1)])) as RowCounts;
    const value = (owned: HandUpgrades) => {
        const table = payoutTable(owned);
        let chips = 55, mult = 1; // Card-rank chips; outcome/pattern bases are below.
        for (const id of Object.keys(table) as RaiseHandTypeId[]) {
            chips += frequencies[id] * table[id].chips;
            mult += frequencies[id] * table[id].mult;
        }
        return chips * mult;
    };
    const baseline = value(upgrades);
    return ids.filter(id => getRaise(id)).map(id => ({ id, value: value({ ...upgrades, [id]: (upgrades[id] ?? 0) + 1 }) - baseline }))
        .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
}

export function chooseRaiseOffer(ids: readonly string[], strategy: BuildStrategy, upgrades: HandUpgrades, counts: RowCounts, rng: SeededRNG): string | undefined {
    const raises = ids.filter(id => getRaise(id));
    if (strategy === 'random') return raises.length ? rng.pick(raises) : undefined;
    return rankRaiseOffers(raises, strategy, upgrades, counts).find(offer => offer.value > 0)?.id;
}
