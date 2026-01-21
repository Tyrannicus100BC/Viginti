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
  'win': { id: 'win', name: 'Win', chips: 0, mult: 0 },
  'viginti': { id: 'viginti', name: 'Viginti', chips: 5, mult: 0.25 },
  'two_cards': { id: 'two_cards', name: 'Two Cards', chips: 5, mult: 0.5 },
  'rank_match': { id: 'rank_match', name: 'Rank Match', chips: 2, mult: 1 },
  'suit_match': { id: 'suit_match', name: 'Suit Match', chips: 3, mult: 1 },
  'sequence': { id: 'sequence', name: 'Sequence', chips: 4, mult: 1 }
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

  // 1. Win / Viginti
  const isViginti = blackjackScore === 21;
  
  if (isViginti) {
     criteria.push({
         id: 'viginti',
         name: SCORING_RULES.viginti.name,
         count: 1,
         chips: SCORING_RULES.viginti.chips,
         multiplier: SCORING_RULES.viginti.mult
     });
  } else if (isWin) {
     criteria.push({
         id: 'win',
         name: SCORING_RULES.win.name,
         count: 1,
         chips: SCORING_RULES.win.chips,
         multiplier: SCORING_RULES.win.mult
     });
  }

  // 2. Two Cards
  if (cards.length === 2) {
      criteria.push({
         id: 'two_cards',
         name: SCORING_RULES.two_cards.name,
         count: 1,
         chips: SCORING_RULES.two_cards.chips,
         multiplier: SCORING_RULES.two_cards.mult
      });
  }

  // 3. Rank Match (Pairs, etc >= 2)
  const rankCounts: Record<string, number> = {};
  cards.forEach(c => rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1);
  let rankMatchCount = 0;
  let rankMatchChips = 0;
  let rankMatchMult = 0;

  for (const rank in rankCounts) {
      const count = rankCounts[rank];
      if (count >= 2) {
          rankMatchCount++;
          // Base rule * (count - 1)? Or just flat per match group?
          // Simplest: Flat per group.
          rankMatchChips += SCORING_RULES.rank_match.chips;
          rankMatchMult += SCORING_RULES.rank_match.mult;
      }
  }

  if (rankMatchCount > 0) {
      criteria.push({
          id: 'rank_match',
          name: SCORING_RULES.rank_match.name,
          count: rankMatchCount,
          chips: rankMatchChips,
          multiplier: rankMatchMult
      });
  }

  // 4. Suit Match (>= 2 same suit? Or >=3? Defaulting to >= 2 for flexibility as per "Two Cards" logic usually implying pairs, but suit might need 3? Prompt example: "Two Suite Match (3 long hearts, 2 long diamonds)" -> implies length 2 counts.)
  const suitCounts: Record<string, number> = {};
  cards.forEach(c => suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1);
  let suitMatchCount = 0;
  let suitMatchChips = 0;
  let suitMatchMult = 0;

  for (const suit in suitCounts) {
      const count = suitCounts[suit];
      if (count >= 2) {
          suitMatchCount++;
          suitMatchChips += SCORING_RULES.suit_match.chips;
          suitMatchMult += SCORING_RULES.suit_match.mult;
      }
  }

  if (suitMatchCount > 0) {
      criteria.push({
          id: 'suit_match',
          name: SCORING_RULES.suit_match.name,
          count: suitMatchCount,
          chips: suitMatchChips,
          multiplier: suitMatchMult
      });
  }

  // 5. Sequence (>= 3 consecutive? Prompt says "4 long, 1-2-3-4" is a sequence.)
  // Usually poker straights are 5, or 3 in mini.
  // Prompt implies checking for runs. 
  // Sort cards by poker value.
  const uniqueValues = Array.from(new Set(cards.map(c => POKER_ORDER[c.rank]))).sort((a, b) => a - b);
  // Also consider Ace as low (1) if needed? POKER_ORDER has Ace=14.
  // Let's add low ace support: If 14 exists, add 1.
  if (uniqueValues.includes(14)) uniqueValues.unshift(1);

  let seqCount = 0;
  let seqChips = 0;
  let seqMult = 0;

  // Find runs of length >= 3
  let currentRunLength = 1;

  // We need to be careful. 1,2,3,4 is ONE sequence of length 4. Not two sequences.
  // So we just iterate and reset.
  for (let i = 0; i < uniqueValues.length - 1; i++) {
      if (uniqueValues[i + 1] === uniqueValues[i] + 1) {
          currentRunLength++;
      } else {
          if (currentRunLength >= 2) {
              seqCount++;
              seqChips += SCORING_RULES.sequence.chips;
              seqMult += SCORING_RULES.sequence.mult;
          }
          currentRunLength = 1;
      }
  }
  // Check last run
  if (currentRunLength >= 2) {
      seqCount++;
      seqChips += SCORING_RULES.sequence.chips;
      seqMult += SCORING_RULES.sequence.mult;
  }

  if (seqCount > 0) {
      criteria.push({
          id: 'sequence',
          name: SCORING_RULES.sequence.name,
          count: seqCount,
          chips: seqChips,
          multiplier: seqMult
      });
  }

  // Totals
  const totalChips = criteria.reduce((sum, c) => sum + c.chips, 0);
  const totalMultiplier = criteria.reduce((sum, c) => sum + c.multiplier, 0);
  // Final score formula: (Sum of Cards + TotalChips) * TotalMultiplier?
  // Prompt: "(sum of cards involed + 10) x 2" -> This was for a specific hand type example.
  // Prompt also says: "The area that normally shows the blackjack hand score will be used to show the running total... As this appears, they will see the blackjack hand score increase by this amount."
  // This implies we take Base Blackjack Score, add All Chips, then multiply by All Mults.
  // Wait, "sum of cards involved". In Blackjack, all cards are involved.
  // So Base Cards Score (Blackjack Value) + Bonus Chips.
  const baseScore = blackjackScore + totalChips;
  // Multiplier defaults to 1 if no mults? 
  // If user says "x2" is added, then the base is 1?
  // Or is it additive multipliers? "Total xChips".
  // Note: "Each hand type... new column for added chips... existing multiplier".
  // So Flush: +10, x2.
  // If I have Flush and Pair (+5, x1.5).
  // Total Mult = 2 + 1.5 = 3.5?
  // Or product? "Add it to the running total xChips". "Added together".
  // So it is additive.
  // What is the starting multiplier? Should be 1 (identity) or 0 (and we multiply by final)?
  // Usually in Balatro-likes, it's (Base + Chips) * (Mult).
  // If I have NO scoring hands, score is just Blackjack Value * 1?
  // Yes. So start mult at 1?
  // BUT the prompt says: "First it will only show the +Chips... then it will show the xChips... update the blackjack score to be multiplied by the total xChips".
  // If I have 0 scoring hands, I show nothing. Total xChips = 0?
  // If total xChips is 0, score becomes 0?
  // No, basic multiplier is 1.
  // So `finalMult = Math.max(1, totalMultiplier)`.
  // Wait, if I have a Flush (x2), is the total mult 2 or 3 (1+2)?
  // "Flush is currently x3... enhance to +10, x2".
  // This implies the rule replaces the old value.
  // So if I have Flush (x2) and Pair (x1.5), and I "Add them", I get 3.5.
  // So the implicit base is 0, but valid hands add to it.
  // If `totalMultiplier` is 0, we use 1.
  
  const finalMult = totalMultiplier === 0 ? 1 : totalMultiplier;
  const finalScore = Math.floor(baseScore * finalMult);

  return {
    criteria,
    totalChips,
    totalMultiplier: finalMult,
    finalScore,
    scoringCards: cards // All cards involved
  };
}
