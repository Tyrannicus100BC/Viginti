import { advanceChallenges, completeChallenges, createChallenges, CHALLENGE_ROUNDS } from '../challenges';
import { chooseBoss, getBustLimit } from '../bosses';
import { getNextAnte } from '../economy';
import { SeededRNG } from '../rng';
import { hasPendingPack } from '../../logic/packs';
import { getBlackjackScore } from '../../logic/scoring';
import type { RelicInstance } from '../../logic/relics/types';
import type { GameState } from '../GameState';
import type { ActionResult } from '../engine';

function canAdvance(state: GameState): boolean {
    return ['entering_casino', 'playing', 'deal_over'].includes(state.phase)
        && !hasPendingPack(state) && !state.debugPackReturn;
}

/** Credit one skipped round, including its normal challenge rewards. */
export function processDebugAdvanceRound(state: GameState): ActionResult {
    if (!canAdvance(state)) return { nextState: state, events: [] };
    const completion = completeChallenges(advanceChallenges(state.challenges, { rounds: 1 }));
    const rewards = [...completion.rewards];
    if (completion.advance && state.bossId) {
        rewards.push({ id: `boss-${state.challengeStage}`, title: 'Boss Defeated', tier: 'major', kind: 'table_action' });
    }
    const dealsTaken = state.dealsTaken + 1;
    return {
        nextState: { ...state, deal: dealsTaken, dealsTaken, challenges: completion.challenges,
            challengeRewards: [...state.challengeRewards, ...rewards] },
        events: [
            { type: 'challenges_updated', challenges: completion.challenges },
            ...rewards.map(reward => ({ type: 'challenge_completed' as const, reward })),
        ],
    };
}

/** Jump past the remaining rounds of this ante without dealing or charging cash. */
export function processDebugAdvanceAnte(state: GameState): ActionResult {
    if (!canAdvance(state)) return { nextState: state, events: [] };
    const goal = state.challenges.find(challenge => challenge.main && challenge.metric === 'rounds');
    const skippedRounds = Math.max(0, (goal?.target ?? CHALLENGE_ROUNDS) - (goal?.progress ?? 0));
    const dealsTaken = state.dealsTaken + skippedRounds;
    const ante = getNextAnte(state.ante);
    const challengeStage = state.challengeStage + 1;
    const rng = new SeededRNG(state.rngState);
    const bossId = chooseBoss(challengeStage, rng);
    const challenges = [...createChallenges(challengeStage, ante),
        ...state.challenges.filter(challenge => challenge.source === 'pack' && !challenge.completed)];
    const bustLimit = getBustLimit({ bossId });
    const inventory = state.inventory as RelicInstance[];
    // The debug control can change boss rules while cards are already on the table.
    const playerHands = state.playerHands.map(hand => {
        const blackjackValue = getBlackjackScore(hand.cards, inventory, false, bustLimit);
        return { ...hand, blackjackValue, isBust: blackjackValue > bustLimit };
    });
    const dealer = { ...state.dealer, blackjackValue: getBlackjackScore(
        state.dealer.cards.filter(card => card.isFaceUp), inventory, true, bustLimit) };
    return {
        nextState: { ...state, deal: Math.max(1, dealsTaken), dealsTaken, ante, challengeStage,
            bossId, rngState: rng.getState(), challenges, playerHands, dealer },
        events: [
            { type: 'challenges_updated', challenges },
            { type: 'ante_increased', previousAnte: state.ante, ante },
        ],
    };
}
