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

    async round_started(event, config) {
        if (event.type !== 'round_started') return;
        config.updateUI({
            dealerMessage: null,
            isInitialDeal: true,
            isDealerPlaying: false,
            scoringHandIndex: -1,
            isCollectingChips: false,
            allWinnersEnlarged: false,
            runningSummary: null,
            roundSummary: null,
        });
    },

    async cards_dealt(event, config) {
        if (event.type !== 'cards_dealt') return;
        config.sfx?.play('cardDeal');
        await wait(200, config);
    },

    async initial_deal_complete(event, config) {
        config.updateUI({ isInitialDeal: false });
        await wait(300, config);
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
        await wait(150, config);
    },

    async draw_complete(_event, config) {
        await wait(100, config);
    },

    // === Card Placement ===

    async card_placed(event, config) {
        if (event.type !== 'card_placed') return;
        config.sfx?.play('cardPlace');
        await wait(200, config);
    },

    async hand_bust(event, config) {
        if (event.type !== 'hand_bust') return;
        config.sfx?.play('bust');
        config.updateUI({ isShaking: true });
        await wait(400, config);
        config.updateUI({ isShaking: false });
    },

    async hand_modified(event, config) {
        if (event.type !== 'hand_modified') return;
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
        config.updateUI({ isDealerPlaying: true, dealerVisible: true });
        config.sfx?.play('cardFlip');
        await wait(600, config);
    },

    async dealer_hit(event, config) {
        if (event.type !== 'dealer_hit') return;
        config.updateUI({
            dealerMessage: 'Hit!',
            dealerMessageExiting: false,
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
        if (event.outcome === 'win') {
            config.sfx?.play('win');
        } else {
            config.sfx?.play('loss');
        }
        await wait(300, config);
    },

    async scoring_hand_focus(event, config) {
        if (event.type !== 'scoring_hand_focus') return;
        config.updateUI({ scoringHandIndex: event.handIndex });
        await wait(400, config);
    },

    async scoring_row(event, config) {
        if (event.type !== 'scoring_row') return;
        const pitch = nextScoreRowPitch();
        config.sfx?.play('score', { playbackRate: pitch });
        await wait(200, config);
    },

    async scoring_hand_complete(event, config) {
        if (event.type !== 'scoring_hand_complete') return;
        await wait(300, config);
    },

    async summary_update(event, config) {
        if (event.type !== 'summary_update') return;
        config.updateUI({
            runningSummary: { chips: event.chips, mult: event.mult },
        });
    },

    async round_scoring_complete(event, config) {
        if (event.type !== 'round_scoring_complete') return;
        config.updateUI({
            roundSummary: {
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
        config.updateUI({ isCollectingChips: true });
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
        // Reset some UI state on phase transitions
        if (event.to === 'playing') {
            config.updateUI({
                isDealerPlaying: false,
                dealerMessage: null,
                scoringHandIndex: -1,
                isCollectingChips: false,
            });
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

    async comps_earned(event, config) {
        if (event.type !== 'comps_earned') return;
        config.sfx?.play('click');
        await wait(200, config);
    },

    async next_casino_setup(event, config) {
        if (event.type !== 'next_casino_setup') return;
        await wait(300, config);
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
