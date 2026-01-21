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
  handsRemaining: number;
  scoringHandIndex: number;
  // Physics Scoring State
  scoringDetails: { handId: number; score: number; sourceId: string } | null;
  isCollectingChips: boolean;
  discardPile: Card[];

  isInitialDeal: boolean;
  
  dealerMessageExiting: boolean;
  dealerMessage: string | null;

  // Actions
  startGame: () => void;
  dealFirstHand: () => void;
  drawCard: () => void;
  assignCard: (handIndex: number) => void;
  holdReturns: () => Promise<void>; // Async for pacing
  nextRound: () => void;
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
  handsRemaining: 3,
  scoringHandIndex: -1, 
  scoringDetails: null,
  isCollectingChips: false,
  discardPile: [],
  isInitialDeal: true,
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
        const card = deckRef.pop()!;
        card.isFaceUp = true;
        card.origin = 'deck';
        playerHands.push({
            id: i,
            cards: [card],
            isHeld: false,
            isBust: false,
            blackjackValue: getBlackjackScore([card])
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
    
    // After animations complete (3 player cards + 2 dealer cards, staggered)
    setTimeout(() => {
        set({ isInitialDeal: false });
    }, 2000);
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
    
    // 4. Score Logic
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

    set({ 
      dealer: { ...dealer, isRevealed: true, cards: dCards, blackjackValue: dVal }, 
      deck: dDeck, 
      playerHands: scoredHands, 
      phase: 'scoring',
      scoringHandIndex: -1 
    });


    // 5. Animation Sequence
    let animatingHands = [...scoredHands];
    
    for (let i = 0; i < animatingHands.length; i++) {
        if (animatingHands[i].isBust) continue;

        // A. Highlight Hand
        set({ scoringHandIndex: i });
        await wait(420); // Reduced from 600

        // B. Reveal Result
        animatingHands = animatingHands.map((h, idx) => idx === i ? { ...h, resultRevealed: true } : h);
        set({ playerHands: animatingHands });
        
        const hand = animatingHands[i];
        const scoreData = hand.finalScore;
        const isWin = !!scoreData;
        const criteriaCount = scoreData?.criteria?.length || 0;
        // Animation timing:
        // Initial: 300
        // Chips Phase: criteriaCount * (100 + 400) = N * 500
        // Pre-Mult: 200
        // Mult Reveal: 300
        // Mult Phase: criteriaCount * (100 + 400) = N * 500
        // Post Mult: 400
        // Finalize: 500
        // Buffer: 200
        // Total Base: 300 + 200 + 300 + 400 + 500 + 200 = 1900ms
        // Total Per Item: 1000ms
        const animationDuration = isWin 
            ? 1900 + (criteriaCount * 1000)
            : 700; 

        await wait(animationDuration);
        
        if (isWin && scoreData) {
            // Trigger Physics Chips to Pot
            set({ 
                scoringDetails: { 
                    handId: hand.id, 
                    score: scoreData.finalScore, 
                    sourceId: `hand-score-${hand.id}` 
                } 
            });
            
            // Wait for spawning to finish
            await wait(105); // Reduced from 150
            // Clear trigger so it doesn't re-fire, but the chips stay in the pot
            set({ scoringDetails: null });
            
            // Wait a bit more for physics to settle visibly
            await wait(560); // Reduced from 800
        }
    }
    
    // All hands scored. Trigger collection phase.
    set({ scoringHandIndex: -1 });
    
    // Check if there are any winnings to collect
    const totalWinnings = animatingHands.reduce((acc, h) => acc + (h.finalScore?.finalScore || 0), 0);
    
    if (totalWinnings > 0) {
        // Wait 1.4s after last chips were dropped (indicated by loop finishing)
        await wait(1400);
        set({ isCollectingChips: true });
        // The PhysicsPot will callback chipCollectionComplete when done
    } else {
        // No winnings, skip collection
        get().chipCollectionComplete();
    }
  },

  chipCollectionComplete: () => {
      const { playerHands, totalScore, targetScore, handsRemaining } = get();
      
      const totalWinnings = playerHands.reduce((acc, h) => acc + (h.finalScore?.finalScore || 0), 0);
      const newTotalScore = totalScore + totalWinnings;
      
      const hasReachedTarget = newTotalScore >= targetScore;
      let nextPhase: 'round_over' | 'game_over' = 'round_over';
      
      if (!hasReachedTarget && handsRemaining <= 0) {
          nextPhase = 'game_over';
      }

      set({ 
          // totalScore: newTotalScore, // Now handled incrementally
          phase: nextPhase,
          isCollectingChips: false,
          scoringHandIndex: -1,
          scoringDetails: null
      });
  },

  nextRound: () => {
      const currentState = get();
      const { deck, dealer, playerHands, totalScore, targetScore, round } = currentState;
      
      // Check if player reached the target score
      const hasReachedTarget = totalScore >= targetScore;
      
      if (hasReachedTarget) {
           // Advance to next casino
          const newRound = round + 1;
          const newTotalScore = 0; // Reset score for new casino
          const newHandsRemaining = 3; // Reset hands for new casino
          
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

        // Deal 3 hands
        for (let i = 0; i < INITIAL_HAND_COUNT; i++) {
            const card = deckRef.pop()!;
            card.isFaceUp = true;
            card.origin = 'deck';
            newHands.push({
                id: i,
                cards: [card],
                isHeld: false,
                isBust: false,
                blackjackValue: getBlackjackScore([card])
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
        }, 2000);
  }
}));
