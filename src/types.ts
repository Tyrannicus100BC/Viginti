export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  isFaceUp?: boolean;
  origin?: 'deck' | 'draw_pile';
}

export interface ScoringMatch {
  cardIds: string[];
  chips: number;
  multiplier: number;
}

export type ScoringCriterionId =
  | 'win'
  | 'viginti'
  | 'pair'
  | 'flush'
  | 'straight';

export interface ScoringDetail {
  id: string; // e.g. 'win', 'pair', 'sequence'
  name: string; // Display name
  count: number; // specialized count (e.g. number of pairs)
  chips: number; // Total chips from this criterion
  multiplier: number; // Total multiplier from this criterion
  cardIds?: string[]; // IDs of cards that contributed to this criterion
  matches?: ScoringMatch[];
}

export interface HandScore {
  criteria: ScoringDetail[];
  totalChips: number; // Sum of base chips
  totalMultiplier: number; // Sum of multipliers
  finalScore: number; // (totalChips) * totalMultiplier
  scoringCards: Card[]; // Cards involved in the primary patterns (optional usage now)
}

export interface PlayerHand {
  id: number;
  cards: Card[];
  isHeld: boolean;
  isBust: boolean;
  finalScore?: HandScore | null;
  blackjackValue: number;
  resultRevealed?: boolean;
}

export interface DealerHand {
  cards: Card[];
  isRevealed: boolean;
  blackjackValue: number;
}
