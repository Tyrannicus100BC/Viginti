import { create } from 'zustand';
import type { Card, DealerHand, PlayerHand } from '../types';
import { createStandardDeck, shuffleDeck } from '../logic/deck';
import { getBlackjackScore, evaluateHandScore } from '../logic/scoring';
import { calculateTargetScore } from '../logic/casinoConfig';

interface GameState {
    deck: Card[];
    dealer: DealerHand;
    playerHands: PlayerHand[];
    drawnCard: Card | null;
    phase: 'init' | 'entering_casino' | 'playing' | 'scoring' | 'round_over' | 'game_over';
    round: number;
    totalScore: number;
    targetScore: number;
    comps: number;
    handsRemaining: number;
    scoringHandIndex: number;
    // Physics Scoring State
    scoringDetails: { handId: number; score: number; sourceId: string } | null;
    isCollectingChips: boolean;
    // Aggregated Scoring State
    runningSummary: { chips: number; mult: number } | null;
    roundSummary: { totalChips: number; totalMult: number; finalScore: number } | null;
    showFinalScore: boolean;
    discardPile: Card[];

    isInitialDeal: boolean;
    isShaking: boolean; // For >300 score celebration

    dealerMessageExiting: boolean;
    dealerMessage: string | null;

    // Actions
    startGame: () => void;
    dealFirstHand: () => void;
    drawCard: () => void;
    assignCard: (handIndex: number) => void;
    holdReturns: () => Promise<void>; // Async for pacing
    nextRound: (forceContinue?: boolean) => void;
    completeRoundEarly: () => void;
    continueFromFinalScore: () => void;
    chipCollectionComplete: () => void;

    animationSpeed: number;
    setAnimationSpeed: (speed: number) => void;
    incrementScore: (amount: number) => void;
    triggerDebugChips: () => void;
}

const INITIAL_HAND_COUNT = 3;

export const useGameStore = create<GameState>((set, get) => ({
    deck: [],
    dealer: { cards: [], isRevealed: false, blackjackValue: 0 },
    playerHands: [],
    drawnCard: null,
    dealerMessage: null,
    dealerMessageExiting: false,
    phase: 'init',
    round: 1,
    totalScore: 0,
    targetScore: calculateTargetScore(1),
    comps: 5,
    handsRemaining: 3,
    scoringHandIndex: -1,
    scoringDetails: null,
    isCollectingChips: false,
    runningSummary: null,
    roundSummary: null,
    showFinalScore: false,
    discardPile: [],
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

            // Clear any existing timer to reset the 1.4s countdown
            if (debugTimer) clearTimeout(debugTimer);

            set({
                isCollectingChips: false, // Ensure we aren't already collecting
                scoringDetails: {
                    handId: -99,
                    score: scoreToDrop,
                    sourceId: 'debug-button'
                }
            });

            // Clear details after tiny delay so physics triggers but doesn't loop
            setTimeout(() => set({ scoringDetails: null }), 100);

            // Auto collect after 1.4s
            debugTimer = setTimeout(() => {
                set({ isCollectingChips: true });
                debugTimer = null;
            }, 1400);
        };
    })(),

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
            handsRemaining: 3,
            round: 1,
            discardPile: [],
            isInitialDeal: true
        });
    },

    dealFirstHand: () => {
        const { deck, round, targetScore, handsRemaining, totalScore } = get();

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
                blackjackValue: getBlackjackScore([dealerCards[1]])
            },
            drawnCard: null,
            phase: 'playing',
            isInitialDeal: true,
            // Ensure stats are preserved/set (should be set by startGame/nextRound already)
            round,
            targetScore,
            handsRemaining: handsRemaining - 1,
            totalScore
        });

        // After animations complete (Dealer cards only now)
        setTimeout(() => {
            set({ isInitialDeal: false });
        }, 1500); // Reduced delay as there are fewer cards
    },

    drawCard: () => {
        const { deck, drawnCard, phase } = get();
        if (phase !== 'playing' || drawnCard) return;

        const newDeck = [...deck];
        const card = newDeck.pop();
        if (!card) return;

        card.isFaceUp = true;
        card.origin = 'deck';
        set({ deck: newDeck, drawnCard: card });
    },

    assignCard: (handIndex) => {
        const { playerHands, drawnCard } = get();
        if (!drawnCard) return;

        const newHands = playerHands.map((h, idx) => {
            if (idx !== handIndex) return h;
            if (h.isBust) return h;

            // Create a new hand object with the new card
            const cardToAdd = { ...drawnCard, origin: 'draw_pile' as const };
            const newCards = [...h.cards, cardToAdd];

            // Recalc Blackjack
            const val = getBlackjackScore(newCards);

            return {
                ...h,
                cards: newCards,
                blackjackValue: val,
                isBust: val > 21
            };
        });

        set({ playerHands: newHands, drawnCard: null });
    },

    holdReturns: async () => {
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
        const newDealer = { ...dealer, isRevealed: true };
        newDealer.cards[0].isFaceUp = true;
        newDealer.blackjackValue = getBlackjackScore(newDealer.cards);
        set({ dealer: newDealer });
        await wait(650);

        const dDeck = [...deck];
        let dCards = [...newDealer.cards];
        let dVal = newDealer.blackjackValue;

        // 2. Dealer Draw Loop
        while (dVal < 17) {
            set({ dealerMessage: "Hit!", dealerMessageExiting: false });

            const c = dDeck.pop();
            if (!c) break;
            c.isFaceUp = true;
            c.origin = 'deck';
            dCards = [...dCards, c];
            dVal = getBlackjackScore(dCards);

            set({
                deck: dDeck,
                dealer: { ...dealer, isRevealed: true, cards: dCards, blackjackValue: dVal }
            });

            await wait(550);
            set({ dealerMessageExiting: true });
            await wait(200);
            set({ dealerMessage: null, dealerMessageExiting: false });
        }

        await wait(300);

        // 3. Final Result Message
        if (dVal < 21) {
            set({ dealerMessage: "Stand!", dealerMessageExiting: false });
            await wait(1000);
            set({ dealerMessageExiting: true });
            await wait(200);
            set({ dealerMessage: null, dealerMessageExiting: false });
        }

        // 4. Score Logic And Aggregation
        const { playerHands } = get();

        const scoredHands = playerHands.map((h) => {
            let win = false;
            if (h.isBust) win = false;
            else if (h.blackjackValue === 21) win = true;
            else if (dVal > 21) win = true;
            else if (h.blackjackValue >= dVal) win = true;
            else win = false;

            if (win) {
                const score = evaluateHandScore(h.cards, win);
                return { ...h, finalScore: score, resultRevealed: false };
            } else {
                return { ...h, finalScore: null, resultRevealed: false };
            }
        });

        // Calculate Totals for Aggregation
        const wins = scoredHands.filter(h => h.finalScore);
        const totalRoundChips = wins.reduce((acc, h) => acc + (h.finalScore?.totalChips || 0), 0);
        const totalRoundMult = wins.reduce((acc, h) => acc + (h.finalScore?.totalMultiplier || 0), 0);
        const finalRoundScore = Math.floor(totalRoundChips * totalRoundMult);

        // Reveal Dealer and All Player Outcomes Immediately
        const revealedHands = scoredHands.map(h => ({ ...h, resultRevealed: true }));

        set({
            dealer: { ...dealer, isRevealed: true, cards: dCards, blackjackValue: dVal },
            deck: dDeck,
            playerHands: revealedHands,
            phase: 'scoring',
            scoringHandIndex: -1
        });

        // Allow user to digest outcomes before scoring starts
        await wait(1500);

        set({ runningSummary: { chips: 0, mult: 0 } });

        // 5. Animation Sequence (Reveal Chips/Mults per hand)
        // Use revealedHands to keep consistency
        let animatingHands = [...revealedHands];

        // Track running totals locally for state updates
        let currentTotalChips = 0;
        let currentTotalMult = 0;

        for (let i = 0; i < animatingHands.length; i++) {
            if (animatingHands[i].isBust) continue;

            const hand = animatingHands[i];
            const scoreData = hand.finalScore;

            // Highlight Hand to indicate scoring focus
            set({ scoringHandIndex: i });

            // Increment Running Totals if it's a win
            if (scoreData) {
                currentTotalChips += scoreData.totalChips;
                currentTotalMult += scoreData.totalMultiplier;

                // Update state for UI to show growing score
                set({ runningSummary: { chips: currentTotalChips, mult: currentTotalMult } });
            }

            const criteriaCount = scoreData?.criteria?.length || 0;
            const animationDuration = 500 + (criteriaCount * 1200);

            await wait(animationDuration);

            set({ scoringHandIndex: -1 });
            await wait(180);
        }

        // 6. Round Aggregation & Transition
        if (finalRoundScore > 0) {
            set({
                roundSummary: {
                    totalChips: totalRoundChips,
                    totalMult: totalRoundMult,
                    finalScore: finalRoundScore
                },
                showFinalScore: true
            });

            // Note: We wait for user interaction or auto-timeout in the UI/App.tsx 
            // to trigger continueFromFinalScore
        } else {
            get().chipCollectionComplete();
        }
    },

    continueFromFinalScore: async () => {
        const { roundSummary } = get();
        set({ showFinalScore: false, roundSummary: null });

        // Trigger Physics Collection from center
        const score = roundSummary?.finalScore || 0;
        set({
            scoringDetails: {
                handId: -99, // General aggregation source
                score: score,
                sourceId: 'total-score-display'
            }
        });

        // Wait for spawning
        await new Promise(resolve => setTimeout(resolve, 200));
        set({ scoringDetails: null });

        // Wait for physics to settle then Collect
        await new Promise(resolve => setTimeout(resolve, 1400));
        set({ isCollectingChips: true });
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
            scoringHandIndex: -1,
            scoringDetails: null,
            roundSummary: null,
            runningSummary: null
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
            const newHandsRemaining = 3; // Reset hands for new casino

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
                handsRemaining: newHandsRemaining,
                comps: newComps,
                discardPile: [],
                dealerMessage: null
            });
            return;
        }

        // Decrement deals when dealing a new hand (and not advancing casino)
        const newHandsRemaining = currentState.handsRemaining - 1;

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
                blackjackValue: getBlackjackScore([dealerCards[1]])
            },
            drawnCard: null,
            phase: 'playing',
            handsRemaining: newHandsRemaining,
            discardPile: newDiscardPile,
            isInitialDeal: true
        });

        // After animations complete
        setTimeout(() => {
            set({ isInitialDeal: false });
        }, 1500);
    }
}));
