import { afterEach, describe, expect, it } from 'vitest';
import { createInitialState, getValidActions, processAction } from '../engine';
import { BOSS_REGISTRY, chooseBoss, getBustLimit, getHandRules } from '../bosses';
import { canPlayHand } from '../economy';
import { createChallenges } from '../challenges';
import { SeededRNG } from '../rng';
import type { GameState } from '../GameState';
import type { Card, PlayerHand } from '../../types';
import { getBlackjackScore, evaluateHandScore } from '../../logic/scoring';
import { TUTORIAL_STEPS } from '../tutorial/definitions';
import { useGameBridge } from '../../store/gameBridge';
import { finishOpeningPack } from './fixtures';
import { chooseAction, observe } from '../../simulation/bot';
import { RaisePlayPolicy, observeRaises } from '../../simulation/raisePolicy';

const cards = (...ranks: Card['rank'][]): Card[] => ranks.map((rank, i) => ({ id: `${rank}-${i}`, rank, suit: 'hearts', isFaceUp: true }));
const act = (state: GameState, action: Parameters<typeof processAction>[1]) => processAction(state, action).nextState;
const hand = (ranks: Card['rank'][], id = 0, bossId: string | null = null): PlayerHand => {
    const handCards = cards(...ranks);
    const limit = getBustLimit({ bossId });
    const value = getBlackjackScore(handCards, [], false, limit, getHandRules({ bossId }));
    return { id, cards: handCards, blackjackValue: value, isBust: value > limit, isHeld: false };
};
function playing(bossId: string): GameState {
    const start = act(createInitialState(), { type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 42,
        globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id) });
    return { ...act(finishOpeningPack(start), { type: 'deal' }), bossId, challengeStage: 2,
        challenges: createChallenges(2), playerHands: [hand(['2']), hand(['3'], 1), hand(['4'], 2)] };
}
function outcomes(bossId: string, ranks: Card['rank'][][], dealerValue = 18) {
    const state: GameState = { ...playing(bossId), phase: 'resolving_outcomes',
        dealer: { cards: cards('10', '8'), blackjackValue: dealerValue, isRevealed: true },
        playerHands: ranks.map((r, id) => hand(r, id, bossId)) };
    return act(state, { type: 'resolve_hand_outcome' });
}
afterEach(() => useGameBridge.getState().reset());

describe('random boss pool', () => {
    it('can select all six bosses deterministically, only on boss antes', () => {
        const found = new Set<string | null>();
        for (let seed = 1; seed <= 200; seed++) {
            const rngSeed = seed * 98765;
            const selected = chooseBoss(2, new SeededRNG(rngSeed));
            expect(chooseBoss(2, new SeededRNG(rngSeed))).toBe(selected);
            expect(chooseBoss(1, new SeededRNG(rngSeed))).toBeNull();
            found.add(selected);
        }
        expect(found).toEqual(new Set(BOSS_REGISTRY.map(boss => boss.id)));
    });

    it.each(BOSS_REGISTRY)('preserves $name and its rules through export/import', boss => {
        const state = playing(boss.id);
        expect(useGameBridge.getState().loadGameState(JSON.stringify(state))).toBe(true);
        expect(useGameBridge.getState().gameState.bossId).toBe(boss.id);
        expect(getHandRules(useGameBridge.getState().gameState)).toEqual(getHandRules(state));
    });
});

describe('Tight Fit', () => {
    it('accepts a third card, rejects a fourth, and auto-stands when all hands are full', () => {
        const base = playing('tight_fit');
        const state: GameState = { ...base, playerHands: [hand(['2', '2']), hand(['3', '3', '3'], 1), hand(['4', '4', '4'], 2)],
            drawnCards: cards('2', '5'), selectedDrawIndex: 0, modifiers: { drawCountMod: 0, placeCountMod: 2 } };
        const result = processAction(state, { type: 'place_card', handIndex: 0 });
        expect(result.nextState.playerHands[0].cards).toHaveLength(3);
        expect(result.nextState.drawnCards).toEqual([]);
        expect(result.events).toContainEqual({ type: 'auto_stand_triggered' });
        expect(getValidActions(result.nextState)).not.toContainEqual({ type: 'draw' });
        const fourth = { ...result.nextState, drawnCards: cards('2'), selectedDrawIndex: 0 };
        expect(getValidActions(fourth)).not.toContainEqual({ type: 'place_card', handIndex: 0 });
        expect(act(fourth, { type: 'place_card', handIndex: 0 })).toEqual(fourth);
        expect(canPlayHand(fourth.playerHands[0], getHandRules(fourth))).toBe(false);
        expect(canPlayHand(fourth.playerHands[0])).toBe(true);
    });

    it.each(['hold', 'double_down'])('%s respects the three-card cap without spending a charge or held card', relicId => {
        const state: GameState = { ...playing('tight_fit'), playerHands: [hand(['2', '2', '2'])],
            inventory: [{ id: relicId, state: {} }], tableActionCharges: { [relicId]: 3 }, tableActionHeldCards: { hold: cards('2')[0] },
            interactionMode: 'select_hand', activeTableActionId: relicId };
        expect(getValidActions(state)).not.toContainEqual({ type: 'select_table_action_target', handIndex: 0 });
        expect(act(state, { type: 'select_table_action_target', handIndex: 0 })).toEqual(state);
        const available = { ...state, playerHands: [hand(['2', '2'])] };
        expect(act(available, { type: 'select_table_action_target', handIndex: 0 }).playerHands[0].cards).toHaveLength(3);
    });
});

describe('Three’s Company', () => {
    it.each([18, 24])('requires three cards even against a dealer total of %s', dealerValue => {
        const state = outcomes('threes_company', [['A', 'K'], ['10', '10'], ['7', '7', '7']], dealerValue);
        expect(state.playerHands.map(hand => hand.outcome)).toEqual(['loss', 'loss', 'win']);
        const scored = act(state, { type: 'score_round' });
        expect(scored.playerHands[1].finalScore?.criteria.map(row => row.id)).toContain('pair');
        expect(scored.playerHands[2].finalScore?.criteria.map(row => row.id)).toContain('viginti');
    });

    it('keeps a two-card 21 playable and recalculates its Ace after a third card', () => {
        const state: GameState = { ...playing('threes_company'), playerHands: [hand(['A', 'K'])],
            drawnCards: cards('2'), selectedDrawIndex: 0 };
        expect(getValidActions(state)).toContainEqual({ type: 'place_card', handIndex: 0 });
        const result = processAction(state, { type: 'place_card', handIndex: 0 });
        expect(result.nextState.playerHands[0]).toMatchObject({ blackjackValue: 13, isBust: false });
        expect(result.events).not.toContainEqual({ type: 'auto_stand_triggered' });
    });

    it.each(['hold', 'double_down'])('allows %s to add the required third card to 21', relicId => {
        const state: GameState = { ...playing('threes_company'), playerHands: [hand(['A', 'K'])],
            inventory: [{ id: relicId, state: {} }], tableActionCharges: { [relicId]: 3 }, tableActionHeldCards: { hold: cards('2')[0] } };
        expect(getValidActions(state)).toContainEqual({ type: 'activate_table_action', relicId });
        const targeting = act(state, { type: 'activate_table_action', relicId });
        expect(getValidActions(targeting)).toContainEqual({ type: 'select_table_action_target', handIndex: 0 });
        expect(act(targeting, { type: 'select_table_action_target', handIndex: 0 }).playerHands[0].cards).toHaveLength(3);
    });
});

describe('Hard Aces', () => {
    it('values opening player Aces at 1 and dealer Aces normally', () => {
        const base = playing('hard_aces');
        const state = act({ ...base, phase: 'entering_casino', cash: 1000,
            deckProbabilities: { ...base.deckProbabilities, ranks: { ace: 1, face: 0, upper: 0, lower: 0 } } }, { type: 'deal' });
        expect(state.playerHands[1].blackjackValue).toBe(1);
        expect(state.dealer.blackjackValue).toBe(11);
    });

    it.each([[], ['joker'], ['royal_couple'], ['joker', 'royal_couple']].map(ids => ({ ids })))('composes with relics $ids without restoring soft Aces', ({ ids }) => {
        const inventory = ids.map(id => ({ id, state: {} }));
        const handCards = cards('A', 'K');
        const rules = getHandRules({ bossId: 'hard_aces' });
        expect(getBlackjackScore(handCards, inventory, false, 21, rules)).toBe(11);
        expect(getBlackjackScore(handCards, inventory, true, 21, rules)).toBe(21);
        const score = evaluateHandScore(handCards, true, false, inventory, 0, undefined, 'win', {}, 21, rules);
        expect(score.criteria[0].id).toBe('win');
        expect(score.criteria.find(row => row.id === 'flush')?.chips).toBe(21);
    });

    it('uses hard Aces on ordinary placement and held-card placement', () => {
        const base = { ...playing('hard_aces'), playerHands: [hand(['K'])] };
        const placed = act({ ...base, drawnCards: cards('A'), selectedDrawIndex: 0 }, { type: 'place_card', handIndex: 0 });
        expect(placed.playerHands[0].blackjackValue).toBe(11);
        const state: GameState = { ...base, inventory: [{ id: 'hold', state: {} }], tableActionHeldCards: { hold: cards('A')[0] },
            interactionMode: 'select_hand', activeTableActionId: 'hold' };
        expect(act(state, { type: 'select_table_action_target', handIndex: 0 }).playerHands[0].blackjackValue).toBe(11);
    });
});

describe('Dead Hand', () => {
    it('removes all busted pattern payouts and their Raises while retaining the bust penalty', () => {
        const resolved = outcomes('dead_hand', [['9', '9', '10'], ['Q', 'K', '2']]);
        const state = { ...resolved, handUpgrades: { raise_pair_combo: 1 } };
        const result = processAction(state, { type: 'score_round' });
        expect(result.nextState.playerHands.map(hand => hand.finalScore?.criteria.map(row => row.id))).toEqual([['bust'], ['bust']]);
        expect(result.events.some(event => event.type === 'scoring_row_intro' && event.criterion.id !== 'bust')).toBe(false);
        expect(result.nextState.playerHands[0].finalScore?.criteria[0]).toMatchObject({ chips: -20, multiplier: -.1 });
        expect(result.nextState.challenges.find(goal => goal.metric === 'flushes')?.progress).toBe(0);
        const ordinary = act({ ...state, bossId: null }, { type: 'score_round' });
        expect(ordinary.playerHands[0].finalScore?.criteria.some(row => row.id === 'pair')).toBe(true);
        expect(ordinary.playerHands[1].finalScore?.criteria.some(row => row.id === 'royalty')).toBe(true);
    });

    it('keeps patterns on non-busted losing hands', () => {
        const result = act(outcomes('dead_hand', [['3', '3']]), { type: 'score_round' });
        expect(result.playerHands[0].finalScore?.criteria.map(row => row.id)).toEqual(['loss', 'pair', 'flush']);
    });
});

describe('Underhand', () => {
    it('wins strictly below the dealer, loses ties and higher totals, and never wins on a player bust', () => {
        const result = outcomes('underhand', [['8', '9'], ['9', '9'], ['10', '9'], ['A', 'K'], ['K', 'Q', '2']]);
        expect(result.playerHands.map(hand => hand.outcome)).toEqual(['win', 'loss', 'loss', 'loss', 'bust']);
        const scored = act(result, { type: 'score_round' });
        expect(scored.playerHands[3].finalScore?.criteria.map(row => row.id)).toContain('loss');
        expect(scored.playerHands[3].finalScore?.criteria.map(row => row.id)).not.toContain('viginti');
    });

    it('keeps dealer bust wins, player bust losses, and empty hands inactive', () => {
        const result = outcomes('underhand', [['2'], ['K', 'Q', '2'], []], 24);
        expect(result.playerHands.map(hand => hand.outcome)).toEqual(['win', 'bust', null]);
    });
});

describe('boss-aware simulation actions', () => {
    it.each(BOSS_REGISTRY)('estimates $name payouts using its actual rules', boss => {
        const state = outcomes(boss.id, [['9', '9'], ['A', 'K'], ['K', 'Q', '2']]);
        const policy = new RaisePlayPolicy(observeRaises(state));
        const scored = act(state, { type: 'score_round' });
        const chips = scored.playerHands.reduce((sum, hand) => sum + (hand.finalScore?.totalChips ?? 0), 0);
        const mult = scored.playerHands.reduce((sum, hand) => sum + (hand.finalScore?.totalMultiplier ?? 0), 1);
        expect(policy.expectedPayout(state.playerHands)).toBe(Math.floor(Number((chips * mult).toFixed(8))));
    });

    it.each(BOSS_REGISTRY)('only chooses legal placements for $name', boss => {
        const state: GameState = { ...playing(boss.id), playerHands: [hand(['2', '2', '2']), hand(['A', 'K'], 1), hand(['3'], 2)],
            drawnCards: cards('2'), selectedDrawIndex: 0 };
        for (const bot of ['simple', 'score'] as const) {
            expect(getValidActions(state)).toContainEqual(chooseAction(observe(state), bot));
        }
    });
});
