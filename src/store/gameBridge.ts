/**
 * GameBridge — Zustand store that wraps the pure game engine.
 *
 * This store:
 * 1. Holds the pure GameState as the source of truth for game logic
 * 2. Holds UI-only state (animation flags, dealer messages, scoring indices)
 * 3. Dispatches player actions through processAction()
 * 4. Feeds resulting events to EventPlayer for async presentation
 *
 * Components can consume this store with `useGameBridge` selectors,
 * getting the same state shape they expect from the old gameStore.
 */

import { create } from 'zustand';
import type { GameState, GamePhase, ShopItem, RewardSummary, InteractionMode } from '../engine/GameState';
import type { PlayerAction } from '../engine/PlayerAction';
import type { GameEvent } from '../engine/GameEvent';
import { processAction, getValidActions } from '../engine/engine';
import { playEvents, playEventsSync } from './EventPlayer';
import type { EventPlayerConfig, SfxPlayer } from './EventPlayer';
import type { Card, PlayerHand, DealerHand } from '../types';
import type { RelicInstance } from '../logic/relics/types';

// ─── UI-Only State ──────────────────────────────────────

interface UIState {
    // Animation flags
    isInitialDeal: boolean;
    isShaking: boolean;
    isDealerPlaying: boolean;
    isCollectingChips: boolean;
    isReshuffling: boolean;
    allWinnersEnlarged: boolean;
    dealerVisible: boolean;

    // Dealer messages
    dealerMessage: string | null;
    dealerMessageExiting: boolean;

    // Scoring animation
    scoringHandIndex: number;
    roundSummary: { totalChips: number; totalMult: number; finalScore: number } | null;

    // Active highlights
    activeRelicId: string | null;

    // Animation speed
    animationSpeed: number;

    // Event processing
    isProcessingEvents: boolean;
}

// ─── Bridge State ───────────────────────────────────────

interface GameBridgeState extends UIState {
    // Pure game state
    gameState: GameState;
    
    // Event log for debugging/replay
    eventLog: GameEvent[];

    // SFX player (injectable for testing)
    sfx: SfxPlayer | null;

    // Headless mode (for tests — skips all timing)
    headless: boolean;

    // === Actions ===

    /** Initialize with an SFX player */
    setSfx: (sfx: SfxPlayer) => void;

    /** Dispatch a player action through the pure engine, then animate */
    dispatch: (action: PlayerAction) => Promise<void>;

    /** Dispatch without animation (headless) */
    dispatchSync: (action: PlayerAction) => void;

    /** Get valid actions for current state */
    validActions: () => PlayerAction[];

    /** Set animation speed */
    setAnimationSpeed: (speed: number) => void;

    /** Reset everything */
    reset: () => void;

    // === Convenience Accessors ===
    // These mirror the old gameStore fields for backward compat

    readonly phase: GamePhase;
    readonly deck: readonly Card[];
    readonly dealer: Readonly<DealerHand>;
    readonly playerHands: readonly PlayerHand[];
    readonly drawnCards: readonly (Card | null)[];
    readonly selectedDrawIndex: number | null;
    readonly cardsPlacedThisTurn: number;
    readonly round: number;
    readonly interactionMode: InteractionMode;
    readonly totalScore: number;
    readonly targetScore: number;
    readonly comps: number;
    readonly dealsTaken: number;
    readonly handsRemaining: number;
    readonly inventory: readonly RelicInstance[];
    readonly tableActionCharges: Readonly<Record<string, number>>;
    readonly tableActionHeldCards: Readonly<Record<string, Card | null>>;
    readonly shopItems: readonly ShopItem[];
    readonly giftShopRestockCost: number;
    readonly shopRewardSummary: RewardSummary | null;
    readonly runningSummary: { readonly chips: number; readonly mult: number } | null;
    readonly selectedCityId: string | null;
    readonly activeTableActionId: string | null;
    readonly removalCount: number;
    readonly discardPile: readonly Card[];
    readonly redrawDiscard: { readonly card: Card; readonly index: number } | null;
}

// ─── Initial States ─────────────────────────────────────

const INITIAL_UI: UIState = {
    isInitialDeal: false,
    isShaking: false,
    isDealerPlaying: false,
    isCollectingChips: false,
    isReshuffling: false,
    allWinnersEnlarged: false,
    dealerVisible: false,
    dealerMessage: null,
    dealerMessageExiting: false,
    scoringHandIndex: -1,
    roundSummary: null,
    activeRelicId: null,
    animationSpeed: 1,
    isProcessingEvents: false,
};

// ─── Store ──────────────────────────────────────────────

export const useGameBridge = create<GameBridgeState>((set, get) => {

    /** Extract game state fields to flat store shape */
    const flattenGameState = (gs: GameState) => ({
        phase: gs.phase,
        deck: gs.deck,
        dealer: gs.dealer,
        playerHands: gs.playerHands,
        drawnCards: gs.drawnCards,
        selectedDrawIndex: gs.selectedDrawIndex,
        cardsPlacedThisTurn: gs.cardsPlacedThisTurn,
        round: gs.round,
        interactionMode: gs.interactionMode,
        totalScore: gs.totalScore,
        targetScore: gs.targetScore,
        comps: gs.comps,
        dealsTaken: gs.dealsTaken,
        handsRemaining: gs.handsRemaining,
        inventory: gs.inventory,
        tableActionCharges: gs.tableActionCharges,
        tableActionHeldCards: gs.tableActionHeldCards,
        shopItems: gs.shopItems,
        giftShopRestockCost: gs.giftShopRestockCost,
        shopRewardSummary: gs.shopRewardSummary,
        runningSummary: gs.runningSummary,
        selectedCityId: gs.selectedCityId,
        activeTableActionId: gs.activeTableActionId,
        removalCount: gs.removalCount,
        discardPile: gs.discardPile,
        redrawDiscard: gs.redrawDiscard,
    });

    return {
        // Initial pure game state (not yet started)
        gameState: { phase: 'init' } as GameState,
        eventLog: [],
        sfx: null,
        headless: false,

        // UI state
        ...INITIAL_UI,

        // Flattened game state (init values)
        phase: 'init' as GamePhase,
        deck: [],
        dealer: { cards: [], blackjackValue: 0, isRevealed: false } as DealerHand,
        playerHands: [],
        drawnCards: [],
        selectedDrawIndex: null,
        cardsPlacedThisTurn: 0,
        round: 1,
        interactionMode: 'default' as InteractionMode,
        totalScore: 0,
        targetScore: 0,
        comps: 0,
        dealsTaken: 0,
        handsRemaining: 0,
        inventory: [],
        tableActionCharges: {},
        tableActionHeldCards: {},
        shopItems: [],
        giftShopRestockCost: 3,
        shopRewardSummary: null,
        runningSummary: null,
        selectedCityId: null,
        activeTableActionId: null,
        removalCount: 0,
        discardPile: [],
        redrawDiscard: null,

        setSfx: (sfx) => set({ sfx }),

        dispatch: async (action) => {
            const { gameState, sfx, animationSpeed, headless: hl } = get();
            const { nextState, events } = processAction(gameState, action);

            // Update game state and flattened fields immediately
            set({
                gameState: nextState,
                ...flattenGameState(nextState),
                eventLog: [...get().eventLog, ...events],
                isProcessingEvents: true,
            });

            // Process events through EventPlayer for animation/sound
            const config: EventPlayerConfig = {
                updateUI: (patch) => set(patch as Partial<GameBridgeState>),
                sfx,
                getSpeed: () => get().animationSpeed,
                headless: hl,
            };

            await playEvents(events, config);
            set({ isProcessingEvents: false });
        },

        dispatchSync: (action) => {
            const { gameState } = get();
            const { nextState, events } = processAction(gameState, action);

            // Update game state
            set({
                gameState: nextState,
                ...flattenGameState(nextState),
                eventLog: [...get().eventLog, ...events],
            });

            // Process events immediately (headless)
            playEventsSync(events, (patch) => set(patch as Partial<GameBridgeState>));
        },

        validActions: () => {
            return getValidActions(get().gameState);
        },

        setAnimationSpeed: (speed) => set({ animationSpeed: speed }),

        reset: () => {
            set({
                gameState: { phase: 'init' } as GameState,
                eventLog: [],
                ...INITIAL_UI,
                ...flattenGameState({ phase: 'init' } as GameState),
            });
        },
    };
});
