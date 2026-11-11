import type { Card } from '../types';

export const MAX_HAND_CARDS = 5;
export const MAX_HAND_PAIRS = 3;

/** Temporary player rules for the current boss ante. Dealer card values stay normal. */
export interface HandRules {
  readonly maxCards?: number;
  readonly minWinCards?: number;
  readonly hardAces?: boolean;
  readonly noBustPatterns?: boolean;
  readonly winBelowDealer?: boolean;
}

/** Call only for non-busted, nonempty player hands. */
export function handBeatsDealer(value: number, cardCount: number, dealerValue: number, dealerBustLimit = 21, rules: HandRules = {}): boolean {
  if (cardCount < (rules.minWinCards ?? 1)) return false;
  return dealerValue > dealerBustLimit || (rules.winBelowDealer ? value < dealerValue : value >= dealerValue);
}

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

export function getBaseBlackjackScore(cards: Card[], ignoreSpecialEffects: boolean = false, bustLimit = 21,
  options: { flexibleJacks?: boolean; pairedFaces?: boolean; hardAces?: boolean } = {}): number {
  let score = 0;
  let aces = 0;
  let jacks = 0;
  let faces = 0;

  for (const card of cards) {
    if (!ignoreSpecialEffects && card.specialEffect?.type === 'score') {
        score -= card.specialEffect.value;
    }

    if (card.type === 'chip' || card.type === 'mult') continue;
    if (card.type === 'score') {
        if (!ignoreSpecialEffects) {
            score -= (card.chips || 0); // Score cards reduce score
        }
        continue;
    }

    const val = RANK_VALUES[card.rank];
    if (val !== undefined) {
      score += card.rank === 'A' && options.hardAces ? 1 : val;
      if (card.rank === 'A' && !options.hardAces) aces += 1;
      if (card.rank === 'J') jacks += 1;
      if (['J', 'Q', 'K'].includes(card.rank)) faces += 1;
    }
  }

  if (options.pairedFaces) {
    score -= Math.floor(faces / 2) * 10;
    // Paired face cards already count as a combined 10. Joker can only
    // soften an unpaired Jack; never subtract its discount twice.
    jacks = faces % 2 && jacks > 0 ? 1 : 0;
  }
  let best = -Infinity;
  let smallestBust = Infinity;
  for (let softJacks = 0; softJacks <= (options.flexibleJacks ? jacks : 0); softJacks++) {
    let value = score - softJacks * 9;
    let softAces = aces;
    while (value > bustLimit && softAces > 0) { value -= 10; softAces--; }
    if (value <= bustLimit) best = Math.max(best, value);
    else smallestBust = Math.min(smallestBust, value);
  }
  return best !== -Infinity ? best : smallestBust;
}
