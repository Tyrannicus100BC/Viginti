import { create } from 'zustand';
import type { Card, DealerHand, PlayerHand, Suit, Rank } from '../types';
import { createStandardDeck, shuffleDeck } from '../logic/deck';
import { getBlackjackScore, evaluateHandScore } from '../logic/scoring';
import { calculateTargetScore } from '../logic/casinoConfig';
import { RelicManager } from '../logic/relics/manager';
// import type { RoundSummary } from '../logic/relics/types';

interface GameState {
    deck: Card[];
    dealer: DealerHand;
    playerHands: PlayerHand[];
    drawnCard: Card | null;
    phase: 'init' | 'entering_casino' | 'playing' | 'scoring' | 'round_over' | 'game_over';
    round: number;
    interactionMode: 'default' | 'double_down_select';
    totalScore: number;
    targetScore: number;
    comps: number;
    dealsTaken: number;
    handsRemaining: number;
    scoringHandIndex: number;
    isCollectingChips: boolean;
    // Aggregated Scoring State
    runningSummary: { chips: number; mult: number } | null;
    roundSummary: { totalChips: number; totalMult: number; finalScore: number } | null;
    discardPile: Card[];
    inventory: string[];
    activeRelicId: string | null;

    isInitialDeal: boolean;
    isShaking: boolean; // For >300 score celebration

    dealerMessageExiting: boolean;
    dealerMessage: string | null;

    // Actions
    startGame: () => void;
    dealFirstHand: () => void;
    drawCard: () => void;
    startDoubleDown: () => void;
    cancelDoubleDown: () => void;
    confirmDoubleDown: (handIndex: number) => void;
    assignCard: (handIndex: number) => void;
    holdReturns: (forceDealerBust?: boolean) => Promise<void>; // Async for pacing
    nextRound: (forceContinue?: boolean) => void;
    completeRoundEarly: () => void;
    startChipCollection: () => Promise<void>;
    chipCollectionComplete: () => void;

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
    isInitialDeal: true,
    isShaking: false,
    animationSpeed: 1,
    setAnimationSpeed: (speed) => set({ animationSpeed: speed }),

    incrementScore: (amount) => set(state => ({ totalScore: state.totalScore + amount })),

    triggerDebugChips: (() => {
        let debugTimer: ReturnType<typeof setTimeout> | null = null;
        return () => {
            const { targetScore } = get();
            const scoreToDrop = Math.ceil(targetScore / 3);

            if (debugTimer) clearTimeout(debugTimer);

            set({
                isCollectingChips: false,
                runningSummary: {
                    chips: scoreToDrop,
                    mult: 2
                }
            });

            // Auto collect after 1s
            debugTimer = setTimeout(() => {
                const { runningSummary, incrementScore } = get();
                if (runningSummary) {
                    const finalAmount = Math.floor(runningSummary.chips * runningSummary.mult);
                    incrementScore(finalAmount);
                }
                get().chipCollectionComplete();
                debugTimer = null;
            }, 1000);
        };
    })(),

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

    startGame: () => {
        const deck = shuffleDeck(createStandardDeck());

        // Reset to Casino 1 state but don't deal yet
        const emptyHands: PlayerHand[] = Array.from({ length: INITIAL_HAND_COUNT }, (_, i) => ({
            id: i,
            cards: [],
            isHeld: false,
            isBust: false,
            blackjackValue: 0
        }));

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
            inventory: [] // Reset runs clear inventory usually
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
            roundSummary: null
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
                const score = evaluateHandScore(h.cards, win, h.isDoubled, get().inventory);
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
            scoringHandIndex: -1
        });

        // Stagger reveal of player outcomes
        const currentHands = [...scoredHands];
        
        for (let i = 0; i < currentHands.length; i++) {
            const hand = currentHands[i];
            const isBustOrViginti = hand.isBust || hand.blackjackValue === 21;
            
            // Reveal this hand's result
            currentHands[i] = { ...hand, resultRevealed: true };
            set({ playerHands: [...currentHands] });

            // Pause only if we're showing a new label (Win/Loss)
            if (!isBustOrViginti && i < currentHands.length - 1) {
                await wait(400);
            }
        }

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

            // The wait time here should match the total time spent in Hand.tsx's animation loop
            let handDuration = 0; // initial from Hand.tsx
            for (const crit of scoreData.criteria) {
                // Hook for Sequence Interruption (Relics)
                await RelicManager.executeInterruptHook('onScoreRow', {
                     inventory: get().inventory,
                     criterionId: crit.id as any,
                     score: scoreData,
                     highlightRelic: async (relicId: string) => {
                         console.log('Relic Active:', relicId);
                         set({ activeRelicId: relicId });
                         await wait(250);
                         set({ activeRelicId: null });
                     }
                });

                handDuration += 400; // label reveal
                if (crit.matches && crit.matches.length > 0) {
                    handDuration += crit.matches.length * 600;
                } else {
                    handDuration += 500;
                }
                handDuration += 200; // transition
            }
            handDuration += 500; // Buffer for mult sum loop 
            
            await wait(handDuration);

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
             modifyRunningSummary: (c: number, m: number) => {
                  // Additive update
                  get().updateRunningSummary(c, m);
             },
            highlightRelic: async (id: string) => {
                console.log('Highlighting Relic:', id);
                set({ activeRelicId: id });
                await wait(750); // Visual pause for the effect (reduced from 1500)
                set({ activeRelicId: null });
            }
        });

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

        // Wait for the center animation to "pop in" before updating the HUD (popIn is 0.5s)
        await new Promise(resolve => setTimeout(resolve, 600));

        if (runningSummary) {
            const finalAmount = Math.floor(runningSummary.chips * runningSummary.mult);
            incrementScore(finalAmount);
        }
        // Wait long enough for the player to see the final sums before allowing next round
        await new Promise(resolve => setTimeout(resolve, 800));
        get().chipCollectionComplete();
    },

    chipCollectionComplete: () => {
        const { totalScore, targetScore, handsRemaining, roundSummary } = get();

        // Ensure roundSummary is cleared
        if (roundSummary) set({ roundSummary: null });

        const hasReachedTarget = totalScore >= targetScore;
        let nextPhase: 'round_over' | 'game_over' = 'round_over';

        if (!hasReachedTarget && handsRemaining <= 0) {
            nextPhase = 'game_over';
        }

        set({
            phase: nextPhase,
            isCollectingChips: false,
            scoringHandIndex: -1
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

    nextRound: (forceContinue = false) => {
        const currentState = get();
        const { deck, dealer, playerHands, totalScore, targetScore, round, comps } = currentState;

        // Check if player reached the target score
        const hasReachedTarget = totalScore >= targetScore;

        if (hasReachedTarget && !forceContinue) {
            // Advance to next casino
            const newRound = round + 1;
            const newTotalScore = totalScore - targetScore; // Carry over surplus score

            // Comps increase logic
            const currentHandsRemaining = currentState.handsRemaining;
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
                handsRemaining: RelicManager.executeValueHook('getDealsPerCasino', BASE_DEALS_PER_CASINO, { inventory: get().inventory }),
                comps: newComps,
                discardPile: [],
                dealerMessage: null,
                runningSummary: null,
                roundSummary: null
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
            drawnCard: null,
            phase: 'playing',
            dealsTaken: newDealsTaken,
            handsRemaining: newHandsRemaining,
            discardPile: newDiscardPile,
            isInitialDeal: true,
            runningSummary: null,
            roundSummary: null
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
            const newInventory = [...state.inventory, relicId];
            const dealsPerCasino = RelicManager.executeValueHook('getDealsPerCasino', BASE_DEALS_PER_CASINO, { inventory: newInventory });
            return {
                inventory: newInventory,
                handsRemaining: dealsPerCasino - state.dealsTaken
            };
        });
    },

    removeRelic: (relicId) => {
         set(state => {
            const newInventory = state.inventory.filter(id => id !== relicId);
            const dealsPerCasino = RelicManager.executeValueHook('getDealsPerCasino', BASE_DEALS_PER_CASINO, { inventory: newInventory });
            return {
                inventory: newInventory,
                handsRemaining: dealsPerCasino - state.dealsTaken
            };
        });
    }
}));
