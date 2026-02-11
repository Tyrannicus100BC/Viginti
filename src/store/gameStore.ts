import { create } from 'zustand';
import type { Card, DealerHand, PlayerHand } from '../types';
import { createStandardDeck, shuffleDeck } from '../logic/deck';
import { getBlackjackScore, evaluateHandScore } from '../logic/scoring';
import { calculateTargetScore } from '../logic/casinoConfig';
import { RelicManager } from '../logic/relics/manager';
import type { RelicInstance } from '../logic/relics/types';
// import { RELIC_REGISTRY } from '../logic/relics/registry';



// Import Gambler Definitions
import { GAMBLER_DEFINITIONS } from '../logic/gamblers/definitions';
import { CITY_DEFINITIONS } from '../logic/cities/definitions';
import { generateShopItems, getRelicCompCost } from '../logic/rewards/generator';
// import type { RoundSummary } from '../logic/relics/types';
import { TutorialManager } from '../logic/tutorials/tutorials';
import { ATLANTIC_CITY_TUTORIAL_STEPS, GLOBAL_TUTORIAL_STEPS, STAND_TUTORIAL_ID, TUTORIAL_STEPS } from '../logic/tutorials/definitions';
import { getDebugSettingsEnabled, setDebugSettingsEnabled } from './persistence';
import { recordCityCleared } from '../logic/progression';
import { sfxEngine } from '../utils/sfxEngine';

const SCORE_ROW_RATE_BASE = 1;
const SCORE_ROW_RATE_STEP = 0.04;
const SCORE_ROW_RATE_MAX = 1.3;

const buildTutorialContext = (state: GameState) => ({
    phase: state.phase,
    round: state.round,
    isInitialDeal: state.isInitialDeal,
    isDealerPlaying: state.isDealerPlaying,
    dealerCards: state.dealer.cards,
    drawnCards: state.drawnCards,
    playerHands: state.playerHands,
    cardsPlacedThisTurn: state.cardsPlacedThisTurn,
    interactionMode: state.interactionMode,
    totalScore: state.totalScore,
    targetScore: state.targetScore,
    runningSummary: state.runningSummary,
    handsRemaining: state.handsRemaining,
    dealsTaken: state.dealsTaken,
    inventory: state.inventory
});

const getTableActionConfig = (relicId: string) => {
    const config = RelicManager.getRelicConfig(relicId);
    return config?.tableAction;
};

const buildTableActionCharges = (
    inventory: RelicInstance[],
    existingCharges: Record<string, number> = {},
    options?: { resetPerCasino?: boolean }
) => {
    const charges: Record<string, number> = {};
    inventory.forEach(instance => {
        const action = getTableActionConfig(instance.id);
        if (!action) return;
        const current = existingCharges[instance.id];
        let next = current ?? (action.recharge === 'casino' ? action.maxCharges : 0);
        if (options?.resetPerCasino && action.recharge === 'casino') {
            next = action.maxCharges;
        }
        charges[instance.id] = Math.max(0, Math.min(action.maxCharges, next));
    });
    return charges;
};

const buildTableActionHeldCards = (
    inventory: RelicInstance[],
    existingHeld: Record<string, Card | null> = {},
    options?: { resetPerCasino?: boolean }
) => {
    const held: Record<string, Card | null> = {};
    inventory.forEach(instance => {
        const action = getTableActionConfig(instance.id);
        if (!action) return;
        held[instance.id] = options?.resetPerCasino ? null : (existingHeld[instance.id] ?? null);
    });
    return held;
};

const shouldGainCharge = (recharge: string, event: 'bust' | 'loss') => {
    if (recharge === 'bust_or_loss') return true;
    return recharge === event;
};

interface GameState {
    deck: Card[];
    dealer: DealerHand;
    playerHands: PlayerHand[];
    drawnCards: (Card | null)[];
    selectedDrawIndex: number | null;
    cardsPlacedThisTurn: number;
    redrawDiscard: { card: Card; index: number } | null;
    isRedrawAnimating: boolean;
    modifiers: {
        drawCountMod: number;
        placeCountMod: number;
    };
    phase: 'init' | 'entering_casino' | 'playing' | 'scoring' | 'round_over' | 'game_over' | 'casino_win' | 'gift_shop' | 'victory';
    round: number;
    interactionMode: 'default' | 'select_hand' | 'select_card' | 'select_draw';
    totalScore: number;
    targetScore: number;
    comps: number;
    dealsTaken: number;
    handsRemaining: number;
    scoringHandIndex: number;
    isCollectingChips: boolean;
    allWinnersEnlarged: boolean;
    dealerVisible: boolean;
    // Aggregated Scoring State
    runningSummary: { chips: number; mult: number } | null;
    roundSummary: { totalChips: number; totalMult: number; finalScore: number } | null;
    selectedCityId: string | null;
    shopRewardSummary: { dealsBonus: number; doubleDownBonus: number; surrenderBonus: number; interestedBonus: number; winBonus: number; total: number } | null;
    discardPile: Card[];
    inventory: RelicInstance[];
    activeRelicId: string | null;
    activeTableActionId: string | null;
    tableActionCharges: Record<string, number>;
    tableActionHeldCards: Record<string, Card | null>;
    shopItems: { id: string, type: 'Charm' | 'Angle' | 'TableAction', purchased?: boolean, cost: number, nameOverride?: string }[];
    giftShopRestockCost: number;
    selectedShopItemId: string | null;
    buyShopItem: (itemId: string) => { success: boolean, reason?: 'full' | 'insufficient_funds' };
    restockGiftShop: () => void;
    addComps: (amount: number) => void;
    enterGiftShop: () => void;
    isSellingMode: boolean;
    toggleSellingMode: (enabled: boolean) => void;
    rewardRelicSell: (relicId: string) => void;
    sellRelic: (instanceId: string, index: number) => void;


    isInitialDeal: boolean;
    isShaking: boolean; // For >300 score celebration

    dealerMessageExiting: boolean;
    dealerMessage: string | null;
    isDealerPlaying: boolean;
    drawTutorialReady: boolean;
    vigintiSoundKey: number;
    scoreSfxStep: number;
    removalCount: number;

    getMaxCharms: () => number;
    getMaxAngles: () => number;



    debugEnabled: boolean;
    
    // Actions
    startGame: (gamblerId?: string, cityId?: string, options?: { skipAtlanticTutorials?: boolean }) => void;
    dealFirstHand: () => void;
    drawCard: () => void;
    assignCard: (handIndex: number) => Promise<void>;

    // Table Action Hooks
    startTableAction: (relicId: string) => void;
    cancelTableAction: () => void;
    selectTableActionHand: (handIndex: number) => Promise<void>;
    selectTableActionCard: (payload: { target: 'player' | 'dealer'; handIndex?: number; cardId: string }) => Promise<void>;
    selectTableActionDrawCard: (drawIndex: number) => Promise<void>;
    holdReturns: (forceDealerBust?: boolean) => Promise<void>; // Async for pacing
    nextRound: (forceContinue?: boolean) => void;
    selectShopItem: (itemId: string) => void;
    confirmShopSelection: (itemId?: string) => void;
    completeRoundEarly: () => void;
    startChipCollection: () => Promise<void>;
    chipCollectionComplete: () => void;

    toggleDebug: () => void;

    animationSpeed: number;
    setAnimationSpeed: (speed: number) => void;
    incrementScore: (amount: number) => void;
    triggerDebugChips: () => void;
    triggerScoringRow: (chips: number, mult: number) => void;
    resetScoreRowPitch: () => void;
    playScoreRowSfx: () => void;
    debugWin: () => Promise<void>;
    debugUndo: () => void;
    debugFillTableAction: (relicId: string) => void;
    drawSpecificCard: (cardId: string) => void;
    addRelic: (relicId: string) => void;
    removeRelic: (relicId: string) => void;
    updateRunningSummary: (chips: number, mult: number) => void;
    selectDrawnCard: (index: number) => void;
    getProjectedDrawCount: () => number;
    getProjectedPlaceCount: () => number;
    deductRemovalCost: () => void;
    removeCard: (cardId: string) => void;
    enhanceCard: (cardId: string, effect: { type: 'chip' | 'mult' | 'score', value: number }) => void;
    leaveShop: () => void;
    revealDealerHiddenCard: () => void;
    goToTitle: () => void;
    winGame: () => void;
    isReshuffling: boolean;
    registerTutorials: (options?: { includeAtlanticCity?: boolean }) => void;
    checkTutorials: () => void;
    onTutorialContinue: (actionId: string, handler: (context?: any) => Promise<void> | void) => void;
    isTutorialInputLocked: () => boolean;
    onInitialDealAnimationsComplete: () => void;
    signalTotalWinningsAnimationComplete: () => void;
    setDrawTutorialReady: (ready: boolean) => void;
    triggerVigintiSound: () => void;
}



const INITIAL_HAND_COUNT = 3;
const BASE_DEALS_PER_CASINO = 3;

export const useGameStore = create<GameState>((set, get) => {
    const addTableActionCharge = (event: 'bust' | 'loss') => {
        set(state => {
            const next = { ...state.tableActionCharges };
            state.inventory.forEach(instance => {
                const action = getTableActionConfig(instance.id);
                if (!action) return;
                if (!shouldGainCharge(action.recharge, event)) return;
                const current = next[instance.id] ?? 0;
                next[instance.id] = Math.min(action.maxCharges, current + 1);
            });
            return { tableActionCharges: next };
        });
    };

    const shouldSuppressAutoStandForStandTutorial = () => {
        const manager = TutorialManager.getInstance();
        return manager.areSessionTutorialsEnabled() && !manager.isCompleted(STAND_TUTORIAL_ID);
    };

    const queueAutoStandIfAllowed = () => {
        if (shouldSuppressAutoStandForStandTutorial()) return;
        setTimeout(() => {
            get().holdReturns();
        }, 1000);
    };

    const getDealerDisplayValue = (dealer: DealerHand, inventory: RelicInstance[]) => {
        const visibleCards = dealer.isRevealed ? dealer.cards : dealer.cards.filter(card => card.isFaceUp);
        return getBlackjackScore(visibleCards, inventory);
    };

    const getCurrentCasinoShopConfig = () => {
        const { selectedCityId, round } = get();
        const city = CITY_DEFINITIONS.find(c => c.id === selectedCityId) || CITY_DEFINITIONS[0];
        const casinoIndex = round - 1;
        return {
            rewardConfig: city.getRewards(casinoIndex),
            shopPriceOverrides: city.getShopPriceOverrides?.(casinoIndex)
        };
    };

    return ({
    deck: [],
    dealer: { cards: [], isRevealed: false, blackjackValue: 0 },
    playerHands: [],
    drawnCards: [],
    selectedDrawIndex: null,
    cardsPlacedThisTurn: 0,
    redrawDiscard: null,
    isRedrawAnimating: false,
    modifiers: { drawCountMod: 0, placeCountMod: 0 },
    dealerMessage: null,
    dealerMessageExiting: false,

    phase: 'init',
    interactionMode: 'default',
    round: 1,
    totalScore: 0,
    targetScore: calculateTargetScore(1),
    comps: 5,
    dealsTaken: 0,
    handsRemaining: BASE_DEALS_PER_CASINO,
    scoringHandIndex: -1,
    isCollectingChips: false,
    runningSummary: null,
    roundSummary: null,
    selectedCityId: null,
    shopRewardSummary: null,
    discardPile: [],
    inventory: [],
    activeRelicId: null,
    activeTableActionId: null,
    tableActionCharges: {},
    tableActionHeldCards: {},
    shopItems: [],
    removalCount: 0,
    isSellingMode: false,
    toggleSellingMode: (enabled) => set({ isSellingMode: enabled }),
    rewardRelicSell: (relicId) => {
        const purchaseCost = getRelicCompCost(relicId);
        const sellPrice = Math.ceil(purchaseCost / 3);
        const { comps } = get();
        set({ comps: comps + sellPrice });
        sfxEngine.play('purchase');
    },
    sellRelic: (instanceId, index) => {
        const { inventory, tableActionCharges, tableActionHeldCards } = get();
        const instance = inventory[index];
        if (!instance || instance.id !== instanceId) return;

        const newInventory = [...inventory];
        newInventory.splice(index, 1);

        set({
            inventory: newInventory,
            tableActionCharges: buildTableActionCharges(newInventory, tableActionCharges),
            tableActionHeldCards: buildTableActionHeldCards(newInventory, tableActionHeldCards)
        });
    },
    giftShopRestockCost: 3,
    selectedShopItemId: null,
    vigintiSoundKey: 0,
    isInitialDeal: true,
    isShaking: false,
    isReshuffling: false,
    allWinnersEnlarged: false,
    dealerVisible: true,
    isDealerPlaying: false,
    drawTutorialReady: false,
    debugEnabled: getDebugSettingsEnabled(),
    animationSpeed: 1,
    scoreSfxStep: 0,
    setAnimationSpeed: (speed) => set({ animationSpeed: speed }),
    addComps: (amount) => {
        if (amount <= 0) return;
        set(state => ({ comps: state.comps + amount }));
    },
    triggerVigintiSound: () => set(state => ({ vigintiSoundKey: state.vigintiSoundKey + 1 })),
    resetScoreRowPitch: () => set({ scoreSfxStep: 0 }),
    playScoreRowSfx: () =>
        set(state => {
            const playbackRate = Math.min(
                SCORE_ROW_RATE_BASE + state.scoreSfxStep * SCORE_ROW_RATE_STEP,
                SCORE_ROW_RATE_MAX
            );
            sfxEngine.play('score', { playbackRate });
            return { scoreSfxStep: state.scoreSfxStep + 1 };
        }),

    registerTutorials: (options) => {
         const includeAtlanticCity = options?.includeAtlanticCity ?? true;
         const manager = TutorialManager.getInstance();
         manager.registerSteps([
             ...GLOBAL_TUTORIAL_STEPS,
             ...(includeAtlanticCity ? ATLANTIC_CITY_TUTORIAL_STEPS : [])
         ]);
        manager.registerActions({
            deal_first_hand: async () => {
                get().dealFirstHand();
            },
            mark_draw_tutorial_ready: () => {
                get().setDrawTutorialReady(true);
            }
        });
    },

    checkTutorials: () => {
        const state = get();
        const manager = TutorialManager.getInstance();
        const context = buildTutorialContext(state);

        manager.setContext(context);
        
        // Trigger generic check
        if (!manager.getActiveStep()) {
             TUTORIAL_STEPS.forEach(step => {
                 manager.tryTriggerStep(step.id, context, 'auto');
             });
        }
    },

    onTutorialContinue: (actionId, handler) => {
        TutorialManager.getInstance().registerActions({ [actionId]: handler });
    },

    isTutorialInputLocked: () => {
        return TutorialManager.getInstance().isInputLocked();
    },

    onInitialDealAnimationsComplete: () => {
        const current = get();
        if (!current.isInitialDeal) return;

        set({ isInitialDeal: false });

        const updated = get();
        const context = buildTutorialContext(updated);
        const manager = TutorialManager.getInstance();
        manager.setContext(context);
        manager.signalEvent('dealer_initial_deal_complete', context);
    },

    signalTotalWinningsAnimationComplete: () => {
        const state = get();
        const manager = TutorialManager.getInstance();
        const context = buildTutorialContext(state);
        manager.setContext(context);
        manager.signalEvent('total_winnings_shown', context);
    },

    goToTitle: () => set({ phase: 'init' }),
    setDrawTutorialReady: (ready) => set({ drawTutorialReady: ready }),

    winGame: () => {
        const { selectedCityId } = get();
        if (selectedCityId) {
            recordCityCleared(selectedCityId);
        }
        set({ phase: 'victory' });
    },

    toggleDebug: () => {
        set(state => {
            const newValue = !state.debugEnabled;
            setDebugSettingsEnabled(newValue);
            return { debugEnabled: newValue };
        });
    },

    getProjectedDrawCount: () => {
        const { modifiers, inventory } = get();
        let drawCount = 1 + modifiers.drawCountMod;
        // dryRun: true prevents side effects like consuming bonuses
        drawCount = RelicManager.executeValueHook('getDrawCount', drawCount, { inventory, dryRun: true });
        return drawCount;
    },

    getProjectedPlaceCount: () => {
        const { modifiers, inventory } = get();
        let placeCount = 1 + modifiers.placeCountMod;
        placeCount = RelicManager.executeValueHook('getPlaceCount', placeCount, { inventory, dryRun: true });
        return placeCount;
    },

    getMaxCharms: () => {
        const { inventory } = get();
        return RelicManager.executeValueHook('getMaxCharms', 5, { inventory, dryRun: true });
    },

    getMaxAngles: () => {
        const { inventory } = get();
        return RelicManager.executeValueHook('getMaxAngles', 5, { inventory, dryRun: true });
    },

    incrementScore: (amount) => set(state => ({ totalScore: state.totalScore + amount })),

    triggerDebugChips: () => {
        const { targetScore, totalScore, incrementScore, phase, addComps } = get();
        if (phase === 'gift_shop') {
            addComps(5);
            return;
        }
        const amount = Math.ceil(targetScore / 2);
        const nextTotal = totalScore + amount;
        incrementScore(amount);
        // Only finalize collection during the scoring pipeline.
        // Calling this during "playing" can force round_over while the initial deal lock is still active.
        if (phase === 'scoring') {
            get().chipCollectionComplete();
            return;
        }

        // Debug convenience: if cash clears the casino during normal play,
        // move directly to round_over and clear the initial deal lock
        // so the action button becomes "Leave Casino".
        if ((phase === 'playing' || phase === 'entering_casino') && nextTotal >= targetScore) {
            set({
                phase: 'round_over',
                isCollectingChips: false,
                scoringHandIndex: -1,
                roundSummary: null,
                isInitialDeal: false
            });
        }
    },

    updateRunningSummary: (chips, mult) => {
        set(state => ({
            runningSummary: state.runningSummary ? {
                chips: state.runningSummary.chips + chips,
                mult: state.runningSummary.mult + mult
            } : { chips, mult }
        }));
    },

    triggerScoringRow: (chips, mult) => {
        set(state => {
            const currentChips = state.runningSummary?.chips || 0;
            const currentMult = state.runningSummary?.mult || 0;
            return {
                runningSummary: {
                    chips: currentChips + chips,
                    mult: currentMult + mult
                }
            };
        });
    },

    startGame: (gamblerId: string = 'newbie', cityId: string = 'atlantic_city', options?: { skipAtlanticTutorials?: boolean }) => {
        const gambler = GAMBLER_DEFINITIONS.find(g => g.id === gamblerId) || GAMBLER_DEFINITIONS[0];
        const city = CITY_DEFINITIONS.find(c => c.id === cityId) || CITY_DEFINITIONS[0];

        const tutorialManager = TutorialManager.getInstance();
        const isAtlanticCity = city.id === 'atlantic_city';
        const skipAtlanticTutorials = options?.skipAtlanticTutorials ?? false;
        const includeAtlanticCityTutorials = isAtlanticCity && !skipAtlanticTutorials;

        get().registerTutorials({ includeAtlanticCity: includeAtlanticCityTutorials });

        tutorialManager.setSessionTutorialsEnabled(includeAtlanticCityTutorials);
        if (includeAtlanticCityTutorials) {
            tutorialManager.resetSessionTutorials();
        }
        
        const deck = shuffleDeck(gambler.getInitialDeck());

        // Reset to Casino 1 state but don't deal yet
        const emptyHands: PlayerHand[] = Array.from({ length: INITIAL_HAND_COUNT }, (_, i) => ({
            id: i,
            cards: [],
            isHeld: false,
            isBust: false,
            blackjackValue: 0
        }));

        // Initialize Inventory from Gambler
        const initialInventory = gambler.getInitialRelics();
        const initialTargetScore = city.casinoTargets[0]; // 1st casino target score

        set({
            deck,
            playerHands: emptyHands,
            dealer: { cards: [], isRevealed: false, blackjackValue: 0 },
            drawnCards: [],
            selectedDrawIndex: null,
            cardsPlacedThisTurn: 0,
            redrawDiscard: null,
            isRedrawAnimating: false,
            modifiers: { drawCountMod: 0, placeCountMod: 0 },
            dealerMessage: null,
            dealerMessageExiting: false,
            phase: 'entering_casino', // Start in entry mode
            totalScore: 0,
            targetScore: initialTargetScore,
            selectedCityId: city.id,
            comps: 5,
            dealsTaken: 0,
            handsRemaining: RelicManager.executeValueHook('getDealsPerCasino', BASE_DEALS_PER_CASINO, { inventory: initialInventory }),
            round: 1,
            discardPile: [],
            isInitialDeal: true,
            interactionMode: 'default',
            inventory: initialInventory,
            runningSummary: null,
            roundSummary: null,
            allWinnersEnlarged: false,
            dealerVisible: true,
            shopItems: [],
            giftShopRestockCost: 3,
            selectedShopItemId: null,
            isDealerPlaying: false,
            drawTutorialReady: false,
            activeTableActionId: null,
            tableActionCharges: buildTableActionCharges(initialInventory, {}, { resetPerCasino: true }),
            tableActionHeldCards: buildTableActionHeldCards(initialInventory, {}, { resetPerCasino: true }),
            animationSpeed: 1,
        });
    },

    deductRemovalCost: () => {
        const { removalCount, comps } = get();
        const cost = 2 + (removalCount * 2);
        if (comps < cost) return;

        set(state => ({
            comps: state.comps - cost,
            removalCount: state.removalCount + 1
        }));
        sfxEngine.play('purchase');
    },

    removeCard: (cardId: string) => {
        set(state => ({
            deck: state.deck.filter(c => c.id !== cardId)
        }));
    },

    dealFirstHand: async () => {
        const { deck, round, targetScore, totalScore, isInitialDeal, phase } = get();
        if (isInitialDeal && phase === 'playing') return; // Already dealing

        // Use the existing deck (already shuffled in startGame or nextRound)
        // or create a new one if empty (fallback)
        const currentDeck = deck.length > 0 ? [...deck] : shuffleDeck(createStandardDeck());

        // Deal logic
        const playerHands: PlayerHand[] = [];
        const deckRef = currentDeck; // Mutable ref

        for (let i = 0; i < INITIAL_HAND_COUNT; i++) {
            // Start with empty hands
            playerHands.push({
                id: i,
                cards: [],
                isHeld: false,
                isBust: false,
                blackjackValue: 0
            });
        }

        // Deal one card to the center hand (index 1)
        const initialPlayerCard = deckRef.pop()!;
        initialPlayerCard.isFaceUp = true;
        initialPlayerCard.origin = 'deck';
        playerHands[1].cards.push(initialPlayerCard);
        playerHands[1].blackjackValue = getBlackjackScore(playerHands[1].cards, get().inventory);

        const dealerCards: Card[] = [];
        const burnedCards: Card[] = [];

        // Helper to draw valid card for dealer
        const drawForDealer = () => {
            let c = deckRef.pop();
            while (c && (c.type === 'chip' || c.type === 'mult' || c.type === 'score')) {
                burnedCards.push(c);
                c = deckRef.pop();
            }
            return c;
        };

        const d1 = drawForDealer();
        const d2 = drawForDealer();

        if (d1) {
            d1.isFaceUp = false;
            d1.origin = 'deck';
            dealerCards.push(d1);
        }
        if (d2) {
            d2.isFaceUp = true;
            d2.origin = 'deck';
            dealerCards.push(d2);
        }

        // --- SEQUENCE CHANGE: Handle Discard Animation Delay ---
        // Check if there are cards to discard (from previous round)
        const activeHands = get().playerHands;
        const hasCardsToDiscard = activeHands.some(h => h.cards.length > 0);
        
        // Prevent concurrent calls and block hits
        set({ isInitialDeal: true });

        if (hasCardsToDiscard) {
            // 1. Clear State to trigger Discard Animation
            // Create purely empty hands structure to force discard
            const emptyHandsForDiscard = activeHands.map(h => ({ ...h, cards: [], blackjackValue: 0, isBust: false, isHeld: false, isDoubled: false }));
            
            set({
                playerHands: emptyHandsForDiscard, 
                // Keep other state to prevent layout jumps
            });

            // Calculate wait time: 
            const centerHandCards = activeHands[1]?.cards.length || 0;
            const discardDuration = centerHandCards > 0 ? (centerHandCards * 100 + 600) : 0; // ms

            if (discardDuration > 0) {
                 await new Promise(resolve => setTimeout(resolve, discardDuration / get().animationSpeed));
            }
        }
        
        // 2. NOW Deal new cards (State Update)
        // Re-fetch deck/hands in case they changed (unlikely in this sync block but good practice)
        const currentRef = get();
        // We need to put the dealt cards INTO the state now.
        // We already mutated `playerHands` locally above (lines 282-301), let's use that.
        // Note: The previous logic blindly did `set({ playerHands })` which included the new cards immediately.
        
        set({
            deck: deckRef,
            playerHands: playerHands, // Now contains the new dealt card
            dealer: {
                cards: dealerCards,
                isRevealed: false,
                blackjackValue: dealerCards.length > 1 ? getBlackjackScore([dealerCards[1]], get().inventory, true) : 0
            },
            discardPile: [...get().discardPile, ...burnedCards],
            drawnCards: [],
            selectedDrawIndex: null,
            cardsPlacedThisTurn: 0,
            redrawDiscard: null,
            isRedrawAnimating: false,
            phase: 'playing',
            isInitialDeal: true,
            // Ensure stats are preserved/set (should be set by startGame/nextRound already)
            round,
            targetScore,
            dealsTaken: 1,
            handsRemaining: RelicManager.executeValueHook('getDealsPerCasino', BASE_DEALS_PER_CASINO, { inventory: get().inventory }) - 1,
            totalScore,
            runningSummary: null,
            roundSummary: null,
            allWinnersEnlarged: false,
            dealerVisible: true,
            isDealerPlaying: false,
            animationSpeed: 1
        });

        // After animations complete, isInitialDeal will be cleared via onInitialDealAnimationsComplete.
    },

    drawCard: async () => {
        const { deck, drawnCards, phase, modifiers, inventory } = get();
        if (phase !== 'playing' || drawnCards.length > 0) return;

        // Cancel table action if active
        set({ interactionMode: 'default', activeTableActionId: null });

        // Calculate count
        let drawCount = 1 + modifiers.drawCountMod;
        // Consume draw modifier
        set(state => ({ modifiers: { ...state.modifiers, drawCountMod: 0 } }));

        drawCount = RelicManager.executeValueHook('getDrawCount', drawCount, { inventory });



        // Auto-Reshuffle Check
        let deckRef = [...deck];
        let discardRef = [...get().discardPile];

        // Standard check: do we have enough cards?
        if (deckRef.length < drawCount && discardRef.length > 0) {
             // Reshuffle needed
             const combined = [...deckRef, ...discardRef];
             deckRef = shuffleDeck(combined);
             discardRef = []; // Empty discard pile
             
             set({ 
                 deck: deckRef, 
                 discardPile: discardRef,
                 isReshuffling: true 
             });

             // Reset animation flag after duration
             setTimeout(() => {
                 set({ isReshuffling: false });
             }, 1000);
        }

        const cardsToDraw: Card[] = [];

        for (let i = 0; i < drawCount; i++) {
            const card = deckRef.pop();
            if (!card) break; // Deck empty handle?

            card.isFaceUp = true;
            card.origin = 'deck';
            cardsToDraw.push(card);

            set({ deck: deckRef, drawnCards: [...cardsToDraw] });

            // Animation delay betwen draws
            if (i < drawCount - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        // Auto select center
        const centerIndex = Math.floor((cardsToDraw.length - 1) / 2);
        set({ selectedDrawIndex: Math.max(0, centerIndex) });
        TutorialManager.getInstance().signalEvent('player_hit');
    },

    selectDrawnCard: (index: number) => {
        const { drawnCards } = get();
        if (index >= 0 && index < drawnCards.length) {
            set({ selectedDrawIndex: index });
        }
    },

    startTableAction: (relicId: string) => {
        const { phase, drawnCards, isDealerPlaying, isInitialDeal, playerHands, dealer, interactionMode, tableActionCharges, tableActionHeldCards } = get();
        if (phase !== 'playing' || isDealerPlaying || isInitialDeal) return;
        if (interactionMode !== 'default') return;

        const action = getTableActionConfig(relicId);
        if (!action) return;

        const charges = tableActionCharges[relicId] ?? 0;
        const hasDrawnCards = drawnCards.some(c => c !== null);
        const hasHeldCard = !!tableActionHeldCards[relicId];

        let nextMode: GameState['interactionMode'] | null = null;

        switch (relicId) {
            case 'double_down':
            case 'surrender': {
                const hasPlayableHand = playerHands.some(h => !h.isBust && !h.isHeld && h.blackjackValue !== 21 && h.cards.length > 0);
                if (!hasPlayableHand) return;
                if (hasDrawnCards) return;
                if (charges < action.chargeCost) return;
                nextMode = 'select_hand';
                break;
            }
            case 'discard': {
                if (charges < action.chargeCost) return;
                nextMode = 'select_card';
                break;
            }
            case 'redraw': {
                if (charges < action.chargeCost) return;
                if (!hasDrawnCards) return;
                nextMode = 'select_draw';
                break;
            }
            case 'hold': {
                if (hasHeldCard) {
                    nextMode = 'select_hand';
                } else {
                    if (charges < action.chargeCost) return;
                    if (!hasDrawnCards) return;
                    nextMode = 'select_draw';
                }
                break;
            }
            case 'switch': {
                if (charges < action.chargeCost) return;
                const hasDealerFaceUp = dealer.cards.some(c => c.isFaceUp);
                const hasPlayerCard = playerHands.some(h => !h.isBust && h.blackjackValue !== 21 && h.cards.length > 0);
                if (!hasDealerFaceUp || !hasPlayerCard) return;
                nextMode = 'select_card';
                break;
            }
            default:
                return;
        }

        if (!nextMode) return;
        set({ activeTableActionId: relicId, interactionMode: nextMode });
        TutorialManager.getInstance().signalEvent('table_action_activated', { relicId });
    },

    cancelTableAction: () => {
        set({ activeTableActionId: null, interactionMode: 'default' });
    },

    selectTableActionHand: async (handIndex: number) => {
        const { interactionMode, activeTableActionId } = get();
        if (interactionMode !== 'select_hand' || !activeTableActionId) return;

        const action = getTableActionConfig(activeTableActionId);
        if (!action) return;

        if (activeTableActionId === 'double_down') {
            const { playerHands, deck, tableActionCharges } = get();
            const charges = tableActionCharges[activeTableActionId] ?? 0;
            if (charges < action.chargeCost) return;

            const hand = playerHands[handIndex];
            if (!hand || hand.isBust || hand.isHeld || hand.blackjackValue === 21 || hand.cards.length === 0) return;

            set(state => ({
                tableActionCharges: {
                    ...state.tableActionCharges,
                    [activeTableActionId]: Math.max(0, charges - action.chargeCost)
                }
            }));

            const currentDeck = [...deck];
            const card = currentDeck.pop();
            if (!card) return;

            card.isFaceUp = true;
            card.origin = 'double_down';

            const updatedHands = playerHands.map((h, idx) => {
                if (idx !== handIndex) return h;
                const isSpecial = card.type === 'chip' || card.type === 'mult' || card.type === 'score';
                const orderedCards = isSpecial ? [card, ...h.cards] : [...h.cards, card];
                const val = getBlackjackScore(orderedCards, get().inventory);

                return {
                    ...h,
                    cards: orderedCards,
                    blackjackValue: val,
                    isBust: val > 21,
                    isHeld: true,
                    isDoubled: true
                };
            });

            set({
                playerHands: updatedHands,
                deck: currentDeck,
                interactionMode: 'default',
                activeTableActionId: null
            });

            const postHand = updatedHands[handIndex];
            if (postHand.isBust) {
                sfxEngine.play('bust');
                addTableActionCharge('bust');
                RelicManager.executeInterruptHook('onHandBust', {
                    inventory: get().inventory,
                    highlightRelic: async () => { },
                    handId: postHand.id
                }).catch(console.error);
            }

            if (updatedHands.every(h => h.isBust || h.isHeld || h.blackjackValue === 21)) {
                queueAutoStandIfAllowed();
            }
            return;
        }

        if (activeTableActionId === 'surrender') {
            const { playerHands, discardPile, tableActionCharges } = get();
            const charges = tableActionCharges[activeTableActionId] ?? 0;
            if (charges < action.chargeCost) return;

            const hand = playerHands[handIndex];
            if (!hand || hand.isBust || hand.cards.length === 0) return;

            const cardsToDiscard = [...hand.cards];
            const newHands = playerHands.map((h, idx) => {
                if (idx !== handIndex) return h;
                return {
                    ...h,
                    cards: [],
                    blackjackValue: 0,
                    isBust: false,
                    isHeld: true,
                    isDoubled: false,
                    finalScore: null,
                    resultRevealed: false
                };
            });

            set({
                playerHands: newHands,
                discardPile: [...discardPile, ...cardsToDiscard],
                tableActionCharges: {
                    ...tableActionCharges,
                    [activeTableActionId]: Math.max(0, charges - action.chargeCost)
                },
                interactionMode: 'default',
                activeTableActionId: null
            });
            const allUnplayable = newHands.every(h => h.isBust || h.isHeld || h.blackjackValue === 21);
            if (allUnplayable) {
                queueAutoStandIfAllowed();
            }
            return;
        }

        if (activeTableActionId === 'hold') {
            const { playerHands, tableActionHeldCards, inventory } = get();
            const heldCard = tableActionHeldCards[activeTableActionId];
            if (!heldCard) return;

            const hand = playerHands[handIndex];
            if (!hand || hand.isBust || hand.isHeld || hand.blackjackValue === 21) return;

            const cardToPlace: Card = { ...heldCard, origin: 'draw_pile', animationOffset: 0 };
            const isSpecial = cardToPlace.type === 'chip' || cardToPlace.type === 'mult' || cardToPlace.type === 'score';
            const newCards = isSpecial ? [cardToPlace, ...hand.cards] : [...hand.cards, cardToPlace];
            const newVal = getBlackjackScore(newCards, inventory);

            const updatedHands = playerHands.map((h, idx) => {
                if (idx !== handIndex) return h;
                return {
                    ...h,
                    cards: newCards,
                    blackjackValue: newVal,
                    isBust: newVal > 21
                };
            });

            set({
                playerHands: updatedHands,
                tableActionHeldCards: {
                    ...tableActionHeldCards,
                    [activeTableActionId]: null
                },
                interactionMode: 'default',
                activeTableActionId: null
            });
            sfxEngine.play('cardPlace');

            const placedHandInitial = updatedHands[handIndex];
            const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
            const checkContext = {
                inventory: get().inventory,
                handId: handIndex,
                placedCard: cardToPlace,
                handCards: placedHandInitial.cards,
                blackjackValue: placedHandInitial.blackjackValue,
                modifyHand: () => { },
                highlightRelic: async () => { },
                revealDealerHiddenCard: () => { }
            };

            const shouldWait = RelicManager.executeCheckHook('onCheckCardPlace', checkContext as any);
            if (shouldWait) {
                await wait(600);
            } else {
                await wait(0);
            }

            await RelicManager.executeInterruptHook('onCardPlaced', {
                inventory: get().inventory,
                handId: handIndex,
                placedCard: cardToPlace,
                handCards: placedHandInitial.cards,
                blackjackValue: placedHandInitial.blackjackValue,
                highlightRelic: async (id, options) => {
                    const { preDelay = 0, duration = 500, postDelay = 0, trigger } = options || {};
                    await wait(preDelay);
                    set({ activeRelicId: id });
                    if (trigger) await trigger();
                    await wait(duration);
                    set({ activeRelicId: null });
                    await wait(postDelay);
                },
                modifyHand: (cards) => {
                    set(state => {
                        const nextHands = state.playerHands.map(h => {
                            if (h.id === handIndex) {
                                const val = getBlackjackScore(cards, state.inventory);
                                return { ...h, cards, blackjackValue: val, isBust: val > 21 };
                            }
                            return h;
                        });
                        return { playerHands: nextHands };
                    });
                },
                revealDealerHiddenCard: () => get().revealDealerHiddenCard()
            });

            const finalHands = get().playerHands;
            const finalHand = finalHands[handIndex];
            if (finalHand.isBust && !hand.isBust) {
                sfxEngine.play('bust');
                addTableActionCharge('bust');
                await RelicManager.executeInterruptHook('onHandBust', {
                    inventory: get().inventory,
                    handId: finalHand.id,
                    handCards: finalHand.cards,
                    highlightRelic: async (id, options) => {
                        const { preDelay = 0, duration = 500, postDelay = 0, trigger } = options || {};
                        await wait(preDelay);
                        set({ activeRelicId: id });
                        if (trigger) await trigger();
                        await wait(duration);
                        set({ activeRelicId: null });
                        await wait(postDelay);
                    },
                    modifyHand: (cards) => {
                        set(state => ({
                            playerHands: state.playerHands.map(h => {
                                if (h.id === finalHand.id) {
                                    const val = getBlackjackScore(cards, state.inventory);
                                    return { ...h, cards, blackjackValue: val, isBust: val > 21 };
                                }
                                return h;
                            })
                        }));
                    }
                });
            }

            const postHands = get().playerHands;
            const allUnplayable = postHands.every(h => h.isBust || h.isHeld || h.blackjackValue === 21);
            const hasRemainingCards = get().drawnCards.some(c => c !== null);
            if (allUnplayable && !hasRemainingCards) {
                queueAutoStandIfAllowed();
            }
        }
    },

    selectTableActionCard: async (payload) => {
        const { interactionMode, activeTableActionId } = get();
        if (interactionMode !== 'select_card' || !activeTableActionId) return;

        const action = getTableActionConfig(activeTableActionId);
        if (!action) return;

        if (activeTableActionId === 'discard') {
            const { playerHands, dealer, discardPile, tableActionCharges, inventory } = get();
            const charges = tableActionCharges[activeTableActionId] ?? 0;
            if (charges < action.chargeCost) return;

            if (payload.target === 'player') {
                if (payload.handIndex === undefined) return;
                const hand = playerHands[payload.handIndex];
                if (!hand || hand.isBust || hand.blackjackValue === 21 || hand.cards.length === 0) return;
                const cardIndex = hand.cards.findIndex(c => c.id === payload.cardId);
                if (cardIndex === -1) return;

                const nextCards = hand.cards.filter((_, idx) => idx !== cardIndex);
                const nextVal = nextCards.length > 0 ? getBlackjackScore(nextCards, inventory) : 0;
                const updatedHands = playerHands.map((h, idx) => {
                    if (idx !== payload.handIndex) return h;
                    return {
                        ...h,
                        cards: nextCards,
                        blackjackValue: nextVal,
                        isBust: nextVal > 21
                    };
                });

                set({
                    playerHands: updatedHands,
                    discardPile: [...discardPile, hand.cards[cardIndex]],
                    tableActionCharges: {
                        ...tableActionCharges,
                        [activeTableActionId]: Math.max(0, charges - action.chargeCost)
                    },
                    interactionMode: 'default',
                    activeTableActionId: null
                });

                const updatedHand = updatedHands[payload.handIndex];
                if (updatedHand.isBust && !hand.isBust) {
                    sfxEngine.play('bust');
                    addTableActionCharge('bust');
                    await RelicManager.executeInterruptHook('onHandBust', {
                        inventory: get().inventory,
                        handId: updatedHand.id,
                        handCards: updatedHand.cards,
                        highlightRelic: async (id, options) => {
                            const { preDelay = 0, duration = 500, postDelay = 0, trigger } = options || {};
                            await new Promise(resolve => setTimeout(resolve, preDelay));
                            set({ activeRelicId: id });
                            if (trigger) await trigger();
                            await new Promise(resolve => setTimeout(resolve, duration));
                            set({ activeRelicId: null });
                            await new Promise(resolve => setTimeout(resolve, postDelay));
                        },
                        modifyHand: (cards) => {
                            set(state => ({
                                playerHands: state.playerHands.map(h => {
                                    if (h.id === updatedHand.id) {
                                        const val = getBlackjackScore(cards, state.inventory);
                                        return { ...h, cards, blackjackValue: val, isBust: val > 21 };
                                    }
                                    return h;
                                })
                            }));
                        }
                    });
                }
                return;
            }

            const cardIndex = dealer.cards.findIndex(c => c.id === payload.cardId);
            if (cardIndex === -1) return;
            const targetCard = dealer.cards[cardIndex];
            if (!dealer.isRevealed && !targetCard.isFaceUp) return;
            if (dealer.blackjackValue >= 21) return;

            const nextDealerCards = dealer.cards.filter((_, idx) => idx !== cardIndex);
            const nextDealer: DealerHand = {
                ...dealer,
                cards: nextDealerCards,
                blackjackValue: getDealerDisplayValue({ ...dealer, cards: nextDealerCards }, inventory)
            };

            set({
                dealer: nextDealer,
                discardPile: [...discardPile, targetCard],
                tableActionCharges: {
                    ...tableActionCharges,
                    [activeTableActionId]: Math.max(0, charges - action.chargeCost)
                },
                interactionMode: 'default',
                activeTableActionId: null
            });
            return;
        }

        if (activeTableActionId === 'switch') {
            const { playerHands, dealer, tableActionCharges, inventory } = get();
            const charges = tableActionCharges[activeTableActionId] ?? 0;
            if (charges < action.chargeCost) return;
            if (payload.target !== 'player' || payload.handIndex === undefined) return;

            const hand = playerHands[payload.handIndex];
            if (!hand || hand.isBust || hand.blackjackValue === 21 || hand.cards.length === 0) return;

            const playerCardIndex = hand.cards.findIndex(c => c.id === payload.cardId);
            if (playerCardIndex === -1) return;

            const dealerCardIndex = dealer.cards.findIndex(c => c.isFaceUp);
            if (dealerCardIndex === -1) return;

            const playerCard = hand.cards[playerCardIndex];
            const dealerCard = dealer.cards[dealerCardIndex];

            const newHandCards = [...hand.cards];
            newHandCards[playerCardIndex] = { ...dealerCard, isFaceUp: true, origin: 'none' };

            const newDealerCards = [...dealer.cards];
            newDealerCards[dealerCardIndex] = { ...playerCard, isFaceUp: true, origin: 'none' };

            const newHandValue = getBlackjackScore(newHandCards, inventory);
            const updatedHands = playerHands.map((h, idx) => {
                if (idx !== payload.handIndex) return h;
                return {
                    ...h,
                    cards: newHandCards,
                    blackjackValue: newHandValue,
                    isBust: newHandValue > 21
                };
            });

            const updatedDealer: DealerHand = {
                ...dealer,
                cards: newDealerCards,
                blackjackValue: getDealerDisplayValue({ ...dealer, cards: newDealerCards }, inventory)
            };

            set({
                playerHands: updatedHands,
                dealer: updatedDealer,
                tableActionCharges: {
                    ...tableActionCharges,
                    [activeTableActionId]: Math.max(0, charges - action.chargeCost)
                },
                interactionMode: 'default',
                activeTableActionId: null
            });

            const updatedHand = updatedHands[payload.handIndex];
            if (updatedHand.isBust && !hand.isBust) {
                sfxEngine.play('bust');
                addTableActionCharge('bust');
                await RelicManager.executeInterruptHook('onHandBust', {
                    inventory: get().inventory,
                    handId: updatedHand.id,
                    handCards: updatedHand.cards,
                    highlightRelic: async (id, options) => {
                        const { preDelay = 0, duration = 500, postDelay = 0, trigger } = options || {};
                        await new Promise(resolve => setTimeout(resolve, preDelay));
                        set({ activeRelicId: id });
                        if (trigger) await trigger();
                        await new Promise(resolve => setTimeout(resolve, duration));
                        set({ activeRelicId: null });
                        await new Promise(resolve => setTimeout(resolve, postDelay));
                    },
                    modifyHand: (cards) => {
                        set(state => ({
                            playerHands: state.playerHands.map(h => {
                                if (h.id === updatedHand.id) {
                                    const val = getBlackjackScore(cards, state.inventory);
                                    return { ...h, cards, blackjackValue: val, isBust: val > 21 };
                                }
                                return h;
                            })
                        }));
                    }
                });
            }
            const allUnplayable = updatedHands.every(h => h.isBust || h.isHeld || h.blackjackValue === 21);
            const hasRemainingCards = get().drawnCards.some(c => c !== null);
            if (allUnplayable && !hasRemainingCards) {
                queueAutoStandIfAllowed();
            }
        }
    },

    selectTableActionDrawCard: async (drawIndex: number) => {
        const { interactionMode, activeTableActionId, drawnCards, deck, tableActionCharges, tableActionHeldCards } = get();
        if (interactionMode !== 'select_draw' || !activeTableActionId) return;

        const action = getTableActionConfig(activeTableActionId);
        if (!action) return;

        const targetCard = drawnCards[drawIndex];
        if (!targetCard) return;

        const charges = tableActionCharges[activeTableActionId] ?? 0;
        if (charges < action.chargeCost) return;

        if (activeTableActionId === 'redraw') {
            const nextDeck = [...deck];
            const newCard = nextDeck.pop() || null;
            if (newCard) {
                newCard.isFaceUp = true;
                newCard.origin = 'deck';
            }

            const nextDrawn = [...drawnCards];
            nextDrawn[drawIndex] = null;

            set({
                deck: nextDeck,
                drawnCards: nextDrawn,
                redrawDiscard: { card: targetCard, index: drawIndex },
                isRedrawAnimating: true,
                tableActionCharges: {
                    ...tableActionCharges,
                    [activeTableActionId]: Math.max(0, charges - action.chargeCost)
                },
                interactionMode: 'default',
                activeTableActionId: null
            });
            TutorialManager.getInstance().signalEvent('table_action_completed', { relicId: 'redraw' });

            await new Promise(resolve => setTimeout(resolve, 320));

            set(state => {
                const updatedDrawn = [...state.drawnCards];
                updatedDrawn[drawIndex] = newCard;
                return {
                    drawnCards: updatedDrawn,
                    discardPile: [...state.discardPile, targetCard],
                    redrawDiscard: null,
                    isRedrawAnimating: false
                };
            });
            return;
        }

        if (activeTableActionId === 'hold') {
            const nextDeck = [...deck];
            const newCard = nextDeck.pop() || null;
            if (newCard) {
                newCard.isFaceUp = true;
                newCard.origin = 'deck';
            }

            const nextDrawn = [...drawnCards];
            nextDrawn[drawIndex] = newCard;

            set({
                deck: nextDeck,
                drawnCards: nextDrawn,
                tableActionHeldCards: {
                    ...tableActionHeldCards,
                    [activeTableActionId]: targetCard
                },
                tableActionCharges: {
                    ...tableActionCharges,
                    [activeTableActionId]: Math.max(0, charges - action.chargeCost)
                },
                interactionMode: 'default',
                activeTableActionId: null
            });
        }
    },

    assignCard: async (handIndex) => {
        const { playerHands, drawnCards, selectedDrawIndex, cardsPlacedThisTurn, modifiers, inventory, discardPile } = get();
        if (selectedDrawIndex === null || !drawnCards[selectedDrawIndex]) return;

        const cardToPlace = drawnCards[selectedDrawIndex];

        const newHands = playerHands.map((h, idx) => {
            if (idx !== handIndex) return h;
            if (h.isBust || h.isHeld) return h;

            // Calculate draw offset for animation origin
            const spacing = 120;
            const drawOffset = (selectedDrawIndex - (drawnCards.length - 1) / 2) * spacing;
            const cardToAdd = { ...cardToPlace, origin: 'draw_pile' as const, animationOffset: drawOffset };
            const isSpecial = cardToAdd.type === 'chip' || cardToAdd.type === 'mult' || cardToAdd.type === 'score';
            const newCards = isSpecial ? [cardToAdd, ...h.cards] : [...h.cards, cardToAdd];

            // Recalc Blackjack
            const val = getBlackjackScore(newCards, get().inventory);

            return {
                ...h,
                cards: newCards,
                blackjackValue: val,
                isBust: val > 21
            };
        });

        // 1. Commit initial placement
        // Also remove from drawnCards immediately so it doesn't appear duplicated during animation
        const initialDrawnUpdate = [...drawnCards];
        initialDrawnUpdate[selectedDrawIndex] = null;
        
        set({ 
            playerHands: newHands,
            drawnCards: initialDrawnUpdate
        });
        sfxEngine.play('cardPlace');

        // Signal placement animation completion for tutorials (after animation duration).
        // This decouples tutorial timing from the click that triggered placement.
        const placementSignalDelayMs = 600;
        window.setTimeout(() => {
            const state = get();
            const context = buildTutorialContext(state);
            const manager = TutorialManager.getInstance();
            manager.setContext(context);
            manager.signalEvent('player_place_animation_complete', context);
        }, placementSignalDelayMs);

        // 2. Trigger onCardPlaced Hook (Async)
        const placedHandInitial = newHands[handIndex];
        
        // Wait helper for animations inside hooks if needed
        const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        // Pre-Hook Check: Do we need to wait for the animation?
        const checkContext = {
            inventory: get().inventory,
            handId: handIndex,
            placedCard: cardToPlace,
            handCards: placedHandInitial.cards,
            blackjackValue: placedHandInitial.blackjackValue,
            // These methods aren't needed for the check, but providing stubs/refs to satisfy type if needed, 
            // though types.ts says context is CardPlacedContext.
            // Actually, CardPlacedContext has highlightRelic etc. 
            // We'll trust the check hook doesn't call them, or we mock them.
            // To be safe, providing minimal context since check is synchronous and shouldn't effect state.
            modifyHand: () => {}, 
            highlightRelic: async () => {},
            revealDealerHiddenCard: () => {}
        };

        const shouldWait = RelicManager.executeCheckHook('onCheckCardPlace', checkContext as any); // Cast as needed if strict

        // Wait for card placement animation to complete (0.6s) ONLY if a relic is interested
        if (shouldWait) {
            await wait(600);
        } else {
            // Small microtask yield just in case, but essentially instant
            await wait(0);
        }

        await RelicManager.executeInterruptHook('onCardPlaced', {
            inventory: get().inventory,
            handId: handIndex,
            placedCard: cardToPlace,
            handCards: placedHandInitial.cards,
            blackjackValue: placedHandInitial.blackjackValue,
            highlightRelic: async (id, options) => {
                 const { preDelay = 0, duration = 500, postDelay = 0, trigger } = options || {};
                 await wait(preDelay);
                 set({ activeRelicId: id });
                 if (trigger) await trigger();
                 await wait(duration);
                 set({ activeRelicId: null });
                 await wait(postDelay);
            },
            modifyHand: (cards) => {
                set(state => {
                    // Update hand with new cards
                    const updatedHands = state.playerHands.map(h => {
                         if (h.id === handIndex) {
                             const newVal = getBlackjackScore(cards, state.inventory);
                             return { ...h, cards, blackjackValue: newVal, isBust: newVal > 21 };
                         }
                         return h;
                    });
                    return { playerHands: updatedHands };
                });
            },
            revealDealerHiddenCard: () => get().revealDealerHiddenCard()
        });
        
        // Refresh hand state after hooks (in case modifyHand was called)
        const finalHands = get().playerHands;
        const finalHand = finalHands[handIndex];

        // 3. Trigger onHandBust if applicable post-hook
         if (finalHand.isBust && !playerHands[handIndex].isBust) { // Compare against ORIGINAL start of turn state? 
            sfxEngine.play('bust');
            
            addTableActionCharge('bust');

            await RelicManager.executeInterruptHook('onHandBust', {
                inventory: get().inventory,
                handId: finalHand.id,
                handCards: finalHand.cards,
                highlightRelic: async (id, options) => {
                     const { preDelay = 0, duration = 500, postDelay = 0, trigger } = options || {};
                     await wait(preDelay);
                     set({ activeRelicId: id });
                     if (trigger) await trigger();
                     await wait(duration);
                     set({ activeRelicId: null });
                     await wait(postDelay);
                },
                modifyHand: (cards) => {
                     set(state => ({
                         playerHands: state.playerHands.map(h => {
                             if (h.id === finalHand.id) {
                                 const val = getBlackjackScore(cards, state.inventory);
                                 return { ...h, cards, blackjackValue: val, isBust: val > 21 };
                             }
                             return h;
                         })
                     }));
                }
            });
        }
        
        // Refresh again in case Bust hook modified hand (e.g. Mulligan)
        const postBustHands = get().playerHands;
        const postBustHand = postBustHands[handIndex];

        // Update sequencing state
        const remainingDrawn = [...drawnCards];
        remainingDrawn[selectedDrawIndex] = null; // Mark as consumed, keeping position fixed
        const newPlacedCount = cardsPlacedThisTurn + 1;

        let totalPlaceCount = 1 + modifiers.placeCountMod;
        totalPlaceCount = RelicManager.executeValueHook('getPlaceCount', totalPlaceCount, { inventory });

        // Check if we can continue placing
        const anyPlayable = postBustHands.some(h => !h.isBust && !h.isHeld && h.blackjackValue !== 21);
        const hasRemainingCards = remainingDrawn.some(c => c !== null);
        const canPlaceMore = newPlacedCount < totalPlaceCount && hasRemainingCards && anyPlayable;

        if (canPlaceMore) {
            // Find next available card
            // Try forward first
            let nextIndex = -1;
            for (let i = selectedDrawIndex + 1; i < remainingDrawn.length; i++) {
                if (remainingDrawn[i] !== null) {
                    nextIndex = i;
                    break;
                }
            }
            // Overwrap search
            if (nextIndex === -1) {
                for (let i = 0; i < selectedDrawIndex; i++) {
                    if (remainingDrawn[i] !== null) {
                        nextIndex = i;
                        break;
                    }
                }
            }

            set({
                playerHands: postBustHands,
                drawnCards: remainingDrawn,
                selectedDrawIndex: nextIndex !== -1 ? nextIndex : null,
                cardsPlacedThisTurn: newPlacedCount
            });
        } else {
            // Turn Sequence Complete
            // Filter out nulls for discard pile
            const leftovers = remainingDrawn.filter((c): c is Card => c !== null);
            const newDiscards = [...discardPile, ...leftovers];

            set({
                playerHands: postBustHands,
                drawnCards: [],
                selectedDrawIndex: null,
                cardsPlacedThisTurn: 0,
                discardPile: newDiscards,
                modifiers: { ...modifiers, placeCountMod: 0 } // Reset place mod
            });

            // Auto-stand if all hands are unplayable
            const allUnplayable = postBustHands.every(h => h.isBust || h.isHeld || h.blackjackValue === 21);
            if (allUnplayable) {
                queueAutoStandIfAllowed();
            }
        }
    },

    holdReturns: async (forceDealerBust = false) => {
        // Reset speed to normal at start of sequence
        set({ animationSpeed: 1 });
        sfxEngine.play('stand');

        const manager = TutorialManager.getInstance();

        const waitForTutorialStep = async (stepId: string) => {
            if (manager.isCompleted(stepId)) return;

            const context = buildTutorialContext(get());
            manager.setContext(context);

            const active = manager.getActiveStep();
            if (active?.id === stepId) {
                await new Promise<void>(resolve => {
                    const unsubscribe = manager.subscribe(() => {
                        if (manager.isCompleted(stepId)) {
                            unsubscribe();
                            resolve();
                        }
                    });
                });
                return;
            }

            const triggered = manager.tryTriggerStep(stepId, context, 'chain');
            if (!triggered) return;

            await new Promise<void>(resolve => {
                const unsubscribe = manager.subscribe(() => {
                    if (manager.isCompleted(stepId)) {
                        unsubscribe();
                        resolve();
                    }
                });
            });
        };

        const triggerTutorialStep = (stepId: string) => {
            if (manager.isCompleted(stepId)) return;
            const context = buildTutorialContext(get());
            manager.setContext(context);
            if (manager.getActiveStep()?.id === stepId) return;
            manager.tryTriggerStep(stepId, context, 'chain');
        };

        const minDealerTurnMs = 3000;
        let dealerTurnTriggered = false;
        let dealerTurnStart = 0;

        const triggerDealerTurnTutorial = () => {
            if (manager.isCompleted('dealer_turn')) return false;

            const context = buildTutorialContext(get());
            manager.setContext(context);

            const active = manager.getActiveStep();
            if (active?.id === 'dealer_turn') {
                dealerTurnStart = performance.now();
                return true;
            }

            const triggered = manager.tryTriggerStep('dealer_turn', context, 'chain');
            if (triggered) {
                dealerTurnStart = performance.now();
            }

            return triggered;
        };

        dealerTurnTriggered = triggerDealerTurnTutorial();
        set({ isDealerPlaying: true });

        // Helper to wait with dynamic speed
        const wait = async (ms: number) => {
            let remaining = ms;
            const interval = 50;

            while (remaining > 0) {
                const speed = get().animationSpeed;
                remaining -= interval * speed;
                await new Promise(resolve => setTimeout(resolve, interval));
            }
        };

        const waitReal = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

        // 1. Reveal Phase
        const { dealer, deck } = get();
        
        // Check if already revealed (e.g. by Spyglass relic)
        let dCards = [...dealer.cards];
        let dVal = dealer.blackjackValue;

        if (!dealer.isRevealed) {
            const revealedCards = [...dealer.cards];
            revealedCards[0] = { ...revealedCards[0], isFaceUp: true };
            
            const revealVal = getBlackjackScore(revealedCards, get().inventory, true);
            
            // Update cards and blackjackValue immediately when reveal starts
            set({ 
                dealer: { 
                    ...dealer, 
                    isRevealed: true, 
                    cards: revealedCards,
                    blackjackValue: revealVal
                } 
            });
            
            await wait(600); // Wait for the 0.6s flip transition
            
            // No need for second set() since we updated it above
            dCards = revealedCards;
            dVal = revealVal;
        }
        const burnedCards: Card[] = [];

        // 2. Dealer Draw Loop
        const dDeck = [...deck];
        const { inventory } = get();
        const baseStopValue = 17;
        const dealerStopValue = forceDealerBust ? 22 : RelicManager.executeValueHook('getDealerStopValue', baseStopValue, { inventory });
        let dealerBustPlayed = false;
        while (dVal < dealerStopValue) {
            set({ dealerMessage: "Hit!", dealerMessageExiting: false });

            let c = dDeck.pop();
            while (c && (c.type === 'chip' || c.type === 'mult' || c.type === 'score')) {
                if (c) burnedCards.push(c);
                c = dDeck.pop();
            }

            if (!c) break;
            c.isFaceUp = true;
            c.origin = 'deck';
            const nextCards = [...dCards, c];
            const nextVal = getBlackjackScore(nextCards, get().inventory, true);

            // Show card being dealt and update score immediately
            // Match behavior of player assignCard which updates score synchronously
            set({
                deck: dDeck,
                dealer: { 
                    ...get().dealer, 
                    cards: nextCards,
                    blackjackValue: nextVal // Update immediately
                }
            });
            
            dCards = nextCards;
            dVal = nextVal;
            if (dVal > 21 && !dealerBustPlayed) {
                dealerBustPlayed = true;
                sfxEngine.play('bust');
            }

            await wait(500); // Match --anim-deal-duration (wait for card to fly/flip)

            set({ dealerMessageExiting: true });
            await wait(100);
            set({ dealerMessage: null, dealerMessageExiting: false });
        }

        await wait(200);

        // 3. Final Result Message
        if (dVal < 21) {
            sfxEngine.play('stand');
            set({ dealerMessage: "Stand!", dealerMessageExiting: false });
            await wait(500);
            set({ dealerMessageExiting: true });
            await wait(100);
            set({ dealerMessage: null, dealerMessageExiting: false });
        } else if (dVal === 21) {
            // Exact 21 -> No longer gives +2 Charges per user request
        }

        if (dealerTurnTriggered) {
            const elapsed = performance.now() - dealerTurnStart;
            if (elapsed < minDealerTurnMs) {
                await waitReal(minDealerTurnMs - elapsed);
            }
            manager.completeStep('dealer_turn');
        }

        // 4. Score Logic And Aggregation
        const { playerHands } = get();

        const scoredHands = playerHands.map((h) => {
            let win = false;
            if (h.cards.length === 0) win = false;
            else if (h.isBust) win = false;
            else if (h.blackjackValue === 21) win = true;
            else if (dVal > 21) win = true;
            else if (h.blackjackValue >= dVal) win = true;
            else win = false;

            if (!win && !h.isBust && h.cards.length > 0) {
                // Loss (Standing but beat by dealer) -> +1 Charge
                addTableActionCharge('loss');
            }

            if (win) {
                const score = evaluateHandScore(h.cards, win, h.isDoubled, get().inventory, get().handsRemaining);
                return { ...h, finalScore: score, resultRevealed: false };
            } else {
                return { ...h, finalScore: null, resultRevealed: false };
            }
        });

        // Calculate Totals for Aggregation
        // (Aggregation now handled dynamically in onRoundCompletion)

        // Reveal Dealer immediately, but keep player results hidden initially
        set({
            dealer: { ...dealer, isRevealed: true, cards: dCards, blackjackValue: dVal },
            deck: dDeck,
            discardPile: [...get().discardPile, ...burnedCards],
            playerHands: scoredHands,
            phase: 'scoring',
            scoringHandIndex: -1,
            allWinnersEnlarged: false,
            dealerVisible: true
        });
        const hasWinningHand = scoredHands.some(hand => hand.finalScore);
        if (hasWinningHand) {
            triggerTutorialStep('win_money_first');
        }

        // Stagger reveal of player outcomes
        const currentHands = [...scoredHands];

        for (let i = 0; i < currentHands.length; i++) {
            const hand = currentHands[i];
            const isBustOrViginti = hand.isBust || hand.blackjackValue === 21;

            // Reveal this hand's result
            currentHands[i] = {
                ...hand,
                resultRevealed: true,
                outcome: hand.finalScore ? 'win' : 'loss'
            };
            set({ playerHands: [...currentHands] });
            if (!hand.isBust && hand.cards.length > 0) {
                if (currentHands[i].outcome === 'win') {
                    sfxEngine.play('win');
                } else {
                    sfxEngine.play('loss');
                }
            }
            // Pause only if we're showing a new label (Win/Loss)
            if (!isBustOrViginti && i < currentHands.length - 1) {
                await wait(400);
            }
        }

        const allHandsLost = currentHands.length > 0 &&
            currentHands.every(hand => hand.outcome === 'loss');
        if (allHandsLost) {
            await waitForTutorialStep('lost_all_hands');
        }

        // STEP 1 COMPLETE: Fade out dealer
        await wait(200);
        set({
            dealerVisible: false
            // allWinnersEnlarged remains false so hands grow one by one via scoringHandIndex
        });

        // Allow user to digest outcomes before scoring starts
        await wait(400);

        get().resetScoreRowPitch();
        set({ runningSummary: { chips: 0, mult: 0 } });

        // 5. Animation Sequence (Reveal Chips/Mults per hand)
        let animatingHands = [...currentHands];

        for (let i = 0; i < animatingHands.length; i++) {
            if (animatingHands[i].isBust || !animatingHands[i].finalScore) continue;

            const hand = animatingHands[i];
            const scoreData = hand.finalScore;
            if (!scoreData) continue;

            // Highlight Hand to indicate scoring focus
            set({ scoringHandIndex: i });

            for (const crit of scoreData.criteria) {
                // Hook for Sequence Interruption (Relics)
                // We run this in parallel with the row duration wait to prevent sync drift,
                // while still ensuring both finish before moving to the next row.
                const relicHookPromise = RelicManager.executeInterruptHook('onScoreRow', {
                     inventory: get().inventory,
                     criterionId: crit.id as any,
                     score: scoreData,
                     modifyRunningSummary: (chips, mult) => get().updateRunningSummary(chips, mult),
                     highlightRelic: async (relicId: string, options?: any) => {
                         const { preDelay = 0, duration = 250, postDelay = 0, trigger } = options || {};
                         await wait(preDelay);
                         set({ activeRelicId: relicId });
                         if (trigger) await trigger();
                         await wait(duration);
                         set({ activeRelicId: null });
                         await wait(postDelay);
                     }
                });

                let rowDuration = 400; // label reveal
                if (crit.matches && crit.matches.length > 0) {
                    rowDuration += crit.matches.length * 600;
                } else {
                    rowDuration += 700; // 200 (chips) + 500 (mult)
                }
                rowDuration += 200; // transition beat

                await wait(rowDuration);
                await relicHookPromise;
            }

            await wait(50); // Tiny buffer for safety

            // Hook for Hand Completion (Relics like Royalty)
            // Triggered while still in scoring focus (large size)
            await RelicManager.executeInterruptHook('onHandCompletion', {
                inventory: get().inventory,
                handCards: hand.cards,
                score: scoreData,
                modifyRunningSummary: (c: number, m: number) => {
                    get().updateRunningSummary(c, m);
                },
                highlightRelic: async (id: string, options?: any) => {
                    const { preDelay = 0, duration = 750, postDelay = 0, trigger } = options || {};
                    await wait(preDelay);
                    set({ activeRelicId: id });
                    if (trigger) await trigger();
                    await wait(duration);
                    set({ activeRelicId: null });
                    await wait(postDelay);
                }
            });

            set({ scoringHandIndex: -1 });
            await wait(180);
        }

        // 6. Round Aggregation & Transition via Interrupt Hooks
        // Allow relics to modify the running totals (which are the source of truth)
        // Checks wins, losses, vigintis based on the scored hands
        const finalWins = scoredHands.filter(h => h.finalScore && h.finalScore.totalChips >= 0);
        // Note: Using finalScore presence as Win indicator.

        await RelicManager.executeInterruptHook('onRoundCompletion', {
            inventory: get().inventory,
            wins: finalWins.length,
            losses: scoredHands.length - finalWins.length,
            vigintis: finalWins.filter(h => h.blackjackValue === 21).length,
            runningSummary: get().runningSummary || { chips: 0, mult: 0 },
            playerHands: scoredHands, // Pass resolved hands for checking lengths etc.
            modifyRunningSummary: (c: number, m: number) => {
                // Additive update
                get().updateRunningSummary(c, m);
            },
            removeRelic: (relicId: string) => {
                get().removeRelic(relicId);
            },
            highlightRelic: async (id: string, options?: any) => {
                // Apply the requested 200ms delays for onRoundCompletion
                const { preDelay = 200, duration = 750, postDelay = 200, trigger } = options || {};
                await wait(preDelay);
                set({ activeRelicId: id });
                if (trigger) await trigger();
                await wait(duration);
                set({ activeRelicId: null });
                await wait(postDelay);
            }
        });

        // Restore hands to normal size
        set({ allWinnersEnlarged: false });
        await wait(300);

        if (hasWinningHand) {
            const context = buildTutorialContext(get());
            manager.setContext(context);
            manager.signalEvent('scoring_sequence_complete', context);
            await waitForTutorialStep('win_money_first');
            await waitForTutorialStep('hud_debt');
        }

        // Continue to collection if there are any chips to collect
        const currentSummary = get().runningSummary;
        if (currentSummary && (currentSummary.chips > 0 || currentSummary.mult > 0)) {
            await get().startChipCollection();
        } else {
            get().chipCollectionComplete();
        }
    },

    startChipCollection: async () => {
        const { runningSummary, incrementScore } = get();

        // 1. Show the total winnings label in the center immediately
        set({ isCollectingChips: true });
        // Tutorial event is fired when the total winnings animation finishes.

        // 2. Wait 1000ms (1s) before updating the HUD, as requested
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (runningSummary) {
            const finalAmount = Math.floor(runningSummary.chips * runningSummary.mult);
            incrementScore(finalAmount);
        }

        // 3. Wait long enough for the player to see the final sums before allowing next round
        await new Promise(resolve => setTimeout(resolve, 1000));
        get().chipCollectionComplete();
    },

    chipCollectionComplete: () => {
        const { totalScore, targetScore, handsRemaining, roundSummary } = get();

        // Ensure roundSummary is cleared
        if (roundSummary) set({ roundSummary: null });

        const hasReachedTarget = totalScore >= targetScore;
        let nextPhase: 'round_over' | 'game_over' = 'round_over';

        if (!hasReachedTarget && handsRemaining <= 0) {
            nextPhase = 'round_over';
        }

        set({
            phase: nextPhase,
            isCollectingChips: false,
            scoringHandIndex: -1,
            // Don't reset dealerVisible/allWinnersEnlarged here, 
            // the user wants them to stay until Deal/Next Casino/Game Over
        });

        if (totalScore < targetScore && handsRemaining > 0) {
            const manager = TutorialManager.getInstance();
            const context = buildTutorialContext(get());
            manager.setContext(context);
            manager.signalEvent('deal_action_available', context);
        }
    },

    completeRoundEarly: () => {
        const { handsRemaining } = get();
        // Bonus calculation: 5 comps per remaining hand
        const bonusComps = handsRemaining * 5;

        set(state => ({
            comps: state.comps + bonusComps
        }));

        // Advance to next casino immediately
        get().nextRound();
    },



    selectShopItem: (itemId: string) => {
        set({ selectedShopItemId: itemId });
    },

    confirmShopSelection: (itemId?: string) => {
        const { shopItems, inventory, selectedShopItemId } = get();

        // Determine which ID to use: explicit argument takes precedence over selected state
        const idToConfirm = itemId || selectedShopItemId;

        let newInventory = [...inventory];

        if (idToConfirm) {
            const selectedItem = shopItems.find(i => i.id === idToConfirm);
            if (selectedItem && !selectedItem.purchased) {
                // Add to inventory
                const baseRelic = RelicManager.getRelicConfig(selectedItem.id);
                if (baseRelic) {
                    const newInstance: RelicInstance = {
                        id: selectedItem.id,
                        state: { ...(baseRelic.properties || {}) }
                    };
                    newInventory.push(newInstance);
                }

                // Mark as purchased instead of removing
                set(state => ({
                    shopItems: state.shopItems.map(i =>
                        i.id === idToConfirm ? { ...i, purchased: true } : i
                    ),
                    inventory: newInventory,
                    selectedShopItemId: null,
                    tableActionCharges: buildTableActionCharges(newInventory, state.tableActionCharges),
                    tableActionHeldCards: buildTableActionHeldCards(newInventory, state.tableActionHeldCards)
                }));
            }
        }
    },


    leaveShop: () => {
        const { inventory, tableActionHeldCards, tableActionCharges } = get();
        // Trigger the actual Casino Transition now
        const { round, totalScore, targetScore, comps, deck, discardPile, dealer, playerHands, drawnCards } = get();

        const newRound = round + 1;
        const newTotalScore = totalScore; 

        // Rewards already applied on entry to shop

        // Calculate Target Score using City logic
        // But first we need the city
        const { selectedCityId } = get();
        const city = CITY_DEFINITIONS.find(c => c.id === selectedCityId) || CITY_DEFINITIONS[0];
        
        let newTargetScore = targetScore;
        
        // Check if we exceeded max casinos?
        // If round > city.numberOfCasinos, what happens?
        // Usually we should have ended game by verified success. 
        // If we are here, we are leaving shop to GO TO `newRound`.
        
        // If `round` (current) was the last one, `newRound` is out of bounds.
        // But we processed rewards for `round`.
        // So now we are entering a non-existent casino?
        // We should check victory condition here or in nextRound.
        // But if we are in Shop, we already beat the previous one.
        // The user says "Cities control the progression... eventually unlock conditions".
        // Let's assume loop or endless if we go past, OR update target score to standard formula.
        // City definitions only defined rewards for specific indices?
        // My `getRewards` logic in definitions uses standard formula or specific indices.
        
        const targetIdx = newRound - 1;
        const cityTarget = city.casinoTargets[targetIdx] !== undefined 
            ? city.casinoTargets[targetIdx] 
            : (city.casinoTargets[city.casinoTargets.length - 1] + (targetIdx - city.casinoTargets.length + 1) * 1000); // Fallback scaling

        newTargetScore = newTotalScore + cityTarget; // target for NEW round

        // Preserve and shuffle ALL cards in play to prevent loss
        // Collect from: Remaining Deck, Discard Pile, Dealer Hand, Player Hands, Drawn/Active Cards
        const heldCards = Object.values(tableActionHeldCards).filter((card): card is Card => !!card);
        const allCards = [
            ...deck,
            ...discardPile,
            ...dealer.cards,
            ...playerHands.flatMap(h => h.cards),
            ...drawnCards.filter((c): c is Card => c !== null),
            ...heldCards
        ];

        // Ensure all cards are reset to face down / no origin
        allCards.forEach(c => {
            c.isFaceUp = false;
            c.origin = undefined;
            // Keep enhancements/chips/mults/special effects
        });

        const shuffledDeck = shuffleDeck(allCards.length > 0 ? allCards : createStandardDeck());

        const emptyHands: PlayerHand[] = Array.from({ length: INITIAL_HAND_COUNT }, (_, i) => ({
            id: i,
            cards: [],
            isHeld: false,
            isBust: false,
            blackjackValue: 0
        }));

        set({
            deck: shuffledDeck,
            playerHands: emptyHands,
            dealer: { cards: [], isRevealed: false, blackjackValue: 0 },
            phase: 'entering_casino', // Go to entry screen
            round: newRound,
            targetScore: newTargetScore,
            totalScore: newTotalScore,
            dealsTaken: 0,
            handsRemaining: RelicManager.executeValueHook('getDealsPerCasino', BASE_DEALS_PER_CASINO, { inventory }),
            comps: comps, 
            discardPile: [],
            drawnCards: [], // Clear drawn area
            selectedDrawIndex: null, 
            cardsPlacedThisTurn: 0,
            redrawDiscard: null,
            isRedrawAnimating: false,
            interactionMode: 'default',
            activeTableActionId: null,
            tableActionCharges: buildTableActionCharges(inventory, tableActionCharges, { resetPerCasino: true }),
            tableActionHeldCards: buildTableActionHeldCards(inventory, {}, { resetPerCasino: true }),
            dealerMessage: null,
            runningSummary: null,
            roundSummary: null,
            allWinnersEnlarged: false,
            dealerVisible: true,
            shopItems: [],
            giftShopRestockCost: 3,
            selectedShopItemId: null,
            shopRewardSummary: null,
            animationSpeed: 1
        });
    },

    nextRound: async (forceContinue = false) => {
        const currentState = get();
        const { deck, dealer, playerHands, totalScore, targetScore, handsRemaining, isInitialDeal } = currentState;
        if (isInitialDeal) return; // Already dealing

        // Check if player reached the target score
        const hasReachedTarget = totalScore >= targetScore;

        if (!hasReachedTarget && handsRemaining <= 0 && !forceContinue) {
            set({ phase: 'game_over' });
            return;
        }

        if (hasReachedTarget && !forceContinue) {
            // GO TO GIFT SHOP PHASE

            // Calculate Rewards
            const { tableActionCharges, handsRemaining, inventory, selectedCityId, round, comps } = currentState;
            const dealsBonus = handsRemaining * 2;
            const hasDoubleDownRelic = inventory.some(r => r.id === 'double_down');
            const doubleDownBonus = hasDoubleDownRelic ? ((tableActionCharges['double_down'] ?? 0) * 1) : 0;
            const hasSurrenderRelic = inventory.some(r => r.id === 'surrender');
            const surrenderBonus = hasSurrenderRelic ? ((tableActionCharges['surrender'] ?? 0) * 1) : 0;
            // "Interested" bonus is based on comps before casino payout rewards are applied.
            const interestedBonus = Math.min(5, Math.floor(comps / 5));
            const winBonus = 2;
            const totalBonus = dealsBonus + doubleDownBonus + surrenderBonus + interestedBonus + winBonus;

            // Generate Rewards based on City
            const city = CITY_DEFINITIONS.find(c => c.id === selectedCityId) || CITY_DEFINITIONS[0];
            
            // Check if we just beat the LAST casino in the city
            if (round >= city.casinoTargets.length) {
                // Victory Condition?
                // For now, let's allow playing beyond or show Game Over Win?
                // User requirement: "Cities control the progression... new structure for specifying items available after each casino"
                // If it's the last casino, typically you win the run.
                // "This is the tutorial city. It will only be three casinos long."
                // I should likely add a 'VICTORY' phase or handle it.
                // But for now, let's generate rewards as if it's just another shop, 
                // but maybe we should show a specific "City Cleared" message?
                // The prompt says "first and third rewards offer...", implying there IS a reward after the 3rd.
                // So we show the shop for the 3rd casino.
                // But `nextRound` from the shop will then increment round to 4.
                // My `nextRound` logic should check this.
            }

            // Casino 1 cleared -> Index 0. 
            // `round` is currently 1 (since we started at 1 and haven't incremented yet).
            // So we pass index `round - 1`. Or `round`?
            // "The first and third rewards".
            // If round 1 is cleared, that's the 1st reward.
            // So index should be 0 for Round 1 reward?
            // Let's assume input to getRewards matches the index of the casino just beaten (0-based)
            const { rewardConfig, shopPriceOverrides } = getCurrentCasinoShopConfig();
            const newShopItems = generateShopItems(rewardConfig, inventory, shopPriceOverrides);

            set({
                shopItems: newShopItems,
                phase: 'casino_win',
                dealerVisible: false,
                shopRewardSummary: { dealsBonus, doubleDownBonus, surrenderBonus, interestedBonus, winBonus, total: totalBonus }
            });
            return;
        }

        // Decrement deals when dealing a new hand (and not advancing casino)
        const newDealsTaken = currentState.dealsTaken + 1;
        const dealsPerCasino = RelicManager.executeValueHook('getDealsPerCasino', BASE_DEALS_PER_CASINO, { inventory: get().inventory });
        const newHandsRemaining = dealsPerCasino - newDealsTaken;

        const additionalDiscard = [
            ...dealer.cards,
            ...playerHands.flatMap(h => h.cards)
        ];

        const newDiscardPile = [...currentState.discardPile, ...additionalDiscard];
        const deckRef = [...deck];

        // If deck is getting dangerously low, we might need a fallback, 
        // but according to requirements we only shuffle when changing casinos.
        // 52 cards should usually last for 3 rounds.

        const newHands: PlayerHand[] = [];

        // Deal 3 empty hands
        for (let i = 0; i < INITIAL_HAND_COUNT; i++) {
            newHands.push({
                id: i,
                cards: [], // Start empty
                isHeld: false,
                isBust: false,
                blackjackValue: 0
            });
        }

        // Deal one card to the center hand (index 1)
        const initialPlayerCard = deckRef.pop()!;
        initialPlayerCard.isFaceUp = true;
        initialPlayerCard.origin = 'deck';
        newHands[1].cards.push(initialPlayerCard);
        newHands[1].blackjackValue = getBlackjackScore(newHands[1].cards, get().inventory);

        const dealerCards = [deckRef.pop()!, deckRef.pop()!];
        dealerCards[0].isFaceUp = false;
        dealerCards[0].origin = 'deck';
        dealerCards[1].isFaceUp = true;
        dealerCards[1].origin = 'deck';

        // newHands and dealerCards are prepared above but NOT set yet.

        // --- SEQUENCE CHANGE: Handle Discard Animation Delay ---
        // 1. Clear State to trigger Discard Animation
        // Create purely empty hands structure to force discard
        const activeHands = get().playerHands;
        const emptyHandsForDiscard = activeHands.map(h => ({ ...h, cards: [], blackjackValue: 0, isBust: false, isHeld: false, isDoubled: false }));
        
        // Block hits during animation
        set({ isInitialDeal: true });

        set({
            playerHands: emptyHandsForDiscard, 
            // Keep other state to prevent layout jumps/flashes
            dealer: { ...dealer, cards: [] } // Also clear dealer? Yes, dealer needs to discard too.
        });

        // Calculate wait time based on the actual duration of the discard animation (0.42s)
        // plus the stagger delay (0.1s per card). 
        // Adding 200ms buffer to prevent animation overlap bugs.
        const centerHandCards = activeHands[1]?.cards.length || 0;
        const discardDuration = centerHandCards > 0 ? ((centerHandCards - 1) * 100 + 620) : 0; // ms

        if (discardDuration > 0) {
                await new Promise(resolve => setTimeout(resolve, discardDuration / get().animationSpeed));
        }

        // 2. NOW Deal new cards (State Update)
        set({
            deck: deckRef,
            playerHands: newHands,
            dealer: {
                cards: dealerCards,
                isRevealed: false,
                blackjackValue: getBlackjackScore([dealerCards[1]], get().inventory)
            },
            drawnCards: [],
            selectedDrawIndex: null,
            cardsPlacedThisTurn: 0,
            redrawDiscard: null,
            isRedrawAnimating: false,
            phase: 'playing',
            interactionMode: 'default',
            activeTableActionId: null,
            dealsTaken: newDealsTaken,
            handsRemaining: newHandsRemaining,
            discardPile: newDiscardPile,
            isInitialDeal: true,
            runningSummary: null,
            roundSummary: null,
            allWinnersEnlarged: false,
            dealerVisible: true,
            isDealerPlaying: false,
            animationSpeed: 1
        });

        if (newHandsRemaining < currentState.handsRemaining) {
            const manager = TutorialManager.getInstance();
            const context = buildTutorialContext(get());
            manager.setContext(context);
            manager.signalEvent('hud_draws_decremented', context);
        }

        // After animations complete, isInitialDeal will be cleared via onInitialDealAnimationsComplete.
    },

    debugWin: async () => {
        const { phase, drawnCards, holdReturns } = get();
        if (phase !== 'playing') return;

        // If there's a drawn card, discard it first
        if (drawnCards.length > 0) {
            get().debugUndo();
        }

        await holdReturns(true);
    },

    debugUndo: () => {
        const { phase, drawnCards, deck } = get();
        if (phase !== 'playing' || drawnCards.length === 0) return;

        // Filter out nulls first
        const cardsToReturn = drawnCards
            .filter((c): c is Card => c !== null)
            .reverse();

        cardsToReturn.forEach(c => {
            c.isFaceUp = false;
            c.origin = undefined;
        });

        set({
            drawnCards: [],
            selectedDrawIndex: null,
            cardsPlacedThisTurn: 0,
            redrawDiscard: null,
            isRedrawAnimating: false,
            modifiers: { drawCountMod: 0, placeCountMod: 0 }, // Reset just in case
            deck: [...deck, ...cardsToReturn]
        });
    },

    debugFillTableAction: (relicId: string) => {
        const action = getTableActionConfig(relicId);
        if (!action) return;
        set(state => ({
            tableActionCharges: {
                ...state.tableActionCharges,
                [relicId]: action.maxCharges
            }
        }));
    },

    drawSpecificCard: (cardId: string) => {
        const { deck, phase, drawnCards } = get();
        if (phase !== 'playing' || drawnCards.length > 0) return;

        const cardIndex = deck.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return;

        const newDeck = [...deck];
        const [card] = newDeck.splice(cardIndex, 1);

        card.isFaceUp = true;
        card.origin = 'deck';

        set({
            deck: newDeck,
            drawnCards: [card],
            selectedDrawIndex: 0,
            interactionMode: 'default',
            activeTableActionId: null
        });
        TutorialManager.getInstance().signalEvent('player_hit');
    },

    addRelic: (relicId) => {
        set(state => {
            const config = RelicManager.getRelicConfig(relicId);
            if (!config) return {};

            const instance: RelicInstance = {
                id: relicId,
                state: config.properties ? JSON.parse(JSON.stringify(config.properties)) : {}
            };

            const newInventory = [...state.inventory, instance];
            const dealsPerCasino = RelicManager.executeValueHook('getDealsPerCasino', BASE_DEALS_PER_CASINO, { inventory: newInventory });
            return {
                inventory: newInventory,
                handsRemaining: dealsPerCasino - state.dealsTaken,
                tableActionCharges: buildTableActionCharges(newInventory, state.tableActionCharges),
                tableActionHeldCards: buildTableActionHeldCards(newInventory, state.tableActionHeldCards)
            };
        });
    },

    removeRelic: (relicId) => {
        set(state => {
            const newInventory = state.inventory.filter(r => r.id !== relicId);
            const dealsPerCasino = RelicManager.executeValueHook('getDealsPerCasino', BASE_DEALS_PER_CASINO, { inventory: newInventory });
            return {
                inventory: newInventory,
                handsRemaining: dealsPerCasino - state.dealsTaken,
                tableActionCharges: buildTableActionCharges(newInventory, state.tableActionCharges),
                tableActionHeldCards: buildTableActionHeldCards(newInventory, state.tableActionHeldCards)
            };
        });
    },

    revealDealerHiddenCard: () => {
        const { dealer, inventory } = get();
        if (dealer.isRevealed) return;

        const revealedCards = [...dealer.cards];
        if (revealedCards.length > 0) {
            revealedCards[0] = { ...revealedCards[0], isFaceUp: true };
            
            set({
                dealer: {
                    ...dealer,
                    isRevealed: true,
                    cards: revealedCards
                }
            });

            // Update score after delay to match flip animation
            setTimeout(() => {
                const revealVal = getBlackjackScore(revealedCards, inventory, true);
                set(state => ({
                    dealer: {
                        ...state.dealer,
                        blackjackValue: revealVal
                    }
                }));
            }, 600);
        }
    },

    enhanceCard: (cardId, effect) => {
        const { comps } = get();
        let level = 0;
        if (effect.type === 'score') level = [-1, -2, -3, -4].indexOf(-effect.value);
        if (effect.type === 'mult') level = [1, 2, 3, 4].indexOf(effect.value);
        if (effect.type === 'chip') level = [5, 10, 20, 50].indexOf(effect.value);

        const costs = [1, 3, 5, 7];
        const cost = costs[level] || 0;

        if (comps < cost) return;

        set(state => ({
            deck: state.deck.map(c =>
                c.id === cardId
                    ? { ...c, specialEffect: effect }
                    : c
            ),
            comps: state.comps - cost
        }));
        sfxEngine.play('purchase');
    },

    buyShopItem: (itemId: string) => {
        const { comps, inventory, shopItems, getMaxCharms, getMaxAngles } = get();

        const item = shopItems.find(i => i.id === itemId);
        if (!item || item.purchased) return { success: false };

        const fallbackCost = getRelicCompCost(item.id);
        const cost = item.cost ?? fallbackCost;

        if (comps < cost) {
            return { success: false, reason: 'insufficient_funds' };
        }

        // Check slots
        const baseRelic = RelicManager.getRelicConfig(item.id);
        if (!baseRelic) return { success: false };

        const isCharm = baseRelic.categories.includes('Charm');
        const isAngle = baseRelic.categories.includes('Angle');

        if (isCharm) {
            const currentCharms = inventory.filter(inst => {
                const config = RelicManager.getRelicConfig(inst.id);
                return config?.categories.includes('Charm');
            }).length;
            if (currentCharms >= getMaxCharms()) {
                return { success: false, reason: 'full' };
            }
        }

        if (isAngle) {
            const currentAngles = inventory.filter(inst => {
                const config = RelicManager.getRelicConfig(inst.id);
                return config?.categories.includes('Angle');
            }).length;
            if (currentAngles >= getMaxAngles()) {
                return { success: false, reason: 'full' };
            }
        }

        // Deduct Cost
        set({ comps: comps - cost });

        // Add Angle/Charm/TableAction relic to inventory
        if (baseRelic) {
            const newInstance: RelicInstance = {
                id: item.id,
                state: { ...(baseRelic.properties || {}) }
            };

            const newInventory = [...inventory, newInstance];
            // Recalculate deals
            const dealsPerCasino = RelicManager.executeValueHook('getDealsPerCasino', BASE_DEALS_PER_CASINO, { inventory: newInventory });

            set(state => ({
                inventory: newInventory,
                handsRemaining: dealsPerCasino - state.dealsTaken,
                tableActionCharges: buildTableActionCharges(newInventory, state.tableActionCharges),
                tableActionHeldCards: buildTableActionHeldCards(newInventory, state.tableActionHeldCards)
            }));
        }

        // Mark purchased
        set({
            shopItems: shopItems.map(i => i.id === itemId ? { ...i, purchased: true } : i)
        });
        sfxEngine.play('purchase');
        TutorialManager.getInstance().signalEvent('relic_purchased', { relicId: itemId });
        return { success: true };
    },
    restockGiftShop: () => {
        const { phase, comps, giftShopRestockCost, inventory } = get();
        if (phase !== 'gift_shop' || comps < giftShopRestockCost) return;

        const { rewardConfig, shopPriceOverrides } = getCurrentCasinoShopConfig();
        const rerolledItems = generateShopItems(rewardConfig, inventory, shopPriceOverrides);
        sfxEngine.play('restock');

        set(state => ({
            comps: state.comps - state.giftShopRestockCost,
            shopItems: rerolledItems,
            selectedShopItemId: null,
            giftShopRestockCost: state.giftShopRestockCost + 3
        }));
    },
    enterGiftShop: () => {
        TutorialManager.getInstance().clearEvent('gift_shop_animated_in');
        set({
            phase: 'gift_shop',
            giftShopRestockCost: 3,
            removalCount: 0
        });
    }
    });
});
