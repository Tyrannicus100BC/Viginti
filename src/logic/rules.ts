import type { Card } from '../types';

export const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 10, 'Q': 10, 'K': 10, 'A': 11
};

export const POKER_ORDER: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

export function getBaseBlackjackScore(cards: Card[], ignoreSpecialEffects: boolean = false): number {
  let score = 0;
  let aces = 0;

  for (const card of cards) {
    if (!ignoreSpecialEffects && card.specialEffect?.type === 'score') {
        score -= card.specialEffect.value;
    }

    if (card.type === 'chip' || card.type === 'mult') continue;
    if (card.type === 'score') {
        if (!ignoreSpecialEffects) {
            score -= (card.chips || 0); // Score cards reduce score
        }
        continue;
    }

    const val = RANK_VALUES[card.rank];
    if (val !== undefined) {
      score += val;
      if (card.rank === 'A') aces += 1;
    }
  }

  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }
  return score;
}
