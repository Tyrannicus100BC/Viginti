
import type { RelicConfig, RelicHooks, RoundSummary, HandContext, RoundContext, GameContext, RoundCompletionContext, HandCompletionContext, ScoreRowContext } from './types';
import type { Card, HandScore } from '../../types';

// Helper to check for face cards (J, Q, K) - Ace is usually not a face card in BJ context unless specified
const isFaceCard = (c: Card) => ['J', 'Q', 'K'].includes(c.rank);

export const RELIC_REGISTRY: Record<string, RelicConfig> = {
    'deft': {
        id: 'deft',
        name: 'Deft',
        description: 'Extra draw per casino', // Interpreted as handsRemaining starts at 4? Or 1 extra draw action? 
        // User request: "1 extra draw per casino". In GameStore, we have `handsRemaining: 3`. 
        // So this means starting with 4 hands? Or drawing an extra card?
        // "Number of Draws a player gets per casino" -> The variable is `handsRemaining`.
        hooks: {
            getDealsPerCasino: (val: number) => val + 1
        },
        icon: '/relics/deft.png' 
    },
    'royalty': {
        id: 'royalty',
        name: 'Royalty',
        description: 'Hands with two face cards earn $10',
        hooks: {
            onHandCompletion: async (context: HandCompletionContext) => {
                const faceCards = context.handCards.filter(isFaceCard);
                if (faceCards.length >= 2) {
                    await context.highlightRelic('royalty', {
                        trigger: () => context.modifyRunningSummary(10, 0)
                    });
                }
            }
        },
        icon: '/relics/royalty.png'
    },
    'joker': {
        id: 'joker',
        name: 'Joker',
        description: 'Jack are worth 10 or 5',
        hooks: {
            // We need a specific hook for blackjack calculation adjustment
            // Since we don't have it in types yet, I will use a custom one and add it to types in next step if needed
            // But I defined `getCardValue` in types. 
            // However, 5/10 logic needs state (is the hand busting?).
            // I will implement a `adjustBlackjackScore` hook in types.ts in a bit.
            // For now, I'll put the placeholder here.
             // @ts-ignore
            adjustBlackjackScore: (currentScore: number, context: { handCards: Card[] }) => {
                let score = currentScore;
                if (score <= 21) return score;

                const jacks = context.handCards.filter(c => c.rank === 'J');
                let jacksCount = jacks.length;
                
                // Reduce 5 for each Jack until <= 21 or out of Jacks
                // (Jack is 10. If we treat as 5, we subtract 5).
                while (score > 21 && jacksCount > 0) {
                    score -= 5;
                    jacksCount--;
                }
                return score;
            }
        },
        icon: '/relics/joker.png'
    },
    'idiot': {
        id: 'idiot',
        name: 'Idiot',
        description: 'Dealer hits on 16', 
        // Standard is Stand on 17 (Hit 16).
        // If "Idiot" means easier, maybe he Stands on 16 (Hit 15)?
        // Or if "Dealer hits on 16" is the text, and normal is Hit 16...
        // Maybe normal is "Stands on Soft 17"?
        // I will assume this changes the Stop Value to 16? 
        // If Stop Value is 16, he hits on 15, stands on 16.
        // This makes it easier for player (dealer scores lower).
        hooks: {
            getDealerStopValue: () => 16
        },
        icon: '/relics/idiot.png'
    },
    'flusher': {
        id: 'flusher',
        name: 'Flusher',
        description: 'Flushes earn an extra x1',
        hooks: {
            onEvaluateHandScore: (score: HandScore) => {
                let hasFlush = false;
                const updatedCriteria = score.criteria.map(c => {
                    if (c.id === 'flush') {
                        hasFlush = true;
                        const newMult = c.multiplier + 1; // Add 1.0 to making it 1.5 (base 0.5 + 1.0)
                        
                        // Also update matches if they exist, as Hand.tsx uses them for sequential scoring
                        const updatedMatches = c.matches?.map(m => ({
                            ...m,
                            multiplier: m.multiplier + 1
                        }));

                        return {
                            ...c,
                            multiplier: newMult,
                            matches: updatedMatches
                        };
                    }
                    return c;
                });

                if (!hasFlush) return score;

                // Re-calculate totals
                const totalChips = updatedCriteria.reduce((sum, crit) => sum + crit.chips, 0);
                const totalMultiplier = updatedCriteria.reduce((sum, crit) => sum + crit.multiplier, 0);

                return {
                    ...score,
                    criteria: updatedCriteria,
                    totalChips,
                    totalMultiplier,
                    finalScore: Math.floor(totalChips * totalMultiplier)
                };
            },
            onScoreRow: async (context: ScoreRowContext) => {
                if (context.criterionId === 'flush') {
                    // Start highlighting after a small delay to match the multiplier appearing in Hand.tsx
                    // Hand.tsx reveals row at 0ms, wait 400ms for label, then 200ms for chips, then shows mult.
                    // So mult appears at roughly 600ms.
                    await context.highlightRelic('flusher', { preDelay: 600 });
                }
            }
        },
        icon: '/relics/flusher.png'
    },
    'one_armed': {
        id: 'one_armed',
        name: 'One Armed',
        description: 'Winning a single hand earns x2',
        hooks: {
            onRoundCompletion: async (context: RoundCompletionContext) => {
                if (context.wins === 1) {
                    const currentMult = context.runningSummary.mult;
                    // "Worth x2" -> Double the final score by adding the current multiplier to the pot.
                    await context.highlightRelic('one_armed', {
                        trigger: () => context.modifyRunningSummary(0, currentMult > 0 ? currentMult : 1)
                    });
                }
            }
        },
        icon: '/relics/one_armed.png'
    },
    'high_roller': {
        id: 'high_roller',
        name: 'High Roller',
        description: 'Winning all three hands earns $10',
        hooks: {
             onRoundCompletion: async (context: RoundCompletionContext) => {
                 if (context.wins === 3) {
                     await context.highlightRelic('high_roller', {
                         trigger: () => context.modifyRunningSummary(10, 0)
                     });
                 }
             }
        },
        icon: '/relics/high_roller.png'
    }
};
