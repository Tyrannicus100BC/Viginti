export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  isFaceUp?: boolean;
  origin?: 'deck' | 'draw_pile';
}

export type PokerHandType =
  | 'mini_royal_flush'
  | 'straight_flush'
  | 'three_of_a_kind'
  | 'straight'
  | 'flush'
  | 'one_pair'
  | 'high_card';

export interface HandScore {
  pokerHand: PokerHandType;
  multiplier: number;
  basePoints: number;
  totalScore: number;
  scoringCards: Card[];
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
