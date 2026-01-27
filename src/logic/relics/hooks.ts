
import { withPriority, type RoundCompletionContext, type HandCompletionContext, type ScoreRowContext, type HandContext, type GameContext, type HandBustContext } from './types';
import type { Card, HandScore } from '../../types';
import { findMatches, POKER_ORDER, SCORING_RULES, RANK_VALUES } from '../rules';

// Helpers
const isFaceCard = (c: Card) => ['J', 'Q', 'K'].includes(c.rank);

const getRankCounts = (cards: Card[]) => {
    const counts: Record<string, number> = {};
    for (const c of cards) {
        counts[c.rank] = (counts[c.rank] || 0) + 1;
    }
    return counts;
};


// Generic Group Finder
// Generic Group Finder
const getStandardScore = (cards: Card[], baseChips: number, baseMult: number, isRun: boolean, runParams?: { chipRun?: number, multRun?: number }, chipCards: boolean = false) => {
    const cardChips = chipCards ? cards.reduce((s, c) => s + RANK_VALUES[c.rank], 0) : 0;
    let finalChips = cardChips + baseChips;
    let finalMult = baseMult;

    if (isRun && runParams && cards.length > 1) {
        const extras = cards.length - 1;
        finalChips += extras * (runParams.chipRun || 0);
        finalMult += extras * (runParams.multRun || 0);
    }
    
    return { chips: finalChips, mult: finalMult };
};

const findBestGroup = (cards: Card[], type: 'rank' | 'flush' | 'straight', fixedLen: number): Card[] | null => {
    let candidates: Card[][] = [];

    if (type === 'rank') {
        const counts = getRankCounts(cards);
        Object.keys(counts).forEach(rank => {
            const group = cards.filter(c => c.rank === rank)
                               .sort((a, b) => POKER_ORDER[b.rank] - POKER_ORDER[a.rank]); // Sort desc just in case
            if (fixedLen > 0) {
               if (group.length >= fixedLen) {
                   // Take top N
                   candidates.push(group.slice(0, fixedLen));
               }
            } else {
               if (group.length >= 2) {
                   candidates.push(group);
               }
            }
        });
    } else if (type === 'flush') {
        const suits: Record<string, Card[]> = {};
        cards.forEach(c => {
            if (!suits[c.suit]) suits[c.suit] = [];
            suits[c.suit].push(c);
        });
        
        Object.values(suits).forEach(group => {
            // Sort by value desc for subsetting
            group.sort((a, b) => POKER_ORDER[b.rank] - POKER_ORDER[a.rank]);
            
            if (fixedLen > 0) {
                if (group.length >= fixedLen) {
                     candidates.push(group.slice(0, fixedLen));
                }
            } else {
                if (group.length >= 2) {
                    candidates.push(group);
                }
            }
        });
    } else if (type === 'straight') {
        const getRuns = (cardList: Card[], useLowAce: boolean) => {
            const getOrderVal = (c: Card) => (useLowAce && c.rank === 'A') ? 1 : POKER_ORDER[c.rank];
            const sorted = [...cardList].sort((a, b) => getOrderVal(a) - getOrderVal(b));
            
            let localCandidates: Card[][] = [];
            if (sorted.length === 0) return localCandidates;

            const pushCandidate = (run: Card[]) => {
                if (run.length >= (fixedLen || 2)) {
                    if (fixedLen > 0) {
                        // Find the best sub-run of exactly fixedLen by maximizing chips
                        let bestSub: Card[] = [];
                        let maxChips = -1;
                        for (let start = 0; start <= run.length - fixedLen; start++) {
                            const sub = run.slice(start, start + fixedLen);
                            const chips = sub.reduce((s, c) => s + RANK_VALUES[c.rank], 0);
                            if (chips > maxChips) {
                                maxChips = chips;
                                bestSub = sub;
                            }
                        }
                        localCandidates.push(bestSub);
                    } else {
                        localCandidates.push([...run]);
                    }
                }
            };

            let currentRun: Card[] = [sorted[0]];
            for (let i = 1; i < sorted.length; i++) {
                const prev = currentRun[currentRun.length - 1];
                const curr = sorted[i];
                const pVal = getOrderVal(prev);
                const cVal = getOrderVal(curr);

                if (cVal === pVal + 1) {
                    currentRun.push(curr);
                } else if (cVal === pVal) {
                    continue;
                } else {
                    pushCandidate(currentRun);
                    currentRun = [curr];
                }
            }
            pushCandidate(currentRun);
            return localCandidates;
        };

        // Standard candidates (Ace = 14)
        candidates.push(...getRuns(cards, false));

        // Ace-low candidates (Ace = 1)
        if (cards.some(c => c.rank === 'A')) {
            candidates.push(...getRuns(cards, true));
        }
    }

    if (candidates.length === 0) return null;

    // Sort candidates
    // 1. Length (Desc)
    // 2. Sum Chips (Desc)
    candidates.sort((a, b) => {
        if (a.length !== b.length) return b.length - a.length;
        const sumA = a.reduce((s, c) => s + RANK_VALUES[c.rank], 0);
        const sumB = b.reduce((s, c) => s + RANK_VALUES[c.rank], 0);
        return sumB - sumA;
    });

    return candidates[0];
};

const evaluateStandardRelic = (score: HandScore, context: HandContext, type: 'rank' | 'flush' | 'straight', fixedLen: number, relicState?: any, config?: any) => {
    const bestGroup = findBestGroup(context.handCards, type, fixedLen);
    if (bestGroup) {
         const isRun = fixedLen === 0;
         let id = `${type}_${isRun ? 'run' : (fixedLen === 2 ? 'pair' : 'triple')}`;
         
         // Use handType definition as source of truth for base values
         const baseChips = config?.handType?.chips ?? 0;
         const baseMult = config?.handType?.mult ?? 0;
         const chipCards = config?.handType?.chipCards || false;
         
         const runParams = isRun ? {
             chipRun: config?.handType?.chipRun,
             multRun: config?.handType?.multRun
         } : undefined;

         const { chips, mult } = getStandardScore(bestGroup, baseChips, baseMult, isRun, runParams, chipCards);
         
         const newCriteria = [...score.criteria, {
             id: id as any,
             name: id.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
             count: 1,
             chips: chips,
             multiplier: mult,
             cardIds: bestGroup.map(c => c.id)
         }];
         
         const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
         const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
         return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
    }
    return score;
}

const createCategoryBonusHook = (categoryPrefix: string, type: 'mult' | 'chips') => ({
    onEvaluateHandScore: (score: HandScore, _context: HandContext, relicState: any, _config: any) => {
        let changed = false;
        const updatedCriteria = score.criteria.map(c => {
            const isMatch = (
                c.id === categoryPrefix || 
                c.id.startsWith(categoryPrefix + '_') || 
                (categoryPrefix === 'rank' && (c.id === 'pair' || c.id === 'three_kind'))
            );

            if (isMatch) {
                changed = true;
                const val = type === 'mult' ? relicState.bonus_mult : relicState.bonus_chips;
                if (type === 'mult') {
                    const newMult = c.multiplier + val;
                    const updatedMatches = c.matches?.map(m => ({ ...m, multiplier: m.multiplier + val }));
                    return { ...c, multiplier: newMult, matches: updatedMatches };
                } else {
                    const newChips = c.chips + val;
                    return { ...c, chips: newChips };
                }
            }
            return c;
        });

        if (!changed) return score;

        const totalChips = updatedCriteria.reduce((sum, crit) => sum + crit.chips, 0);
        const totalMultiplier = updatedCriteria.reduce((sum, crit) => sum + crit.multiplier, 0);

        return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMultiplier, finalScore: Math.floor(totalChips * totalMultiplier) };
    },
    onScoreRow: async (context: ScoreRowContext, _relicState: any, config: any) => {
        const isMatch = (
            context.criterionId === categoryPrefix || 
            context.criterionId.startsWith(categoryPrefix + '_') || 
            (categoryPrefix === 'rank' && (context.criterionId === 'pair' || context.criterionId === 'three_kind'))
        );

        if (isMatch) {
            const relicId = config?.id || `${categoryPrefix}_${type}`;
            await context.highlightRelic(relicId, { preDelay: 600 });
        }
    }
});

const createSuitBonusHook = (suit: string) => ({
    onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, config: any) => {
        const relicId = config?.id;
        let changed = false;
        const updatedCriteria = score.criteria.map(c => {
            const isChipCards = /^(rank|flush|straight|double_down)/.test(c.id);

            if (isChipCards && c.cardIds && c.cardIds.length > 0) {
                 const cards = context.handCards.filter(card => c.cardIds.includes(card.id));
                 const suitCount = cards.filter(card => card.suit.toLowerCase() === suit.toLowerCase()).length;
                 
                 if (suitCount > 0) {
                     changed = true;
                     const bonus = suitCount * relicState.bonus_chips;
                     
                     const cAny = c as any;
                     const boostedBy = cAny.boostedBy || [];
                     if (relicId && !boostedBy.includes(relicId)) {
                        return { 
                             ...c, 
                             chips: c.chips + bonus,
                             boostedBy: [...boostedBy, relicId]
                        } as any;
                     }
                     
                     return { ...c, chips: c.chips + bonus };
                 }
            }
            return c;
        });

        if (!changed) return score;
        const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
        const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
        return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
    },
    
    onScoreRow: async (context: ScoreRowContext, _relicState: any, config: any) => {
        const relicId = config?.id;
        if (!relicId) return;
        const crit = context.score.criteria.find(c => c.id === context.criterionId) as any;
        if (crit && crit.boostedBy && crit.boostedBy.includes(relicId)) {
            // Highlight!
            // The user wants: "default chip value ... first, then ... highlight and ... increase"
            // Since the value is already increased in the score, we can't easily show "default first".
            // But we can highlight to show WHY it is high.
            await context.highlightRelic(relicId, { preDelay: 200 }); 
        }
    }
});

export const Hooks = {
    // JMarr Category
    deft_extra_draw: {
        getDealsPerCasino: (val: number, _context: GameContext, relicState: any) => val + relicState.extra_draws
    },
    royalty_face_cards: {
        onHandCompletion: async (context: HandCompletionContext, relicState: any, _config: any) => {
            const faceCards = context.handCards.filter(isFaceCard);
            if (faceCards.length >= 2) {
                await context.highlightRelic('royalty', {
                    trigger: () => context.modifyRunningSummary(relicState.amount, 0)
                });
            }
        }
    },
    joker_adjust_bj: {
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
    idiot_dealer_stop: {
        getDealerStopValue: (_val: number, _context: GameContext, relicState: any) => relicState.stop_value
    },
    flusher_bonus: createCategoryBonusHook('flush', 'mult'),
    flusher_chips: createCategoryBonusHook('flush', 'chips'),
    
    // Rank Bonuses
    rank_mult: createCategoryBonusHook('rank', 'mult'),
    rank_chips: createCategoryBonusHook('rank', 'chips'),

    // Straight Bonuses
    straight_mult: createCategoryBonusHook('straight', 'mult'),
    straight_chips: createCategoryBonusHook('straight', 'chips'),
    one_armed_win_bonus: {
        onRoundCompletion: async (context: RoundCompletionContext, relicState: any, _config: any) => {
            if (context.wins === 1) {
                const currentMult = context.runningSummary.mult;
                const valToAdd = currentMult > 0 ? currentMult * (relicState.factor - 1) : 1;
                
                await context.highlightRelic('one_armed', {
                    trigger: () => context.modifyRunningSummary(0, valToAdd)
                });
            }
        }
    },
    high_roller_win_all: {
        onRoundCompletion: async (context: RoundCompletionContext, relicState: any, _config: any) => {
             if (context.wins === 3) {
                 await context.highlightRelic('high_roller', {
                     trigger: () => context.modifyRunningSummary(relicState.amount, 0)
                 });
             }
         }
    },

    // Scoring Category

    viginti_relic: {
        onEvaluateHandScore: withPriority(-10, (score: HandScore, context: HandContext, _relicState: any, config: any) => {
            const chipCards = config?.handType?.chipCards || false;
            if (context.blackjackValue === 21) {
                const cardChips = chipCards ? context.handCards.reduce((s, c) => s + RANK_VALUES[c.rank], 0) : 0;
                const newCriteria = [...score.criteria, {
                    id: 'viginti' as any,
                    name: 'Viginti',
                    count: 1,
                    chips: cardChips + 50,
                    multiplier: 1,
                    cardIds: context.handCards.map(c => c.id)
                }];
                const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
                const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
                return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            } else if (context.isWin) {
                const cardChips = chipCards ? context.handCards.reduce((s, c) => s + RANK_VALUES[c.rank], 0) : 0;
                const newCriteria = [...score.criteria, {
                    id: 'win' as any,
                    name: 'Win',
                    count: 1,
                    chips: cardChips + 10,
                    multiplier: 1,
                    cardIds: context.handCards.map(c => c.id)
                }];
                const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
                const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
                return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            }
            return score;
        })
    },
    double_down_relic: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, _relicState: any, config: any) => {
            if (context.isDoubled) {
                const chipCards = config?.handType?.chipCards || false;
                const ddCard = context.handCards.find(c => c.origin === 'double_down');
                const cardChips = (chipCards && ddCard) ? RANK_VALUES[ddCard.rank] : 0;
                const newCriteria = [...score.criteria, {
                    id: 'double_down' as any,
                    name: 'Double Down',
                    count: 1,
                    chips: cardChips,
                    multiplier: 1,
                    cardIds: ddCard ? [ddCard.id] : []
                }];
                const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
                const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
                return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            }
            return score;
        }
    },


    // Standardized Helper Logic
    rank_pair: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, config: any) => 
            evaluateStandardRelic(score, context, 'rank', 2, relicState, config)
    },
    rank_triple: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, config: any) => 
            evaluateStandardRelic(score, context, 'rank', 3, relicState, config)
    },
    rank_run: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, config: any) => 
            evaluateStandardRelic(score, context, 'rank', 0, relicState, config)
    },
    flush_pair: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, config: any) => 
            evaluateStandardRelic(score, context, 'flush', 2, relicState, config)
    },
    flush_triple: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, config: any) => 
            evaluateStandardRelic(score, context, 'flush', 3, relicState, config)
    },
    flush_run: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, config: any) => 
            evaluateStandardRelic(score, context, 'flush', 0, relicState, config)
    },
    straight_pair: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, config: any) => 
            evaluateStandardRelic(score, context, 'straight', 2, relicState, config)
    },
    straight_triple: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, config: any) => 
            evaluateStandardRelic(score, context, 'straight', 3, relicState, config)
    },
    straight_run: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, config: any) => 
            evaluateStandardRelic(score, context, 'straight', 0, relicState, config)
    },


    // Face / Bonus Chips / Mult Modifiers
    lucky_coin_pair_chips: {
        onEvaluateHandScore: (score: HandScore, _context: HandContext, relicState: any, _config: any) => {
            let changed = false;
            const updatedCriteria = score.criteria.map(c => {
                if (c.id === 'pair') {
                    changed = true;
                    return { ...c, chips: c.chips + relicState.bonus_chips };
                }
                return c;
            });
            if (!changed) return score;
            const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
            const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
            return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
        }
    },
    rabbit_foot_pair_mult: {
        onEvaluateHandScore: (score: HandScore, _context: HandContext, relicState: any, _config: any) => {
            let changed = false;
            const updatedCriteria = score.criteria.map(c => {
                if (c.id === 'pair') {
                    changed = true;
                    return { ...c, multiplier: c.multiplier + relicState.bonus_mult };
                }
                return c;
            });
            if (!changed) return score;
            const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
            const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
            return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
        }
    },
    bent_clip_three_kind: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, _config: any) => {
            const counts = getRankCounts(context.handCards);
            const hasThree = Object.values(counts).some(c => c >= 3);
            if (hasThree) {
                const newCriteria = [...score.criteria, {
                    id: 'three_kind' as any,
                    name: 'Three of a Kind',
                    count: 1,
                    chips: 0,
                    multiplier: relicState.bonus_mult,
                    cardIds: []
                }];
                const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
                const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
                return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            }
            return score;
        }
    },
    horseshoe_straight_mult: {
        onEvaluateHandScore: (score: HandScore, _context: HandContext, relicState: any, _config: any) => {
            let changed = false;
            const updatedCriteria = score.criteria.map(c => {
                if (c.id === 'straight') {
                    changed = true;
                    return { ...c, multiplier: c.multiplier + relicState.bonus_mult };
                }
                return c;
            });
            if (!changed) return score;
            const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
            const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
            return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
        }
    },
    red_string_straight_chips: {
        onEvaluateHandScore: (score: HandScore, _context: HandContext, relicState: any, _config: any) => {
            let changed = false;
            const updatedCriteria = score.criteria.map(c => {
                if (c.id === 'straight') {
                    changed = true;
                    return { ...c, chips: c.chips + relicState.bonus_chips };
                }
                return c;
            });
            if (!changed) return score;
            const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
            const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
            return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
        }
    },
    jade_charm_straight_mult: {
        onEvaluateHandScore: (score: HandScore, _context: HandContext, relicState: any, _config: any) => {
            let changed = false;
            const updatedCriteria = score.criteria.map(c => {
                if (c.id === 'straight') {
                    changed = true;
                    return { ...c, multiplier: c.multiplier + relicState.bonus_mult };
                }
                return c;
            });
            if (!changed) return score;
            const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
            const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
            return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
        }
    },
    wishbone_flush_mult: {
        onEvaluateHandScore: (score: HandScore, _context: HandContext, relicState: any, _config: any) => {
            let changed = false;
            const updatedCriteria = score.criteria.map(c => {
                if (c.id === 'flush') {
                    changed = true;
                    return { ...c, multiplier: c.multiplier + relicState.bonus_mult };
                }
                return c;
            });
            if (!changed) return score;
            const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
            const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
            return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
        }
    },
    ladybug_flush_chips: {
        onEvaluateHandScore: (score: HandScore, _context: HandContext, relicState: any, _config: any) => {
            let changed = false;
            const updatedCriteria = score.criteria.map(c => {
                if (c.id === 'flush') {
                    changed = true;
                    return { ...c, chips: c.chips + relicState.bonus_chips };
                }
                return c;
            });
            if (!changed) return score;
            const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
            const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
            return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
        }
    },
    dice_pair_flush_mult: {
        onEvaluateHandScore: (score: HandScore, _context: HandContext, relicState: any, _config: any) => {
            let changed = false;
            const updatedCriteria = score.criteria.map(c => {
                if (c.id === 'flush') {
                    changed = true;
                    return { ...c, multiplier: c.multiplier + relicState.bonus_mult };
                }
                return c;
            });
            if (!changed) return score;
            const totalChips = updatedCriteria.reduce((s, c) => s + c.chips, 0);
            const totalMult = updatedCriteria.reduce((s, c) => s + c.multiplier, 0);
            return { ...score, criteria: updatedCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
        }
    },

    // Suites
    // Using a factory like helper for these could be better, but staying explicit for now per instruction "reference named hook"
    old_receipt_diamonds: createSuitBonusHook('diamonds'),
    lucky_rock_hearts: createSuitBonusHook('hearts'),
    burnt_match_clubs: createSuitBonusHook('clubs'),
    lost_key_spades: createSuitBonusHook('spades'),


    // Hands
    feather_same_hand_size: {
        onRoundCompletion: async (context: RoundCompletionContext, relicState: any, _config: any) => {
            const hands = context.playerHands || [];
            if (hands.length === 0) return;
            const len = hands[0].cards.length;
            const allSame = hands.every((h: any) => h.cards.length === len);
            
            if (allSame) {
                await context.highlightRelic('feather', {
                     trigger: () => context.modifyRunningSummary(relicState.bonus_chips, 0)
                });
            }
        }
    },
    odd_sock_two_cards: {
        onRoundCompletion: async (context: RoundCompletionContext, relicState: any, _config: any) => {
            const hands = context.playerHands || [];
            const allTwo = hands.length > 0 && hands.every((h: any) => h.cards.length === 2);
            
            if (allTwo) {
                await context.highlightRelic('odd_sock', {
                     trigger: () => context.modifyRunningSummary(relicState.bonus_chips, 0)
                });
            }
        }
    },

    // Specific Cards
    star_bead_nines: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, _config: any) => {
            const count = context.handCards.filter(c => c.rank === '9').length;
            if (count > 0) {
                 const newCriteria = [...score.criteria, {
                    id: 'star_bead' as any,
                    name: 'Star Bead',
                    count: count,
                    chips: 0,
                    multiplier: count * relicState.bonus_mult,
                    cardIds: []
                }];
                const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
                const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
                return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            }
            return score;
        }
    },
    heart_button_ten_four: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, _config: any) => {
            const count = context.handCards.filter(c => c.rank === '10' || c.rank === '4').length;
            if (count > 0) {
                const newCriteria = [...score.criteria, {
                     id: 'heart_button' as any,
                     name: 'Heart Button',
                     count: count,
                     chips: 0,
                     multiplier: count * relicState.bonus_mult,
                     cardIds: []
                 }];
                 const totalChips = newCriteria.reduce((sum, crit) => sum + crit.chips, 0);
                 const totalMult = newCriteria.reduce((sum, crit) => sum + crit.multiplier, 0);
                 return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            }
            return score;
        }
    },
    lucky_acorn_kings: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, _config: any) => {
            const count = context.handCards.filter(c => c.rank === 'K').length;
            if (count > 0) {
                 const newCriteria = [...score.criteria, {
                     id: 'lucky_acorn' as any,
                     name: 'Lucky Acorn',
                     count: count,
                     chips: 0,
                     multiplier: count * relicState.bonus_mult,
                     cardIds: []
                 }];
                 const totalChips = newCriteria.reduce((sum, crit) => sum + crit.chips, 0);
                 const totalMult = newCriteria.reduce((sum, crit) => sum + crit.multiplier, 0);
                 return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            }
            return score;
        }
    },

    // Global
    faded_tag_bonus: {
        onRoundCompletion: async (context: RoundCompletionContext, relicState: any, _config: any) => {
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
    mini_shoe_bonus_chips: {
        onRoundCompletion: async (context: RoundCompletionContext, relicState: any, _config: any) => {
            await context.highlightRelic('mini_shoe', {
                 trigger: () => context.modifyRunningSummary(relicState.bonus_chips, 0)
            });
        }
    },
    robe_slippers_bonus_mult: {
        onRoundCompletion: async (context: RoundCompletionContext, relicState: any, _config: any) => {
            await context.highlightRelic('robe_slippers', {
                 trigger: () => context.modifyRunningSummary(0, relicState.bonus_mult)
            });
        }
    },
    key_ring_final_draw: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, _config: any) => {
            if (context.handsRemaining === 0) {
                 const newCriteria = [...score.criteria, {
                     id: 'key_ring' as any,
                     name: 'Key Ring',
                     count: 1,
                     chips: 0,
                     multiplier: relicState.bonus_mult,
                     cardIds: []
                 }];
                 const totalChips = newCriteria.reduce((sum, crit) => sum + crit.chips, 0);
                 const totalMult = newCriteria.reduce((sum, crit) => sum + crit.multiplier, 0);
                 return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            }
            return score;
        }
    },

    // Draw / Place Logic
    cloning_machine_draw: {
        getDrawCount: (val: number, _context: GameContext, relicState: any) => val + relicState.extra_draws
    },
    redemption_bust_bonus: {
        onHandBust: async (_context: HandBustContext, relicState: any, _config: any) => {
            relicState.pending_bonus = true;
        },
        getDrawCount: (val: number, context: GameContext, relicState: any) => {
            // Check pending bonus
            if (relicState.pending_bonus) {
                if (!context.dryRun) {
                    // Reset active bonus from previous turn if any (though logic handles this by default)
                    relicState.active_bonus = true;
                    relicState.pending_bonus = false;
                }
                return val + relicState.extra_draw;
            }
             // Logic: active_bonus should be reset on new draw? 
             // Actually, if we just set active_bonus = true, we need to know when to turn it off?
             // The current implementation turned it off at start of draw.
             // Revised logic:
             if (!context.dryRun) {
                 relicState.active_bonus = false; // Clear old active
             }
            return val;
        },
        getPlaceCount: (val: number, _context: GameContext, relicState: any) => {
            if (relicState.active_bonus) {
                return val + relicState.extra_place;
            }
            return val;
        }
    }
}
