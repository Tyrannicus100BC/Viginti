import { getPackDefinition, type PendingPack } from '../logic/packs';
import { RelicManager } from '../logic/relics/manager';
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
import { BASE_ANTE, HANDS_PER_ANTE } from '../engine/economy';
import type { GameState, GamePhase, ShopItem, RewardSummary, InteractionMode } from '../engine/GameState';
import type { PlayerAction } from '../engine/PlayerAction';
import type { GameEvent } from '../engine/GameEvent';
import { processAction, getValidActions, createInitialState } from '../engine/engine';
import { playEvents, playEventsSync } from './EventPlayer';
import type { EventPlayerConfig, SfxPlayer } from './EventPlayer';
import type { Card, PlayerHand, DealerHand } from '../types';
import type { RelicInstance } from '../logic/relics/types';
import { getGlobalTutorialsCompleted, setGlobalTutorialsCompleted, getDebugSettingsEnabled, setDebugSettingsEnabled } from './persistence';

/**
 * Helper to check if two actions are "essentially the same".
 * Used for filtering buffered inputs in the dispatch queue.
 */
function isActionEquivalent(a: PlayerAction, b: PlayerAction): boolean {
    if (a.type !== b.type) return false;
    
    switch (a.type) {
        case 'start_game':
            return a.cityId === b.cityId && a.gamblerId === b.gamblerId && a.skipAtlanticTutorials === b.skipAtlanticTutorials;
        case 'select_drawn_card':
            return a.drawIndex === b.drawIndex;
        case 'place_card':
            return a.handIndex === b.handIndex;
        case 'double_down':
            return a.handIndex === b.handIndex;
        case 'activate_table_action':
            return a.relicId === b.relicId;
        case 'select_table_action_target':
            return a.handIndex === b.handIndex;
        case 'select_table_action_card':
            return a.cardId === b.cardId && a.handIndex === b.handIndex && (a as any).target === (b as any).target;
        case 'select_table_action_draw_card':
            return a.drawIndex === b.drawIndex;
        case 'buy_shop_item':
            return a.itemId === b.itemId;
        case 'choose_raise':
            return (a as any).raiseId === (b as any).raiseId;
        case 'sell_relic':
            return a.relicId === b.relicId && a.index === b.index;
        case 'enhance_card':
            return a.cardId === b.cardId;
        case 'destroy_card':
            return a.cardId === b.cardId;
        case 'acknowledge_tutorial':
            return a.stepId === b.stepId;
        default:
            // For simple types like 'deal', 'draw', 'stand', 'cancel_table_action', etc.
            return true;
    }
}

// ─── Debug Ledger ───────────────────────────────────────

export interface DebugLedgerEntry {
    stateBefore: GameState;
    action: PlayerAction;
    stateAfter: GameState;
    availableActions: PlayerAction[];
    events: GameEvent[];
    timestamp: number;
}

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
    anteIncrease: { previousAnte: number; ante: number } | null;

    // Dealer messages
    dealerMessage: string | null;
    dealerMessageExiting: boolean;

    // Scoring animation
    scoringHandIndex: number;
    visibleScoringRowIndices: Record<number, number[]>;
    scoringRowValues: Record<number, Record<number, { chips: number, mult: number, count: number }>>;
    scoringCriteria: Record<number, any[]>;
    activeHighlightIds: string[] | null;
    dealSummary: { totalChips: number; totalMult: number; finalScore: number } | null;

    // Active highlights
    activeRelicId: string | null;
    activeTutorialId: string | null;

    // Animation speed
    animationSpeed: number;

    // Event processing
    isProcessingEvents: boolean;
    
    // UI Modes
    isSellingMode: boolean;
    debugEnabled: boolean;
    debugLedger: DebugLedgerEntry[];

    // SFX/Scoring Triggers (for components like Hand.tsx)
    vigintiSoundKey: number;
    scoreRowSoundKey: number;
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

    /** Dismiss the ante interstitial without queuing another game action. */
    continueAnteIncrease: () => void;

    /** Toggle selling mode */
    toggleSellingMode: (enabled?: boolean) => void;

    /** Toggle debug mode */
    toggleDebug: () => void;

    /** Reset everything */
    reset: () => void;

    /** Manual SFX/UI Triggers */
    triggerVigintiSound: () => void;
    playScoreRowSfx: () => void;
    resetScoreRowPitch: () => void;
    triggerScoringRow: (chips: number, mult: number) => void;

    /** Load a state directly from JSON */
    loadGameState: (json: string) => boolean;

    // === Convenience Accessors ===
    // These mirror the old gameStore fields for backward compat

    readonly phase: GamePhase;
    readonly dealer: Readonly<DealerHand>;
    readonly playerHands: readonly PlayerHand[];
    readonly drawnCards: readonly (Card | null)[];
    readonly selectedDrawIndex: number | null;
    readonly cardsPlacedThisTurn: number;
    readonly deal: number;
    readonly interactionMode: InteractionMode;
    readonly totalScore: number;
    readonly targetScore: number;
    readonly comps: number;
    readonly cash: number;
    readonly ante: number;
    readonly handsUntilAnteIncrease: number;
    readonly shopDealsAtLastFreeRestock: number;
    readonly dealsTaken: number;
    readonly handsRemaining: number;
    readonly inventory: readonly RelicInstance[];
    readonly relicSlots: number;
    readonly pendingRaiseChoices: readonly string[];
    readonly pendingPack: PendingPack | null;
    readonly handUpgrades: import('../logic/handScoring').HandUpgrades;
    readonly tableActionCharges: Readonly<Record<string, number>>;
    readonly tableActionHeldCards: Readonly<Record<string, Card | null>>;
    readonly shopItems: readonly ShopItem[];
    readonly shopHasNewStock: boolean;
    readonly giftShopRestockCost: number;
    readonly shopRewardSummary: RewardSummary | null;
    readonly runningSummary: { readonly chips: number; readonly mult: number } | null;
    readonly selectedCityId: string | null;
    readonly activeTableActionId: string | null;
    readonly deckProbabilities: DeckProbabilities;
    readonly removalCount: number;
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
    anteIncrease: null,
    dealerMessage: null,
    dealerMessageExiting: false,
    scoringHandIndex: -1,
    visibleScoringRowIndices: {},
    scoringRowValues: {},
    scoringCriteria: {},
    activeHighlightIds: null,
    dealSummary: null,
    activeRelicId: null,
    activeTutorialId: null,
    animationSpeed: 1,
    isProcessingEvents: false,
    isSellingMode: false,
    debugEnabled: getDebugSettingsEnabled(),
    debugLedger: [],
    vigintiSoundKey: 0,
    scoreRowSoundKey: 0,
};

// ─── Store ──────────────────────────────────────────────

// ─── Pitch Tracking for Score Sounds ─────────────────────
let scoreRowPitch = 1.0;

export const useGameBridge = create<GameBridgeState>((set, get) => {

    /** Extract game state fields to flat store shape */
    const flattenGameState = (gs: GameState) => ({
        phase: gs.phase,
        dealer: gs.dealer,
        playerHands: gs.playerHands,
        drawnCards: gs.drawnCards,
        selectedDrawIndex: gs.selectedDrawIndex,
        cardsPlacedThisTurn: gs.cardsPlacedThisTurn,
        deal: gs.deal,
        interactionMode: gs.interactionMode,
        totalScore: gs.totalScore,
        targetScore: gs.targetScore,
        comps: gs.comps,
        cash: gs.cash,
        ante: gs.ante,
        handsUntilAnteIncrease: gs.handsUntilAnteIncrease,
        shopDealsAtLastFreeRestock: gs.shopDealsAtLastFreeRestock,
        dealsTaken: gs.dealsTaken,
        handsRemaining: gs.handsRemaining,
        inventory: gs.inventory,
        relicSlots: gs.relicSlots,
        pendingRaiseChoices: gs.pendingRaiseChoices,
        pendingPack: gs.pendingPack,
        handUpgrades: gs.handUpgrades ?? {},
        tableActionCharges: gs.tableActionCharges,
        tableActionHeldCards: gs.tableActionHeldCards,
        shopItems: gs.shopItems,
        shopHasNewStock: gs.shopHasNewStock,
        giftShopRestockCost: gs.giftShopRestockCost,
        shopRewardSummary: gs.shopRewardSummary,
        runningSummary: gs.runningSummary,
        selectedCityId: gs.selectedCityId,
        activeTableActionId: gs.activeTableActionId,
        deckProbabilities: gs.deckProbabilities,
        removalCount: gs.removalCount,
        redrawDiscard: gs.redrawDiscard,
    });

    const initialState = createInitialState();

    // Action queue to prevent race conditions during animations
    let actionQueuePromise = Promise.resolve();
    let pendingActionCount = 0;

    return {
        // Initial pure game state (not yet started)
        gameState: initialState,
        eventLog: [],
        sfx: null,
        headless: false,

        // UI state
        ...INITIAL_UI,

        // Flattened game state (init values)
        ...flattenGameState(initialState),

        setSfx: (sfx) => set({ sfx }),

        dispatch: async (action) => {
            pendingActionCount++;
            set({ isProcessingEvents: true });

            const nextPromise = actionQueuePromise.catch(() => {}).then(async () => {
                try {
                    const { gameState, sfx, headless: hl, debugEnabled } = get();

                    // VALIDATION / REDISPATCH LOGIC:
                    // Check if the buffered action is actually still valid in the current state.
                    // This handles the "interpretation of the click" problem.
                    const valid = getValidActions(gameState);
                    const isInfra = [
                        'debug_win', 
                        'debug_undo',
                        'debug_victory',
                        'debug_add_relic', 
                        'debug_remove_relic',
                        'debug_fill_charges',
                        'debug_give_cash',
                        'debug_draw_card',
                        'start_game' // Always allow restart
                    ].includes(action.type);

                    const isStillValid = isInfra || valid.some(v => isActionEquivalent(v, action));

                    if (!isStillValid) {
                        console.warn(`[GameBridge] Dropping stale buffered action: ${action.type}. No longer valid in current state.`);
                        return;
                    }

                    let finalAction = action;
                    // Inject persistence for start_game
                    if (finalAction.type === 'start_game') {
                        finalAction = { 
                            ...finalAction, 
                            globalTutorialsCompleted: finalAction.globalTutorialsCompleted ?? getGlobalTutorialsCompleted() 
                        };
                    }
                    if (finalAction.type === 'debug_undo') {
                        const { debugLedger } = get();
                        if (debugLedger.length > 0) {
                            const lastEntry = debugLedger[debugLedger.length - 1];
                            const prevGameState = lastEntry.stateBefore;
                            set({
                                gameState: prevGameState,
                                ...flattenGameState(prevGameState),
                                debugLedger: debugLedger.slice(0, -1),
                                // Reset UI flags to match newly restored state (best effort)
                                isInitialDeal: false,
                                isDealerPlaying: false,
                                isCollectingChips: false,
                                isProcessingEvents: false,
                                scoringHandIndex: -1,
                                visibleScoringRowIndices: {},
                                scoringRowValues: {},
                                scoringCriteria: {},
                                dealSummary: null,
                                runningSummary: prevGameState.runningSummary,
                            });
                            return;
                        }
                        return;
                    }

                    const { nextState, events } = processAction(gameState, finalAction);

                    // Record snapshot
                    if (debugEnabled) {
                        const entry: DebugLedgerEntry = {
                            stateBefore: { ...gameState },
                            action: { ...finalAction },
                            stateAfter: { ...nextState },
                            availableActions: getValidActions(nextState),
                            events: [...events],
                            timestamp: Date.now(),
                        };
                        set(state => ({
                            debugLedger: [...state.debugLedger.slice(-199), entry]
                        }));
                    }

                    // Persist global tutorials if changed
                    if (nextState.tutorial.globalCompletedStepIds !== gameState.tutorial?.globalCompletedStepIds) {
                        setGlobalTutorialsCompleted([...nextState.tutorial.globalCompletedStepIds]);
                    }

                    // Update initial flags
                    set({
                        eventLog: [...get().eventLog, ...events],
                    });

                    // Process events through EventPlayer for animation/sound
                    const config: EventPlayerConfig = {
                        updateUI: (patch) => set((state) => {
                            const updates: any = {};
                            for (const key in patch) {
                                const val = patch[key as keyof typeof patch];
                                if (typeof val === 'function') {
                                    updates[key] = val((state as any)[key]);
                                } else {
                                    updates[key] = val;
                                }
                            }
                            return updates;
                        }),
                        sfx,
                        getSpeed: () => get().animationSpeed,
                        headless: hl,
                        waitForAnteContinue: () => new Promise<void>(resolve => {
                            const unsubscribe = useGameBridge.subscribe(state => {
                                if (state.anteIncrease === null) {
                                    unsubscribe();
                                    resolve();
                                }
                            });
                            if (get().anteIncrease === null) {
                                unsubscribe();
                                resolve();
                            }
                        }),
                    };

                    await playEvents(events, config);

                    // ONLY AFTER events are done, sync the final game state
                    set({
                        gameState: nextState,
                        ...flattenGameState(nextState),
                    });

                    // Check for auto-stand trigger
                    if (events.some(e => e.type === 'auto_stand_triggered')) {
                        // Queue a stand action automatically
                        void get().dispatch({ type: 'stand' });
                    } else if (nextState.phase === 'dealer_turn') {
                         void get().dispatch({ type: 'resolve_dealer_turn' });
                    } else if (nextState.phase === 'resolving_outcomes') {
                         void get().dispatch({ type: 'resolve_hand_outcome' });
                    } else if (nextState.phase === 'scoring') {
                         void get().dispatch({ type: 'score_round' });
                    }
                } finally {
                    pendingActionCount--;
                    if (pendingActionCount === 0) {
                        set({ isProcessingEvents: false });
                    }
                }
            });

            actionQueuePromise = nextPromise;
            return nextPromise;
        },

        dispatchSync: (action) => {
            const { gameState, debugEnabled } = get();

            const { nextState, events } = processAction(gameState, action);

            // Record snapshot
            if (debugEnabled) {
                const entry: DebugLedgerEntry = {
                    stateBefore: { ...gameState },
                    action: { ...action },
                    stateAfter: { ...nextState },
                    availableActions: getValidActions(nextState),
                    events: [...events],
                    timestamp: Date.now(),
                };
                set(state => ({
                    debugLedger: [...state.debugLedger.slice(-199), entry]
                }));
            }

            // Update game state
            set({
                gameState: nextState,
                ...flattenGameState(nextState),
                eventLog: [...get().eventLog, ...events],
            });

            // Process events immediately (headless)
            playEventsSync(events, (patch) => set((state) => {
                const updates: any = {};
                for (const key in patch) {
                    const val = patch[key as keyof typeof patch];
                    if (typeof val === 'function') {
                        updates[key] = val((state as any)[key]);
                    } else {
                        updates[key] = val;
                    }
                }
                return updates;
            }));

            // Event handlers animate card additions; restore authoritative arrays after playback.
            set({ gameState: nextState, ...flattenGameState(nextState) });

            // Check for auto-stand trigger
            if (events.some(e => e.type === 'auto_stand_triggered')) {
                get().dispatchSync({ type: 'stand' });
            } else if (nextState.phase === 'dealer_turn') {
                 get().dispatchSync({ type: 'resolve_dealer_turn' });
            } else if (nextState.phase === 'resolving_outcomes') {
                 get().dispatchSync({ type: 'resolve_hand_outcome' });
            } else if (nextState.phase === 'scoring') {
                 get().dispatchSync({ type: 'score_round' });
            }
        },

        validActions: () => {
            return getValidActions(get().gameState);
        },

        setAnimationSpeed: (speed) => set({ animationSpeed: speed }),
        continueAnteIncrease: () => set({ anteIncrease: null }),

        toggleSellingMode: (enabled) => set(state => ({ 
            isSellingMode: enabled !== undefined ? enabled : !state.isSellingMode 
        })),

        toggleDebug: () => set(state => {
            const next = !state.debugEnabled;
            setDebugSettingsEnabled(next);
            return { debugEnabled: next };
        }),

        reset: () => {
            const newState = createInitialState();
            scoreRowPitch = 1.0;
            set({
                gameState: newState,
                eventLog: [],
                ...INITIAL_UI,
                visibleScoringRowIndices: {},
                scoringRowValues: {},
                scoringCriteria: {},
                activeHighlightIds: null,
                debugEnabled: getDebugSettingsEnabled(),
                ...flattenGameState(newState),
            });
        },

        triggerVigintiSound: () => {
            set(state => ({ vigintiSoundKey: state.vigintiSoundKey + 1 }));
        },

        playScoreRowSfx: () => {
            const { sfx } = get();
            if (sfx) {
                sfx.play('score', { playbackRate: scoreRowPitch });
                scoreRowPitch = Math.min(1.3, scoreRowPitch + 0.04);
            }
            set(state => ({ scoreRowSoundKey: state.scoreRowSoundKey + 1 }));
        },

        resetScoreRowPitch: () => {
            scoreRowPitch = 1.0;
        },

        triggerScoringRow: (chips, mult) => {
            set(state => {
                const current = state.runningSummary || { chips: 0, mult: 0 };
                return {
                    runningSummary: {
                        chips: current.chips + chips,
                        mult: current.mult + mult
                    }
                };
            });
        },

        loadGameState: (json: string): boolean => {
            try {
                const parsed = JSON.parse(json);
                // Basic validation: must have phase
                if (!parsed || !parsed.phase) return false;

                // If it's a full state object (includes UI flags etc from a previous dump)
                // we might want to extract just the gameState sub-property if it exists,
                // or assume it's the pure GameState.
                
                const rawState = parsed.gameState || parsed;
                const inventory = rawState.inventory.filter((instance: RelicInstance) => RelicManager.getRelicConfig(instance.id));
                const nextGameState = {
                    ...rawState,
                    inventory,
                    relicSlots: Math.max(4, inventory.length, rawState.relicSlots ?? 4),
                    pendingRaiseChoices: rawState.pendingRaiseChoices ?? [],
                    pendingPack: rawState.pendingRaiseChoices?.length ? {
                        packId: getPackDefinition(rawState.pendingPack?.packId).id,
                        picksRemaining: rawState.pendingPack?.picksRemaining ?? 1,
                    } : null,
                    ante: rawState.ante ?? BASE_ANTE,
                    handsUntilAnteIncrease: rawState.handsUntilAnteIncrease ?? HANDS_PER_ANTE,
                    shopHasNewStock: rawState.shopHasNewStock ?? false,
                    handUpgrades: rawState.handUpgrades ?? {},
                    // Imported shops use the same stock presentation as new runs.
                    shopItems: (rawState.shopItems ?? []).map((item: ShopItem) => {
                        if (item.type === 'Control' || item.type === 'Score') return { ...item, type: 'Relic' };
                        if (item.type === 'Raise' || item.type === 'RaisePack') {
                            const pack = getPackDefinition(item.packId);
                            return { ...item, type: 'RaisePack', packId: pack.id, cost: item.type === 'Raise' ? pack.cost : item.cost, nameOverride: pack.name };
                        }
                        return item;
                    }),
                };

                const isScoring = nextGameState.phase === 'scoring';
                const isDealerTurn = nextGameState.phase === 'dealer_turn';
                const isResolving = nextGameState.phase === 'resolving_outcomes';
                const showDealer = ['entering_casino', 'playing', 'dealer_turn', 'resolving_outcomes'].includes(nextGameState.phase);

                set({
                    gameState: nextGameState,
                    ...flattenGameState(nextGameState),
                    // Reset UI flags to sensible defaults for the new state
                    isInitialDeal: false,
                    anteIncrease: null,
                    isShaking: false,
                    isDealerPlaying: isDealerTurn || isResolving,
                    isCollectingChips: false,
                    isReshuffling: false,
                    allWinnersEnlarged: false,
                    dealerVisible: showDealer,
                    dealerMessage: null,
                    dealerMessageExiting: false,
                    scoringHandIndex: -1,
                    visibleScoringRowIndices: {},
                    scoringRowValues: {},
                    scoringCriteria: {},
                    activeHighlightIds: null,
                    dealSummary: null,
                    isProcessingEvents: false,
                });

                // Trigger auto-progression if needed
                if (isDealerTurn) {
                    void get().dispatch({ type: 'resolve_dealer_turn' });
                } else if (isResolving) {
                    void get().dispatch({ type: 'resolve_hand_outcome' });
                } else if (isScoring) {
                    void get().dispatch({ type: 'score_round' });
                }

                return true;
            } catch (e) {
                console.error('Failed to load game state:', e);
                return false;
            }
        },
    };
});
