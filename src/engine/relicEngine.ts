/**
 * RelicEngine — Pure adapter for relic hook execution.
 *
 * Wraps the existing RelicManager/hooks so that:
 *   - Value hooks pass through directly (they're already pure)
 *   - Interrupt hooks produce GameEvents instead of calling UI callbacks
 *   - Relic state mutations are captured immutably (copy-on-write)
 *   - Check hooks pass through directly (already pure booleans)
 *
 * This is the engine's interface to the relic system — the presentation
 * layer never sees RelicEngine, it only consumes the GameEvents.
 */

import type { GameEvent } from './GameEvent';
import type { GameState } from './GameState';
import type { Card, PlayerHand } from '../types';
import { RelicManager, RELIC_REGISTRY } from '../logic/relics/manager';
import type {
    RelicInstance,
    RelicConfig,
    RelicHooks,
    GameContext,
    PrioritizedHook,
    HandCompletionContext,
    RoundCompletionContext,
    HandBustContext,
    CardPlacedContext,
    ScoreRowContext,
    HighlightRelicFn,
} from '../logic/relics/types';
import type { HandScore, ScoringDetail } from '../types';

// ─── Result Type ────────────────────────────────────────

export interface RelicHookResult {
    /** Events produced by hook execution */
    events: GameEvent[];
    /** Updated relic inventory (with mutated state cloned) */
    inventory: RelicInstance[];
    /** Updated running summary (for scoring hooks) */
    runningSummary?: { chips: number; mult: number };
    /** Updated player hands (for onCardPlaced / onHandBust that modify hands) */
    playerHands?: PlayerHand[];
    /** Whether dealer hidden card was revealed */
    dealerRevealed?: boolean;
    /** Relics to remove from inventory */
    relicsToRemove?: string[];
}

// ─── Helper: Normalize Hook ─────────────────────────────

function normalizeHook<T>(hook: T | PrioritizedHook<T>): PrioritizedHook<T> {
    if (typeof hook === 'object' && hook !== null && 'priority' in hook && 'handler' in hook) {
        return hook as PrioritizedHook<T>;
    }
    return { priority: 0, handler: hook as T };
}

// ─── Helper: Deep clone relic state ─────────────────────

function cloneRelicState(state: Record<string, any>): Record<string, any> {
    return JSON.parse(JSON.stringify(state));
}

// ─── Helper: Collect active hooks ───────────────────────

interface ActiveHook {
    instanceIndex: number;
    relicId: string;
    priority: number;
    handler: Function;
    config: RelicConfig;
}

function collectHooks(
    hookName: keyof RelicHooks,
    inventory: RelicInstance[],
): ActiveHook[] {
    const hooks: ActiveHook[] = [];

    inventory.forEach((instance, idx) => {
        const config = RELIC_REGISTRY[instance.id];
        if (!config || !config.hooks[hookName]) return;

        const rawHook = config.hooks[hookName];
        const normalized = normalizeHook(rawHook as any);

        hooks.push({
            instanceIndex: idx,
            relicId: instance.id,
            priority: normalized.priority,
            handler: normalized.handler,
            config,
        });
    });

    hooks.sort((a, b) => a.priority - b.priority);
    return hooks;
}

// ─── Value Hook Passthrough ─────────────────────────────
// Value hooks are already pure — they take (value, context, relicState, config) → value
// We delegate directly to RelicManager which handles priority sorting.

export function executeValueHook<T>(
    hookName: keyof RelicHooks,
    initialValue: T,
    context: GameContext,
): T {
    return RelicManager.executeValueHook(hookName, initialValue, context);
}

// ─── Check Hook Passthrough ─────────────────────────────

export function executeCheckHook(
    hookName: keyof RelicHooks,
    context: GameContext,
): boolean {
    return RelicManager.executeCheckHook(hookName, context);
}

// ─── Interrupt Hooks: Pure Execution ────────────────────
// Instead of async callbacks, we create mock contexts that capture
// side effects and produce GameEvents.

/**
 * Execute onCardPlaced interrupt hooks purely.
 * Returns events + any hand/state modifications.
 */
export function executeOnCardPlaced(
    inventory: RelicInstance[],
    handIndex: number,
    handCards: Card[],
    placedCard: Card,
    blackjackValue: number,
    dealerCards: Card[],
): RelicHookResult {
    const events: GameEvent[] = [];
    const inv = inventory.map(i => ({ ...i, state: cloneRelicState(i.state) }));
    let currentHandCards = [...handCards];
    let dealerRevealed = false;

    const hooks = collectHooks('onCardPlaced', inv);

    for (const hook of hooks) {
        const instance = inv[hook.instanceIndex];

        // Create a pure context that captures side effects
        const ctx: any = {
            inventory: inv,
            handId: handIndex,
            handCards: currentHandCards,
            placedCard,
            blackjackValue,
            highlightRelic: async (relicId: string, options?: any) => {
                events.push({ type: 'relic_activated', relicId, description: `${hook.config.name} triggered` });
                // Execute the trigger callback synchronously if present
                if (options?.trigger) {
                    await options.trigger();
                }
            },
            modifyHand: (cards: Card[]) => {
                currentHandCards = cards;
                const newBJ = cards.length > 0 ? blackjackValue : 0; // Simplified; real recalc done in engine
                events.push({ type: 'hand_modified', handIndex, newCards: cards, newBlackjackValue: newBJ, reason: `relic:${hook.relicId}` });
            },
            revealDealerHiddenCard: () => {
                dealerRevealed = true;
                if (dealerCards.length > 0) {
                    events.push({ type: 'dealer_card_revealed', card: dealerCards[0] });
                }
            },
        };

        try {
            // Execute synchronously — the async nature is only for UI pauses we don't need
            hook.handler(ctx, instance.state, hook.config);
        } catch (e) {
            console.error(`Error in pure onCardPlaced for relic ${hook.relicId}:`, e);
        }

        // Track state changes
        events.push({ type: 'relic_state_changed', relicId: hook.relicId, newState: { ...instance.state } });
    }

    return { events, inventory: inv, dealerRevealed };
}

/**
 * Execute onHandBust interrupt hooks purely.
 * Returns events + any hand modifications.
 */
export function executeOnHandBust(
    inventory: RelicInstance[],
    handIndex: number,
    handCards: Card[],
): RelicHookResult {
    const events: GameEvent[] = [];
    const inv = inventory.map(i => ({ ...i, state: cloneRelicState(i.state) }));
    let currentHandCards = [...handCards];

    const hooks = collectHooks('onHandBust', inv);

    for (const hook of hooks) {
        const instance = inv[hook.instanceIndex];

        const ctx: any = {
            inventory: inv,
            handId: handIndex,
            handCards: currentHandCards,
            highlightRelic: async (relicId: string, options?: any) => {
                events.push({ type: 'relic_activated', relicId, description: `${hook.config.name} triggered on bust` });
                if (options?.trigger) {
                    await options.trigger();
                }
            },
            modifyHand: (cards: Card[]) => {
                currentHandCards = cards;
                events.push({ type: 'hand_modified', handIndex, newCards: cards, newBlackjackValue: 0, reason: `relic:${hook.relicId}` });
            },
        };

        try {
            hook.handler(ctx, instance.state, hook.config);
        } catch (e) {
            console.error(`Error in pure onHandBust for relic ${hook.relicId}:`, e);
        }

        events.push({ type: 'relic_state_changed', relicId: hook.relicId, newState: { ...instance.state } });
    }

    return { events, inventory: inv };
}

/**
 * Execute onScoreRow interrupt hooks purely.
 * These trigger relic highlights when specific scoring rows appear.
 */
export function executeOnScoreRow(
    inventory: RelicInstance[],
    criterionId: string,
    score: HandScore,
    runningSummary: { chips: number; mult: number },
): RelicHookResult {
    const events: GameEvent[] = [];
    const inv = inventory.map(i => ({ ...i, state: cloneRelicState(i.state) }));
    let summary = { ...runningSummary };

    const hooks = collectHooks('onScoreRow', inv);

    for (const hook of hooks) {
        const instance = inv[hook.instanceIndex];

        const ctx: any = {
            inventory: inv,
            criterionId,
            score,
            highlightRelic: async (relicId: string, options?: any) => {
                events.push({ type: 'relic_activated', relicId, description: `${hook.config.name} scored` });
                if (options?.trigger) {
                    await options.trigger();
                }
            },
            modifyRunningSummary: (chipsToAdd: number, multToAdd: number) => {
                summary = { chips: summary.chips + chipsToAdd, mult: summary.mult + multToAdd };
                events.push({ type: 'summary_update', ...summary });
            },
        };

        try {
            hook.handler(ctx, instance.state, hook.config);
        } catch (e) {
            console.error(`Error in pure onScoreRow for relic ${hook.relicId}:`, e);
        }
    }

    return { events, inventory: inv, runningSummary: summary };
}

/**
 * Execute onHandCompletion interrupt hooks purely.
 * These trigger after a winning hand is fully scored (e.g., royalty bonus).
 */
export function executeOnHandCompletion(
    inventory: RelicInstance[],
    handCards: Card[],
    score: HandScore,
    runningSummary: { chips: number; mult: number },
): RelicHookResult {
    const events: GameEvent[] = [];
    const inv = inventory.map(i => ({ ...i, state: cloneRelicState(i.state) }));
    let summary = { ...runningSummary };

    const hooks = collectHooks('onHandCompletion', inv);

    for (const hook of hooks) {
        const instance = inv[hook.instanceIndex];

        const ctx: any = {
            inventory: inv,
            handCards,
            score,
            highlightRelic: async (relicId: string, options?: any) => {
                events.push({ type: 'relic_activated', relicId, description: `${hook.config.name} hand completion` });
                if (options?.trigger) {
                    await options.trigger();
                }
            },
            modifyRunningSummary: (chipsToAdd: number, multToAdd: number) => {
                summary = { chips: summary.chips + chipsToAdd, mult: summary.mult + multToAdd };
                events.push({ type: 'summary_update', ...summary });
            },
        };

        try {
            hook.handler(ctx, instance.state, hook.config);
        } catch (e) {
            console.error(`Error in pure onHandCompletion for relic ${hook.relicId}:`, e);
        }

        events.push({ type: 'relic_state_changed', relicId: hook.relicId, newState: { ...instance.state } });
    }

    return { events, inventory: inv, runningSummary: summary };
}

/**
 * Execute onRoundCompletion interrupt hooks purely.
 * These trigger after all hands are scored (e.g., high roller, faded tag).
 */
export function executeOnRoundCompletion(
    inventory: RelicInstance[],
    wins: number,
    losses: number,
    vigintis: number,
    runningSummary: { chips: number; mult: number },
    playerHands: PlayerHand[],
): RelicHookResult {
    const events: GameEvent[] = [];
    const inv = inventory.map(i => ({ ...i, state: cloneRelicState(i.state) }));
    let summary = { ...runningSummary };
    const relicsToRemove: string[] = [];

    const hooks = collectHooks('onRoundCompletion', inv);

    for (const hook of hooks) {
        const instance = inv[hook.instanceIndex];

        const ctx: any = {
            inventory: inv,
            wins,
            losses,
            vigintis,
            runningSummary: { ...summary },
            playerHands,
            highlightRelic: async (relicId: string, options?: any) => {
                events.push({ type: 'relic_activated', relicId, description: `${hook.config.name} round completion` });
                if (options?.trigger) {
                    await options.trigger();
                }
            },
            modifyRunningSummary: (chipsToAdd: number, multToAdd: number) => {
                summary = { chips: summary.chips + chipsToAdd, mult: summary.mult + multToAdd };
                events.push({ type: 'summary_update', ...summary });
            },
            removeRelic: (relicId: string) => {
                relicsToRemove.push(relicId);
                events.push({ type: 'relic_removed', relicId });
            },
        };

        try {
            hook.handler(ctx, instance.state, hook.config);
        } catch (e) {
            console.error(`Error in pure onRoundCompletion for relic ${hook.relicId}:`, e);
        }

        events.push({ type: 'relic_state_changed', relicId: hook.relicId, newState: { ...instance.state } });
    }

    return { events, inventory: inv, runningSummary: summary, relicsToRemove };
}

// ─── Convenience: Get Relic Config ──────────────────────

export function getRelicConfig(id: string): RelicConfig | undefined {
    return RelicManager.getRelicConfig(id);
}
