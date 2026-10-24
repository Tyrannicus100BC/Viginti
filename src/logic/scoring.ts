import type { Card, HandScore } from '../types';

import { RelicManager } from './relics/manager';
import type { RelicInstance } from './relics/types';
import { getBaseBlackjackScore } from './rules';
import { evaluateBaseHands, type HandUpgrades } from './handScoring';
export { POKER_ORDER, RANK_VALUES } from './rules';

export function getPlayerBustLimit(inventory: readonly RelicInstance[], baseLimit = 21): number {
  return RelicManager.executeValueHook('getBustLimit', baseLimit, { inventory: [...inventory] });
}

export function getBlackjackScore(cards: Card[], inventory: RelicInstance[] = [], ignoreSpecialEffects: boolean = false, bustLimit = 21): number {
  if (!ignoreSpecialEffects) bustLimit = getPlayerBustLimit(inventory, bustLimit);
  let score = getBaseBlackjackScore(cards, ignoreSpecialEffects, bustLimit);

  // Relic: Adjust Blackjack Score (e.g. Joker)
  score = RelicManager.executeValueHook('adjustBlackjackScore', score, {
    inventory,
    handCards: cards,
    ignoreSpecialEffects, bustLimit
  });

  return score;
}

export function evaluateHandScore(cards: Card[], isWin: boolean, isDoubled: boolean = false, inventory: RelicInstance[] = [], handsRemaining: number = 0, categoryCounts?: Record<string, number>, outcome?: 'win' | 'loss' | 'bust' | 'push' | null, handUpgrades: HandUpgrades = {}, bustLimit = 21): HandScore {
  bustLimit = getPlayerBustLimit(inventory, bustLimit);
  const blackjackScore = getBlackjackScore(cards, inventory, false, bustLimit);

  // Initial Empty Score
  const initialScore: HandScore = {
    criteria: evaluateBaseHands(cards, isWin, blackjackScore, outcome, handUpgrades, bustLimit),
    totalChips: 0,
    totalMultiplier: 0,
    finalScore: 0,
    scoringCards: cards
  };

  // Cash and mult bonuses pay only with a winning outcome, including Viginti.
  const awardsSpecialBonuses = initialScore.criteria.some(row => row.id === 'win' || row.id === 'viginti');
  let specialChips = 0;
  let specialMult = 0;
  const specialCardIds: string[] = [];

  for (const card of awardsSpecialBonuses ? cards : []) {
    // Check for inline special effects
    if (card.specialEffect) {
      if (card.specialEffect.type === 'chip') {
        specialChips += card.specialEffect.value;
        specialCardIds.push(card.id);
      } else if (card.specialEffect.type === 'mult') {
        specialMult += card.specialEffect.value;
        specialCardIds.push(card.id);
      }
    }

    if (card.type === 'chip') {
      specialChips += (card.chips || 0);
      specialCardIds.push(card.id);
    } else if (card.type === 'mult') {
      specialMult += (card.mult || 0);
      specialCardIds.push(card.id);
    }
  }

  if (specialChips > 0 || specialMult > 0) {
    initialScore.criteria.push({
      id: 'special_cards',
      name: 'Special Cards',
      count: specialCardIds.length,
      chips: specialChips,
      multiplier: specialMult,
      cardIds: specialCardIds
    });
    initialScore.totalChips += specialChips;
    initialScore.totalMultiplier += specialMult;
  }
  initialScore.totalChips = initialScore.criteria.reduce((sum, criterion) => sum + criterion.chips, 0);
  initialScore.totalMultiplier = initialScore.criteria.reduce((sum, criterion) => sum + criterion.multiplier, 0);
  initialScore.finalScore = Math.floor(initialScore.totalChips * initialScore.totalMultiplier);
  return RelicManager.executeValueHook('onEvaluateHandScore', initialScore, {
    inventory,
    handCards: cards,
    isWin,
    isDoubled,
    handsRemaining,
    blackjackValue: blackjackScore,
    outcome,
    categoryCounts
  });
}
