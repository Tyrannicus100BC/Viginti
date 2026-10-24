import { describe, expect, it } from 'vitest';
import { processAction } from '../../engine/engine';
import { SeededRNG } from '../../engine/rng';
import { getRaise } from '../../logic/handScoring';
import { getBlackjackScore } from '../../logic/scoring';
import type { Card, PlayerHand } from '../../types';
import { INITIAL_ROW_COUNTS, RaisePlayPolicy, buildWeights, chooseRaiseOffer, dealerDistribution, observeRaises, ordinaryCards } from '../raisePolicy';
import { playRaiseRound, runRaiseGame, startRaiseRun, syntheticStack, validateRaiseRuns, type RaiseRunConfig } from '../raiseRuns';

const config: RaiseRunConfig = { trials: 1, seed: 42, maxRounds: 8, strategies: ['adaptive'], play: 'patterns' };
const card = (rank: Card['rank'], suit: Card['suit'] = 'hearts', id: string = `${rank}-${suit}`): Card => ({ rank, suit, id, isFaceUp: true });
const hand = (id: number, cards: Card[]): PlayerHand => ({ id, cards, blackjackValue: getBlackjackScore(cards), isBust: getBlackjackScore(cards) > 21, isHeld: false });
function dealt(seed = 42) {
    let state = startRaiseRun(seed);
    state = processAction(state, { type: 'skip_pack' }).nextState;
    state = processAction(state, { type: 'finish_pack' }).nextState;
    return processAction(state, { type: 'deal' }).nextState;
}

describe('Raise-focused play', () => {
    it('stands when every hand has five cards, even with room below the bust limit', () => {
        const state = { ...dealt(), playerHands: [0, 1, 2].map(id => hand(id,
            Array.from({ length: 5 }, (_, i) => card('2', 'hearts', `${id}-${i}`)))) };
        const observation = observeRaises(state), policy = new RaisePlayPolicy(observation);
        expect(policy.choose(observation)).toEqual({ type: 'stand' });
        expect(policy.expectedDraw(state.playerHands)).toBe(policy.expectedPayout(state.playerHands));
    });

    it('does not conflate card orders when the pair cap changes which ranks score', () => {
        const cards = [card('2'), card('2', 'clubs'), card('2', 'spades'), card('3', 'diamonds'), card('3')];
        const state = { ...dealt(), dealer: { cards: [card('K'), card('Q', 'clubs')], isRevealed: true, blackjackValue: 20 } };
        const policy = new RaisePlayPolicy(observeRaises(state));
        const payouts: number[] = [];
        for (const ordered of [cards, [...cards.slice(3), ...cards.slice(0, 3)]]) {
            const hands = [hand(0, ordered), hand(1, []), hand(2, [])];
            const outcomes = processAction({ ...state, playerHands: hands, phase: 'resolving_outcomes' }, { type: 'resolve_hand_outcome' }).nextState;
            const scoring = processAction(outcomes, { type: 'score_round' }).events.find(event => event.type === 'deal_scoring_complete')!;
            expect(policy.expectedPayout(hands)).toBeCloseTo(scoring.finalScore);
            payouts.push(scoring.finalScore);
        }
        expect(payouts[0]).not.toBe(payouts[1]);
    });

    it('uses normalized production rank/suit probabilities and integrates the hidden dealer', () => {
        const observation = observeRaises(dealt());
        expect(ordinaryCards(observation.deckProbabilities).reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1);
        for (const rank of ['A', '6', 'K'] as const) {
            const distribution = dealerDistribution({ ...observation, dealerCards: [card(rank)] });
            expect(distribution.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1);
            expect(distribution.every(item => item.value >= 17)).toBe(true);
        }
    });

    it('matches production shared-pot settlement with stacked raises, multiple pairs and a bust', () => {
        for (const focus of ['pair', 'straight', 'flush', 'pair-straight'] as const) {
            const cards = [hand(0, [card('4'), card('4', 'clubs'), card('4', 'spades')]),
                hand(1, [card('9'), card('10'), card('K')]), hand(2, [card('2'), card('3', 'clubs')])];
            const state = { ...dealt(), handUpgrades: syntheticStack(focus, 16), playerHands: cards,
                dealer: { cards: [card('K', 'diamonds'), card('Q', 'clubs')], isRevealed: true, blackjackValue: 20 } };
            const policy = new RaisePlayPolicy(observeRaises(state));
            const outcomes = processAction({ ...state, phase: 'resolving_outcomes' }, { type: 'resolve_hand_outcome' }).nextState;
            const result = processAction(outcomes, { type: 'score_round' });
            const event = result.events.find(event => event.type === 'deal_scoring_complete');
            expect(event).toBeDefined();
            expect(policy.expectedPayout(state.playerHands)).toBeCloseTo(event!.finalScore);
        }
    });

    it('changes placement to match the actual accumulated pair versus flush bonuses', () => {
        const state = { ...dealt(), playerHands: [hand(0, [card('5', 'clubs')]), hand(1, [card('3')]), hand(2, [card('K'), card('Q')])],
            drawnCards: [card('5')], selectedDrawIndex: 0 };
        const pair = { ...state, handUpgrades: syntheticStack('pair', 32) };
        const flush = { ...state, handUpgrades: syntheticStack('flush', 32) };
        expect(new RaisePlayPolicy(observeRaises(pair)).choose(observeRaises(pair))).toEqual({ type: 'place_card', handIndex: 0 });
        expect(new RaisePlayPolicy(observeRaises(flush)).choose(observeRaises(flush))).toEqual({ type: 'place_card', handIndex: 1 });
    });

    it('can draw beyond 17 when the upgraded patterns outweigh bust risk', () => {
        const state = { ...dealt(), handUpgrades: syntheticStack('pair', 100),
            playerHands: [hand(0, [card('9'), card('9', 'clubs')]), hand(1, [card('8'), card('9', 'diamonds')]), hand(2, [card('7'), card('10')])] };
        const observation = observeRaises(state);
        expect(new RaisePlayPolicy(observation).choose(observation)).toEqual({ type: 'draw' });
    });

    it('preserves the production rule that a busted three-of-a-kind pays three upgraded pairs', () => {
        const state = { ...dealt(), playerHands: [hand(0, [card('9'), card('9', 'clubs'), card('9', 'spades')]), hand(1, []), hand(2, [])],
            dealer: { cards: [card('K', 'diamonds'), card('Q', 'clubs')], isRevealed: true, blackjackValue: 20 } };
        const pay = (upgrades: ReturnType<typeof syntheticStack>) => {
            const outcomes = processAction({ ...state, handUpgrades: upgrades, phase: 'resolving_outcomes' }, { type: 'resolve_hand_outcome' }).nextState;
            return processAction(outcomes, { type: 'score_round' });
        };
        const original = pay({}), stacked = pay(syntheticStack('pair', 32));
        expect(stacked.nextState.playerHands[0].outcome).toBe('bust');
        expect(stacked.nextState.playerHands[0].finalScore?.criteria.filter(row => row.id === 'pair')).toHaveLength(3);
        const payout = (result: typeof stacked) => result.events.find(event => event.type === 'deal_scoring_complete')!.finalScore;
        expect(payout(original)).toBe(51);
        expect(payout(stacked)).toBe(387); // (3 × ($23 base Pair + $48 raises) − $20 Bust) × 201%
    });

    it('does not consult the hidden dealer card or engine RNG', () => {
        const original = dealt();
        const changed = { ...original, rngState: original.rngState + 987,
            dealer: { ...original.dealer, cards: original.dealer.cards.map(card => card.isFaceUp ? card : { ...card, rank: 'A' as const }) } };
        const first = observeRaises(original), second = observeRaises(changed);
        expect(first).toEqual(second);
        expect(new RaisePlayPolicy(first).choose(first)).toEqual(new RaisePlayPolicy(second).choose(second));
        expect(first).not.toHaveProperty('rngState');
    });
});

describe('Raise selection and progression', () => {
    it('reinforces the leading build and changes the preferred reward between pair and flush', () => {
        const pair = 'raise_v9_0_simple_pair_cash~4', flush = 'raise_v9_0_simple_flush_cash~2';
        const pairBuild = syntheticStack('pair', 16), flushBuild = syntheticStack('flush', 16);
        expect(buildWeights('adaptive', pairBuild).pair).toBeGreaterThan(buildWeights('adaptive', pairBuild).flush!);
        expect(chooseRaiseOffer([pair, flush], 'pair', {}, INITIAL_ROW_COUNTS, new SeededRNG(1))).toBe(pair);
        expect(chooseRaiseOffer([pair, flush], 'flush', {}, INITIAL_ROW_COUNTS, new SeededRNG(1))).toBe(flush);
        expect(chooseRaiseOffer([pair, flush], 'adaptive', flushBuild, INITIAL_ROW_COUNTS, new SeededRNG(1))).toBe(flush);
    });

    it('accounts for drawbacks and skips offers whose combined effect is harmful', () => {
        const harmful = 'raise_v9_0_tradeoff_flush_cash_bust_cash~4~7';
        expect(getRaise(harmful)).toBeDefined();
        expect(chooseRaiseOffer([harmful], 'adaptive', {}, { ...INITIAL_ROW_COUNTS, flush: .15, bust: 3 }, new SeededRNG(1))).toBeUndefined();
    });

    it('replays actual offered rewards and cash through the engine deterministically', () => {
        const first = runRaiseGame(config, 'adaptive', 0), second = runRaiseGame(config, 'adaptive', 0);
        expect(first).toEqual(second);
        expect(first.rounds).toHaveLength(8);
        expect(first.stop).toBe('horizon');
        expect(first.rounds[0].anteNumber).toBe(1);
        expect(first.rounds[4].anteNumber).toBe(2);
        expect(first.picks.every(pick => pick.offers.includes(pick.chosen) && getRaise(pick.chosen)?.id.startsWith('raise_v10_'))).toBe(true);
        let cash = 100;
        for (const row of first.rounds) { cash = Math.max(0, cash - row.ante + row.payout); expect(row.cash).toBe(cash); }
        expect(Object.values(first.upgrades).reduce((a, b) => a + b, 0)).toBe(first.picks.length);
    });

    it('never mutates an input snapshot and captures the fixed-play no-raise counterfactual', () => {
        const state = { ...dealt(), handUpgrades: syntheticStack('flush', 8) }, before = structuredClone(state);
        const result = playRaiseRound(state, 'patterns');
        expect(state).toEqual(before);
        expect(result.round.payout).toBeGreaterThanOrEqual(result.round.noRaisePayout);
        expect(result.round.raises).toBe(8);
    });

    it('uses equal total raise budgets for synthetic single and combined builds', () => {
        for (const focus of ['pair', 'straight', 'flush', 'pair-straight'] as const) for (const rarity of ['Common', 'Uncommon'] as const) {
            const stack = syntheticStack(focus, 16, rarity);
            expect(Object.values(stack).reduce((a, b) => a + b, 0)).toBe(16);
            expect(Object.keys(stack).every(id => getRaise(id)?.rarity === rarity && getRaise(id)?.modifiers.length === 1)).toBe(true);
        }
        expect(() => syntheticStack('pair', -1)).toThrow();
        expect(() => validateRaiseRuns({ ...config, maxRounds: 0 })).toThrow();
        expect(() => validateRaiseRuns({ ...config, strategies: [] })).toThrow();
    });
});
