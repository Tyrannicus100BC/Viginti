/**
 * Game event types — the structured log of everything that happens as a result of actions.
 * Events serve two purposes:
 * 1. Debug/replay ledger for the game logic
 * 2. Animation/sound instructions for the presentation layer
 * 
 * Events carry enough context for the presentation layer to animate correctly,
 * but contain NO timing information — timing is the presentation layer's job.
 */

import type { Card, HandScore, ScoringDetail } from '../types';
import type { RelicInstance } from '../logic/relics/types';
import type { GamePhase, ShopItem, RewardSummary } from './GameState';
import type { TutorialDisplayConfig, TutorialScope } from './tutorial/types';

// ─── Event Type Union ───────────────────────────────────

export type GameEvent =
    // === Dealing ===
    | { type: 'deal_started'; deal: number; handsRemaining: number }
    | { type: 'cards_dealt'; playerCard: Card; playerHandIndex: number; dealerCards: [Card, Card] }
    | { type: 'initial_deal_complete' }

    // === Drawing ===
    | { type: 'deck_reshuffled'; deckSize: number }
    | { type: 'card_drawn'; card: Card; drawIndex: number }
    | { type: 'draw_complete'; drawnCards: Card[]; selectedIndex: number }

    // === Card Placement ===
    | { type: 'card_placed'; card: Card; handIndex: number; newBlackjackValue: number }
    | { type: 'hand_bust'; handIndex: number; blackjackValue: number }
    | { type: 'hand_modified'; handIndex: number; newCards: Card[]; newBlackjackValue: number; reason: string }
    | { type: 'leftover_cards_discarded'; cards: Card[] }
    | { type: 'card_discarded_to_pile'; card: Card }
    | { type: 'auto_stand_triggered' }
    | { type: 'placement_complete'; canPlaceMore: boolean; nextDrawIndex: number | null }

    // === Relic Activations ===
    | { type: 'relic_activated'; relicId: string; description?: string }
    | { type: 'relic_state_changed'; relicId: string; newState: Record<string, any> }
    | { type: 'relic_removed'; relicId: string }
    | { type: 'dealer_card_revealed'; card: Card }

    // === Dealer Turn ===
    | { type: 'dealer_reveal'; card: Card; newValue: number }
    | { type: 'dealer_hit'; card: Card; newValue: number; burnedCards: Card[] }
    | { type: 'dealer_stand'; value: number }
    | { type: 'dealer_bust'; value: number }

    // === Scoring ===
    | { type: 'hand_outcome'; handIndex: number; outcome: 'win' | 'loss' | 'bust'; blackjackValue: number }
    | { type: 'scoring_hand_focus'; handIndex: number }
    | { type: 'scoring_row_intro'; handIndex: number; criterion: ScoringDetail }
    | { type: 'scoring_row_chips'; handIndex: number; criterionId: string; chips: number }
    | { type: 'scoring_row_mult'; handIndex: number; criterionId: string; multiplier: number }
    | { type: 'scoring_hand_complete'; handIndex: number }
    | { type: 'summary_update'; chips: number; mult: number }
    | { type: 'deal_scoring_complete'; totalChips: number; totalMult: number; finalScore: number }
    | { type: 'dealer_fade_out' }

    | { type: 'chip_collection'; amount: number; newTotalScore: number }

    // === Charge Changes ===
    | { type: 'charge_gained'; relicId: string; newCharges: number; reason: 'bust' | 'loss' }

    // === Phase Transitions ===
    | { type: 'phase_changed'; from: GamePhase; to: GamePhase }
    | { type: 'target_reached'; totalScore: number; targetScore: number }
    | { type: 'game_over'; won: boolean; finalScore: number }

    // === Gift Shop ===
    | { type: 'shop_entered'; items: ShopItem[]; rewardSummary: RewardSummary }
    | { type: 'item_purchased'; itemId: string; relic: RelicInstance; newComps: number }
    | { type: 'shop_restocked'; newItems: ShopItem[]; cost: number; newComps: number }
    | { type: 'relic_sold'; relicId: string; refund: number; newComps: number }
    | { type: 'shop_left' }

    // === Deck Management ===
    | { type: 'card_enhanced'; cardId: string; enhancement: { type: 'chip' | 'mult' | 'score'; value: number } }
    | { type: 'card_destroyed'; cardId: string }

    // === Table Actions ===
    | { type: 'table_action_activated'; relicId: string; prompt: string }
    | { type: 'table_action_cancelled'; relicId: string }
    | { type: 'table_action_resolved'; relicId: string; description: string }
    | { type: 'charge_spent'; relicId: string; newCharges: number }

    // === Casino Progression ===
    | { type: 'casino_cleared'; deal: number; score: number }
    | { type: 'payout_started'; total: number; rewardSummary: RewardSummary }
    | { type: 'payout_step'; label: string; amount: number; description?: string }
    | { type: 'payout_complete'; total: number }
    | { type: 'comps_earned'; amount: number; newTotal: number; reason: string }
    | { type: 'next_casino_setup'; deal: number; targetScore: number }

    // === Tutorial ===
    | { type: 'tutorial_triggered'; stepId: string; config: TutorialDisplayConfig }
    | { type: 'tutorial_completed'; stepId: string; scope: TutorialScope }
    | { type: 'tutorial_skipped'; stepId: string }
    
    // === System ===
    | { type: 'animation_complete'; animationId: string };
