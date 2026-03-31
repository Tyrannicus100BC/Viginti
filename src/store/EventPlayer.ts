/**
 * EventPlayer — async event processor for the presentation layer.
 *
 * Takes a GameEvent[] produced by the pure engine and processes them
 * sequentially with timing, animation, and sound. Each event handler
 * mutates UI state via a callback and waits for animation duration.
 *
 * Timing is presentation-only — the engine produces events with no
 * timing information. The EventPlayer adds timing based on event type.
 */

import type { GameEvent } from '../engine/GameEvent';

// ─── Types ──────────────────────────────────────────────

/** Minimal SFX interface so we don't couple to the full sfxEngine */
export interface SfxPlayer {
    play(id: string, options?: { volume?: number; playbackRate?: number }): void;
}

/** Callback that allows each handler to mutate the bridge store state */
export type UIUpdater = (patch: Record<string, any>) => void;

/** Configuration for the EventPlayer */
export interface EventPlayerConfig {
    /** Callback to patch UI state in the bridge store */
    updateUI: UIUpdater;
    /** Sound player (sfxEngine or mock) */
    sfx: SfxPlayer | null;
    /** Returns current animation speed multiplier (default 1) */
    getSpeed: () => number;
    /** If true, skip all timing (for tests / headless) */
    headless?: boolean;
}

/** Async handler for a single event */
type EventHandler = (event: GameEvent, config: EventPlayerConfig) => Promise<void>;

// ─── Timing Helpers ─────────────────────────────────────

/** Wait for a given duration, respecting animation speed */
async function wait(ms: number, config: EventPlayerConfig): Promise<void> {
    if (config.headless || ms <= 0) return;
    const speed = config.getSpeed();
    const adjusted = Math.max(10, ms / speed);
    return new Promise(resolve => setTimeout(resolve, adjusted));
}

// ─── Score Row Pitch Tracking ───────────────────────────

const SCORE_ROW_RATE_BASE = 1;
const SCORE_ROW_RATE_STEP = 0.04;
const SCORE_ROW_RATE_MAX = 1.3;

let scoreRowPitch = SCORE_ROW_RATE_BASE;

function resetScoreRowPitch() {
    scoreRowPitch = SCORE_ROW_RATE_BASE;
}

function nextScoreRowPitch(): number {
    const pitch = scoreRowPitch;
    scoreRowPitch = Math.min(SCORE_ROW_RATE_MAX, scoreRowPitch + SCORE_ROW_RATE_STEP);
    return pitch;
}

// ─── Event Handlers ─────────────────────────────────────

const handlers: Partial<Record<GameEvent['type'], EventHandler>> = {

    // === Dealing ===

    async deal_started(event, config) {
        if (event.type !== 'deal_started') return;
        config.updateUI({
            dealerMessage: null,
            handsRemaining: event.handsRemaining,
            deal: event.deal,
            isInitialDeal: true,
            isDealerPlaying: false,
            scoringHandIndex: -1,
            isCollectingChips: false,
            allWinnersEnlarged: false,
            runningSummary: null,
            dealSummary: null,
            dealerVisible: true,
            visibleScoringRowIndices: {},
            scoringRowValues: {},
            scoringCriteria: {},
            activeHighlightIds: null,
            // Reset state for new deal
            playerHands: Array.from({ length: 3 }, (_, i) => ({
                id: i,
                cards: [],
                isHeld: false,
                isBust: false,
                blackjackValue: 0,
            })),
            dealer: { cards: [], isRevealed: false, blackjackValue: 0 }
        });
    },

    async cards_dealt(event, config) {
        if (event.type !== 'cards_dealt') return;
        
        // Initialize hands with dealt cards
        config.updateUI({
            playerHands: (prev: any) => {
                const next = [...prev];
                next[event.playerHandIndex] = {
                    ...next[event.playerHandIndex],
                    cards: [event.playerCard]
                };
                return next;
            },
            dealer: {
                cards: event.dealerCards,
                isRevealed: false,
                blackjackValue: 0 // Will be updated during reveal
            }
        });

        config.sfx?.play('cardDeal');
        await wait(200, config);
    },

    async initial_deal_complete(_event, config) {
        // config.updateUI({ isInitialDeal: false }); // Now handled by animation_complete signal
        await wait(200, config);
    },

    // === Drawing ===

    async deck_reshuffled(event, config) {
        if (event.type !== 'deck_reshuffled') return;
        config.updateUI({ isReshuffling: true });
        await wait(400, config);
        config.updateUI({ isReshuffling: false });
    },

    async card_drawn(event, config) {
        if (event.type !== 'card_drawn') return;
        config.sfx?.play('cardDeal');
        
        // Update drawnCards array in the store
        config.updateUI({ 
            drawnCards: (prev: any) => {
                const next = [...prev];
                next[event.drawIndex] = event.card;
                return next;
            }
        });

        await wait(150, config);
    },

    async draw_complete(event, config) {
        if (event.type !== 'draw_complete') return;
        config.updateUI({ selectedDrawIndex: event.selectedIndex });
        await wait(100, config);
    },

    // === Card Placement ===

    async card_placed(event, config) {
        if (event.type !== 'card_placed') return;
        
        config.updateUI({
            // Remove from drawn cards
            drawnCards: (prev: any) => {
                const next = [...prev];
                const idx = next.findIndex((c: any) => c && c.id === event.card.id);
                if (idx !== -1) next[idx] = null;
                return next;
            },
            // Add to player hand
            playerHands: (prev: any) => {
                const next = [...prev];
                const hand = next[event.handIndex];
                next[event.handIndex] = {
                    ...hand,
                    cards: [...hand.cards, event.card],
                    blackjackValue: event.newBlackjackValue
                };
                return next;
            }
        });

        config.sfx?.play('cardPlace');
        await wait(200, config);
    },

    async hand_bust(event, config) {
        if (event.type !== 'hand_bust') return;
        config.sfx?.play('bust');
        config.updateUI({ 
            isShaking: true,
            playerHands: (prev: any) => {
                const next = [...prev];
                next[event.handIndex] = {
                    ...next[event.handIndex],
                    isBust: true,
                    blackjackValue: event.blackjackValue
                };
                return next;
            }
        });
        await wait(400, config);
        config.updateUI({ isShaking: false });
    },

    async hand_modified(event, config) {
        if (event.type !== 'hand_modified') return;
        config.updateUI({
            playerHands: (prev: any) => {
                const next = [...prev];
                next[event.handIndex] = {
                    ...next[event.handIndex],
                    cards: event.newCards,
                    blackjackValue: event.newBlackjackValue,
                    isBust: event.newBlackjackValue > 21
                };
                return next;
            }
        });
        await wait(300, config);
    },

    async leftover_cards_discarded(_event, config) {
        await wait(200, config);
    },

    async card_discarded_to_pile(_event, config) {
        await wait(100, config);
    },

    async auto_stand_triggered(_event, config) {
        config.sfx?.play('stand');
        await wait(500, config);
    },

    async placement_complete(_event, _config) {
        // No delay — just a marker event
    },

    // === Relic Activations ===

    async relic_activated(event, config) {
        if (event.type !== 'relic_activated') return;
        config.updateUI({ activeRelicId: event.relicId });
        await wait(600, config);
        config.updateUI({ activeRelicId: null });
    },

    async relic_state_changed(_event, _config) {
        // Relics may need UI update but no special animation
    },

    async relic_removed(_event, config) {
        await wait(200, config);
    },

    async dealer_card_revealed(event, config) {
        if (event.type !== 'dealer_card_revealed') return;
        config.sfx?.play('cardFlip');
        await wait(400, config);
    },

    // === Dealer Turn ===

    async dealer_reveal(event, config) {
        if (event.type !== 'dealer_reveal') return;
        config.updateUI({ 
            isDealerPlaying: true, 
            dealerVisible: true,
            dealer: (prev: any) => ({
                ...prev,
                cards: prev.cards.map((c: any, i: number) => i === 0 ? event.card : c),
                isRevealed: true,
                blackjackValue: event.newValue
            })
        });
        config.sfx?.play('cardFlip');
        await wait(600, config);
    },

    async dealer_hit(event, config) {
        if (event.type !== 'dealer_hit') return;
        config.updateUI({
            dealerMessage: 'Hit!',
            dealerMessageExiting: false,
            dealer: (prev: any) => ({
                ...prev,
                cards: [...prev.cards, event.card],
                blackjackValue: event.newValue
            })
        });
        config.sfx?.play('cardDeal');
        await wait(400, config);
        config.updateUI({ dealerMessageExiting: true });
        await wait(200, config);
    },

    async dealer_stand(event, config) {
        if (event.type !== 'dealer_stand') return;
        config.updateUI({
            dealerMessage: 'Stand',
            dealerMessageExiting: false,
        });
        await wait(600, config);
        config.updateUI({ dealerMessageExiting: true });
        await wait(200, config);
    },

    async dealer_bust(event, config) {
        if (event.type !== 'dealer_bust') return;
        config.sfx?.play('bust');
        config.updateUI({
            dealerMessage: 'Bust!',
            dealerMessageExiting: false,
            isShaking: true,
        });
        await wait(600, config);
        config.updateUI({ isShaking: false, dealerMessageExiting: true });
        await wait(200, config);
    },

    // === Scoring ===

    async hand_outcome(event, config) {
        if (event.type !== 'hand_outcome') return;
        
        config.updateUI({
            playerHands: (prev: any) => {
                const next = [...prev];
                next[event.handIndex] = {
                    ...next[event.handIndex],
                    outcome: event.outcome,
                    resultRevealed: true,
                    blackjackValue: event.blackjackValue
                };
                return next;
            }
        });

        if (event.outcome === 'win') {
            config.sfx?.play('win');
        } else {
            config.sfx?.play('loss');
        }
        await wait(300, config);
    },

    async dealer_fade_out(_event, config) {
        config.updateUI({ dealerVisible: false });
        await wait(400, config);
        config.updateUI({
            dealer: (prev: any) => ({ ...prev, cards: [], blackjackValue: 0 })
        });
    },



    async scoring_hand_focus(event, config) {
        if (event.type !== 'scoring_hand_focus') return;
        config.updateUI({ 
            scoringHandIndex: event.handIndex,
            activeHighlightIds: null,
        });
        await wait(400, config);
    },

    async scoring_row_intro(event, config) {
        if (event.type !== 'scoring_row_intro') return;
        const { handIndex, criterion } = event;
        
        // 1. Reveal the row (frame + label)
        config.updateUI({
            scoringCriteria: (prev: any) => {
                const current = prev[handIndex] || [];
                return { ...prev, [handIndex]: [...current, criterion] };
            },
            visibleScoringRowIndices: (prev: any) => {
                const current = prev[handIndex] || [];
                const nextIdx = current.length;
                return { ...prev, [handIndex]: [...current, nextIdx] };
            },
            scoringRowValues: (prev: any) => {
                const handRows = prev[handIndex] || {};
                const nextIdx = Object.keys(handRows).length;
                return {
                    ...prev,
                    [handIndex]: {
                        ...handRows,
                        [nextIdx]: { count: criterion.count ?? 0 }
                    }
                };
            },
            activeHighlightIds: criterion.cardIds || [],
        });

        // Track row index for next step
        const cfg = config as any;
        if (!cfg._scoringRowMap) cfg._scoringRowMap = {};
        const currentRowIdx = (cfg._scoringRowMap[handIndex] ?? -1) + 1;
        cfg._scoringRowMap[handIndex] = currentRowIdx;

        const pitch = nextScoreRowPitch();
        config.sfx?.play('score', { playbackRate: pitch });
        await wait(300, config);
    },

    async scoring_row_chips(event, config) {
        if (event.type !== 'scoring_row_chips') return;
        const { handIndex } = event;
        const cfg = config as any;
        const rowIdx = cfg._scoringRowMap[handIndex];
        
        if (rowIdx !== undefined) {
             config.updateUI({
                scoringRowValues: (prev: any) => {
                    const hRows = prev[handIndex];
                    return {
                        ...prev,
                        [handIndex]: {
                            ...hRows,
                            [rowIdx]: { 
                                ...hRows[rowIdx],
                                chips: event.chips,
                            }
                        }
                    };
                }
            });
            if (event.chips > 0) {
                 config.sfx?.play('chipPlace');
            }
            await wait(200, config);
        }
    },

    async scoring_row_mult(event, config) {
        if (event.type !== 'scoring_row_mult') return;
        const { handIndex } = event;
        const cfg = config as any;
        const rowIdx = cfg._scoringRowMap[handIndex];
        
        if (rowIdx !== undefined) {
             config.updateUI({
                scoringRowValues: (prev: any) => {
                    const hRows = prev[handIndex];
                    return {
                        ...prev,
                        [handIndex]: {
                            ...hRows,
                            [rowIdx]: { 
                                ...hRows[rowIdx],
                                mult: event.multiplier,
                            }
                        }
                    };
                }
            });
             if (event.multiplier > 0) {
                 config.sfx?.play('chipPlace'); // distinct sound?
            }
            await wait(200, config);
        }
    },

    async scoring_hand_complete(event, config) {
        if (event.type !== 'scoring_hand_complete') return;
        
        // Wait while hand is still focused so user can see the final state
        await wait(500, config);

        config.updateUI({ 
            activeHighlightIds: null,
            scoringHandIndex: -1
        });

        // Wait after shrinking before moving to the next hand
        await wait(500, config);
    },

    async summary_update(event, config) {
        if (event.type !== 'summary_update') return;
        // Final sync for this hand's summary
        config.updateUI({
            runningSummary: { chips: event.chips, mult: event.mult },
        });
    },

    async deal_scoring_complete(event, config) {
        if (event.type !== 'deal_scoring_complete') return;
        config.updateUI({
            dealSummary: {
                totalChips: event.totalChips,
                totalMult: event.totalMult,
                finalScore: event.finalScore,
            },
        });
        resetScoreRowPitch();
        await wait(400, config);
    },

    async chip_collection(event, config) {
        if (event.type !== 'chip_collection') return;
        config.sfx?.play('totalWinnings');
        config.updateUI({ 
            isCollectingChips: true,
            totalScore: event.newTotalScore 
        });
        await wait(1000, config);
        config.updateUI({ isCollectingChips: false });
    },

    // === Charge Changes ===

    async charge_gained(_event, _config) {
        // UI updates table action charges reactively from game state
    },

    // === Phase Transitions ===

    async phase_changed(event, config) {
        if (event.type !== 'phase_changed') return;
        
        config.updateUI({ phase: event.to });

        // Reset some UI state on phase transitions
        if (event.to === 'entering_casino') {
            config.updateUI({ dealerVisible: true });
        }
        if (event.to === 'playing' || event.to === 'scoring') {
            config.updateUI({
                isDealerPlaying: false,
                dealerMessage: null,
                scoringHandIndex: -1,
                isCollectingChips: false,
                visibleScoringRowIndices: {},
                scoringRowValues: {},
                scoringCriteria: {},
                activeHighlightIds: null,
            });
        }
        
        if (event.to === 'scoring') {
            config.updateUI({ runningSummary: { chips: 0, mult: 1 } });
            await wait(200, config);
        }

        if (event.to === 'game_over') {
            config.sfx?.play('loss');
        }
    },

    async target_reached(event, config) {
        if (event.type !== 'target_reached') return;
        config.sfx?.play('confetti');
        config.updateUI({ isShaking: true });
        await wait(1000, config);
        config.updateUI({ isShaking: false });
    },

    async game_over(event, config) {
        if (event.type !== 'game_over') return;
        if (event.won) {
            config.sfx?.play('confetti');
        }
        await wait(500, config);
    },

    // === Gift Shop ===

    async shop_entered(event, config) {
        if (event.type !== 'shop_entered') return;
        config.sfx?.play('click');
        await wait(300, config);
    },

    async item_purchased(event, config) {
        if (event.type !== 'item_purchased') return;
        config.sfx?.play('purchase');
        await wait(300, config);
    },

    async shop_restocked(event, config) {
        if (event.type !== 'shop_restocked') return;
        config.sfx?.play('restock');
        await wait(300, config);
    },

    async relic_sold(event, config) {
        if (event.type !== 'relic_sold') return;
        config.sfx?.play('click');
        await wait(200, config);
    },

    async shop_left(_event, config) {
        await wait(200, config);
    },

    // === Deck Management ===

    async card_enhanced(_event, config) {
        config.sfx?.play('click');
        await wait(200, config);
    },

    async card_destroyed(_event, config) {
        config.sfx?.play('click');
        await wait(200, config);
    },

    // === Table Actions ===

    async table_action_activated(event, config) {
        if (event.type !== 'table_action_activated') return;
        config.sfx?.play('click');
        config.updateUI({ activeTableActionId: event.relicId });
        await wait(200, config);
    },

    async table_action_cancelled(event, config) {
        if (event.type !== 'table_action_cancelled') return;
        config.updateUI({ activeTableActionId: null });
    },

    async table_action_resolved(event, config) {
        if (event.type !== 'table_action_resolved') return;
        config.updateUI({ activeTableActionId: null });
        await wait(300, config);
    },

    async charge_spent(_event, _config) {
        // Charges update reactively from game state
    },

    // === Casino Progression ===

    async casino_cleared(event, config) {
        if (event.type !== 'casino_cleared') return;
        config.sfx?.play('confetti');
        await wait(500, config);
    },

    async payout_started(event, config) {
        if (event.type !== 'payout_started') return;
        config.updateUI({ 
            shopRewardSummary: event.rewardSummary,
        });
        await wait(200, config);
    },

    async payout_step(_event, config) {
        // CasinoWinScreen handles the internal animation of rows, 
        // but we can provide a small delay for the event stream pacing.
        await wait(100, config);
    },

    async payout_complete(_event, config) {
        await wait(200, config);
    },

    async comps_earned(event, config) {
        if (event.type !== 'comps_earned') return;
        config.sfx?.play('click');
        await wait(200, config);
    },

    async next_casino_setup(event, config) {
        if (event.type !== 'next_casino_setup') return;
        await wait(300, config);
    },

    // === Tutorial ===

    async tutorial_triggered(event, config) {
        if (event.type !== 'tutorial_triggered') return;
        // Check if we need a sound?
        // config.sfx?.play('notification'); 
        config.updateUI({ activeTutorialId: event.stepId });
        await wait(300, config);
    },

    async tutorial_completed(event, config) {
        if (event.type !== 'tutorial_completed') return;
        config.updateUI({ activeTutorialId: null });
        await wait(200, config);
    },

    async tutorial_skipped(event, config) {
         if (event.type !== 'tutorial_skipped') return;
         config.updateUI({ activeTutorialId: null });
    },

    async animation_complete(event, config) {
        if (event.type !== 'animation_complete') return;
        if (event.animationId === 'dealer_initial_deal_complete') {
            config.updateUI({ isInitialDeal: false });
        }
    },
};

// ─── Public API ─────────────────────────────────────────

/**
 * Process a list of GameEvents sequentially.
 * Each event triggers its handler in order, with timing between them.
 * Returns when all events have been processed.
 */
export async function playEvents(
    events: readonly GameEvent[],
    config: EventPlayerConfig,
): Promise<void> {
    resetScoreRowPitch();
    (config as any)._scoringRowMap = {};
    for (const event of events) {
        const handler = handlers[event.type];
        if (handler) {
            await handler(event, config);
        }
    }
}

/**
 * Process events without timing (headless mode).
 * Useful for tests and CLI simulation.
 */
export function playEventsSync(
    events: readonly GameEvent[],
    updateUI: UIUpdater,
): void {
    const config: EventPlayerConfig = {
        updateUI,
        sfx: null,
        getSpeed: () => 1,
        headless: true,
    };
    // Run all handlers synchronously (they're async but headless = no waits)
    for (const event of events) {
        const handler = handlers[event.type];
        if (handler) {
            // In headless mode, all awaits resolve immediately (no setTimeout)
            void handler(event, config);
        }
    }
}
