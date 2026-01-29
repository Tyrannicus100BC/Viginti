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
// import type { RoundSummary } from '../logic/relics/types';

interface GameState {
    deck: Card[];
    dealer: DealerHand;
    playerHands: PlayerHand[];
    drawnCards: (Card | null)[];
    selectedDrawIndex: number | null;
    cardsPlacedThisTurn: number;
    modifiers: {
        drawCountMod: number;
        placeCountMod: number;
    };
    phase: 'init' | 'entering_casino' | 'playing' | 'scoring' | 'round_over' | 'game_over' | 'gift_shop';
    round: number;
    interactionMode: 'default' | 'double_down_select' | 'surrender_select';
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
    shopRewardSummary: { dealsBonus: number; doubleDownBonus: number; surrenderBonus: number; winBonus: number; total: number } | null;
    discardPile: Card[];
    inventory: RelicInstance[];
    activeRelicId: string | null;

    shopItems: { id: string, type: 'Charm' | 'Angle' | 'Card', card?: Card, purchased?: boolean, cost?: number, nameOverride?: string }[];
    selectedShopItemId: string | null;
    buyShopItem: (itemId: string) => void;

    isInitialDeal: boolean;
    isShaking: boolean; // For >300 score celebration

    dealerMessageExiting: boolean;
    dealerMessage: string | null;
    isDealerPlaying: boolean;



    debugEnabled: boolean;
    
    // Actions
    startGame: (gamblerId?: string) => void;
    dealFirstHand: () => void;
    drawCard: () => void;
    assignCard: (handIndex: number) => Promise<void>;

    // Double Down Actions
    doubleDownCharges: number;
    startDoubleDown: () => void;
    cancelDoubleDown: () => void;
    doubleDownHand: (handIndex: number) => void;

    // Surrender Actions
    surrenders: number;
    startSurrender: () => void;
    cancelSurrender: () => void;
    surrenderHand: (handIndex: number) => void;
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
    debugWin: () => Promise<void>;
    debugUndo: () => void;
    debugFillDoubleDown: () => void;
    debugFillSurrender: () => void;
    drawSpecificCard: (cardId: string) => void;
    addRelic: (relicId: string) => void;
    removeRelic: (relicId: string) => void;
    updateRunningSummary: (chips: number, mult: number) => void;
    selectDrawnCard: (index: number) => void;
    getProjectedDrawCount: () => number;
    getProjectedPlaceCount: () => number;
    removeCard: (cardId: string) => void;
    enhanceCard: (cardId: string, effect: { type: 'chip' | 'mult' | 'score', value: number }) => void;
    leaveShop: () => void;
    revealDealerHiddenCard: () => void;
}



const INITIAL_HAND_COUNT = 3;
const BASE_DEALS_PER_CASINO = 3;

export const useGameStore = create<GameState>((set, get) => ({
    deck: [],
    dealer: { cards: [], isRevealed: false, blackjackValue: 0 },
    playerHands: [],
    drawnCards: [],
    selectedDrawIndex: null,
    cardsPlacedThisTurn: 0,
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
    shopRewardSummary: null,
    discardPile: [],
    inventory: [],
    activeRelicId: null,
    shopItems: [],
    selectedShopItemId: null,
    doubleDownCharges: 0,
    surrenders: 0,
    isInitialDeal: true,
    isShaking: false,
    allWinnersEnlarged: false,
    dealerVisible: true,
    isDealerPlaying: false,
    debugEnabled: localStorage.getItem('viginti_debug') === 'true',
    animationSpeed: 1,
    setAnimationSpeed: (speed) => set({ animationSpeed: speed }),

    toggleDebug: () => {
        set(state => {
            const newValue = !state.debugEnabled;
            localStorage.setItem('viginti_debug', String(newValue));
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

    incrementScore: (amount) => set(state => ({ totalScore: state.totalScore + amount })),

    triggerDebugChips: () => {
        const { targetScore, incrementScore } = get();
        const amount = Math.ceil(targetScore / 2);
        incrementScore(amount);
        get().chipCollectionComplete();
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

    startGame: (gamblerId: string = 'default') => {
        const gambler = GAMBLER_DEFINITIONS.find(g => g.id === gamblerId) || GAMBLER_DEFINITIONS[0];
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

        set({
            deck,
            playerHands: emptyHands,
            dealer: { cards: [], isRevealed: false, blackjackValue: 0 },
            drawnCards: [],
            selectedDrawIndex: null,
            cardsPlacedThisTurn: 0,
            modifiers: { drawCountMod: 0, placeCountMod: 0 },
            dealerMessage: null,
            dealerMessageExiting: false,
            phase: 'entering_casino', // Start in entry mode
            totalScore: 0,
            targetScore: calculateTargetScore(1),
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
            selectedShopItemId: null,
            isDealerPlaying: false,
            doubleDownCharges: 0,
            surrenders: initialInventory.some(r => r.id === 'surrender') ? 3 : 0,
        });
    },

    removeCard: (cardId: string) => {
        set(state => ({
            deck: state.deck.filter(c => c.id !== cardId)
        }));
    },

    dealFirstHand: () => {
        const { deck, round, targetScore, totalScore } = get();

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

        set({
            deck: deckRef,
            playerHands,
            dealer: {
                cards: dealerCards,
                isRevealed: false,
                blackjackValue: dealerCards.length > 1 ? getBlackjackScore([dealerCards[1]], get().inventory, true) : 0
            },
            discardPile: [...get().discardPile, ...burnedCards],
            drawnCards: [],
            selectedDrawIndex: null,
            cardsPlacedThisTurn: 0,
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
            isDealerPlaying: false
        });

        // After animations complete (Dealer cards only now)
        const delay = get().debugEnabled ? 0 : 1500;
        setTimeout(() => {
            set({ isInitialDeal: false });
        }, delay);
    },

    drawCard: async () => {
        const { deck, drawnCards, phase, modifiers, inventory } = get();
        if (phase !== 'playing' || drawnCards.length > 0) return;

        // Cancel double down if active
        set({ interactionMode: 'default' });

        // Calculate count
        let drawCount = 1 + modifiers.drawCountMod;
        // Consume draw modifier
        set(state => ({ modifiers: { ...state.modifiers, drawCountMod: 0 } }));

        drawCount = RelicManager.executeValueHook('getDrawCount', drawCount, { inventory });

        const deckRef = [...deck];
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
    },

    selectDrawnCard: (index: number) => {
        const { drawnCards } = get();
        if (index >= 0 && index < drawnCards.length) {
            set({ selectedDrawIndex: index });
        }
    },

    startDoubleDown: () => {
        const { phase, drawnCards, doubleDownCharges } = get();
        if (phase !== 'playing' || drawnCards.length > 0) return;

        // Requirement: At least 1 Charge to start
        if (doubleDownCharges < 1) return;

        set({ interactionMode: 'double_down_select' });
    },

    cancelDoubleDown: () => {
        set({ interactionMode: 'default' });
    },

    doubleDownHand: (handIndex: number) => {
        const { playerHands, deck, interactionMode, doubleDownCharges } = get();
        if (interactionMode !== 'double_down_select') return;
        if (doubleDownCharges < 1) return;

        const hand = playerHands[handIndex];
        if (!hand || hand.isBust || hand.isHeld || hand.blackjackValue === 21) return;

        // Consume Charge
        set({ doubleDownCharges: doubleDownCharges - 1 });

        let currentDeck = [...deck];
        const card = currentDeck.pop();
        if (!card) return; // empty deck safety

        card.isFaceUp = true;
        card.origin = 'double_down';

        const updatedHands = playerHands.map((h, idx) => {
            if (idx !== handIndex) return h;

            // Double Logic
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

        // Update state and exit mode
        set({
            playerHands: updatedHands,
            deck: currentDeck,
            interactionMode: 'default'
        });

        // Handle Bust Side Effects
        const postHand = updatedHands[handIndex];
        if (postHand.isBust) {
            set(state => ({
                doubleDownCharges: Math.min(3, state.doubleDownCharges + 1)
            }));
            RelicManager.executeInterruptHook('onHandBust', {
                inventory: get().inventory,
                highlightRelic: async () => { },
                handId: postHand.id
            }).catch(console.error);
        }

        // Auto-stand if all hands unplayable
        if (updatedHands.every(h => h.isBust || h.isHeld || h.blackjackValue === 21)) {
            setTimeout(() => {
                get().holdReturns();
            }, 1000);
        }
    },

    startSurrender: () => {
        const { phase, drawnCards, surrenders } = get();
        if (phase !== 'playing' || drawnCards.length > 0) return;

        // Requirement: At least 1 Surrender remaining
        if (surrenders < 1) return;

        set({ interactionMode: 'surrender_select' });
    },

    cancelSurrender: () => {
        set({ interactionMode: 'default' });
    },

    surrenderHand: (handIndex: number) => {
        const { playerHands, interactionMode, surrenders, discardPile } = get();
        if (interactionMode !== 'surrender_select') return;
        if (surrenders < 1) return;

        const hand = playerHands[handIndex];
        // Cannot select busted hands or empty hands
        if (!hand || hand.isBust || hand.cards.length === 0) return;

        // Consume Surrender
        const newSurrenders = surrenders - 1;
        const cardsToDiscard = [...hand.cards];

        // Reset Hand
        const newHands = playerHands.map((h, idx) => {
            if (idx !== handIndex) return h;
            return {
                ...h,
                cards: [],
                blackjackValue: 0,
                isBust: false,
                isHeld: false,
                isDoubled: false,
                finalScore: null,
                resultRevealed: false
            };
        });

        set({
            playerHands: newHands,
            discardPile: [...discardPile, ...cardsToDiscard],
            surrenders: newSurrenders,
            interactionMode: 'default'
        });
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
            
            // Inject Doubledown Logic: Add Charge on Bust
            set(state => ({ doubleDownCharges: Math.min(3, state.doubleDownCharges + 1) }));

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
                setTimeout(() => {
                    get().holdReturns();
                }, 1000);
            }
        }
    },

    holdReturns: async (forceDealerBust = false) => {
        // Reset speed to normal at start of sequence
        set({ animationSpeed: 1, isDealerPlaying: true });

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

        // 1. Reveal Phase
        const { dealer, deck } = get();
        
        // Check if already revealed (e.g. by Spyglass relic)
        let dCards = [...dealer.cards];
        let dVal = dealer.blackjackValue;

        if (!dealer.isRevealed) {
            const revealedCards = [...dealer.cards];
            revealedCards[0] = { ...revealedCards[0], isFaceUp: true };
            
            // Update cards but keep old blackjackValue for the flip duration
            set({ 
                dealer: { 
                    ...dealer, 
                    isRevealed: true, 
                    cards: revealedCards 
                } 
            });
            
            await wait(600); // Wait for the 0.6s flip transition
            
            const revealVal = getBlackjackScore(revealedCards, get().inventory, true);
            set({
                dealer: {
                    ...get().dealer,
                    blackjackValue: revealVal
                }
            });
            dCards = revealedCards;
            dVal = revealVal;
        }
        const burnedCards: Card[] = [];

        // 2. Dealer Draw Loop
        const dDeck = [...deck];
        const { inventory } = get();
        const baseStopValue = 17;
        const dealerStopValue = forceDealerBust ? 22 : RelicManager.executeValueHook('getDealerStopValue', baseStopValue, { inventory });
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

            // Show card being dealt (face down -> flip) but keep old score
            set({
                deck: dDeck,
                dealer: { ...get().dealer, cards: nextCards }
            });

            await wait(500); // Match --anim-deal-duration

            dCards = nextCards;
            dVal = nextVal;

            set({
                dealer: { ...get().dealer, blackjackValue: dVal }
            });

            set({ dealerMessageExiting: true });
            await wait(100);
            set({ dealerMessage: null, dealerMessageExiting: false });
        }

        await wait(200);

        // 3. Final Result Message
        if (dVal < 21) {
            set({ dealerMessage: "Stand!", dealerMessageExiting: false });
            await wait(500);
            set({ dealerMessageExiting: true });
            await wait(100);
            set({ dealerMessage: null, dealerMessageExiting: false });
        } else if (dVal === 21) {
            // Exact 21 -> No longer gives +2 Charges per user request
            // set(state => ({ doubleDownCharges: Math.min(3, state.doubleDownCharges + 2) }));
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
                set(state => ({ doubleDownCharges: Math.min(3, state.doubleDownCharges + 1) }));
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

            // Pause only if we're showing a new label (Win/Loss)
            if (!isBustOrViginti && i < currentHands.length - 1) {
                await wait(400);
            }
        }

        // STEP 1 COMPLETE: Fade out dealer
        await wait(200);
        set({
            dealerVisible: false
            // allWinnersEnlarged remains false so hands grow one by one via scoringHandIndex
        });

        // Allow user to digest outcomes before scoring starts
        await wait(400);

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
                         console.log('Relic Active:', relicId);
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
            highlightRelic: async (id: string, options?: any) => {
                // Apply the requested 200ms delays for onRoundCompletion
                const { preDelay = 200, duration = 750, postDelay = 200, trigger } = options || {};
                await wait(preDelay);
                console.log('Highlighting Relic:', id);
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
                if (selectedItem.type === 'Card' && selectedItem.card) {
                    // Add card to deck
                    set(state => ({
                        deck: [...state.deck, selectedItem.card!]
                    }));
                } else {
                    // Add to inventory
                    const baseRelic = RelicManager.getRelicConfig(selectedItem.id);
                    if (baseRelic) {
                        const newInstance: RelicInstance = {
                            id: selectedItem.id,
                            state: { ...(baseRelic.properties || {}) }
                        };
                        newInventory.push(newInstance);
                    }
                }

                // Mark as purchased instead of removing
                set(state => ({
                    shopItems: state.shopItems.map(i =>
                        i.id === idToConfirm ? { ...i, purchased: true } : i
                    ),
                    inventory: newInventory,
                    selectedShopItemId: null
                }));
            }
        }
    },

    leaveShop: () => {
        const { inventory } = get();
        // Trigger the actual Casino Transition now
        const { round, totalScore, targetScore, comps, deck, discardPile } = get();

        const newRound = round + 1;
        const newTotalScore = totalScore; // Keep total score cumulative

        // Rewards already applied on entry to shop

        let newTargetScore = targetScore;
        // Set target relative to current cumulated score
        newTargetScore = newTotalScore + calculateTargetScore(newRound);

        // Preserve and shuffle the manipulated deck
        const combinedDeck = [...deck, ...discardPile];
        const shuffledDeck = shuffleDeck(combinedDeck.length > 0 ? combinedDeck : createStandardDeck());

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
            comps: comps, // Already updated
            discardPile: [],
            surrenders: inventory.some(r => r.id === 'surrender') ? 3 : 0, // Reset to 3 if owned
            dealerMessage: null,
            runningSummary: null,
            roundSummary: null,
            allWinnersEnlarged: false,
            dealerVisible: true,
            shopItems: [],
            selectedShopItemId: null,
            shopRewardSummary: null
        });
    },

    nextRound: (forceContinue = false) => {
        const currentState = get();
        const { deck, dealer, playerHands, totalScore, targetScore, handsRemaining } = currentState;

        // Check if player reached the target score
        const hasReachedTarget = totalScore >= targetScore;

        if (!hasReachedTarget && handsRemaining <= 0 && !forceContinue) {
            set({ phase: 'game_over' });
            return;
        }

        if (hasReachedTarget && !forceContinue) {
            // GO TO GIFT SHOP PHASE

            // Calculate Rewards
            const { surrenders, doubleDownCharges, handsRemaining, comps, inventory } = currentState;
            const dealsBonus = handsRemaining * 2;
            const hasDoubleDownRelic = inventory.some(r => r.id === 'double_down');
            const doubleDownBonus = hasDoubleDownRelic ? (doubleDownCharges * 1) : 0;
            const hasSurrenderRelic = inventory.some(r => r.id === 'surrender');
            const surrenderBonus = hasSurrenderRelic ? (surrenders * 1) : 0;
            const winBonus = 2;
            const totalBonus = dealsBonus + doubleDownBonus + surrenderBonus + winBonus;

            set({ comps: comps + totalBonus });

            // 1a. Generate Standard Card (Cost 1, No Special)
            const fullDeck1 = createStandardDeck();
            const idx1 = Math.floor(Math.random() * fullDeck1.length);
            const standardCard = fullDeck1[idx1];
            standardCard.isFaceUp = true;
            standardCard.origin = 'shop';

            // 1b. Generate Special Card (Cost 2, Guaranteed Special)
            const fullDeck2 = createStandardDeck();
            const idx2 = Math.floor(Math.random() * fullDeck2.length);
            const specialCard = fullDeck2[idx2];
            specialCard.isFaceUp = true;
            specialCard.origin = 'shop';

            const effects = [
                { type: 'mult' as const, value: 1 }, { type: 'mult' as const, value: 2 },
                { type: 'chip' as const, value: 5 }, { type: 'chip' as const, value: 10 }
            ];
            specialCard.specialEffect = effects[Math.floor(Math.random() * effects.length)];

            // 2. Generate Random Angle
            const currentIds = get().inventory.map(i => i.id);
            const allAngles = RelicManager.getAllRelics().filter(r => r.categories.includes('Angle') && !currentIds.includes(r.id));
            const randomAngle = allAngles.length > 0 ? allAngles[Math.floor(Math.random() * allAngles.length)] : null;

            // 3. Generate Random Charm
            const allCharms = RelicManager.getAllRelics().filter(r => r.categories.includes('Charm') && !currentIds.includes(r.id));
            const randomCharm = allCharms.length > 0 ? allCharms[Math.floor(Math.random() * allCharms.length)] : null;

            const newShopItems = [];

            newShopItems.push({
                id: 'shop_card_standard',
                type: 'Card' as const,
                card: standardCard,
                cost: 1,
                nameOverride: 'Standard Card'
            });

            newShopItems.push({
                id: 'shop_card_special',
                type: 'Card' as const,
                card: specialCard,
                cost: 2,
                nameOverride: 'Special Card'
            });

            if (randomAngle) {
                newShopItems.push({
                    id: randomAngle.id,
                    type: 'Angle' as const,
                    cost: 8,
                    nameOverride: randomAngle.name
                });
            }

            if (randomCharm) {
                newShopItems.push({
                    id: randomCharm.id,
                    type: 'Charm' as const,
                    cost: 5,
                    nameOverride: randomCharm.name
                });
            }

            set({
                shopItems: newShopItems,
                phase: 'gift_shop',
                dealerVisible: false,
                shopRewardSummary: { dealsBonus, doubleDownBonus, surrenderBonus, winBonus, total: totalBonus }
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
            phase: 'playing',
            dealsTaken: newDealsTaken,
            handsRemaining: newHandsRemaining,
            discardPile: newDiscardPile,
            isInitialDeal: true,
            runningSummary: null,
            roundSummary: null,
            allWinnersEnlarged: false,
            dealerVisible: true,
            isDealerPlaying: false
        });

        // After animations complete
        setTimeout(() => {
            set({ isInitialDeal: false });
        }, 1500);
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
            modifiers: { drawCountMod: 0, placeCountMod: 0 }, // Reset just in case
            deck: [...deck, ...cardsToReturn]
        });
    },

    debugFillDoubleDown: () => {
        set({ doubleDownCharges: 3 });
    },

    debugFillSurrender: () => {
        set({ surrenders: 3 });
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
            interactionMode: 'default'
        });
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
                handsRemaining: dealsPerCasino - state.dealsTaken
            };
        });
    },

    removeRelic: (relicId) => {
        set(state => {
            const newInventory = state.inventory.filter(r => r.id !== relicId);
            const dealsPerCasino = RelicManager.executeValueHook('getDealsPerCasino', BASE_DEALS_PER_CASINO, { inventory: newInventory });
            return {
                inventory: newInventory,
                handsRemaining: dealsPerCasino - state.dealsTaken
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
        set(state => ({
            deck: state.deck.map(c =>
                c.id === cardId
                    ? { ...c, specialEffect: effect }
                    : c
            )
        }));
    }, // Add comma

    buyShopItem: (itemId: string) => {
        const { comps, inventory, deck, shopItems } = get();

        const item = shopItems.find(i => i.id === itemId);
        if (!item || item.purchased) return;

        const cost = item.cost || (item.type === 'Card' ? (item.id.includes('special') ? 2 : 1) : item.type === 'Angle' ? 8 : 5);

        if (comps < cost) {
            return;
        }

        // Deduct Cost
        set({ comps: comps - cost });

        if (item.type === 'Card' && item.card) {
            set({ deck: [...deck, item.card] });
        } else {
            // Add Angle/Charm to inventory
            const baseRelic = RelicManager.getRelicConfig(item.id);
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
                    handsRemaining: dealsPerCasino - state.dealsTaken
                }));
            }
        }

        // Mark purchased
        set({
            shopItems: shopItems.map(i => i.id === itemId ? { ...i, purchased: true } : i)
        });
    }
}));
