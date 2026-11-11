import type { Card, HandScore, ScoringDetail } from '../types';

import { RelicManager } from './relics/manager';
import type { RelicInstance } from './relics/types';
import { getBaseBlackjackScore, type HandRules } from './rules';
import { evaluateBaseHands, type HandUpgrades } from './handScoring';
export { POKER_ORDER, RANK_VALUES } from './rules';

// Combine pairs only after relic evaluation so every individual pair keeps its
// base payout and relic effects. One row highlights the whole rank group.
function groupPairRows(score: HandScore): HandScore {
  const ranks = new Map(score.scoringCards.map(card => [card.id, card.rank]));
  const pairs = new Map<Card['rank'], ScoringDetail>();
  const criteria: ScoringDetail[] = [];
  for (const row of score.criteria) {
    const rank = row.id === 'pair' ? ranks.get(row.cardIds?.[0] ?? '') : undefined;
    const existing = rank ? pairs.get(rank) : undefined;
    if (existing) {
      existing.count += row.count;
      existing.chips += row.chips;
      existing.multiplier += row.multiplier;
      existing.cardIds = [...new Set([...(existing.cardIds ?? []), ...(row.cardIds ?? [])])];
      if (row.matches) existing.matches = [...(existing.matches ?? []), ...row.matches];
      if (row.breakdown) existing.breakdown = [...(existing.breakdown ?? []), ...row.breakdown];
    } else {
      const grouped = { ...row };
      criteria.push(grouped);
      if (rank) pairs.set(rank, grouped);
    }
  }
  return { ...score, criteria };
}

export function getPlayerBustLimit(inventory: readonly RelicInstance[], baseLimit = 21): number {
  return RelicManager.executeValueHook('getBustLimit', baseLimit, { inventory: [...inventory] });
}

export function getBlackjackScore(cards: Card[], inventory: RelicInstance[] = [], ignoreSpecialEffects: boolean = false, bustLimit = 21, rules: HandRules = {}): number {
  if (!ignoreSpecialEffects) bustLimit = getPlayerBustLimit(inventory, bustLimit);
  const hardAces = !ignoreSpecialEffects && rules.hardAces;
  let score = getBaseBlackjackScore(cards, ignoreSpecialEffects, bustLimit, { hardAces });

  // Relic: Adjust Blackjack Score (e.g. Joker)
  score = RelicManager.executeValueHook('adjustBlackjackScore', score, {
    inventory,
    handCards: cards,
    ignoreSpecialEffects, bustLimit, hardAces
  });

  return score;
}

export function evaluateHandScore(cards: Card[], isWin: boolean, isDoubled: boolean = false, inventory: RelicInstance[] = [], handsRemaining: number = 0, categoryCounts?: Record<string, number>, outcome?: 'win' | 'loss' | 'bust' | 'push' | null, handUpgrades: HandUpgrades = {}, bustLimit = 21, rules: HandRules = {}): HandScore {
  bustLimit = getPlayerBustLimit(inventory, bustLimit);
  const blackjackScore = getBlackjackScore(cards, inventory, false, bustLimit, rules);

  // Initial Empty Score
  const initialScore: HandScore = {
    criteria: evaluateBaseHands(cards, isWin, blackjackScore, outcome, handUpgrades, bustLimit, rules),
    totalChips: 0,
    totalMultiplier: 0,
    finalScore: 0,
    scoringCards: cards
  };

  // Overlapping pairs pay each participating card's bonus once. Longer
  // straights, flushes, and royalty scale bonuses with their base payout count.
  const paidPairBonuses = new Set<string>();
  const suitSymbols = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  for (const row of initialScore.criteria) {
    if (!['win', 'viginti', 'pair', 'straight', 'flush', 'royalty'].includes(row.id)) continue;
    for (const card of cards) {
      if (!row.cardIds?.includes(card.id)) continue;
      if (row.id === 'pair') {
        if (paidPairBonuses.has(card.id)) continue;
        paidPairBonuses.add(card.id);
      }
      const chips = ((card.specialEffect?.type === 'chip' ? card.specialEffect.value : 0)
        + (card.type === 'chip' ? card.chips ?? 0 : 0)) * row.count;
      const multiplier = Number((((card.specialEffect?.type === 'mult' ? card.specialEffect.value : 0)
        + (card.type === 'mult' ? card.mult ?? 0 : 0)) * row.count).toFixed(8));
      if (!chips && !multiplier) continue;
      row.chips += chips;
      row.multiplier = Number((row.multiplier + multiplier).toFixed(8));
      row.breakdown = [...(row.breakdown ?? []), {
        label: `${card.rank === 'none' ? 'Special' : `${card.rank}${suitSymbols[card.suit]}`} card bonus`,
        ...(row.count > 1 ? { detail: `Applied ${row.count} times` } : {}),
        chips, multiplier,
      }];
    }
  }
  initialScore.totalChips = initialScore.criteria.reduce((sum, criterion) => sum + criterion.chips, 0);
  initialScore.totalMultiplier = initialScore.criteria.reduce((sum, criterion) => sum + criterion.multiplier, 0);
  initialScore.finalScore = Math.floor(initialScore.totalChips * initialScore.totalMultiplier);
  return groupPairRows(RelicManager.executeValueHook('onEvaluateHandScore', initialScore, {
    inventory,
    handCards: cards,
    isWin,
    isDoubled,
    handsRemaining,
    blackjackValue: blackjackScore,
    outcome,
    categoryCounts
  }, (previous, next, source) => ({
    ...next,
    // Capture each hook's actual delta before pair rows are combined. This also
    // records relics that modify an existing row without setting sourceRelicId.
    criteria: next.criteria.map((row, index) => {
      const before = previous.criteria[index];
      const chips = row.chips - (before?.chips ?? 0);
      const multiplier = Number((row.multiplier - (before?.multiplier ?? 0)).toFixed(8));
      if (!chips && !multiplier) return row;
      return { ...row, breakdown: [...(before?.breakdown ?? []), {
        label: source.name, sourceRelicId: source.id, chips, multiplier,
      }] };
    }),
  })));
}
