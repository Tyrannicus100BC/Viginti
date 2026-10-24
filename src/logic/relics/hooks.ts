import { type ScoreRowContext, type HandContext, type GameContext, type HandCompletionContext, type DealCompletionContext, type HandBustContext, type RelicConfig } from './types';
import type { Card, HandScore } from '../../types';
import { getBaseBlackjackScore, RANK_VALUES } from '../rules';
import { withPriority } from './types';

// Helpers
const createDecayingBonusHook = (type: 'chips' | 'mult') => ({
    onDealCompletion: async (context: DealCompletionContext, relicState: { amount: number; decay_amount?: number }, config: RelicConfig) => {
        const decayAmount = Math.max(0, Number(relicState.decay_amount ?? config.properties?.decay_amount ?? 0.1));
        if (relicState.amount <= 0) {
            context.removeRelic?.(config.id);
            return;
        }
        await context.highlightRelic(config.id, {
            trigger: () => {
                context.modifyRunningSummary(type === 'chips' ? relicState.amount : 0, type === 'mult' ? relicState.amount : 0);
                relicState.amount = Math.max(0, Number((relicState.amount - decayAmount).toFixed(8)));
                if (relicState.amount <= 0) context.removeRelic?.(config.id);
            }
        });
    }
});

const isFaceCard = (c: Card) => ['J', 'Q', 'K'].includes(c.rank);

// Recalculate the shared card-value rules together so Joker and Royal Couple
// compose independently of acquisition order, with aces optimized afterwards.
const adjustFaceCardValues = (_score: number, context: GameContext & {
    handCards: Card[]; ignoreSpecialEffects?: boolean; bustLimit?: number;
}) => getBaseBlackjackScore(context.handCards, context.ignoreSpecialEffects, context.bustLimit, {
    flexibleJacks: context.inventory.some(relic => relic.id === 'joker'),
    pairedFaces: context.inventory.some(relic => relic.id === 'royal_couple'),
});

// Wait Helper
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


const getRankCounts = (cards: Card[]) => {
    const counts: Record<string, number> = {};
    for (const c of cards) {
        if (c.type && c.type !== 'standard') continue;
        counts[c.rank] = (counts[c.rank] || 0) + 1;
    }
    return counts;
};

const createCategoryBonusHook = (categoryPrefix: string, type: 'mult' | 'chips') => ({
    onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, _config: any) => {
        let changed = false;
        
        const isSingleInstance = context.categoryCounts ? context.categoryCounts[categoryPrefix] === 1 : true;

        const updatedCriteria = score.criteria.map(c => {
            const isMatch = (
                c.id === categoryPrefix || 
                c.id.startsWith(categoryPrefix + '_') || 
                (categoryPrefix === 'rank' && (c.id === 'pair' || c.id === 'three_kind'))
            );

            if (isMatch && (type === 'chips' || isSingleInstance)) {
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

        const isSingleInstance = context.categoryCounts ? context.categoryCounts[categoryPrefix] === 1 : true;

        if (isMatch && (type === 'chips' || isSingleInstance)) {
            const relicId = config?.id || `${categoryPrefix}_${type}`;
            await context.highlightRelic(relicId, { preDelay: 600 });
        }
    }
});

const createSuitBonusHook = (suit: string) => ({
    onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, config: any) => {
        if (!context.isWin) return score;

        const matchingCards = context.handCards.filter(c => c.suit.toLowerCase() === suit.toLowerCase());
        const count = matchingCards.length;
        
        if (count > 0) {
            const relicId = config?.id || `suit_${suit}`;
            const relicName = config?.name || suit;

            const newCriteria = [...score.criteria, {
                id: relicId as any,
                name: relicName,
                count: 1,
                chips: count * relicState.bonus_chips,
                multiplier: 0,
                cardIds: matchingCards.map(c => c.id),
                sourceRelicId: relicId
            }];

            const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
            const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
            return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
        }
        return score;
    }
});

// Card bonuses belong to the outcome row so they are scored and displayed once.
const addWinMultiplier = (score: HandScore, bonus: number): HandScore => {
    const criteria = score.criteria.map(row => row.id === 'win' || row.id === 'viginti'
        ? { ...row, multiplier: Number((row.multiplier + bonus).toFixed(8)) }
        : row);
    const totalMultiplier = Number(criteria.reduce((sum, row) => sum + row.multiplier, 0).toFixed(8));
    return { ...score, criteria, totalMultiplier,
        finalScore: Math.floor(Number((score.totalChips * totalMultiplier).toFixed(8))) };
};

const createCardWinBonusHook = (ranks: string[]) => ({
    onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any) => {
        if (!context.isWin) return score;
        const count = context.handCards.filter(card => (!card.type || card.type === 'standard') && ranks.includes(card.rank)).length;
        return count ? addWinMultiplier(score, count * relicState.bonus_mult) : score;
    },
    onScoreRow: async (context: ScoreRowContext, _relicState: any, config: any) => {
        if ((context.criterionId === 'win' || context.criterionId === 'viginti') &&
            context.score.scoringCards.some(card => (!card.type || card.type === 'standard') && ranks.includes(card.rank))) {
            await context.highlightRelic(config.id, { preDelay: 200 });
        }
    }
});

export const Hooks = {
    sweet_spot_cash: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any, config: RelicConfig) => {
            const matching = context.handCards.filter(card => (!card.type || card.type === 'standard') &&
                ['6', '7', '8', '9'].includes(card.rank));
            if (!matching.length) return score;
            const bonus = matching.length * (relicState.bonus_chips ?? config.properties?.bonus_chips ?? 5);
            const criteria = [...score.criteria, { id: config.id, name: config.name, count: matching.length,
                chips: bonus, multiplier: 0, cardIds: matching.map(card => card.id), sourceRelicId: config.id }];
            const totalChips = score.totalChips + bonus;
            return { ...score, criteria, totalChips,
                finalScore: Math.floor(Number((totalChips * score.totalMultiplier).toFixed(8))) };
        }
    },
    prismatic_charm_flushes: {
        onDealCompletion: async (context: DealCompletionContext, relicState: any, config: RelicConfig) => {
            const suits = new Set<string>();
            for (const hand of context.playerHands) {
                for (const row of hand.finalScore?.criteria ?? []) {
                    if (row.id !== 'flush') continue;
                    const first = hand.cards.find((card: Card) => row.cardIds?.includes(card.id));
                    if (first) suits.add(first.suit);
                }
            }
            if (suits.size < 3) return;
            await context.highlightRelic(config.id, {
                trigger: () => context.modifyRunningSummary(0, relicState.bonus_mult ?? config.properties?.bonus_mult ?? 0.2)
            });
        }
    },
    stage_fright_dealer: {
        // Always-standing overrides the Idiot's 17 rule in either inventory order.
        shouldDealerHit: withPriority(100, (value: boolean, _context: GameContext, relicState: any) =>
            relicState.armed ? false : value),
        onDealCompletion: async (context: DealCompletionContext, relicState: any, config: RelicConfig) => {
            const armed = context.vigintis >= 2;
            if (armed) {
                await context.highlightRelic(config.id, { trigger: () => { relicState.armed = true; } });
            } else relicState.armed = false;
        }
    },
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
        adjustBlackjackScore: adjustFaceCardValues
    },
    royal_couple_value: {
        adjustBlackjackScore: adjustFaceCardValues
    },
    idiot_dealer_stop: {
        shouldDealerHit: (_value: boolean, context: GameContext & { blackjackValue: number }) =>
            context.blackjackValue < 15 || context.blackjackValue === 17
    },
    extra_life_limit: {
        getBustLimit: (value: number) => Math.max(value, 22)
    },
    clean_sweep_growth: {
        onDealCompletion: async (context: DealCompletionContext, relicState: any, config: RelicConfig) => {
            const step = relicState.growth_chips ?? config.properties?.growth_chips ?? 5;
            const swept = context.playerHands.length >= 3 && context.wins === 3;
            const bonus = Math.max(0, (relicState.bonus_chips ?? 0) + (swept ? step : -step));
            await context.highlightRelic(config.id, {
                trigger: () => {
                    relicState.bonus_chips = bonus;
                    context.modifyRunningSummary(bonus, 0);
                }
            });
        }
    },
    two_peas_growth: {
        onDealCompletion: async (context: DealCompletionContext, relicState: any, config: RelicConfig) => {
            const pairs = context.playerHands.reduce((sum, hand) => sum +
                (hand.finalScore?.criteria.filter((row: any) => row.id === 'pair')
                    .reduce((count: number, row: any) => count + row.count, 0) ?? 0), 0);
            const step = relicState.growth_mult ?? config.properties?.growth_mult ?? 0.01;
            const bonus = Number(((relicState.bonus_mult ?? 0) + (pairs >= 2 ? step : 0)).toFixed(8));
            if (!bonus) return;
            await context.highlightRelic(config.id, {
                trigger: () => {
                    relicState.bonus_mult = bonus;
                    context.modifyRunningSummary(0, bonus);
                }
            });
        }
    },
    climbing_vine_growth: {
        // Evaluation is pure: previews and category-count passes must not grow
        // the relic. Commit growth once in onHandCompletion instead.
        onEvaluateHandScore: (score: HandScore, _context: HandContext, relicState: any, config: RelicConfig) => {
            let bonus = relicState.bonus_chips ?? 0;
            const step = relicState.growth_chips ?? config.properties?.growth_chips ?? 5;
            const criteria = score.criteria.map(row => {
                if (row.id !== 'straight') return row;
                if ((row.cardIds?.length ?? 0) >= 3) bonus += step;
                return { ...row, chips: row.chips + bonus, sourceRelicId: config.id };
            });
            const totalChips = criteria.reduce((sum, row) => sum + row.chips, 0);
            return { ...score, criteria, totalChips,
                finalScore: Math.floor(Number((totalChips * score.totalMultiplier).toFixed(8))) };
        },
        onScoreRow: async (context: ScoreRowContext, relicState: any, config: RelicConfig) => {
            if (context.criterionId === 'straight' && (relicState.bonus_chips > 0 ||
                context.score.criteria.some(row => row.id === 'straight' && (row.cardIds?.length ?? 0) >= 3))) {
                await context.highlightRelic(config.id);
            }
        },
        onHandCompletion: async (context: HandCompletionContext, relicState: any, config: RelicConfig) => {
            const triggers = context.score.criteria.filter(row => row.id === 'straight' && (row.cardIds?.length ?? 0) >= 3).length;
            const step = relicState.growth_chips ?? config.properties?.growth_chips ?? 5;
            relicState.bonus_chips = (relicState.bonus_chips ?? 0) + triggers * step;
        }
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
        onDealCompletion: async (context: DealCompletionContext, relicState: any, _config: any) => {
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
        onDealCompletion: async (context: DealCompletionContext, relicState: any, _config: any) => {
             if (context.wins === 3) {
                 await context.highlightRelic('high_roller', {
                     trigger: () => context.modifyRunningSummary(relicState.amount, 0)
                 });
             }
         }
    },

    double_down_relic: {
        onEvaluateHandScore: (score: HandScore, context: HandContext, _relicState: any, config: any) => {
            if (context.isDoubled) {
                const chipCards = config?.handType?.chipCards || false;
                const ddCard = context.handCards.find(c => c.origin === 'double_down');
                const cardChips = (chipCards && ddCard) ? RANK_VALUES[ddCard.rank] : 0;
                const newCriteria = [...score.criteria, {
                    id: config?.handType?.id || ('double_down' as any),
                    name: config?.handType?.name || 'Double Down',
                    count: 1,
                    chips: cardChips,
                    multiplier: config?.handType?.mult ?? 1,
                    cardIds: ddCard ? [ddCard.id] : [],
                    sourceRelicId: config?.id || 'double_down'
                }];
                const totalChips = newCriteria.reduce((s, c) => s + c.chips, 0);
                const totalMult = newCriteria.reduce((s, c) => s + c.multiplier, 0);
                return { ...score, criteria: newCriteria, totalChips, totalMultiplier: totalMult, finalScore: Math.floor(totalChips * totalMult) };
            }
            return score;
        }
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
        onDealCompletion: async (context: DealCompletionContext, relicState: any, _config: any) => {
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
        onDealCompletion: async (context: DealCompletionContext, relicState: any, _config: any) => {
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
    star_bead_nines: createCardWinBonusHook(['9']),
    heart_button_ten_four: createCardWinBonusHook(['10', '4']),
    lucky_acorn_kings: createCardWinBonusHook(['K']),

    // Global
    faded_tag_bonus: createDecayingBonusHook('mult'),
    faded_bill_bonus: createDecayingBonusHook('chips'),
    mini_shoe_bonus_chips: {
        onDealCompletion: async (context: DealCompletionContext, relicState: any, _config: any) => {
            await context.highlightRelic('mini_shoe', {
                 trigger: () => context.modifyRunningSummary(relicState.bonus_chips, 0)
            });
        }
    },
    robe_slippers_bonus_mult: {
        onDealCompletion: async (context: DealCompletionContext, relicState: any, config: any) => {
            await context.highlightRelic(config.id, {
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
        getDrawCount: (val: number, context: GameContext, relicState: any) => {
            const nextDraw = (relicState.draws_taken ?? 0) + 1;
            if (!context.dryRun) relicState.draws_taken = nextDraw;
            return nextDraw % 2 === 0 ? val + relicState.extra_draws : val;
        }
    },
    redemption_bust_bonus: {
        onCheckCardPlace: (context: any) => context.blackjackValue > (context.bustLimit ?? 21),
        onHandBust: async (_context: HandBustContext, relicState: any) => {
            relicState.pending_bonus = true;
        },
        getDrawCount: (val: number, context: GameContext, relicState: any) => {
            if (!relicState.pending_bonus) return val;
            if (!context.dryRun) relicState.pending_bonus = false;
            return val + relicState.extra_draw;
        }
    },

    // Score relics
    safety_net_20: {
        onDealCompletion: async (_context: DealCompletionContext, relicState: any, _config: any) => {
             relicState.armed = false; // Reset per deal
        },
        onCheckCardPlace: (context: any, relicState: any, _config: any) => {
            // Wait if we are about to hit 20 and not yet armed
            return !relicState.armed && context.blackjackValue === 20;
        },
        onCardPlaced: async (context: any, relicState: any, _config: any) => {
            if (!relicState.armed && context.blackjackValue === 20) {
                 
                 await context.highlightRelic('safety_net', {
                     trigger: async () => {
                         // Discard hand
                         context.modifyHand([]);
                         relicState.armed = true;
                     }
                 });
            }
        },
        onEvaluateHandScore: (score: HandScore, context: HandContext, relicState: any) => {
            return relicState.armed && context.isWin ? addWinMultiplier(score, relicState.bonus_mult) : score;
        },
        onScoreRow: async (context: ScoreRowContext, relicState: any, config: any) => {
            if (relicState.armed && (context.criterionId === 'win' || context.criterionId === 'viginti')) {
                await context.highlightRelic(config.id);
            }
        }
    },
    mulligan_bust: {
         onDealCompletion: async (_context: DealCompletionContext, relicState: any, _config: any) => {
             relicState.used_this_deal = false;
        },
        onCheckCardPlace: (context: any, relicState: any, _config: any) => {
             // Wait if we are busting and haven't used mulligan yet
             return !relicState.used_this_round && context.blackjackValue > (context.bustLimit ?? 21);
        },
        onHandBust: async (context: HandBustContext, relicState: any, _config: any) => {
            if (!relicState.used_this_deal) {
                // Wait for BUST animation is handled by caller (usually) or we can wait here?
                // The prompt says: "wait for the BUST animation to finish playing... but then show standard activation..."
                // Since we are in an interrupt hook, we can wait.


                await context.highlightRelic('mulligan', {
                    trigger: () => {
                        // Discard last card
                        const newCards = [...context.handCards];
                        if (newCards.length > 0) {
                            // Find the last card added. In our logic, new cards are appended.
                            // However, if special was added, it might be at start.
                            // But natural bust usually comes from draw.
                            // Let's just pop the last one in the array, as that's visually consistent for 'hit'.
                             newCards.pop();
                             context.modifyHand(newCards);
                        }
                        relicState.used_this_deal = true;
                    }
                });
            }
        }
    },
    spyglass_always: {
        getDealerRevealed: (_val: boolean, _context: any, _relicState: any) => true
    }
}
