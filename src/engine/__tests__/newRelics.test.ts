import { describe, expect, it } from 'vitest';
import { createInitialState, processAction } from '../engine';
import { getBustLimit, getDealerBustLimit } from '../bosses';
import type { GameState } from '../GameState';
import { executeOnHandCompletion, executeValueHook } from '../relicEngine';
import { evaluateHandScore, getBlackjackScore } from '../../logic/scoring';
import { RelicManager } from '../../logic/relics/manager';
import type { RelicInstance } from '../../logic/relics/types';
import { normalizeRelicInstance } from '../../logic/relics/state';
import { generateRelicPackChoices } from '../../logic/relicPacks';
import { SeededRNG } from '../rng';
import { useGameBridge } from '../../store/gameBridge';
import type { Card, PlayerHand } from '../../types';
import { finishOpeningPack } from './fixtures';

const cards = (...ranks: Card['rank'][]): Card[] => ranks.map((rank, index) => ({ id: `${rank}-${index}`, rank, suit: 'hearts' }));
const instance = (id: string, state = {}): RelicInstance => ({ id, state: { ...RelicManager.getRelicConfig(id)?.properties, ...state } });
const start = (): GameState => finishOpeningPack(processAction(createInitialState(), {
    type: 'start_game', cityId: 'atlantic_city', gamblerId: 'default', seed: 42,
}).nextState);
const hand = (ranks: Card['rank'][], outcome: PlayerHand['outcome'] = 'win', id = 0): PlayerHand => ({
    id, cards: cards(...ranks), blackjackValue: getBlackjackScore(cards(...ranks)), isBust: outcome === 'bust', isHeld: false, outcome,
});
const scoreRound = (state: GameState, hands: PlayerHand[]) => processAction({ ...state,
    phase: 'scoring', playerHands: hands, runningSummary: { chips: 0, mult: 1 },
}, { type: 'score_round' });
const straightBonus = (state: GameState, ranks: Card['rank'][]) => {
    const base = evaluateHandScore(cards(...ranks), true).criteria.filter(row => row.id === 'straight');
    const score = evaluateHandScore(cards(...ranks), true, false, [...state.inventory]).criteria.filter(row => row.id === 'straight');
    return score.reduce((sum, row, index) => sum + row.chips - base[index].chips, 0);
};

describe('card-value relics', () => {
    it.each([
        [['J'], 10], [['J', '6'], 16], [['J', 'Q'], 20], [['J', 'J'], 20],
        [['J', 'Q', '2'], 13], [['J', 'J', '5'], 16], [['J', '9', 'A'], 21],
    ] as [Card['rank'][], number][])('Joker limits %j to 10-or-1 Jacks: %i', (ranks, value) => {
        expect(getBlackjackScore(cards(...ranks), [instance('joker')])).toBe(value);
    });

    it.each([
        [['Q', 'K'], 10], [['J', 'Q', 'K'], 20], [['J', 'Q', 'K', 'K'], 20],
        [['Q', 'K', 'A'], 21], [['10', 'Q'], 20], [['J'], 10],
    ] as [Card['rank'][], number][])('Royal Couple combines face cards in %j: %i', (ranks, value) => {
        expect(getBlackjackScore(cards(...ranks), [instance('royal_couple')])).toBe(value);
    });

    it.each([['joker', 'royal_couple'], ['royal_couple', 'joker']])('composes %s and %s without applying discounts twice', (first, second) => {
        const inventory = [instance(first), instance(second)];
        expect(getBlackjackScore(cards('J', 'Q'), inventory)).toBe(10);
        expect(getBlackjackScore(cards('J', 'J', 'K', '5'), inventory)).toBe(16);
        expect(getBlackjackScore(cards('Q', 'K', 'A'), inventory)).toBe(21);
        expect(getBlackjackScore(cards('J', 'J', 'J', 'J'), inventory)).toBe(20);
    });

    it('preserves printed ranks, pattern cash values, and inline card reductions', () => {
        const handCards = cards('Q', 'Q', 'A');
        handCards[0].specialEffect = { type: 'score', value: 3 };
        const snapshot = structuredClone(handCards);
        expect(getBlackjackScore(handCards, [instance('royal_couple')])).toBe(18);
        expect(getBlackjackScore(handCards, [instance('royal_couple')], true)).toBe(21);
        expect(evaluateHandScore(handCards, true, false, [instance('royal_couple')])
            .criteria.find(row => row.id === 'pair')?.chips).toBe(25);
        expect(handCards).toEqual(snapshot);
    });
});

describe('Idiot dealer decisions', () => {
    it.each([14, 15, 16, 17, 18, 21, 22])('makes its decision at %i', value => {
        const inventory = [instance('idiot', { stop_value: 16 })];
        expect(executeValueHook('shouldDealerHit', value < 17, { inventory, blackjackValue: value }))
            .toBe(value < 15 || value === 17);
    });

    it.each([15, 16, 18])('actually stands at %i', value => {
        const state = { ...start(), phase: 'dealer_turn' as const, inventory: [instance('idiot')],
            dealer: { cards: cards('10', String(value - 10) as Card['rank']), blackjackValue: value, isRevealed: true } };
        const result = processAction(state, { type: 'resolve_dealer_turn' });
        expect(result.events.some(event => event.type === 'dealer_hit')).toBe(false);
        expect(result.events).toContainEqual({ type: 'dealer_stand', value });
    });

    it('hits on 17 and can bust, while an ordinary dealer stands', () => {
        const state = { ...start(), phase: 'dealer_turn' as const, inventory: [instance('idiot')],
            dealer: { cards: cards('10', '7'), blackjackValue: 17, isRevealed: true }, deck: cards('K') };
        const result = processAction(state, { type: 'resolve_dealer_turn' });
        expect(result.events).toContainEqual({ type: 'dealer_bust', value: 27 });
        expect(processAction({ ...state, inventory: [] }, { type: 'resolve_dealer_turn' }).events)
            .toContainEqual({ type: 'dealer_stand', value: 17 });
    });
});

describe('Extra Life bust limit', () => {
    it.each([['2', 22, false], ['3', 23, true]] as const)('handles a placed %s at %i', (rank, value, bust) => {
        const state = { ...start(), phase: 'playing' as const, inventory: [instance('extra_life')],
            playerHands: [hand(['K', 'Q'])], drawnCards: cards(rank), selectedDrawIndex: 0 };
        const result = processAction(state, { type: 'place_card', handIndex: 0 });
        expect(result.nextState.playerHands[0]).toMatchObject({ blackjackValue: value, isBust: bust });
        expect(result.events.some(event => event.type === 'hand_bust')).toBe(bust);
    });

    it('uses the player cap for soft aces and keeps Viginti exclusive to 21', () => {
        const inventory = [instance('extra_life')];
        expect(getBlackjackScore(cards('A', 'A'), inventory)).toBe(22);
        expect(getBlackjackScore(cards('A', 'A'), inventory, true)).toBe(12);
        expect(evaluateHandScore(cards('A', 'A'), true, false, inventory).criteria[0].id).toBe('win');
        expect(evaluateHandScore(cards('A', 'K'), true, false, inventory).criteria[0].id).toBe('viginti');
        expect(evaluateHandScore(cards('K', 'Q', '3'), false, false, inventory).criteria[0].id).toBe('bust');
    });

    it('keeps the dealer at 21 and respects the higher boss cap', () => {
        const state = { ...start(), inventory: [instance('extra_life')] };
        expect(getBustLimit(state)).toBe(22);
        expect(getDealerBustLimit(state)).toBe(21);
        expect(getBustLimit({ ...state, bossId: 'high_limit' })).toBe(25);
        expect(getDealerBustLimit({ ...state, bossId: 'high_limit' })).toBe(25);
        const result = processAction({ ...state, phase: 'resolving_outcomes',
            dealer: { cards: cards('K', 'Q', '2'), blackjackValue: 22, isRevealed: true },
            playerHands: [hand(['10', '8'])] }, { type: 'resolve_hand_outcome' });
        expect(result.nextState.playerHands[0].outcome).toBe('win');
    });

    it('uses 22 when a held table-action card is placed', () => {
        const state = { ...start(), phase: 'playing' as const, inventory: [instance('extra_life'), instance('hold')],
            tableActionHeldCards: { hold: cards('2')[0] }, playerHands: [hand(['K', 'Q'])] };
        const targeting = processAction(state, { type: 'activate_table_action', relicId: 'hold' }).nextState;
        expect(processAction(targeting, { type: 'select_table_action_target', handIndex: 0 }).nextState.playerHands[0])
            .toMatchObject({ blackjackValue: 22, isBust: false });
    });
});

describe('growth relics', () => {
    const sweep = [0, 1, 2].map(id => hand(['10', '8'], 'win', id));

    it('grows Clean Sweep by $5 per sweep, shrinks otherwise, and floors at zero', () => {
        let state: GameState = { ...start(), inventory: [instance('clean_sweep')] };
        for (const expected of [5, 10, 15]) {
            const before = structuredClone(state);
            const result = scoreRound(state, sweep);
            const base = scoreRound({ ...state, inventory: [] }, sweep);
            expect(state).toEqual(before);
            expect(result.nextState.runningSummary!.chips - base.nextState.runningSummary!.chips).toBe(expected);
            expect(result.nextState.inventory[0].state.bonus_chips).toBe(expected);
            state = result.nextState;
        }
        for (const expected of [10, 5, 0, 0]) {
            state = scoreRound(state, [sweep[0], sweep[1], hand(['10', '6'], 'loss', 2)]).nextState;
            expect(state.inventory[0].state.bonus_chips).toBe(expected);
        }
    });

    it('does not count fewer than three wins or a surrendered hand as a sweep', () => {
        const state = { ...start(), inventory: [instance('clean_sweep')] };
        expect(scoreRound(state, sweep.slice(0, 2)).nextState.inventory[0].state.bonus_chips).toBe(0);
        expect(scoreRound(state, [...sweep.slice(0, 2), hand([], 'loss', 2)]).nextState.inventory[0].state.bonus_chips).toBe(0);
    });

    it.each([
        [hand(['2', '2']), hand(['4', '4'], 'win', 1)],
        [hand(['2', '2', '3', '3'])],
        [hand(['2', '2', '2'])],
        [hand(['K', 'K', '2'], 'bust')], // One pair does not qualify.
    ])('counts all scored pairs across hands, growing once per qualifying round', (...hands) => {
        const state = { ...start(), inventory: [instance('two_peas')] };
        const pairCount = hands.reduce((sum, item) => sum + evaluateHandScore(item.cards, false).criteria.filter(row => row.id === 'pair').length, 0);
        const bonus = pairCount >= 2 ? 0.01 : 0;
        const result = scoreRound(state, hands);
        expect(result.nextState.inventory[0].state.bonus_mult).toBe(bonus);
        const base = scoreRound({ ...state, inventory: [] }, hands);
        expect(result.nextState.runningSummary!.mult - base.nextState.runningSummary!.mult).toBeCloseTo(bonus);
        const next = scoreRound(result.nextState, [hand(['10', '8'])]);
        expect(next.nextState.inventory[0].state.bonus_mult).toBe(bonus);
    });

    it('accumulates Two Peas exactly without decimal drift and retains it without new pairs', () => {
        let state: GameState = { ...start(), inventory: [instance('two_peas')] };
        for (let i = 0; i < 100; i++) state = scoreRound(state, [hand(['2', '2', '3', '3'])]).nextState;
        expect(state.inventory[0].state.bonus_mult).toBe(1);
        const hands = [hand(['10', '8'])];
        const base = scoreRound({ ...state, inventory: [] }, hands);
        expect(scoreRound(state, hands).nextState.runningSummary!.mult - base.nextState.runningSummary!.mult).toBeCloseTo(1);
    });

    it('keeps straight previews pure, grows only for 3+ cards, and pays on the triggering straight', () => {
        const state = { ...start(), inventory: [instance('climbing_vine')] };
        for (let i = 0; i < 3; i++) expect(straightBonus(state, ['3', '4', '5'])).toBe(5);
        expect(state.inventory[0].state.bonus_chips).toBe(0);
        expect(straightBonus(state, ['3', '4'])).toBe(0);
        const first = scoreRound(state, [hand(['3', '4', '5'])]).nextState;
        expect(first.inventory[0].state.bonus_chips).toBe(5);
        expect(straightBonus(first, ['3', '4'])).toBe(5);
        expect(straightBonus(first, ['3', '4', '5', '6'])).toBe(10);
        expect(scoreRound(first, [hand(['3', '4'])]).nextState.inventory[0].state.bonus_chips).toBe(5);
    });

    it('grows per distinct 3+ straight, including multiple hands and Ace-low straights', () => {
        const state = { ...start(), inventory: [instance('climbing_vine')] };
        const hands = [hand(['A', '2', '3']), hand(['4', '5', '6'], 'win', 1)];
        const base = scoreRound({ ...state, inventory: [] }, hands).nextState;
        const result = scoreRound(state, hands).nextState;
        expect(result.inventory[0].state.bonus_chips).toBe(10);
        expect(result.runningSummary!.chips - base.runningSummary!.chips).toBe(15);
        const twoRuns = cards('2', '3', '4', '7', '8', '9');
        const score = evaluateHandScore(twoRuns, false, false, state.inventory);
        expect(executeOnHandCompletion(state.inventory, twoRuns, score, { chips: 0, mult: 1 }).inventory[0].state.bonus_chips).toBe(10);
    });

    it('retains earned growth through normalization and game import', () => {
        const inventory = [instance('clean_sweep', { bonus_chips: 35 }), instance('two_peas', { bonus_mult: 0.17 }),
            instance('climbing_vine', { bonus_chips: 65 })];
        expect(inventory.map(normalizeRelicInstance)).toEqual(inventory);
        const state = { ...start(), inventory };
        expect(useGameBridge.getState().loadGameState(JSON.stringify(state))).toBe(true);
        expect(useGameBridge.getState().gameState.inventory).toEqual(inventory);
        expect(normalizeRelicInstance(instance('cozy_socks', { bonus_mult: 0.8 })).state.bonus_mult).toBe(0.05);
    });

    it('offers all new passive relics in the standard reward pool', () => {
        const choices = generateRelicPackChoices(new SeededRNG(42), 100, []);
        for (const id of ['royal_couple', 'clean_sweep', 'two_peas', 'climbing_vine', 'extra_life']) {
            expect(choices).toContain(id);
            expect(RelicManager.getRelicConfig(id)?.tableAction).toBeUndefined();
        }
    });
});

describe('Sweet Spot cash', () => {
    it.each(['win', 'loss', 'bust', 'push'] as const)('pays $5 per qualifying card on a %s', outcome => {
        const handCards = cards('6', '6', '7', '8', '9', '5', '10');
        const inventory = [instance('sweet_spot')];
        const base = evaluateHandScore(handCards, outcome === 'win', false, [], 1, undefined, outcome);
        const score = evaluateHandScore(handCards, outcome === 'win', false, inventory, 1, undefined, outcome);
        expect(score.totalChips - base.totalChips).toBe(25);
        expect(score.criteria.find(row => row.id === 'sweet_spot')).toMatchObject({
            chips: 25, count: 5, sourceRelicId: 'sweet_spot', cardIds: handCards.slice(0, 5).map(card => card.id),
        });
    });

    it('pays separately across all three hands and excludes other ranks', () => {
        const state = { ...start(), inventory: [instance('sweet_spot')] };
        const hands = [hand(['6'], 'win', 0), hand(['8'], 'win', 1), hand(['9'], 'win', 2)];
        const result = scoreRound(state, hands).nextState;
        const base = scoreRound({ ...state, inventory: [] }, hands).nextState;
        expect(result.runningSummary!.chips - base.runningSummary!.chips).toBe(15);
        expect(evaluateHandScore(cards('5', '10', 'J'), false, false, state.inventory)
            .criteria.some(row => row.id === 'sweet_spot')).toBe(false);
    });

    it('counts enhanced ordinary cards once and ignores legacy standalone bonus cards', () => {
        const handCards = cards('6', '7', '8');
        handCards[0].specialEffect = { type: 'chip', value: 4 };
        handCards[1].type = 'chip';
        handCards[1].chips = 10;
        expect(evaluateHandScore(handCards, true, false, [instance('sweet_spot')])
            .criteria.find(row => row.id === 'sweet_spot')?.chips).toBe(10);
    });
});

describe('Prismatic Charm flush suits', () => {
    const flushHand = (suit: Card['suit'], id = 0) => ({ ...hand(['2', '4'], 'win', id),
        cards: cards('2', '4').map(card => ({ ...card, id: `${suit}-${id}-${card.id}`, suit })) });

    it.each([
        [['hearts', 'diamonds', 'clubs'], 0.2],
        [['hearts', 'hearts', 'clubs'], 0],
        [['hearts', 'diamonds'], 0],
        [['hearts', 'diamonds', 'clubs', 'spades'], 0.2],
    ] as [Card['suit'][], number][])('awards the bonus once for suits %j', (suits, bonus) => {
        const state = { ...start(), inventory: [instance('prismatic_charm')] };
        const hands = suits.map((suit, id) => flushHand(suit, id));
        const base = scoreRound({ ...state, inventory: [] }, hands).nextState;
        const result = scoreRound(state, hands);
        expect(result.nextState.runningSummary!.mult - base.runningSummary!.mult).toBeCloseTo(bonus);
        expect(result.events.filter(event => event.type === 'relic_activated' && event.relicId === 'prismatic_charm'))
            .toHaveLength(bonus ? 1 : 0);
    });

    it('counts different flushes in the same hand and does not require wins', () => {
        const mixed = { ...hand([], 'bust'), cards: [...flushHand('hearts').cards, ...flushHand('diamonds').cards,
            ...flushHand('spades').cards] };
        const state = { ...start(), inventory: [instance('prismatic_charm')] };
        const result = scoreRound(state, [mixed]).nextState;
        const base = scoreRound({ ...state, inventory: [] }, [mixed]).nextState;
        expect(result.runningSummary!.mult - base.runningSummary!.mult).toBeCloseTo(0.2);
        // No carrying suits between rounds.
        const next = scoreRound(result, [flushHand('clubs')]).nextState;
        const nextBase = scoreRound({ ...result, inventory: [] }, [flushHand('clubs')]).nextState;
        expect(next.runningSummary!.mult).toBeCloseTo(nextBase.runningSummary!.mult);
    });
});

describe('Stage Fright next-round dealer stand', () => {
    const vigintis = [hand(['A', 'K'], 'win', 0), hand(['10', '9', '2'], 'win', 1), hand(['10', '8'], 'loss', 2)];
    const armedState = () => scoreRound({ ...start(), inventory: [instance('stage_fright')] }, vigintis).nextState;

    it.each([4, 14, 15, 16, 17, 20])('stands on %i for the next round', value => {
        const armed = armedState();
        expect(armed.inventory[0].state.armed).toBe(true);
        const dealerCards = value === 4 ? cards('2', '2') : cards('10', String(value - 10) as Card['rank']);
        const result = processAction({ ...armed, phase: 'dealer_turn',
            dealer: { cards: dealerCards.map((card, index) => ({ ...card, isFaceUp: index > 0 })), blackjackValue: 0, isRevealed: false },
        }, { type: 'resolve_dealer_turn' });
        expect(result.events.some(event => event.type === 'dealer_hit')).toBe(false);
        expect(result.events).toContainEqual({ type: 'dealer_stand', value });
        expect(result.nextState.inventory[0].state.armed).toBe(true);
    });

    it('expires after exactly one scored round and can be earned again', () => {
        const state = armedState();
        const next = scoreRound(state, [hand(['10', '8'])]).nextState;
        expect(next.inventory[0].state.armed).toBe(false);
        expect(executeValueHook('shouldDealerHit', true, { inventory: [...next.inventory], blackjackValue: 12 })).toBe(true);
        expect(scoreRound(state, vigintis).nextState.inventory[0].state.armed).toBe(true);
    });

    it('does not arm with just one Viginti or a losing 21', () => {
        const state = { ...start(), inventory: [instance('stage_fright')] };
        expect(scoreRound(state, vigintis.slice(0, 1)).nextState.inventory[0].state.armed).toBe(false);
        expect(scoreRound(state, [vigintis[0], { ...vigintis[1], outcome: 'loss' }]).nextState.inventory[0].state.armed).toBe(false);
    });

    it.each([['stage_fright', 'idiot'], ['idiot', 'stage_fright']])('overrides Idiot with inventory order %s, %s', (first, second) => {
        const inventory = [instance(first, { armed: true }), instance(second, { armed: true })];
        expect(executeValueHook('shouldDealerHit', true, { inventory, blackjackValue: 17 })).toBe(false);
    });

    it('retains its pending effect across import and is available in normal packs', () => {
        const state = armedState();
        expect(useGameBridge.getState().loadGameState(JSON.stringify(state))).toBe(true);
        expect(useGameBridge.getState().gameState.inventory[0].state.armed).toBe(true);
        const choices = generateRelicPackChoices(new SeededRNG(43), 100, []);
        for (const id of ['sweet_spot', 'prismatic_charm', 'stage_fright']) expect(choices).toContain(id);
    });
});
