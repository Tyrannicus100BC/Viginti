import { getPackDefinition } from '../../logic/packs';
import { describe, expect, it } from 'vitest';
import { createInitialState, getValidActions, processAction } from '../engine';
import { createChallenges } from '../challenges';
import { BASE_ANTE, getNextAnte } from '../economy';
import type { GameState } from '../GameState';
import type { PlayerHand } from '../../types';
import { finishOpeningPack } from './fixtures';
import { TUTORIAL_STEPS } from '../tutorial/definitions';

const start = () => finishOpeningPack(processAction(createInitialState(), {
    type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 42,
    globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id),
}).nextState);
const settle = (state: GameState, earnings = 0, playerHands: readonly PlayerHand[] = []) => processAction({
    ...state, phase: 'scoring', runningSummary: { chips: earnings, mult: 1 }, playerHands,
}, { type: 'score_round' });
const beginRewards = (state: GameState) => processAction(state, { type: 'deal' }).nextState;
const goal = (state: GameState, metric: string) => state.challenges.find(challenge => challenge.metric === metric)!;
const pairs = (size = 2): PlayerHand[] => [{
    id: 0, cards: Array.from({ length: size }, (_, index) => ({ id: `pair-${index}`, rank: '2',
        suit: index % 2 ? 'hearts' : 'clubs', isFaceUp: true })),
    blackjackValue: size * 2, isHeld: true, isBust: false, isInactive: false, outcome: 'loss',
}];

describe('challenge progression', () => {
    it.each(['rounds', 'earnings'] as const)('offers Raise and Relic packs when the %s Main goal completes', metric => {
        const before = start();
        const earned = settle({ ...before, challenges: before.challenges.map(challenge => challenge.metric === metric
            ? { ...challenge, progress: challenge.target - 1 } : challenge) }, metric === 'earnings' ? 1 : 0).nextState;
        expect(earned.challengeRewards).toMatchObject([{ tier: 'major' }]);
        const offers = beginRewards(earned).offeredPacks.map(id => getPackDefinition(id).family);
        expect(offers).toHaveLength(3);
        expect(offers).toEqual(expect.arrayContaining(['raise', 'relic']));
    });

    it('always creates two competing Main goals and a rotating side goal', () => {
        for (let stage = 0; stage < 6; stage++) {
            const ante = [50, 100, 175, 290, 460, 715][stage];
            const board = createChallenges(stage, ante);
            expect(board.filter(challenge => challenge.main).map(challenge => challenge.metric)).toEqual(['rounds', 'earnings']);
            expect(board.filter(challenge => !challenge.main)).toHaveLength(1);
            expect(board.find(challenge => challenge.metric === 'earnings')?.target).toBe([300, 600, 1050, 1740, 2760, 4290][stage]);
            expect(board.every(challenge => challenge.progress === 0 && !challenge.completed)).toBe(true);
        }
        expect([0, 1, 2, 3].map(stage => createChallenges(stage)[2].metric)).toEqual(['pairs', 'straights', 'flushes', 'wins']);
    });

    it('accumulates earnings across payouts independently of the remaining bankroll', () => {
        let state = settle(start(), 100).nextState;
        expect(goal(state, 'earnings').progress).toBe(100);
        state = settle({ ...state, cash: 0 }, 199).nextState;
        expect(goal(state, 'earnings').progress).toBe(299);
        expect(state.ante).toBe(50);
        const result = settle({ ...state, cash: 0 }, 1);
        expect(result.nextState).toMatchObject({ ante: 50, challengeStage: 0, phase: 'deal_over', cash: 1 });
        expect(goal(result.nextState, 'earnings')).toMatchObject({ completed: true, progress: 300 });
        const opened = beginRewards(result.nextState);
        expect(opened).toMatchObject({ phase: 'pack_choice', cash: 1, ante: 50 });
        expect(result.nextState.challengeRewards).toMatchObject([{ tier: 'major', title: 'Money Maker' }]);
        expect(opened.offeredPacks).toHaveLength(3);
        expect(opened.offeredPacks.every(id => getPackDefinition(id).offerCount === 5)).toBe(true);
        const returned = finishOpeningPack(opened);
        expect(returned).toMatchObject({ ante: 100, challengeStage: 1, phase: 'deal_over' });
        expect(returned.challenges.every(challenge => challenge.progress === 0)).toBe(true);
    });

    it('allows a single large payout to advance exactly one stage without carrying earnings over', () => {
        const earned = settle(start(), 10000).nextState;
        expect(earned.challengeRewards).toHaveLength(1);
        const state = finishOpeningPack(beginRewards(earned));
        expect(state).toMatchObject({ ante: 100, challengeStage: 1 });
        expect(state.challengeRewards).toHaveLength(0);
        expect(goal(state, 'earnings').progress).toBe(0);
        expect(goal(state, 'rounds').progress).toBe(0);
    });

    it('awards just one major pack if both Main goals complete together', () => {
        const before = start();
        const result = settle({ ...before, challenges: before.challenges.map(challenge => challenge.metric === 'rounds'
            ? { ...challenge, progress: 3 } : challenge) }, 500);
        expect(result.nextState.challengeRewards).toHaveLength(1);
        expect(result.events.filter(event => event.type === 'ante_increased')).toHaveLength(0);
        expect(result.nextState.ante).toBe(50);
        expect(finishOpeningPack(beginRewards(result.nextState)).ante).toBe(100);
    });

    it('counts a pair hand once even with multiple matching pairs, and counts each scoring hand separately', () => {
        let state = start();
        state = settle(state, 0, pairs(3)).nextState;
        expect(goal(state, 'pairs').progress).toBe(1);
        state = settle(state, 0, [...pairs(), { ...pairs()[0], id: 1 }]).nextState;
        expect(goal(state, 'pairs').progress).toBe(3);
    });

    it.each([
        { metric: 'pairs', stage: 0, target: 4, ranks: ['2', '2'], suits: ['clubs', 'hearts'] },
        { metric: 'straights', stage: 1, target: 5, ranks: ['2', '3'], suits: ['clubs', 'hearts'] },
        { metric: 'flushes', stage: 2, target: 6, ranks: ['2', '4'], suits: ['clubs', 'clubs'] },
    ] as const)('completes the $metric goal after $target scoring hands', ({ metric, stage, target, ranks, suits }) => {
        const challenges = createChallenges(stage).map(challenge => challenge.metric === metric
            ? { ...challenge, progress: target - 2 } : challenge);
        expect(challenges.find(challenge => challenge.metric === metric)).toMatchObject({
            target, description: `Score ${target} ${metric === 'flushes' ? 'flush' : metric.slice(0, -1)} hands`,
        });
        const hand: PlayerHand = { ...pairs()[0], cards: ranks.map((rank, index) => ({
            id: `pattern-${index}`, rank, suit: suits[index], isFaceUp: true,
        })), blackjackValue: metric === 'pairs' ? 4 : metric === 'straights' ? 5 : 6 };
        const before = settle({ ...start(), challenges }, 0, [hand]).nextState;
        expect(goal(before, metric)).toMatchObject({ progress: target - 1, completed: false });
        expect(before.challengeRewards).toEqual([]);
        const completed = settle(before, 0, [hand]).nextState;
        expect(goal(completed, metric)).toMatchObject({ progress: target, completed: true });
        expect(completed.challengeRewards).toMatchObject([{ tier: 'minor' }]);
    });

    it('awards a side pack once without raising the ante or resetting other goals', () => {
        const before = start();
        const result = settle({ ...before, challenges: before.challenges.map(challenge => challenge.metric === 'pairs'
            ? { ...challenge, progress: challenge.target - 1 } : challenge) }, 0, pairs());
        let state = result.nextState;
        expect(state.ante).toBe(50);
        expect(goal(state, 'rounds').progress).toBe(1);
        expect(goal(state, 'pairs')).toMatchObject({ progress: 4, completed: true });
        expect(state.offeredPacks).toEqual([]);
        state = beginRewards(state);
        expect(state.offeredPacks).toHaveLength(3);
        expect(state.offeredPacks.every(id => getPackDefinition(id).pickCount === 1)).toBe(true);
        expect(state.challengeRewards).toMatchObject([{ tier: 'minor' }]);
        expect(result.events.some(event => event.type === 'ante_increased')).toBe(false);
        state = finishOpeningPack(state);
        expect(state.challengeRewards).toEqual([]);
        state = settle(state, 0, pairs()).nextState;
        expect(state.phase).toBe('deal_over');
        expect(goal(state, 'pairs').progress).toBe(4);
    });

    it('queues simultaneous side and Main rewards and requires both before another deal', () => {
        const before = start();
        let state = settle({ ...before, challenges: before.challenges.map(challenge => ({ ...challenge,
            progress: challenge.metric === 'rounds' ? 3 : challenge.metric === 'pairs' ? challenge.target - 1 : 0,
        })) }, 0, pairs()).nextState;
        expect(state.challengeRewards.map(reward => reward.tier)).toEqual(['major', 'minor']);
        const completedBoard = state.challenges;
        expect(state.phase).toBe('deal_over');
        const waiting = state;
        // Debug pack previews must leave the earned queue and ante untouched.
        const debug = processAction(state, { type: 'debug_open_pack', packId: 'raise_basic' }).nextState;
        const returned = finishOpeningPack(debug);
        expect(returned.challengeRewards).toEqual(waiting.challengeRewards);
        expect(returned.ante).toBe(50);
        expect(returned.challenges).toEqual(completedBoard);
        state = beginRewards(returned);
        expect(state.cash).toBe(waiting.cash);
        expect(waiting.playerHands[0].cards).toHaveLength(2);
        expect(state.playerHands.every(hand => hand.cards.length === 0)).toBe(true);
        expect(state.runningSummary).toBeNull();
        expect(state.dealsTaken).toBe(waiting.dealsTaken);
        expect(state.challenges).toEqual(completedBoard);
        state = finishOpeningPack(state);
        expect(state.ante).toBe(50);
        expect(state.challenges).toEqual(completedBoard);
        expect(state.phase).toBe('pack_choice');
        expect(state.challengeRewards.map(reward => reward.tier)).toEqual(['minor']);
        expect(state.offeredPacks).toHaveLength(3);
        expect(state.offeredPacks.every(id => getPackDefinition(id).pickCount === 1)).toBe(true);
        expect(getValidActions(state)).toEqual([...state.offeredPacks.map(packId => ({ type: 'open_pack', packId })), { type: 'skip_pack' }]);
        state = finishOpeningPack(state);
        expect(state.phase).toBe('deal_over');
        expect(state.challengeRewards).toEqual([]);
        expect(state.challenges).toEqual(createChallenges(1, 100));
        expect(state.ante).toBe(100);
        expect(state.playerHands.every(hand => hand.cards.length === 0)).toBe(true);
        expect(state.runningSummary).toBeNull();
        expect(state.playerHands.every(hand => !('finalScore' in hand))).toBe(true);
        expect(state.dealsTaken).toBe(waiting.dealsTaken);
    });

    it('skips unopened queued rewards one at a time and advances the ante after the last reward', () => {
        const before = start();
        const earned = settle({ ...before, challenges: before.challenges.map(challenge => ({ ...challenge,
            progress: challenge.metric === 'rounds' ? 3 : challenge.metric === 'pairs' ? challenge.target - 1 : 0,
        })) }, 0, pairs()).nextState;
        let state = beginRewards(earned);
        expect(state.challengeRewards).toHaveLength(2);
        for (let remaining = 1; remaining >= 0; remaining--) {
            const skipped = processAction(state, { type: 'skip_pack' });
            expect(skipped.nextState).toEqual({ ...state, offeredPacks: [] });
            state = processAction(skipped.nextState, { type: 'finish_pack' }).nextState;
            expect(state.challengeRewards).toHaveLength(remaining);
            expect(state.cash).toBe(earned.cash);
            expect(state.dealsTaken).toBe(earned.dealsTaken);
            expect(state.inventory).toEqual(earned.inventory);
            expect(state.handUpgrades).toEqual(earned.handUpgrades);
            expect(state.ante).toBe(remaining ? 50 : 100);
            expect(state.phase).toBe(remaining ? 'pack_choice' : 'deal_over');
            expect(state.offeredPacks).toHaveLength(remaining ? 3 : 0);
        }
        expect(state.challenges).toEqual(createChallenges(1, 100));
    });

    it.each([0, 1, 2, 5, 20])('completes the stage %i cash goal in three debug clicks', stage => {
        const ante = Array.from({ length: stage }).reduce<number>(getNextAnte, BASE_ANTE);
        let state: GameState = { ...start(), phase: 'deal_over', ante, challengeStage: stage, challenges: createChallenges(stage, ante) };
        const before = state;
        const target = goal(state, 'earnings').target;
        const amount = Math.ceil(target / 3);
        for (let count = 1; count <= 3; count++) {
            const result = processAction(state, { type: 'debug_give_cash' });
            state = result.nextState;
            expect(goal(state, 'earnings').progress).toBe(Math.min(count * amount, target));
            expect(state.phase).toBe('deal_over');
            expect(state.ante).toBe(ante);
            expect(state.dealsTaken).toBe(before.dealsTaken);
        }
        expect(state.cash).toBe(before.cash + 3 * amount);
        expect(goal(state, 'earnings').completed).toBe(true);
        expect(state.challengeRewards).toMatchObject([{ tier: 'major', title: 'Money Maker' }]);
        const repeated = processAction(state, { type: 'debug_give_cash' }).nextState;
        expect(repeated.challengeRewards).toEqual(state.challengeRewards);
        expect(finishOpeningPack(beginRewards(repeated))).toMatchObject({ ante: getNextAnte(ante), challengeStage: stage + 1, phase: 'deal_over' });
    });

    it('keeps only one Main reward if debug earnings complete before survival completes', () => {
        const before = start();
        let state = processAction({ ...before, phase: 'playing', challenges: before.challenges.map(challenge =>
            challenge.metric === 'rounds' ? { ...challenge, progress: 3 } : challenge) },
            { type: 'debug_give_cash', amount: 300 }).nextState;
        expect(state.phase).toBe('playing');
        expect(state.challengeRewards).toHaveLength(1);
        state = settle(state, 0).nextState;
        expect(goal(state, 'rounds').completed).toBe(true);
        expect(state.challengeRewards).toHaveLength(1);
        expect(finishOpeningPack(beginRewards(state)).ante).toBe(100);
    });

    it('opens a debug-earned reward before the first deal without charging the ante', () => {
        const earned = processAction(start(), { type: 'debug_give_cash', amount: 300 }).nextState;
        const opened = beginRewards(earned);
        expect(opened).toMatchObject({ phase: 'pack_choice', cash: earned.cash, dealsTaken: 0 });
        const returned = finishOpeningPack(opened);
        expect(returned).toMatchObject({ phase: 'deal_over', ante: 100, cash: earned.cash });
        expect(returned.challengeRewards).toEqual([]);
    });

    it('starts with no challenges and replenishes them only after finishing the opening pack', () => {
        expect(createInitialState().challenges).toEqual([]);
        const opening = processAction(createInitialState(), { type: 'start_game', cityId: 'las_vegas',
            gamblerId: 'default', seed: 42, globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id) }).nextState;
        expect(opening.challenges).toEqual([]);
        const opened = processAction(opening, { type: 'open_pack', packId: opening.offeredPacks[0] }).nextState;
        expect(opened.challenges).toEqual([]);
        const skipped = processAction(opened, { type: 'skip_pack' }).nextState;
        expect(skipped.challenges).toEqual([]);
        const finished = processAction(skipped, { type: 'finish_pack' });
        expect(finished.nextState).toMatchObject({ phase: 'entering_casino', ante: 50, challengeStage: 0 });
        expect(finished.nextState.challenges).toEqual(createChallenges());
        expect(finished.events).toContainEqual({ type: 'challenges_updated', challenges: createChallenges() });
        expect(finished.events.some(event => event.type === 'ante_increased')).toBe(false);
    });

    it('does not credit money to challenges before the opening pack creates them', () => {
        const opening = processAction(createInitialState(), { type: 'start_game', cityId: 'las_vegas',
            gamblerId: 'default', seed: 42, globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id) }).nextState;
        const earned = processAction(opening, { type: 'debug_give_cash', amount: 300 }).nextState;
        expect(earned.challenges).toEqual([]);
        expect(earned.challengeRewards).toEqual([]);
        const returned = finishOpeningPack(earned);
        expect(returned).toMatchObject({ phase: 'entering_casino', ante: 50, cash: 400 });
        expect(returned.challenges).toEqual(createChallenges());
    });

    it('does not count removed debug cash or duplicate settlement as additional earnings', () => {
        const before = start();
        const debug = processAction(before, { type: 'debug_give_cash', amount: 100 }).nextState;
        const removed = processAction(debug, { type: 'debug_give_cash', amount: -50 }).nextState;
        expect(goal(removed, 'earnings').progress).toBe(100);
        const settled = settle(removed, 100).nextState;
        expect(goal(settled, 'earnings').progress).toBe(200);
        expect(processAction(settled, { type: 'score_round' }).nextState).toEqual(settled);
    });
});
