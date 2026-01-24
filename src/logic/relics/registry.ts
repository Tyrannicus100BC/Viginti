
import type { RelicConfig, RoundCompletionContext, HandCompletionContext, ScoreRowContext, HandContext } from './types';
import type { Card, HandScore } from '../../types';

// Helper to check for face cards (J, Q, K)
const isFaceCard = (c: Card) => ['J', 'Q', 'K'].includes(c.rank);

// Helper for counting ranks
const getRankCounts = (cards: Card[]) => {
    const counts: Record<string, number> = {};
    for (const c of cards) {
        counts[c.rank] = (counts[c.rank] || 0) + 1;
    }
    return counts;
};



export const RELIC_REGISTRY: Record<string, RelicConfig> = {
    'deft': {
        id: 'deft',
        name: 'Deft',
        category: 'JMarr',
        description: 'Extra draw per Casino',
        hooks: {
            getDealsPerCasino: (val: number) => val + 1
        },
        icon: '/relics/deft.png' 
    },
    'royalty': {
        id: 'royalty',
        name: 'Royalty',
        category: 'JMarr',
        properties: { amount: 10 },
        description: 'Hands with two [Face] cards earn $${amount}',
        hooks: {
            onHandCompletion: async (context: HandCompletionContext, relicState: any) => {
                const faceCards = context.handCards.filter(isFaceCard);
                if (faceCards.length >= 2) {
                    await context.highlightRelic('royalty', {
                        trigger: () => context.modifyRunningSummary(relicState.amount, 0)
                    });
                }
            }
        },
        icon: '/relics/royalty.png'
    },
    'joker': {
        id: 'joker',
        name: 'Joker',
        category: 'JMarr',
        description: '[Jacks] are worth 10 or 5',
        hooks: {
             // @ts-ignore
            adjustBlackjackScore: (currentScore: number, context: { handCards: Card[] }) => {
                let score = currentScore;
                if (score <= 21) return score;

                const jacks = context.handCards.filter(c => c.rank === 'J');
                let jacksCount = jacks.length;
                
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
        category: 'JMarr',
        description: 'Dealer hits on 16', 
        hooks: {
            getDealerStopValue: () => 16
        },
        icon: '/relics/idiot.png'
    },
    'flusher': {
        id: 'flusher',
        name: 'Flusher',
        category: 'JMarr',
        description: '[Flushes] earn an extra x1',
        hooks: {
            onEvaluateHandScore: (score: HandScore) => {
                let hasFlush = false;
                const updatedCriteria = score.criteria.map(c => {
                    if (c.id === 'flush') {
                        hasFlush = true;
                        const newMult = c.multiplier + 1;
                        const updatedMatches = c.matches?.map(m => ({ ...m, multiplier: m.multiplier + 1 }));
                        return { ...c, multiplier: newMult, matches: updatedMatches };
                    }
                    return c;
                });

                if (!hasFlush) return score;

                const totalChips = updatedCriteria.reduce((sum, crit) => sum + crit.chips, 0);
                const totalMultiplier = updatedCriteria.reduce((sum, crit) => sum + crit.multiplier, 0);

                return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier, finalScore: Math.floor(totalChips * totalMultiplier) };
            },
            onScoreRow: async (context: ScoreRowContext) => {
                if (context.criterionId === 'flush') {
                    await context.highlightRelic('flusher', { preDelay: 600 });
                }
            }
        },
        icon: '/relics/flusher.png'
    },
    'one_armed': {
        id: 'one_armed',
        name: 'One Armed',
        category: 'JMarr',
        description: 'Winning a single hand earns x2',
        hooks: {
            onRoundCompletion: async (context: RoundCompletionContext) => {
                if (context.wins === 1) {
                    const currentMult = context.runningSummary.mult;
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
        category: 'JMarr',
        properties: { amount: 10 },
        description: 'Winning all three hands earns $${amount}',
        hooks: {
             onRoundCompletion: async (context: RoundCompletionContext, relicState: any) => {
                 if (context.wins === 3) {
                     await context.highlightRelic('high_roller', {
                         trigger: () => context.modifyRunningSummary(relicState.amount, 0)
                     });
                 }
             }
        },
        icon: '/relics/high_roller.png'
    },
    
    // NEW RELICS
    
    'lucky_coin': {
        id: 'lucky_coin',
        name: 'Lucky Coin',
        category: 'Face',
        description: 'Having a [Pair] earns an extra $50',
        hooks: {
            onEvaluateHandScore: (score: HandScore) => {
                let changed = false;
                const updatedCriteria = score.criteria.map(c => {
                    if (c.id === 'pair') {
                        changed = true;
                        return { ...c, chips: c.chips + 50 };
                    }
                    return c;
                });
                if (!changed) return score;
                const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
                const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
                return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            }
        },
        icon: ''
    },
    'rabbit_foot': {
        id: 'rabbit_foot',
        name: 'Rabbit Foot',
        category: 'Face',
        description: 'Having a [Pair] earns an extra x8',
        hooks: {
            onEvaluateHandScore: (score: HandScore) => {
                let changed = false;
                const updatedCriteria = score.criteria.map(c => {
                    if (c.id === 'pair') {
                        changed = true;
                        return { ...c, multiplier: c.multiplier + 8 };
                    }
                    return c;
                });
                if (!changed) return score;
                const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
                const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
                return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            }
        },
        icon: ''
    },
    'bent_clip': {
        id: 'bent_clip',
        name: 'Bent Clip',
        category: 'Face',
        description: 'Hands with [Three of a Kind] earn x3',
        hooks: {
            onEvaluateHandScore: (score: HandScore, context: HandContext) => {
                const counts = getRankCounts(context.handCards);
                const hasThree = Object.values(counts).some(c => c >= 3);
                if (hasThree) {
                    // Add via a new criteria for visibility or modify total
                    // Since 3-of-a-kind isn't native, we append a custom criteria
                    const newCriteria = [...score.criteria, {
                        id: 'three_kind' as any,
                        name: 'Three of a Kind',
                        count: 1,
                        chips: 0,
                        multiplier: 3,
                        cardIds: []
                    }];
                    const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
                    const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
                    return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
                }
                return score;
            }
        },
        icon: ''
    },
    'horseshoe': {
        id: 'horseshoe',
        name: 'Horseshoe',
        category: 'Straight',
        description: 'Having a [Straight] earns an extra x12',
        hooks: {
            onEvaluateHandScore: (score: HandScore) => {
                let changed = false;
                const updatedCriteria = score.criteria.map(c => {
                    if (c.id === 'straight') {
                        changed = true;
                        return { ...c, multiplier: c.multiplier + 12 };
                    }
                    return c;
                });
                if (!changed) return score;
                const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
                const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
                return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            }
        },
        icon: ''
    },
    'red_string': {
        id: 'red_string',
        name: 'Red String',
        category: 'Straight',
        description: 'Having a [Straight] earns an extra $200',
        hooks: {
            onEvaluateHandScore: (score: HandScore) => {
                let changed = false;
                const updatedCriteria = score.criteria.map(c => {
                    if (c.id === 'straight') {
                        changed = true;
                        return { ...c, chips: c.chips + 200 };
                    }
                    return c;
                });
                if (!changed) return score;
                const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
                const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
                return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            }
        },
        icon: ''
    },
    'jade_charm': {
        id: 'jade_charm',
        name: 'Jade Charm',
        category: 'Straight',
        description: '[Straights] earn an extra x3',
        hooks: {
            onEvaluateHandScore: (score: HandScore) => {
                let changed = false;
                const updatedCriteria = score.criteria.map(c => {
                    if (c.id === 'straight') {
                        changed = true;
                        return { ...c, multiplier: c.multiplier + 3 };
                    }
                    return c;
                });
                if (!changed) return score;
                const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
                const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
                return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            }
        },
        icon: ''
    },
    'wishbone': {
        id: 'wishbone',
        name: 'Wishbone',
        category: 'Flush',
        description: 'Having a [Flush] earns an extra x10',
        hooks: {
            onEvaluateHandScore: (score: HandScore) => {
                let changed = false;
                const updatedCriteria = score.criteria.map(c => {
                    if (c.id === 'flush') {
                        changed = true;
                        return { ...c, multiplier: c.multiplier + 10 };
                    }
                    return c;
                });
                if (!changed) return score;
                const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
                const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
                return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            }
        },
        icon: ''
    },
    'ladybug': {
        id: 'ladybug',
        name: 'Ladybug',
        category: 'Flush',
        description: 'Having a [Flush] earns an extra $250',
        hooks: {
            onEvaluateHandScore: (score: HandScore) => {
                let changed = false;
                const updatedCriteria = score.criteria.map(c => {
                    if (c.id === 'flush') {
                        changed = true;
                        return { ...c, chips: c.chips + 250 };
                    }
                    return c;
                });
                if (!changed) return score;
                const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
                const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
                return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            }
        },
        icon: ''
    },
    'dice_pair': {
        id: 'dice_pair',
        name: 'Dice Pair',
        category: 'Flush',
        description: '[Flushes] earn an extra x2',
        hooks: {
            onEvaluateHandScore: (score: HandScore) => {
                let changed = false;
                const updatedCriteria = score.criteria.map(c => {
                    if (c.id === 'flush') {
                        changed = true;
                        return { ...c, multiplier: c.multiplier + 2 };
                    }
                    return c;
                });
                if (!changed) return score;
                const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
                const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
                return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            }
        },
        icon: ''
    },
    'old_receipt': {
        id: 'old_receipt',
        name: 'Old Receipt',
        category: 'Suite',
        description: '[Diamonds] earn an extra x3',
        hooks: {
            onEvaluateHandScore: (score: HandScore, context: HandContext) => {
                const count = context.handCards.filter(c => c.suit === 'diamonds').length;
                if (count > 0) {
                    const newCriteria = [...score.criteria, {
                        id: 'diamonds_bonus' as any,
                        name: 'Old Receipt',
                        count: count,
                        chips: 0,
                        multiplier: count * 3,
                        cardIds: []
                    }];
                    const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
                    const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
                    return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
                }
                return score;
            }
        },
        icon: ''
    },
    'lucky_rock': {
        id: 'lucky_rock',
        name: 'Lucky Rock',
        category: 'Suite',
        description: '[Hearts] earn an extra x3',
        hooks: {
            onEvaluateHandScore: (score: HandScore, context: HandContext) => {
                const count = context.handCards.filter(c => c.suit === 'hearts').length;
                if (count > 0) {
                    const newCriteria = [...score.criteria, {
                        id: 'hearts_bonus' as any,
                        name: 'Lucky Rock',
                        count: count,
                        chips: 0,
                        multiplier: count * 3,
                        cardIds: []
                    }];
                    const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
                    const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
                    return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
                }
                return score;
            }
        },
        icon: ''
    },
    'burnt_match': {
        id: 'burnt_match',
        name: 'Burnt Match',
        category: 'Suite',
        description: '[Clubs] earn an extra x3',
        hooks: {
            onEvaluateHandScore: (score: HandScore, context: HandContext) => {
                const count = context.handCards.filter(c => c.suit === 'clubs').length;
                if (count > 0) {
                    const newCriteria = [...score.criteria, {
                        id: 'clubs_bonus' as any,
                        name: 'Burnt Match',
                        count: count,
                        chips: 0,
                        multiplier: count * 3,
                        cardIds: []
                    }];
                    const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
                    const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
                    return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
                }
                return score;
            }
        },
        icon: ''
    },
    'lost_key': {
        id: 'lost_key',
        name: 'Lost Key',
        category: 'Suite',
        description: '[Spades] earn an extra x3',
        hooks: {
            onEvaluateHandScore: (score: HandScore, context: HandContext) => {
                const count = context.handCards.filter(c => c.suit === 'spades').length;
                if (count > 0) {
                    const newCriteria = [...score.criteria, {
                        id: 'spades_bonus' as any,
                        name: 'Lost Key',
                        count: count,
                        chips: 0,
                        multiplier: count * 3,
                        cardIds: []
                    }];
                    const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
                    const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
                    return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
                }
                return score;
            }
        },
        icon: ''
    },
    'pocket_rock': {
        id: 'pocket_rock',
        name: 'Pocket Rock',
        category: 'Hands',
        description: 'Hands with a single card earn an extra $100',
        hooks: {
            onEvaluateHandScore: (score: HandScore, context: HandContext) => {
                if (context.handCards.length === 1) {
                    const newCriteria = [...score.criteria, {
                        id: 'pocket_rock' as any,
                        name: 'Pocket Rock',
                        count: 1,
                        chips: 100,
                        multiplier: 0,
                        cardIds: []
                    }];
                    const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
                    const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
                    return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
                }
                return score;
            }
        },
        icon: ''
    },
    'feather': {
        id: 'feather',
        name: 'Feather',
        category: 'Hands',
        description: 'When all hands have the same number of cards, earn an extra $200',
        hooks: {
            onRoundCompletion: async (context: RoundCompletionContext) => {
                const hands = context.playerHands || [];
                if (hands.length === 0) return;
                const len = hands[0].cards.length;
                const allSame = hands.every((h: any) => h.cards.length === len);
                
                if (allSame) {
                    await context.highlightRelic('feather', {
                         trigger: () => context.modifyRunningSummary(200, 0)
                    });
                }
            }
        },
        icon: ''
    },
    'odd_sock': {
        id: 'odd_sock',
        name: 'Odd Sock',
        category: 'Hands',
        description: 'When all hands have two cards, earn an extra $200',
        hooks: {
            onRoundCompletion: async (context: RoundCompletionContext) => {
                const hands = context.playerHands || [];
                const allTwo = hands.length > 0 && hands.every((h: any) => h.cards.length === 2);
                
                if (allTwo) {
                    await context.highlightRelic('odd_sock', {
                         trigger: () => context.modifyRunningSummary(200, 0)
                    });
                }
            }
        },
        icon: ''
    },
    'star_bead': {
        id: 'star_bead',
        name: 'Star Bead',
        category: 'Specific',
        description: 'Each [9] earns an extra x9',
        hooks: {
            onEvaluateHandScore: (score: HandScore, context: HandContext) => {
                const count = context.handCards.filter(c => c.rank === '9').length;
                if (count > 0) {
                     const newCriteria = [...score.criteria, {
                        id: 'star_bead' as any,
                        name: 'Star Bead',
                        count: count,
                        chips: 0,
                        multiplier: count * 9,
                        cardIds: []
                    }];
                    const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
                    const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
                    return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
                }
                return score;
            }
        },
        icon: ''
    },
    'heart_button': {
        id: 'heart_button',
        name: 'Heart Button',
        category: 'Specific',
        description: 'Each [10] and [4] earns an extra x6',
        hooks: {
            onEvaluateHandScore: (score: HandScore, context: HandContext) => {
                const count = context.handCards.filter(c => c.rank === '10' || c.rank === '4').length;
                if (count > 0) {
                    const newCriteria = [...score.criteria, {
                         id: 'heart_button' as any,
                         name: 'Heart Button',
                         count: count,
                         chips: 0,
                         multiplier: count * 6,
                         cardIds: []
                     }];
                     const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
                     const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
                     return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
                }
                return score;
            }
        },
        icon: ''
    },
    'lucky_acorn': {
        id: 'lucky_acorn',
        name: 'Lucky Acorn',
        category: 'Specific',
        description: 'Each [King] earns an extra x10',
        hooks: {
            onEvaluateHandScore: (score: HandScore, context: HandContext) => {
                const count = context.handCards.filter(c => c.rank === 'K').length;
                if (count > 0) {
                     const newCriteria = [...score.criteria, {
                         id: 'lucky_acorn' as any,
                         name: 'Lucky Acorn',
                         count: count,
                         chips: 0,
                         multiplier: count * 10,
                         cardIds: []
                     }];
                     const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
                     const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
                     return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
                }
                return score;
            }
        },
        icon: ''
    },
    'faded_tag': {
        id: 'faded_tag',
        name: 'Faded Tag',
        category: 'Global',
        properties: { amount: 10 },
        description: 'Earn an extra x${amount}, but decays by x2 each round',
        hooks: {
             onRoundCompletion: async (context: RoundCompletionContext, relicState: any) => {
                 if (relicState.amount > 0) {
                     await context.highlightRelic('faded_tag', {
                         trigger: () => {
                             context.modifyRunningSummary(0, relicState.amount);
                             // Decay logic: divide by 2
                             relicState.amount = Math.floor(relicState.amount / 2);
                         }
                     });
                 }
             }
        },
        icon: ''
    },
    'mini_shoe': {
        id: 'mini_shoe',
        name: 'Mini Shoe',
        category: 'Global',
        description: 'Earn an extra $250',
        hooks: {
            onRoundCompletion: async (context: RoundCompletionContext) => {
                await context.highlightRelic('mini_shoe', {
                     trigger: () => context.modifyRunningSummary(250, 0)
                });
            }
        },
        icon: ''
    },
    'robe_slippers': {
        id: 'robe_slippers',
        name: 'Robe and Slippers Set',
        category: 'Global',
        description: 'Earn an extra x10',
        hooks: {
             onRoundCompletion: async (context: RoundCompletionContext) => {
                await context.highlightRelic('robe_slippers', {
                     trigger: () => context.modifyRunningSummary(0, 10)
                });
            }
        },
        icon: ''
    },
    'key_ring': {
        id: 'key_ring',
        name: 'Key Ring',
        category: 'Global',
        description: 'On final draw, earn x3',
        hooks: {
            onEvaluateHandScore: (score: HandScore, context: HandContext) => {
                if (context.handsRemaining === 0) {
                     const newCriteria = [...score.criteria, {
                         id: 'key_ring' as any,
                         name: 'Key Ring',
                         count: 1,
                         chips: 0,
                         multiplier: 3,
                         cardIds: []
                     }];
                     const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
                     const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
                     return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
                }
                return score;
            }
        },
        icon: ''
    },
};
