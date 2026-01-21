import type { Card, HandScore, PokerHandType } from '../types';

export const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 10, 'Q': 10, 'K': 10, 'A': 11
};

// For poker comparison (order)
const POKER_ORDER: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
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

export const MULTIPLIERS: Record<PokerHandType, number> = {
  'mini_royal_flush': 30,
  'straight_flush': 15,
  'three_of_a_kind': 10,
  'straight': 5,
  'flush': 3,
  'one_pair': 2,
  'high_card': 1
};

function getFaceSum(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + RANK_VALUES[c.rank], 0);
}

function isFlush(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  const suit = cards[0].suit;
  return cards.every(c => c.suit === suit);
}

function isStraight(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  const values = cards.map(c => POKER_ORDER[c.rank]).sort((a, b) => a - b);
  // Handle A-2-3 (A=14, 2=2, 3=3) -> special check? 
  // 3-card poker straights: A-2-3 is usually allowed? Or Q-K-A?
  // Let's assume strict neighbors.
  // Special Case: A-2-3. A is 14. 2,3,14. 
  // If we want low Ace support for straights:
  const hasAce = values.includes(14);
  
  // Check standard sequence
  let sequence = true;
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i + 1] !== values[i] + 1) {
      sequence = false;
      break;
    }
  }
  if (sequence) return true;

  // Check Wheel (A-2-3) for 3 cards
  if (cards.length === 3 && hasAce && values.includes(2) && values.includes(3)) return true;
  
  return false;
}

function getHandType(cards: Card[]): PokerHandType {
  const isF = isFlush(cards);
  const isS = isStraight(cards);
  
  if (cards.length === 3 && isF && isS) {
    // Mini Royal? Q-K-A suited
    const values = cards.map(c => POKER_ORDER[c.rank]);
    if (values.includes(12) && values.includes(13) && values.includes(14)) {
      return 'mini_royal_flush';
    }
    return 'straight_flush';
  }
  
  if (cards.length === 3) {
    const ranks = cards.map(c => c.rank);
    if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) return 'three_of_a_kind';
  }
  
  if (isS) return 'straight';
  if (isF) return 'flush';
  
  // Pair
  const ranks = cards.map(c => c.rank);
  const uniqueRanks = new Set(ranks);
  if (uniqueRanks.size < cards.length) return 'one_pair';
  
  return 'high_card';
}

function getScoringCards(cards: Card[], type: PokerHandType): Card[] {
  // Return the subset that makes the hand.
  // Prioritize "part of the hand".
  // For straight/flush/full hands -> All cards.
  if (['mini_royal_flush', 'straight_flush', 'three_of_a_kind', 'straight', 'flush'].includes(type)) {
    return cards;
  }
  
  // Only pair?
  if (type === 'one_pair') {
    // Find the pair
    const counts: Record<string, Card[]> = {};
    for (const c of cards) {
      if (!counts[c.rank]) counts[c.rank] = [];
      counts[c.rank].push(c);
    }
    for (const rank in counts) {
      if (counts[rank].length >= 2) return counts[rank].slice(0, 2);
    }
  }
  
  // High card -> highest card
  const sorted = [...cards].sort((a, b) => POKER_ORDER[b.rank] - POKER_ORDER[a.rank]);
  return [sorted[0]];
}

function evaluateSubset(subset: Card[]): HandScore {
  const type = getHandType(subset);
  // Special case: "High Card" implies single card value used?
  // "High Card is just 1x the face value of the highest card"
  // If we pass 3 cards [2, 5, 9] (no flush/str), it's High Card.
  // Does valid scoring subset become just [9]? Yes.
  
  const scoringCards = getScoringCards(subset, type);
  const basePoints = getFaceSum(scoringCards);
  const multiplier = MULTIPLIERS[type];
  
  return {
    pokerHand: type,
    multiplier,
    basePoints,
    totalScore: basePoints * multiplier,
    scoringCards
  };
}

export function evaluatePokerHand(cards: Card[]): HandScore {
  if (cards.length === 0) return { pokerHand: 'high_card', multiplier: 1, basePoints: 0, totalScore: 0, scoringCards: [] };
  
  // Get all subsets of size up to 3 (min 1)
  // Actually, usually we take the Best 3 Cards.
  // A hand of 4 cards -> 4 subsets of 3.
  
  let bestScore: HandScore | null = null;
  
  // If count <= 3, just eval the set
  // BUT: Even with 2 cards [5, 5], it's a Pair.
  // With [5, 6], it's High Card.
  // So we should check the whole hand if <=3?
  // Wait, Three Card Poker rules usually require 3 cards for Straight/Flush.
  // Can a 2-card Straight exist? Probably not.
  // Can a 2-card Flush exist? Probably not.
  // I will enforce logical sizes.
  // Straight/Flush/3-Kind require 3 cards.
  // Pair requires 2.
  // High Card requires 1.
  
  // Strategy: Try all combinations of size 1, 2, 3.
  const combinations: Card[][] = [];
  
  // Helper for combos
  const f = (start: number, pool: Card[]) => {
    if (pool.length >= 1 && pool.length <= 3) combinations.push([...pool]);
    if (pool.length === 3) return;
    
    for (let i = start; i < cards.length; i++) {
        f(i + 1, [...pool, cards[i]]);
    }
  };
  f(0, []);

  for (const combo of combinations) {
    const res = evaluateSubset(combo);
    // Sanity checks for definitions:
    // Straight must be 3 cards? Prompt says "3 card poker hand".
    // I'll assume Straight/Flush need 3.
    if ((res.pokerHand === 'straight' || res.pokerHand === 'flush' || res.pokerHand === 'straight_flush' || res.pokerHand === 'three_of_a_kind' || res.pokerHand === 'mini_royal_flush') && combo.length < 3) {
      continue; 
    }
    if (res.pokerHand === 'one_pair' && combo.length < 2) continue;

    if (!bestScore || res.totalScore > bestScore.totalScore) {
      bestScore = res;
    }
  }

  if (!bestScore) {
    // Fallback to evaluating the whole hand as a high card if something goes wrong
    return evaluateSubset([cards[0]]);
  }

  return bestScore;
}
