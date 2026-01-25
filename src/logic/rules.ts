import type { Card, ScoringMatch, ScoringCriterionId } from '../types';

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

export interface ScoringRule {
  id: ScoringCriterionId;
  name: string;
  chips: number;
  mult: number;
}

export const SCORING_RULES: Record<ScoringCriterionId, ScoringRule> = {
  'win': { id: 'win', name: 'Win', chips: 10, mult: 1 },
  'viginti': { id: 'viginti', name: 'Viginti', chips: 50, mult: 1 },
  'double_down': { id: 'double_down', name: 'Double Down', chips: 0, mult: 1 },
  'pair': { id: 'pair', name: 'Pair', chips: 0, mult: 0.5 },
  'straight': { id: 'straight', name: 'Straight', chips: 0, mult: 0.5 },
  'flush': { id: 'flush', name: 'Flush', chips: 0, mult: 0.5 },
};

export function getBaseBlackjackScore(cards: Card[]): number {
  let score = 0;
  let aces = 0;

  for (const card of cards) {
    const val = RANK_VALUES[card.rank];
    score += val;
    if (card.rank === 'A') aces += 1;
  }

  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }
  return score;
}

// Helper for finding matches
export const findMatches = (
  sortedCards: Card[], 
  rule: Partial<ScoringRule>, 
  predicate: (a: Card, b: Card) => boolean,
  scanForwardOnly: boolean = false
): ScoringMatch[] => {
  const matches: ScoringMatch[] = [];
  const usedAsRight = new Set<string>();

  for (let i = 0; i < sortedCards.length; i++) {
    const leftCard = sortedCards[i];
    
    let potentialPartners: Card[];
    if (scanForwardOnly) {
      // Only look at subsequent cards to enforce order/prevent cycles for symmetric types
      potentialPartners = sortedCards.slice(i + 1);
    } else {
      // Look at all other cards
      potentialPartners = sortedCards.filter((_, idx) => idx !== i);
    }
    
    // Filter out cards already used as a target
    potentialPartners = potentialPartners.filter(c => !usedAsRight.has(c.id));
    
    const partner = potentialPartners.find(rightCard => predicate(leftCard, rightCard));
    
    if (partner) {
      usedAsRight.add(partner.id);
      
      // Calculate Chips based on Card Values + Base Chips
      const chips = RANK_VALUES[leftCard.rank] + RANK_VALUES[partner.rank] + (rule.chips || 0);

      matches.push({
          cardIds: [leftCard.id, partner.id],
          chips: chips,
          multiplier: rule.mult || 0
      });
    }
  }
  return matches;
};
