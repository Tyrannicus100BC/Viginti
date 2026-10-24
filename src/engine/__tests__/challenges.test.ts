import { describe, expect, it } from 'vitest';
import { createInitialState, processAction } from '../engine';
import { completeChallenges, advanceChallenges, createChallenges } from '../challenges';
import type { GameState } from '../GameState';
import type { Card, PlayerHand, Rank } from '../../types';
import { finishOpeningPack } from './fixtures';

const act = (state: GameState, action: Parameters<typeof processAction>[1]) => processAction(state, action).nextState;
const start = () => finishOpeningPack(act(createInitialState(), {
    type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 42,
}));
const settle = (state: GameState, earnings = 0, playerHands: readonly PlayerHand[] = []) => act({
    ...state, phase: 'scoring', runningSummary: { chips: earnings, mult: 1 }, playerHands,
}, { type: 'score_round' });
const pair: PlayerHand = { id: 0, cards: [
    { id: 'p1', rank: '2', suit: 'hearts' }, { id: 'p2', rank: '2', suit: 'clubs' },
], blackjackValue: 4, isHeld: true, isBust: false, outcome: 'loss' };

describe('four-round progression', () => {
    it('creates one survival goal and one rotating side challenge, with no main earnings goal', () => {
        for (let stage = 0; stage < 9; stage++) {
            const challenges = createChallenges(stage);
            expect(challenges).toHaveLength(2);
            expect(challenges.filter(goal => goal.main)).toMatchObject([{ metric: 'rounds', target: 4 }]);
            expect(challenges.some(goal => goal.metric === 'earnings')).toBe(false);
        }
        expect([0, 1, 2, 3].map(stage => createChallenges(stage)[1].metric)).toEqual(['pairs', 'straights', 'flushes', 'wins']);
    });

    it('cannot advance from a large payout or debug cash', () => {
        let state = act(start(), { type: 'debug_give_cash', amount: 100000 });
        state = settle(state, 100000);
        expect(state.challengeRewards).toEqual([]);
        expect(state.challenges[0]).toMatchObject({ progress: 1, completed: false });
        expect(state.ante).toBe(50);
        expect(act(state, { type: 'score_round' })).toEqual(state);
    });

    it('requires exactly four settled rounds and advances once after the reward', () => {
        let state = start();
        for (let round = 1; round <= 4; round++) {
            state = settle(state);
            expect(state.challenges[0].progress).toBe(round);
            expect(state.challengeRewards).toHaveLength(round === 4 ? 1 : 0);
            expect(state.ante).toBe(50);
        }
        state = act(state, { type: 'deal' });
        expect(state.pendingPack).toEqual({ packId: 'mixed_major', picksRemaining: 1 });
        state = finishOpeningPack(state);
        expect(state).toMatchObject({ ante: 100, challengeStage: 1, phase: 'deal_over', bossId: null });
        expect(state.challenges).toEqual(createChallenges(1));
        expect(state.challengeRewards).toEqual([]);
    });

    it('assigns the replacement after claiming rewards and only counts hands from the next round', () => {
        const before = start();
        const almost = { ...before, challenges: before.challenges.map(goal => goal.main ? goal : { ...goal, progress: 3 }) };
        const straight: PlayerHand = { ...pair, id: 1, cards: [{ id: 's1', rank: '2', suit: 'hearts' }, { id: 's2', rank: '3', suit: 'clubs' }], blackjackValue: 5 };
        let state = settle(almost, 0, [pair, straight]);
        expect(state.challengeRewards).toMatchObject([{ tier: 'minor' }]);
        expect(state.challenges.find(goal => !goal.completed && !goal.main)).toBeUndefined();
        const rounds = state.challenges[0];
        state = act(state, { type: 'deal' });
        expect(state.pendingPack?.packId).toBe('mixed_minor');
        state = finishOpeningPack(state);
        expect(state.ante).toBe(50);
        expect(state.challenges[0]).toEqual(rounds);
        expect(state.challenges).toHaveLength(2);
        expect(state.challenges[1]).toMatchObject({ metric: 'straights', progress: 0 });
        state = settle(state, 0, [straight]);
        expect(state.challenges[1]).toMatchObject({ metric: 'straights', progress: 1 });
    });

    it('can earn a second side reward within the same ante without duplicate rewards', () => {
        const before = start();
        const first = completeChallenges(advanceChallenges(before.challenges, { pairs: 4 }));
        const returned = finishOpeningPack(act({ ...before, phase: 'deal_over',
            challenges: first.challenges, challengeRewards: first.rewards }, { type: 'deal' }));
        const second = completeChallenges(advanceChallenges(returned.challenges, { straights: 5 }));
        expect(first.rewards).toHaveLength(1);
        expect(second.rewards).toHaveLength(1);
        expect(second.rewards[0].id).not.toBe(first.rewards[0].id);
        expect(second.challenges.find(goal => !goal.main)).toMatchObject({ metric: 'straights', completed: true });
        expect(completeChallenges(second.challenges).rewards).toEqual([]);
    });

    it.each([0, 1, 2, 3])('starts the replacement at zero after completing side challenge %i', stage => {
        const hands: PlayerHand[] = [pair,
            { ...pair, id: 1, cards: [{ id: 's1', rank: '2', suit: 'hearts' }, { id: 's2', rank: '3', suit: 'hearts' }], blackjackValue: 5 },
            { ...pair, id: 2, outcome: 'win' },
        ];
        const before = { ...start(), challenges: createChallenges(stage).map(goal => goal.main
            ? goal : { ...goal, progress: goal.target - 1 }) };
        const result = processAction({ ...before, phase: 'scoring', playerHands: hands,
            runningSummary: { chips: 0, mult: 1 } }, { type: 'score_round' });
        expect(result.nextState.challengeRewards).toHaveLength(1);
        for (const event of result.events) {
            if (event.type === 'challenges_updated') expect(event.challenges.map(goal => goal.id))
                .toEqual(before.challenges.map(goal => goal.id));
        }
        const returned = finishOpeningPack(act(result.nextState, { type: 'deal' }));
        expect(returned.challenges[1]).toMatchObject({ metric: createChallenges((stage + 1) % 4)[1].metric,
            progress: 0, completed: false });
    });

    it('waits through multiple minor rewards and preserves progress on existing extra goals', () => {
        const base = start();
        const extra = { ...base.challenges[1], id: 'extra', source: 'pack' as const };
        const unfinished = { ...extra, id: 'unfinished', progress: 2 };
        const completed = completeChallenges([...base.challenges, extra].map(goal => goal.main
            ? goal : { ...goal, progress: goal.target }));
        const board = [...completed.challenges, unfinished];
        let state = act({ ...base, phase: 'deal_over', challenges: board,
            challengeRewards: completed.rewards }, { type: 'deal' });
        state = finishOpeningPack(state);
        expect(state.phase).toBe('pack_choice');
        expect(state.challenges).toEqual(board);
        state = finishOpeningPack(state);
        expect(state.challenges).toEqual([base.challenges[0],
            expect.objectContaining({ metric: 'straights', progress: 0, completed: false }), unfinished]);
        expect(state.ante).toBe(base.ante);
    });

    it('replaces an early-generated goal from an older save with one fresh goal after rewards', () => {
        const base = start();
        const completed = completeChallenges(advanceChallenges(base.challenges, { pairs: 4 }));
        const early = { ...createChallenges(1)[1], id: `${base.challenges[1].id}-next`, progress: 1 };
        const returned = finishOpeningPack(act({ ...base, phase: 'deal_over',
            challenges: [...completed.challenges, early], challengeRewards: completed.rewards }, { type: 'deal' }));
        expect(returned.challenges).toHaveLength(2);
        expect(returned.challenges[1]).toMatchObject({ id: early.id, metric: 'straights', progress: 0 });
    });

    it('counts all three scored pairs in three of a kind, then completes on the next pair', () => {
        const triple: PlayerHand = { ...pair, cards: [...pair.cards, { id: 'p3', rank: '2', suit: 'spades' }], blackjackValue: 6 };
        const first = settle(start(), 0, [triple]);
        expect(first.challenges[1].progress).toBe(3);
        const second = settle(first, 0, [pair]);
        expect(second.challenges.find(goal => goal.metric === 'pairs')).toMatchObject({ progress: 4, completed: true });
        expect(second.challengeRewards).toMatchObject([{ tier: 'minor' }]);
    });

    it('queues simultaneous main and side rewards and waits for both before raising the ante', () => {
        let state = start();
        state = settle({ ...state, challenges: state.challenges.map(goal => ({ ...goal, progress: goal.target - 1 })) }, 0, [pair]);
        expect(state.challengeRewards.map(reward => reward.tier)).toEqual(['major', 'minor']);
        state = act(state, { type: 'deal' });
        expect(state.challengeRewards.map(reward => reward.tier)).toEqual(['minor', 'major']);
        expect(state.pendingPack?.packId).toBe('mixed_minor');
        const completedBoard = state.challenges;
        state = finishOpeningPack(state);
        expect(state).toMatchObject({ ante: 50, phase: 'pack_choice' });
        expect(state.pendingPack?.packId).toBe('mixed_major');
        expect(state.challenges).toEqual(completedBoard);
        state = finishOpeningPack(state);
        expect(state).toMatchObject({ ante: 100, phase: 'deal_over' });
        expect(state.challenges).toEqual(createChallenges(1));
    });

    it('claims accumulated minor rewards in board order, then the major and boss rewards', () => {
        const base = start();
        const goals = [...base.challenges, { ...base.challenges[1], id: 'extra', source: 'pack' as const }]
            .map(goal => ({ ...goal, progress: goal.target, completed: true }));
        let state = act({ ...base, phase: 'deal_over', challenges: goals, challengeRewards: [
            { id: 'boss-0', title: 'Boss Defeated', tier: 'major', kind: 'table_action' },
            { id: goals[0].id, title: goals[0].title, tier: 'major' },
            { id: 'extra', title: 'Extra', tier: 'minor' },
            { id: goals[1].id, title: goals[1].title, tier: 'minor' },
        ] }, { type: 'deal' });
        expect(state.challengeRewards.map(reward => reward.id)).toEqual([goals[1].id, 'extra', goals[0].id, 'boss-0']);
        for (const packId of ['mixed_minor', 'mixed_minor', 'mixed_major', 'relic_boss']) {
            expect(state.pendingPack?.packId).toBe(packId);
            expect(state.ante).toBe(50);
            expect(state.challenges).toEqual(goals);
            state = finishOpeningPack(state);
        }
        expect(state).toMatchObject({ phase: 'deal_over', ante: 100, challengeRewards: [] });
        expect(state.challenges).toEqual(createChallenges(1));
    });

    it('creates challenges after finishing the opening reward', () => {
        const opening = act(createInitialState(), { type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 1 });
        expect(opening.challenges).toEqual([]);
        expect(opening.pendingPack?.packId).toBe('mixed_major');
        expect(finishOpeningPack(opening).challenges).toEqual(createChallenges());
    });
});


describe('hand-pattern challenge progress', () => {
    const patterns = [
        { metric: 'pairs', cards: [{ id: 'a', rank: '9', suit: 'hearts' }, { id: 'b', rank: '9', suit: 'clubs' }] },
        { metric: 'straights', cards: [{ id: 'a', rank: '9', suit: 'hearts' }, { id: 'b', rank: '10', suit: 'clubs' }] },
        { metric: 'flushes', cards: [{ id: 'a', rank: '9', suit: 'hearts' }, { id: 'b', rank: '10', suit: 'hearts' }] },
    ] as const;

    describe.each(['win', 'loss', 'bust', 'push'] as const)('%s hands', outcome => {
        it.each(patterns)('counts $metric independently of the outcome', ({ metric, cards }) => {
            const goals = [0, 1, 2, 3].map(stage => createChallenges(stage)[1]);
            const finalCards: Card[] = [...cards];
            if (outcome === 'bust') finalCards.push({ id: 'c', rank: 'K', suit: 'spades' });
            const state = settle({ ...start(), challenges: goals }, 0, [{ ...pair,
                cards: finalCards, blackjackValue: outcome === 'bust' ? 28 : 18, isBust: outcome === 'bust', outcome,
            }]);
            expect(state.challenges.find(goal => goal.metric === metric)?.progress).toBe(1);
            expect(state.challenges.find(goal => goal.metric === 'wins')?.progress).toBe(outcome === 'win' ? 1 : 0);
        });
    });

    it.each([1, 2])('counts a losing flush even when tradeoffs remove its positive payout (%i penalties)', count => {
        const state = settle({ ...start(), challenges: createChallenges(2),
            handUpgrades: { raise_v3_0_tradeoff_win_cash_flush_cash: count },
        }, 0, [{ ...pair, cards: [{ id: 'a', rank: '2', suit: 'hearts' }, { id: 'b', rank: '3', suit: 'hearts' }], blackjackValue: 5 }]);
        const flush = state.playerHands[0].finalScore!.criteria.find(row => row.id === 'flush')!;
        expect(flush.chips).toBe(5 - 5 * count);
        expect(flush.multiplier).toBe(0);
        expect(state.challenges.find(goal => goal.metric === 'flushes')?.progress).toBe(1);
    });

    it('earns a pattern reward from an intentional bust and waits to renew the challenge', () => {
        const before = start();
        const state = settle({ ...before, challenges: before.challenges.map(goal => goal.metric === 'pairs'
            ? { ...goal, progress: goal.target - 1 } : goal) }, 0, [{ ...pair, cards: [
                { id: 'a', rank: 'K', suit: 'hearts' }, { id: 'b', rank: 'K', suit: 'clubs' }, { id: 'c', rank: '9', suit: 'spades' },
            ], blackjackValue: 29, isBust: true, outcome: 'bust' }]);
        expect(state.challengeRewards).toMatchObject([{ tier: 'minor', title: 'Pair Collector' }]);
        expect(state.challenges.find(goal => !goal.main)).toMatchObject({ metric: 'pairs', completed: true });
        expect(state.challenges.some(goal => goal.metric === 'straights')).toBe(false);
    });
});


it.each<{ name: string; stage: number; metric: string; ranks: Rank[]; suits?: Card['suit'][]; outcome: PlayerHand['outcome']; value: number; count: number }>([
    { name: 'two separate straights in a loss', stage: 1, metric: 'straights', ranks: ['2', '3', '7', '8'], outcome: 'loss', value: 20, count: 2 },
    { name: 'two separate straights in a bust', stage: 1, metric: 'straights', ranks: ['3', '4', '8', '9'], outcome: 'bust', value: 24, count: 2 },
    { name: 'two flushes in different suits', stage: 2, metric: 'flushes', ranks: ['2', '3', '7', '8'], suits: ['hearts', 'hearts', 'clubs', 'clubs'], outcome: 'loss', value: 20, count: 2 },
    { name: 'one maximal straight, without counting its sub-runs', stage: 1, metric: 'straights', ranks: ['A', '2', '3', '4'], outcome: 'loss', value: 20, count: 1 },
    { name: 'separate Ace-high and Ace-low straights', stage: 1, metric: 'straights', ranks: ['K', 'A', '2'], outcome: 'loss', value: 13, count: 2 },
])('matches the scored pattern count for $name', ({ stage, metric, ranks, suits, outcome, value, count }) => {
    const cards: Card[] = ranks.map((rank, index) => ({ id: `multi-${index}`, rank, suit: suits?.[index] ?? 'hearts' }));
    const state = settle({ ...start(), challenges: createChallenges(stage) }, 0, [{ ...pair, cards,
        blackjackValue: value, isBust: outcome === 'bust', outcome }]);
    const criterionId = metric === 'flushes' ? 'flush' : 'straight';
    expect(state.playerHands[0].finalScore!.criteria.filter(row => row.id === criterionId)).toHaveLength(count);
    expect(state.challenges.find(goal => goal.metric === metric)?.progress).toBe(count);
});
