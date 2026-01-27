import { create } from 'zustand';
import type { Card, DealerHand, PlayerHand, Suit, Rank } from '../types';
import { createStandardDeck, shuffleDeck } from '../logic/deck';
import { getBlackjackScore, evaluateHandScore } from '../logic/scoring';
import { calculateTargetScore } from '../logic/casinoConfig';
import { RelicManager } from '../logic/relics/manager';
import type { RelicInstance } from '../logic/relics/types';
// import { RELIC_REGISTRY } from '../logic/relics/registry';

const getRandomScoringRelics = (count: number, currentInventory: RelicInstance[], excludeIds: string[]) => {
    const allScoring = RelicManager.getAllRelics().filter(r => r.categories.includes('Scoring') && !excludeIds.includes(r.id));
    const currentIds = currentInventory.map(i => i.id);
    const available = allScoring.filter(r => !currentIds.includes(r.id));
    
    const picked: RelicInstance[] = [];
    const pool = [...available];
    
    for (let i=0; i<count; i++) {
        if (pool.length === 0) break;
        const idx = Math.floor(Math.random() * pool.length);
        const relic = pool.splice(idx, 1)[0];
        picked.push({ id: relic.id, state: { ...(relic.properties || {}) } });
    }
    return picked;
};

// Import Gambler Definitions
import { GAMBLER_DEFINITIONS } from '../logic/gamblers/definitions';
// import type { RoundSummary } from '../logic/relics/types';

interface GameState {
    deck: Card[];
    dealer: DealerHand;
    playerHands: PlayerHand[];
    drawnCard: Card | null;
    phase: 'init' | 'entering_casino' | 'playing' | 'scoring' | 'round_over' | 'game_over' | 'gift_shop';
    round: number;
    interactionMode: 'default' | 'double_down_select';
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
    discardPile: Card[];
    inventory: RelicInstance[];
    activeRelicId: string | null;

    shopItems: { id: string, type: 'Charm' | 'Angle' }[];
    selectedShopItemId: string | null;

    isInitialDeal: boolean;
    isShaking: boolean; // For >300 score celebration

    dealerMessageExiting: boolean;
    dealerMessage: string | null;

    debugEnabled: boolean;

    // Actions
    startGame: (gamblerId?: string) => void;
    dealFirstHand: () => void;
    drawCard: () => void;
    startDoubleDown: () => void;
    cancelDoubleDown: () => void;
    confirmDoubleDown: (handIndex: number) => void;
    assignCard: (handIndex: number) => void;
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
    drawSpecificCard: (suit: Suit, rank: Rank) => void;
    addRelic: (relicId: string) => void;
    removeRelic: (relicId: string) => void;
    updateRunningSummary: (chips: number, mult: number) => void;
}

const INITIAL_HAND_COUNT = 3;
const BASE_DEALS_PER_CASINO = 3;

export const useGameStore = create<GameState>((set, get) => ({
    deck: [],
    dealer: { cards: [], isRevealed: false, blackjackValue: 0 },
    playerHands: [],
    drawnCard: null,
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
    discardPile: [],
    inventory: [],
    activeRelicId: null,
    shopItems: [],
    selectedShopItemId: null,
    isInitialDeal: true,
    isShaking: false,
    allWinnersEnlarged: false,
    dealerVisible: true,
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

    incrementScore: (amount) => set(state => ({ totalScore: state.totalScore + amount })),

    triggerDebugChips: () => {
        const { targetScore, incrementScore } = get();
        const amount = Math.ceil(targetScore / 3);
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
            drawnCard: null,
            dealerMessage: null,
            dealerMessageExiting: false,
            phase: 'entering_casino', // Start in entry mode
            totalScore: 0,
            targetScore: calculateTargetScore(1),
            comps: 5,
            dealsTaken: 0,
            handsRemaining: RelicManager.executeValueHook('getDealsPerCasino', BASE_DEALS_PER_CASINO, { inventory: [] }),
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
            selectedShopItemId: null
        });
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

        const dealerCards = [deckRef.pop()!, deckRef.pop()!];
        dealerCards[0].isFaceUp = false;
        dealerCards[0].origin = 'deck';
        dealerCards[1].isFaceUp = true;
        dealerCards[1].origin = 'deck';

        set({
            deck: deckRef,
            playerHands,
            dealer: {
                cards: dealerCards,
                isRevealed: false,
                blackjackValue: getBlackjackScore([dealerCards[1]], get().inventory)
            },
            drawnCard: null,
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
            dealerVisible: true
        });

        // After animations complete (Dealer cards only now)
        setTimeout(() => {
            set({ isInitialDeal: false });
        }, 1500); // Reduced delay as there are fewer cards
    },

    drawCard: () => {
        const { deck, drawnCard, phase } = get();
        if (phase !== 'playing' || drawnCard) return;

        // Cancel double down if active
        set({ interactionMode: 'default' });

        const newDeck = [...deck];
        const card = newDeck.pop();
        if (!card) return;

        card.isFaceUp = true;
        card.origin = 'deck';
        set({ deck: newDeck, drawnCard: card });
    },

    startDoubleDown: () => {
        const { phase, drawnCard } = get();
        if (phase !== 'playing' || drawnCard) return;
        set({ interactionMode: 'double_down_select' });
    },

    cancelDoubleDown: () => {
        set({ interactionMode: 'default' });
    },

    confirmDoubleDown: (handIndex) => {
        const { playerHands, deck, interactionMode } = get();
        if (interactionMode !== 'double_down_select') return;

        const newDeck = [...deck];
        const card = newDeck.pop();
        if (!card) return; // Should handle empty deck?

        card.isFaceUp = true;
        card.origin = 'double_down';
        // Logic to mark card as doubled? Hand identifies it via isDoubled flag.

        const newHands = playerHands.map((h, idx) => {
            if (idx !== handIndex) return h;
            // Prevent if bust or held? UI should handle validation, but safety check:
            if (h.isBust || h.isHeld) return h;

            const newCards = [...h.cards, card];
            const val = getBlackjackScore(newCards, get().inventory);

            return {
                ...h,
                cards: newCards,
                blackjackValue: val,
                isBust: val > 21,
                isHeld: true, // Auto stand
                isDoubled: true
            };
        });

        set({
            playerHands: newHands,
            deck: newDeck,
            interactionMode: 'default'
        });

        // Auto-stand if all hands are unplayable
        const allUnplayable = newHands.every(h => h.isBust || h.isHeld || h.blackjackValue === 21);
        if (allUnplayable) {
            setTimeout(() => {
                get().holdReturns();
            }, 1000);
        }
    },

    assignCard: (handIndex) => {
        const { playerHands, drawnCard } = get();
        if (!drawnCard) return;

        const newHands = playerHands.map((h, idx) => {
            if (idx !== handIndex) return h;
            if (h.isBust || h.isHeld) return h;

            // Create a new hand object with the new card
            const cardToAdd = { ...drawnCard, origin: 'draw_pile' as const };
            const newCards = [...h.cards, cardToAdd];

            // Recalc Blackjack
            const val = getBlackjackScore(newCards, get().inventory);

            return {
                ...h,
                cards: newCards,
                blackjackValue: val,
                isBust: val > 21
            };
        });

        set({ playerHands: newHands, drawnCard: null });

        // Auto-stand if all hands are unplayable
        const allUnplayable = newHands.every(h => h.isBust || h.isHeld || h.blackjackValue === 21);
        if (allUnplayable) {
            setTimeout(() => {
                get().holdReturns();
            }, 1000);
        }
    },

    holdReturns: async (forceDealerBust = false) => {
        // Reset speed to normal at start of sequence
        set({ animationSpeed: 1 });

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

        const { dealer, deck } = get();

        // 1. Reveal Phase
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
        
        const revealVal = getBlackjackScore(revealedCards, get().inventory);
        set({
            dealer: {
                ...get().dealer,
                blackjackValue: revealVal
            }
        });

        const dDeck = [...deck];
        let dCards = revealedCards;
        let dVal = revealVal;

        // 2. Dealer Draw Loop
        const { inventory } = get();
        const baseStopValue = 17;
        const dealerStopValue = forceDealerBust ? 22 : RelicManager.executeValueHook('getDealerStopValue', baseStopValue, { inventory });
        while (dVal < dealerStopValue) {
            set({ dealerMessage: "Hit!", dealerMessageExiting: false });

            const c = dDeck.pop();
            if (!c) break;
            c.isFaceUp = true;
            c.origin = 'deck';
            const nextCards = [...dCards, c];
            const nextVal = getBlackjackScore(nextCards, get().inventory);

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
            if (selectedItem) {
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
        }
        
        // Clear shop and proceed to next casino setup
        set({ 
            inventory: newInventory, 
            shopItems: [],
            selectedShopItemId: null
        });

        // Trigger the actual Casino Transition now
        const { round, totalScore, targetScore, comps, handsRemaining } = get();
        
        const newRound = round + 1;
        const newTotalScore = totalScore - targetScore; // Carry over surplus score

        // Comps increase logic
        const currentHandsRemaining = handsRemaining;
        const newComps = (comps || 0) + (currentHandsRemaining * 5);

        let newTargetScore = targetScore;
        // Set target based on casino number
        newTargetScore = calculateTargetScore(newRound);

        const fullDeck = shuffleDeck(createStandardDeck()); // Always a fresh 52 cards for new casino

        const emptyHands: PlayerHand[] = Array.from({ length: INITIAL_HAND_COUNT }, (_, i) => ({
            id: i,
            cards: [],
            isHeld: false,
            isBust: false,
            blackjackValue: 0
        }));

        set({
            deck: fullDeck,
            playerHands: emptyHands,
            dealer: { cards: [], isRevealed: false, blackjackValue: 0 },
            phase: 'entering_casino', // Go to entry screen
            round: newRound,
            targetScore: newTargetScore,
            totalScore: newTotalScore,
            dealsTaken: 0,
            handsRemaining: RelicManager.executeValueHook('getDealsPerCasino', BASE_DEALS_PER_CASINO, { inventory: newInventory }),
            comps: newComps,
            discardPile: [],
            dealerMessage: null,
            runningSummary: null,
            roundSummary: null,
            allWinnersEnlarged: false,
            dealerVisible: true,
            // inventory updated above
        });
    },

    nextRound: (forceContinue = false) => {
        const currentState = get();
        const { deck, dealer, playerHands, totalScore, targetScore, round, comps, handsRemaining } = currentState;

        // Check if player reached the target score
        const hasReachedTarget = totalScore >= targetScore;

        if (!hasReachedTarget && handsRemaining <= 0 && !forceContinue) {
            set({ phase: 'game_over' });
            return;
        }

        if (hasReachedTarget && !forceContinue) {
            // GO TO GIFT SHOP PHASE
            // Generate 4 Charms, 2 Angles
            
            // Helper to get random items
            const getRandomItems = (count: number, category: string, excludeIds: string[]) => {
                 const allItems = RelicManager.getAllRelics().filter(r => r.categories.includes(category) && !excludeIds.includes(r.id));
                 // Also filter out things already in inventory if unique? Assuming unique for now.
                 const curIds = get().inventory.map(i => i.id);
                 const available = allItems.filter(r => !curIds.includes(r.id));
                 
                 const picked = [];
                 const pool = [...available];
                 for(let i=0; i<count; i++) {
                     if(pool.length === 0) break;
                     const idx = Math.floor(Math.random() * pool.length);
                     picked.push(pool.splice(idx, 1)[0]);
                 }
                 return picked.map(p => ({ id: p.id, type: category as 'Charm' | 'Angle' }));
            };
            
            const currentIds = get().inventory.map(i => i.id);
            const charms = getRandomItems(4, 'Charm', currentIds);
            const angles = getRandomItems(2, 'Angle', currentIds);
            
            set({
                shopItems: [...charms, ...angles],
                phase: 'gift_shop',
                // dealerVisible: false? Maybe? User said "Sign slides down where dealer hand usually is".
                // We'll handle visual hiding in the component or set dealerVisible to false.
                dealerVisible: false
            });
            // We do NOT reset the round yet. That happens in selectShopItem.
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
            drawnCard: null,
            phase: 'playing',
            dealsTaken: newDealsTaken,
            handsRemaining: newHandsRemaining,
            discardPile: newDiscardPile,
            isInitialDeal: true,
            runningSummary: null,
            roundSummary: null,
            allWinnersEnlarged: false,
            dealerVisible: true
        });

        // After animations complete
        setTimeout(() => {
            set({ isInitialDeal: false });
        }, 1500);
    },

    debugWin: async () => {
        const { phase, drawnCard, holdReturns } = get();
        if (phase !== 'playing') return;
        
        // If there's a drawn card, discard it first
        if (drawnCard) {
            get().debugUndo();
        }

        await holdReturns(true);
    },

    debugUndo: () => {
        const { phase, drawnCard, deck } = get();
        if (phase !== 'playing' || !drawnCard) return;

        drawnCard.isFaceUp = false;
        drawnCard.origin = undefined;

        set({
            drawnCard: null,
            deck: [...deck, drawnCard]
        });
    },

    drawSpecificCard: (suit, rank) => {
        const { deck, phase, drawnCard } = get();
        if (phase !== 'playing' || drawnCard) return;

        const cardIndex = deck.findIndex(c => c.suit === suit && c.rank === rank);
        if (cardIndex === -1) return;

        const newDeck = [...deck];
        const [card] = newDeck.splice(cardIndex, 1);
        
        card.isFaceUp = true;
        card.origin = 'deck';
        
        set({
            deck: newDeck,
            drawnCard: card,
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
    }
}));
