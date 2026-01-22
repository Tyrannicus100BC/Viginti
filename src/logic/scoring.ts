import type { Card, HandScore, ScoringCriterionId, ScoringDetail, ScoringMatch } from '../types';

export const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 10, 'Q': 10, 'K': 10, 'A': 11
};

const POKER_ORDER: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

interface ScoringRule {
  id: ScoringCriterionId;
  name: string;
  chips: number;
  mult: number;
}

export const SCORING_RULES: Record<ScoringCriterionId, ScoringRule> = {
  'win': { id: 'win', name: 'Win', chips: 10, mult: 1.5 },
  'viginti': { id: 'viginti', name: 'Viginti', chips: 50, mult: 0 },
  'pair': { id: 'pair', name: 'Pair', chips: 10, mult: 0.5 },
  'straight': { id: 'straight', name: 'Straight', chips: 10, mult: 0.5 },
  'flush': { id: 'flush', name: 'Flush', chips: 10, mult: 0.5 },
};

export function getBlackjackScore(cards: Card[]): number {
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

export function evaluateHandScore(cards: Card[], isWin: boolean): HandScore {
  const blackjackScore = getBlackjackScore(cards);
  const criteria: ScoringDetail[] = [];

  // Helper to add criteria
  const addCriteria = (id: ScoringCriterionId, matches: ScoringMatch[] = [], overrideChips?: number) => {
    const rule = SCORING_RULES[id];
    const totalCount = matches.length || 1; // Default to 1 for basic types like Win
    
    // Calculate totals
    // For Match-based rules (Pair, Straight, Flush), sum the matches.
    // For Outcome rules (Win, Viginti), use the rule defaults or override.
    
    let totalChips = 0;
    let totalMult = 0;

    if (matches.length > 0) {
        matches.forEach(m => {
            totalChips += m.chips;
            totalMult += m.multiplier;
        });
    } else {
        totalChips = overrideChips !== undefined ? overrideChips : rule.chips;
        totalMult = rule.mult;
    }

    // Collect all involved card IDs
    const cardIds = Array.from(new Set(matches.flatMap(m => m.cardIds)));
    // If no matches (e.g. Win), use all cards
    if (matches.length === 0) {
        cards.forEach(c => cardIds.push(c.id));
    }

    criteria.push({
      id: rule.id,
      name: rule.name,
      count: totalCount,
      chips: totalChips,
      multiplier: totalMult,
      cardIds,
      matches: matches.length > 0 ? matches : undefined
    });
  };

  // --- 1. OUTCOME ---
  const isViginti = blackjackScore === 21;
  
  // Note: Win/Viginti do NOT use the pairwise logic, they apply once to the whole hand.
  if (isViginti) {
    addCriteria('viginti');
    addCriteria('win');
  } else if (isWin) {
    addCriteria('win');
  }

  // --- 2. MATCHING ALGORITHM ---
  
  // Helper for finding matches
  const findMatches = (
    sortedCards: Card[], 
    rule: ScoringRule, 
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
        matches.push({
            cardIds: [leftCard.id, partner.id],
            chips: rule.chips,
            multiplier: rule.mult
        });
      }
    }
    return matches;
  };

  // PAIR MATCHES
  // Scan Forward to prevent A matching B and B matching A
  const rankSorted = [...cards].sort((a, b) => POKER_ORDER[a.rank] - POKER_ORDER[b.rank]);
  const pairMatches = findMatches(rankSorted, SCORING_RULES['pair'], (a, b) => a.rank === b.rank, true);
  if (pairMatches.length > 0) addCriteria('pair', pairMatches);

  // STRAIGHT MATCHES
  // Scan All because logic is directed (A->B is true, B->A is false), and Ace sorting (High) might miss Low match if forward only
  const straightSorted = [...cards].sort((a, b) => POKER_ORDER[a.rank] - POKER_ORDER[b.rank]);
  const straightMatches = findMatches(straightSorted, SCORING_RULES['straight'], (a, b) => {
    const rA = POKER_ORDER[a.rank];
    const rB = POKER_ORDER[b.rank];
    // Normal straight (2->3)
    if (rB === rA + 1) return true;
    // Ace Low case (A->2)
    if (a.rank === 'A' && b.rank === '2') return true;
    return false;
  }, false);
  if (straightMatches.length > 0) addCriteria('straight', straightMatches);

  // FLUSH MATCHES
  // Scan Forward because we want ordered chains (1->2->3) and prevent cycles
  const flushSorted = [...cards].sort((a, b) => {
    if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
    return POKER_ORDER[a.rank] - POKER_ORDER[b.rank];
  });
  const flushMatches = findMatches(flushSorted, SCORING_RULES['flush'], (a, b) => {
    return a.suit === b.suit;
  }, true);
  if (flushMatches.length > 0) addCriteria('flush', flushMatches);


  // --- CALCULATION ---
  const totalChips = criteria.reduce((sum, c) => sum + c.chips, 0);
  const totalMultiplier = criteria.reduce((sum, c) => sum + c.multiplier, 0);

  const baseScore = totalChips;
  const finalMult = totalMultiplier;
  const finalScore = Math.floor(baseScore * finalMult);

  return {
    criteria,
    totalChips,
    totalMultiplier: finalMult,
    finalScore,
    scoringCards: cards
  };
}
