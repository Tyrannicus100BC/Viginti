export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'none'; // 'none' for special cards
export type CardOrigin = 'deck' | 'draw_pile' | 'double_down' | 'shop';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  isFaceUp?: boolean;
  origin?: CardOrigin;
  type?: 'standard' | 'chip' | 'mult' | 'score';
  chips?: number;
  mult?: number;
  specialEffect?: {
    type: 'chip' | 'mult' | 'score';
    value: number;
  };
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
  | 'straight'
  | 'double_down'
  | 'rank_pair_chips' | 'rank_pair_mult'
  | 'rank_triple_chips' | 'rank_triple_mult'
  | 'rank_run_chips' | 'rank_run_mult'
  | 'flush_pair_chips' | 'flush_pair_mult'
  | 'flush_triple_chips' | 'flush_triple_mult'
  | 'flush_run_chips' | 'flush_run_mult'
  | 'straight_pair_chips' | 'straight_pair_mult'
  | 'straight_triple_chips' | 'straight_triple_mult'
  | 'straight_run_chips' | 'straight_run_mult'
  | 'special_cards';

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
  outcome?: 'win' | 'loss' | 'push' | null;
  isDoubled?: boolean;
}

export interface DealerHand {
  cards: Card[];
  isRevealed: boolean;
  blackjackValue: number;
}
