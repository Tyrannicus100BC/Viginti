/**
 * Pure game state types.
 * This file defines the complete, immutable state of a Viginti game.
 * No UI concerns, no animation state, no sound — just game logic.
 */
import type { Card, PlayerHand, DealerHand, HandScore } from '../types';
import type { RelicInstance } from '../logic/relics/types';
import type { HandUpgrades } from '../logic/handScoring';
import type { Challenge, ChallengeReward } from './challenges';
import type { PackId, PendingPack } from '../logic/packs';

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
    | 'pack_choice'
    | 'game_over'
    | 'victory';

// ─── Deck Probabilities ──────────────────────────────────

export interface SuitWeights {
    readonly hearts: number;
    readonly diamonds: number;
    readonly clubs: number;
    readonly spades: number;
}

export interface RankWeights {
    readonly ace: number;
    readonly face: number;
    readonly upper: number;
    readonly lower: number;
}

export interface SpecialWeight {
    readonly type: 'chip' | 'mult' | 'score';
    readonly chance: number; // 0-1 probability of this type, before rolling its strength
}

export interface DeckProbabilities {
    readonly suits: SuitWeights;
    readonly ranks: RankWeights;
    readonly specialChance: number; // legacy/base total chance
    readonly specialWeights: readonly SpecialWeight[];
}

// ─── Modifiers ──────────────────────────────────────────

export interface GameModifiers {
    readonly drawCountMod: number;
    readonly placeCountMod: number;
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

    // === Run Economy ===
    readonly deal: number;
    readonly dealsTaken: number;
    readonly handsRemaining: number;
    readonly totalScore: number;
    readonly targetScore: number;
    readonly cash: number; // Spendable bankroll
    readonly ante: number;
    readonly challengeStage: number;
    readonly challenges: readonly Challenge[];
    readonly challengeRewards: readonly ChallengeReward[];

    // === Table State ===
    readonly phase: GamePhase;
    readonly deckProbabilities: DeckProbabilities;
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
    readonly relicSlots: number;
    readonly pendingRaiseChoices: readonly string[];
    readonly pendingPackChoices: readonly string[];
    readonly pendingPack: PendingPack | null;
    readonly offeredPacks: readonly PackId[];
    readonly packReturnPhase: 'entering_casino' | 'deal_over';
    readonly debugPackReturn: {
        readonly phase: 'entering_casino' | 'deal_over' | 'playing' | 'pack_choice';
        readonly offeredPacks: readonly PackId[];
        readonly packReturnPhase: 'entering_casino' | 'deal_over';
    } | null;
    readonly handUpgrades: HandUpgrades;
    readonly tableActionCharges: Readonly<Record<string, number>>;
    readonly tableActionHeldCards: Readonly<Record<string, Card | null>>;
    readonly modifiers: Readonly<GameModifiers>;

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
export const BASE_DEALS_PER_CASINO = 4;
