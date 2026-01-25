import type { Card, Rank, Suit } from '../types';

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];


let globalCardIdCounter = 0;

export function createCard(suit: Suit, rank: Rank, isFaceUp = false): Card {
    return {
        id: `card_${globalCardIdCounter++}_${rank}_${suit}`,
        suit,
        rank,
        isFaceUp
    };
}

export function createStandardDeck(): Card[] {
  const deck: Card[] = [];
  // Reset counter when creating a full standard deck implies a new context, 
  // but if we play multiple games session, we might want unique IDs across session?
  // The original code reset it inside the function. Let's keep it safe.
  // Actually, for React keys, unique is better.
  // I will just use the global counter which increments indefinitely.
  
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(createCard(suit, rank, false));
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
}
