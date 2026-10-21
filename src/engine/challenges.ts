import type { HandScore } from '../types';
import { BASE_ANTE } from './economy';

export type ChallengeMetric = 'rounds' | 'earnings' | 'pairs' | 'straights' | 'flushes' | 'wins';
export type RewardTier = 'minor' | 'major';
export interface Challenge {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly metric: ChallengeMetric;
    readonly main: boolean;
    readonly target: number;
    readonly progress: number;
    readonly completed: boolean;
    readonly source?: 'pack';
    readonly rewardTier?: RewardTier;
}
export interface ChallengeReward {
    readonly id: string;
    readonly tier: RewardTier;
    readonly title: string;
}

// Initial tuning lives here so board size, goals, and rotation can evolve independently.
export const CHALLENGE_ROUNDS = 4;
export const CHALLENGE_EARNINGS_MULTIPLIER = 1.5;
// Harder patterns require fewer scoring hands, including in challenge packs.
export const PATTERN_CHALLENGE_TARGETS = { pairs: 4, straights: 5, flushes: 6 } as const;
const SIDE_CHALLENGES = [
    { metric: 'pairs' as const, title: 'Pair Collector', description: `Score ${PATTERN_CHALLENGE_TARGETS.pairs} pair hands`, target: PATTERN_CHALLENGE_TARGETS.pairs },
    { metric: 'straights' as const, title: 'Straight Shooter', description: `Score ${PATTERN_CHALLENGE_TARGETS.straights} straight hands`, target: PATTERN_CHALLENGE_TARGETS.straights },
    { metric: 'flushes' as const, title: 'Flush Rush', description: `Score ${PATTERN_CHALLENGE_TARGETS.flushes} flush hands`, target: PATTERN_CHALLENGE_TARGETS.flushes },
    { metric: 'wins' as const, title: 'Winning Ways', description: 'Win 6 hands', target: 6 },
];

export function createChallenges(stage = 0, ante = BASE_ANTE): Challenge[] {
    const earnings = ante * CHALLENGE_ROUNDS * CHALLENGE_EARNINGS_MULTIPLIER;
    return [
        { metric: 'rounds' as const, title: 'Raise the Ante', description: `Complete ${CHALLENGE_ROUNDS} rounds`, target: CHALLENGE_ROUNDS, main: true },
        { metric: 'earnings' as const, title: 'Money Maker', description: `Earn $${earnings.toLocaleString()}`, target: earnings, main: true },
        { ...SIDE_CHALLENGES[stage % SIDE_CHALLENGES.length], main: false },
    ].map(goal => ({ ...goal, id: `${stage}-${goal.metric}`, progress: 0, completed: false }));
}

export function advanceChallenges(challenges: readonly Challenge[], amounts: Partial<Record<ChallengeMetric, number>>): Challenge[] {
    return challenges.map(challenge => challenge.completed ? challenge : {
        ...challenge,
        progress: Math.min(challenge.target, challenge.progress + (amounts[challenge.metric] ?? 0)),
    });
}

/** A hand advances each pattern goal once, even if it contains several matching pairs. */
export function getHandChallengeProgress(score: HandScore): Partial<Record<ChallengeMetric, number>> {
    const has = (id: string) => score.criteria.some(row => row.id === id && (row.chips > 0 || row.multiplier > 0));
    return { pairs: has('pair') ? 1 : 0, straights: has('straight') ? 1 : 0, flushes: has('flush') ? 1 : 0, wins: has('win') || has('viginti') ? 1 : 0 };
}

/** Main goals race: a round can award only one major reward, plus any side rewards earned. */
export function completeChallenges(challenges: readonly Challenge[]) {
    const finished = challenges.filter(challenge => !challenge.completed && challenge.progress >= challenge.target);
    const main = challenges.some(challenge => challenge.main && challenge.completed)
        ? undefined : finished.find(challenge => challenge.main);
    const rewarded = [...(main ? [main] : []), ...finished.filter(challenge => !challenge.main)];
    const rewards: ChallengeReward[] = rewarded.map(challenge => ({
        id: challenge.id, title: challenge.title, tier: challenge.rewardTier ?? (challenge.main ? 'major' : 'minor'),
    }));
    return {
        advance: !!main,
        rewards,
        challenges: challenges.map(challenge => ({ ...challenge, completed: challenge.completed || finished.includes(challenge) })),
    };
}
