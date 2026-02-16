/**
 * Pure game state types.
 * This file defines the complete, immutable state of a Viginti game.
 * No UI concerns, no animation state, no sound — just game logic.
 */
import type { Card, PlayerHand, DealerHand, HandScore } from '../types';
import type { RelicInstance } from '../logic/relics/types';

// ─── Phase ──────────────────────────────────────────────

export type GamePhase =
    | 'init'
    | 'entering_casino'
    | 'playing'
    | 'dealer_turn'
    | 'resolving_outcomes'
    | 'scoring'
    | 'deal_over'
    | 'casino_payout'
    | 'gift_shop'
    | 'game_over'
    | 'victory';

// ─── Modifiers ──────────────────────────────────────────

export interface GameModifiers {
    readonly drawCountMod: number;
    readonly placeCountMod: number;
}

// ─── Shop Items ─────────────────────────────────────────

export interface ShopItem {
    readonly id: string;
    readonly type: 'Charm' | 'Angle' | 'TableAction';
    readonly cost: number;
    readonly purchased?: boolean;
    readonly nameOverride?: string;
}

// ─── Interaction Mode ───────────────────────────────────

export type InteractionMode = 'default' | 'select_hand' | 'select_card' | 'select_draw';

// ─── Reward Summary ─────────────────────────────────────

export interface RewardSummary {
    readonly dealsBonus: number;
    readonly doubleDownBonus: number;
    readonly surrenderBonus: number;
    readonly interestedBonus: number;
    readonly winBonus: number;
    readonly total: number;
}

// ─── Scored Hand (extends PlayerHand with scoring results) ─

export interface ScoredHand extends PlayerHand {
    readonly finalScore: HandScore | null;
    readonly resultRevealed: boolean;
    readonly outcome: 'win' | 'loss' | null;
}

export interface TutorialState {
    readonly activeStepId: string | null;
    readonly completedStepIds: readonly string[]; // Session-scoped
    readonly globalCompletedStepIds: readonly string[]; // Global-scoped
}

// ─── Game State ─────────────────────────────────────────

export interface GameState {
    // === Identity ===
    readonly selectedCityId: string | null;
    readonly selectedGamblerId: string | null;

    // === Tutorial ===
    readonly tutorial: TutorialState;

    // === Casino Progression ===
    readonly deal: number;
    readonly dealsTaken: number;
    readonly handsRemaining: number;
    readonly totalScore: number;
    readonly targetScore: number;
    readonly comps: number;

    // === Table State ===
    readonly phase: GamePhase;
    readonly deck: readonly Card[];
    readonly discardPile: readonly Card[];
    readonly dealer: Readonly<DealerHand>;
    readonly playerHands: readonly PlayerHand[];
    readonly drawnCards: readonly (Card | null)[];
    readonly selectedDrawIndex: number | null;
    readonly cardsPlacedThisTurn: number;

    // === Interaction ===
    readonly interactionMode: InteractionMode;
    readonly activeTableActionId: string | null;

    // === Relics & Modifiers ===
    readonly inventory: readonly RelicInstance[];
    readonly tableActionCharges: Readonly<Record<string, number>>;
    readonly tableActionHeldCards: Readonly<Record<string, Card | null>>;
    readonly modifiers: Readonly<GameModifiers>;

    // === Gift Shop ===
    readonly shopItems: readonly ShopItem[];
    readonly giftShopRestockCost: number;
    readonly shopRewardSummary: RewardSummary | null;

    // === Scoring (during scoring phase) ===
    readonly runningSummary: { readonly chips: number; readonly mult: number } | null;

    // === RNG State ===
    readonly rngState: number;

    // === Discard/Redraw ===
    readonly redrawDiscard: { readonly card: Card; readonly index: number } | null;

    // === Card Management ===
    readonly removalCount: number;
}

// ─── Constants ──────────────────────────────────────────

export const INITIAL_HAND_COUNT = 3;
export const BASE_DEALS_PER_CASINO = 3;
