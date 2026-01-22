import type { Card, HandScore, ScoringCriterionId, ScoringDetail } from '../types';

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
  // Outcome
  'win': { id: 'win', name: 'Win', chips: 0, mult: 1.0 },
  'viginti': { id: 'viginti', name: 'Viginti', chips: 0, mult: 1.5 },

  // Rank
  'one_pair': { id: 'one_pair', name: 'One Pair', chips: 5, mult: 0 },
  'two_pair': { id: 'two_pair', name: 'Two Pair', chips: 20, mult: 1 },
  'three_of_a_kind': { id: 'three_of_a_kind', name: 'Three of a Kind', chips: 50, mult: 2 },

  // Suite
  'mini_flush': { id: 'mini_flush', name: 'Mini Flush', chips: 10, mult: 0 },
  'partial_flush': { id: 'partial_flush', name: 'Partial Flush', chips: 15, mult: 0.3 },
  'full_flush': { id: 'full_flush', name: 'Full Flush', chips: 35, mult: 1 },

  // Order
  'sequential': { id: 'sequential', name: 'Sequential', chips: 5, mult: 0.3 },
  'short_straight': { id: 'short_straight', name: 'Short Straight', chips: 10, mult: 0.5 },
  'long_straight': { id: 'long_straight', name: 'Long Straight', chips: 25, mult: 1.5 }
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
  const addCriteria = (id: ScoringCriterionId, count: number = 1, chipsOverride?: number, cardIds?: string[]) => {
    const rule = SCORING_RULES[id];
    criteria.push({
      id: rule.id,
      name: rule.name,
      count,
      chips: chipsOverride !== undefined ? chipsOverride : rule.chips,
      multiplier: rule.mult,
      cardIds
    });
  };

  // --- 1. OUTCOME TIER (Mutually Exclusive) ---
  const isViginti = blackjackScore === 21;
  const allCardIds = cards.map(c => c.id);
  
  if (isViginti) {
     addCriteria('viginti', 1, blackjackScore, allCardIds);
  } else if (isWin) {
     addCriteria('win', 1, blackjackScore, allCardIds);
  }

  // --- 2. RANK TIER (Mutually Exclusive) ---
  // Count ranks
  const rankCounts: Record<string, number> = {};
  cards.forEach(c => rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1);
  
  let pairs = 0;
  let threes = 0;
  
  const rankCardIds: string[] = [];
  
  for (const r in rankCounts) {
      if (rankCounts[r] >= 3) {
          threes++;
          cards.filter(c => c.rank === r).forEach(c => rankCardIds.push(c.id));
      } else if (rankCounts[r] === 2) {
          pairs++;
          cards.filter(c => c.rank === r).forEach(c => rankCardIds.push(c.id));
      }
  }

  // Determine highest rank tier
  if (threes > 0) {
      addCriteria('three_of_a_kind', 1, undefined, rankCardIds);
  } else if (pairs >= 2) {
      addCriteria('two_pair', 1, undefined, rankCardIds); 
  } else if (pairs === 1) {
      addCriteria('one_pair', 1, undefined, rankCardIds);
  }

  // --- 3. SUITE TIER (Mutually Exclusive) ---
  const suitCounts: Record<string, number> = {};
  cards.forEach(c => suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1);
  
  let maxSuitCount = 0;
  let dominantSuit = '';
  for (const s in suitCounts) {
      if (suitCounts[s] > maxSuitCount) {
          maxSuitCount = suitCounts[s];
          dominantSuit = s;
      }
  }

  const flushCardIds = cards.filter(c => c.suit === dominantSuit).map(c => c.id);

  if (maxSuitCount >= 4) {
      addCriteria('full_flush', 1, undefined, flushCardIds);
  } else if (maxSuitCount === 3) {
      addCriteria('partial_flush', 1, undefined, flushCardIds);
  } else if (maxSuitCount === 2) {
      addCriteria('mini_flush', 1, undefined, flushCardIds);
  }

  // --- 4. ORDER TIER (Mutually Exclusive) ---
  // We need to find the longest run of cards.
  // Original logic was using values, let's track cards too.
  const cardsByOrder = [...cards].sort((a, b) => POKER_ORDER[a.rank] - POKER_ORDER[b.rank]);
  
  // Straight logic with card tracking
  const getLongestRun = (cardList: Card[]) => {
    if (cardList.length === 0) return { length: 0, ids: [] };
    
    // Sort unique values
    const sorted = [...cardList].sort((a, b) => POKER_ORDER[a.rank] - POKER_ORDER[b.rank]);
    
    // Handle Ace for straights (A, 2, 3...)
    const aces = sorted.filter(c => c.rank === 'A');
    let extendedList = [...sorted];
    if (aces.length > 0) {
        // Special case: Ace can be 1. We create "virtual" cards for logic but track real IDs.
        const lowAces = aces.map(a => ({ ...a, _vRank: 1 }));
        extendedList = [...lowAces, ...sorted];
    } else {
        extendedList = sorted.map(c => ({ ...c, _vRank: POKER_ORDER[c.rank] }));
    }
    // Re-sort with virtual ranks
    extendedList.sort((a, b) => ( (a as any)._vRank || POKER_ORDER[a.rank]) - ((b as any)._vRank || POKER_ORDER[b.rank]));

    let maxRunLength = 1;
    let currentRun: Card[] = [extendedList[0]];
    let bestRun: Card[] = [extendedList[0]];

    for (let i = 0; i < extendedList.length - 1; i++) {
        const currVR = (extendedList[i] as any)._vRank || POKER_ORDER[extendedList[i].rank];
        const nextVR = (extendedList[i+1] as any)._vRank || POKER_ORDER[extendedList[i+1].rank];
        
        if (nextVR === currVR + 1) {
            currentRun.push(extendedList[i+1]);
        } else if (nextVR !== currVR) {
            if (currentRun.length > maxRunLength) {
                maxRunLength = currentRun.length;
                bestRun = [...currentRun];
            }
            currentRun = [extendedList[i+1]];
        }
    }
    if (currentRun.length > maxRunLength) {
        maxRunLength = currentRun.length;
        bestRun = [...currentRun];
    }
    
    return { length: maxRunLength, ids: Array.from(new Set(bestRun.map(c => c.id))) };
  };

  const straightInfo = getLongestRun(cards);

  if (straightInfo.length >= 4) {
      addCriteria('long_straight', 1, undefined, straightInfo.ids);
  } else if (straightInfo.length === 3) {
      addCriteria('short_straight', 1, undefined, straightInfo.ids);
  } else if (straightInfo.length === 2) {
      addCriteria('sequential', 1, undefined, straightInfo.ids);
  }

  // --- CALCULATION ---
  const totalChips = criteria.reduce((sum, c) => sum + c.chips, 0);
  const totalMultiplier = criteria.reduce((sum, c) => sum + c.multiplier, 0);
  
  // baseScore is now just totalChips because blackjackScore is included in the outcome criterion
  const baseScore = totalChips;
  // Multipliers are now fully explicit (Win = x1, etc)
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
