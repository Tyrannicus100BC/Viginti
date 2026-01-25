import type { Card, HandScore } from '../types';

import { RelicManager } from './relics/manager';
import type { RelicInstance } from './relics/types';
import { getBaseBlackjackScore } from './rules';
export { POKER_ORDER, SCORING_RULES, findMatches, RANK_VALUES } from './rules';
import type { ScoringRule } from './rules';
export type { ScoringRule };

export function getBlackjackScore(cards: Card[], inventory: RelicInstance[] = []): number {
  let score = getBaseBlackjackScore(cards);

  // Relic: Adjust Blackjack Score (e.g. Joker)
  score = RelicManager.executeValueHook('adjustBlackjackScore', score, { 
      inventory, 
      handCards: cards 
  });

  return score;
}

export function evaluateHandScore(cards: Card[], isWin: boolean, isDoubled: boolean = false, inventory: RelicInstance[] = [], handsRemaining: number = 0): HandScore {
  const blackjackScore = getBlackjackScore(cards, inventory);

  // Initial Empty Score
  const initialScore: HandScore = {
    criteria: [],
    totalChips: 0,
    totalMultiplier: 0, 
    finalScore: 0,
    scoringCards: cards
  };

  return RelicManager.executeValueHook('onEvaluateHandScore', initialScore, {
      inventory,
      handCards: cards,
      isWin,
      isDoubled,
      handsRemaining,
      blackjackValue: blackjackScore
  });
}
