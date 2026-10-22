import type { PlayerHand } from '../types';
import { getHandPatterns } from '../logic/handScoring';
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
    readonly kind?: 'table_action';
}

// Initial tuning lives here so board size, goals, and rotation can evolve independently.
export const CHALLENGE_ROUNDS = 4;
// Harder patterns require fewer scored patterns, including in challenge packs.
export const PATTERN_CHALLENGE_TARGETS = { pairs: 4, straights: 5, flushes: 6 } as const;
const SIDE_CHALLENGES = [
    { metric: 'pairs' as const, title: 'Pair Collector', description: `Score ${PATTERN_CHALLENGE_TARGETS.pairs} pairs`, target: PATTERN_CHALLENGE_TARGETS.pairs },
    { metric: 'straights' as const, title: 'Straight Shooter', description: `Score ${PATTERN_CHALLENGE_TARGETS.straights} straights`, target: PATTERN_CHALLENGE_TARGETS.straights },
    { metric: 'flushes' as const, title: 'Flush Rush', description: `Score ${PATTERN_CHALLENGE_TARGETS.flushes} flushes`, target: PATTERN_CHALLENGE_TARGETS.flushes },
    { metric: 'wins' as const, title: 'Winning Ways', description: 'Win 6 hands', target: 6 },
];

export function createChallenges(stage = 0, _ante = BASE_ANTE): Challenge[] {
    return [
        { metric: 'rounds' as const, title: 'Raise the Ante', description: `Complete ${CHALLENGE_ROUNDS} rounds`, target: CHALLENGE_ROUNDS, main: true },
        { ...SIDE_CHALLENGES[stage % SIDE_CHALLENGES.length], main: false },
    ].map(goal => ({ ...goal, id: `${stage}-${goal.metric}`, progress: 0, completed: false }));
}

export function advanceChallenges(challenges: readonly Challenge[], amounts: Partial<Record<ChallengeMetric, number>>): Challenge[] {
    return challenges.map(challenge => challenge.completed ? challenge : {
        ...challenge,
        progress: Math.min(challenge.target, challenge.progress + (amounts[challenge.metric] ?? 0)),
    });
}

/** Count every scored pattern, including multiple patterns in a losing or busted hand. */
export function getHandChallengeProgress(hand: Pick<PlayerHand, 'cards' | 'outcome'>): Partial<Record<ChallengeMetric, number>> {
    const progress = { pairs: 0, straights: 0, flushes: 0, wins: hand.outcome === 'win' ? 1 : 0 };
    for (const pattern of getHandPatterns(hand.cards)) {
        if (pattern.id === 'pair') progress.pairs++;
        if (pattern.id === 'straight') progress.straights++;
        if (pattern.id === 'flush') progress.flushes++;
    }
    return progress;
}

/** Only the four-round main goal advances the ante. Side goals renew immediately. */
export function completeChallenges(challenges: readonly Challenge[]) {
    const finished = challenges.filter(challenge => !challenge.completed && challenge.progress >= challenge.target);
    const replacements = finished.filter(goal => !goal.main && !goal.source).map(goal => {
        const current = SIDE_CHALLENGES.findIndex(side => side.metric === goal.metric);
        const next = SIDE_CHALLENGES[(current + 1) % SIDE_CHALLENGES.length];
        return { ...next, id: `${goal.id}-next`, main: false, progress: 0, completed: false };
    });
    const main = challenges.some(challenge => challenge.main && challenge.completed)
        ? undefined : finished.find(challenge => challenge.main);
    const rewarded = [...(main ? [main] : []), ...finished.filter(challenge => !challenge.main)];
    const rewards: ChallengeReward[] = rewarded.map(challenge => ({
        id: challenge.id, title: challenge.title, tier: challenge.rewardTier ?? (challenge.main ? 'major' : 'minor'),
    }));
    return {
        advance: !!main,
        rewards,
        challenges: [...challenges.map(challenge => ({ ...challenge, completed: challenge.completed || finished.includes(challenge) })), ...replacements],
    };
}
