import type { Card, Rank, Suit } from '../types';
import type { DeckProbabilities, SuitWeights, RankWeights } from '../engine/GameState';
import type { SeededRNG } from '../engine/rng';

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

export function createChipCard(amount: number): Card {
    const id = `card_${globalCardIdCounter++}_chip_${amount}`;
    return {
        id,
        suit: 'spades', // Placeholder, ignored by render
        rank: 'none',
        type: 'chip',
        chips: amount,
        isFaceUp: false
    };
}

export function createMultCard(amount: number): Card {
    const id = `card_${globalCardIdCounter++}_mult_${amount}`;
    return {
        id,
        suit: 'spades', // Placeholder
        rank: 'none',
        type: 'mult',
        mult: amount,
        isFaceUp: false
    };
}

export function createScoreCard(amount: number): Card {
    const id = `card_${globalCardIdCounter++}_score_${amount}`;
    return {
        id,
        suit: 'spades', // Placeholder
        rank: 'none',
        type: 'score',
        chips: amount, // "Amount to reduce" - used by blackjack calc
        isFaceUp: false
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

export function drawCardFromProbabilities(probs: DeckProbabilities, rng: SeededRNG): Card {
    const suit = pickSuit(probs.suits, rng);

    // Roll for specific special cards from weights
    if (probs.specialWeights && probs.specialWeights.length > 0) {
        let roll = rng.next();
        let cumulative = 0;
        for (const sw of probs.specialWeights) {
            cumulative += sw.chance;
            if (roll < cumulative) {
                if (sw.type === 'chip') return createChipCard(sw.value);
                if (sw.type === 'mult') return createMultCard(sw.value);
                return createScoreCard(sw.value);
            }
        }
    }

    // Legacy/Generic special card roll (if total chance still used)
    if (rng.next() < (probs.specialChance || 0)) {
        const specialTypes = ['chip', 'mult', 'score'] as const;
        const type = specialTypes[Math.floor(rng.next() * specialTypes.length)];
        if (type === 'chip') return createChipCard(5 + Math.floor(rng.next() * 10));
        if (type === 'mult') return createMultCard(1 + Math.floor(rng.next() * 2));
        return createScoreCard(5 + Math.floor(rng.next() * 5));
    }

    const rank = pickRank(probs.ranks, rng);
    return createCard(suit, rank, false);
}

function pickSuit(weights: SuitWeights, rng: SeededRNG): Suit {
    const total = weights.hearts + weights.diamonds + weights.clubs + weights.spades;
    let roll = rng.next() * total;

    if (roll < weights.hearts) return 'hearts';
    roll -= weights.hearts;
    if (roll < weights.diamonds) return 'diamonds';
    roll -= weights.diamonds;
    if (roll < weights.clubs) return 'clubs';
    return 'spades';
}

function pickRank(weights: RankWeights, rng: SeededRNG): Rank {
    const total = weights.ace + weights.face + weights.upper + weights.lower;
    let roll = rng.next() * total;

    let group: 'ace' | 'face' | 'upper' | 'lower';
    if (roll < weights.ace) group = 'ace';
    else if (roll < weights.ace + weights.face) group = 'face';
    else if (roll < weights.ace + weights.face + weights.upper) group = 'upper';
    else group = 'lower';

    const groups: Record<string, Rank[]> = {
        ace: ['A'],
        face: ['K', 'Q', 'J', '10'],
        upper: ['9', '8', '7', '6'],
        lower: ['5', '4', '3', '2']
    };

    const options = groups[group];
    return options[Math.floor(rng.next() * options.length)];
}
