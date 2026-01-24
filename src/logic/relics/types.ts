
import type { Card, HandScore, ScoringCriterionId } from '../../types';

export type HookType = 'value' | 'interrupt';

export interface Relic {
    id: string;
    name: string;
    description: string;
    category?: string;
    icon?: string;
}

export interface RelicConfig extends Relic {
    hooks: RelicHooks;
    properties?: Record<string, any>;
}

export interface RelicInstance {
    id: string;
    state: Record<string, any>;
}

// Priority: Higher numbers execute LATER (wrapping the result) for Value hooks usually? 
// No, usually for "pipeline" style value modifications:
// Start -> Relic A (Prio 1) -> Relic B (Prio 10) -> End.
// So Order: sort by Priority ASC, then Inventory Order.
export type PrioritizedHook<T> = {
    priority: number; // Default 0
    handler: T;
}

// Helper to define a hook with priority
export function withPriority<T>(priority: number, handler: T): PrioritizedHook<T> {
    return { priority, handler };
}

// Map of hook names to their handler signatures
// Values can be either the function directly (default priority 0) or a PrioritizedHook
export interface RelicHooks {
    // Value Hooks (Sync, expected to return modified value)
    getDealsPerCasino?: ValueHook<(value: number, context: GameContext, relicState: any) => number>;
    getDealerStopValue?: ValueHook<(value: number, context: GameContext, relicState: any) => number>;
    getCardValue?: ValueHook<(value: number, context: CardValueContext, relicState: any) => number>;
    adjustBlackjackScore?: ValueHook<(value: number, context: { handCards: Card[] }, relicState: any) => number>;
    onEvaluateHandScore?: ValueHook<(score: HandScore, context: HandContext, relicState: any) => HandScore>;
    
    // Interrupt Hooks (Async, can pause flow)
    onScoreRow?: ValueHook<(context: ScoreRowContext, relicState: any) => Promise<void>>;
    onHandCompletion?: ValueHook<(context: HandCompletionContext, relicState: any) => Promise<void>>;
    onRoundCompletion?: ValueHook<(context: RoundCompletionContext, relicState: any) => Promise<void>>;
}

export type ValueHook<T> = T | PrioritizedHook<T>;

export interface HighlightOptions {
    preDelay?: number;
    duration?: number;
    postDelay?: number;
    trigger?: () => Promise<void> | void;
}

export type HighlightRelicFn = (relicId: string, options?: HighlightOptions) => Promise<void>;

export interface GameContext {
    inventory: RelicInstance[]; // List of relic instances
}

export interface CardValueContext extends GameContext {
    card: Card;
}

export interface HandContext extends GameContext {
    handCards: Card[];
    isWin: boolean;
    isDoubled: boolean;
    handsRemaining: number;
}

export interface InterruptContext extends GameContext {
    highlightRelic: HighlightRelicFn;
}

export interface HandCompletionContext extends InterruptContext {
    handCards: Card[];
    score: HandScore;
    modifyRunningSummary: (chipsToAdd: number, multToAdd: number) => void;
}

export interface RoundCompletionContext extends InterruptContext {
    wins: number;
    losses: number;
    vigintis: number;
    runningSummary: { chips: number; mult: number };
    modifyRunningSummary: (chipsToAdd: number, multToAdd: number) => void;
    playerHands: any[]; // Avoid circular dependency with PlayerHand from main types
}

export interface RoundSummary {
    totalChips: number;
    totalMult: number;
    finalScore: number;
}

export interface RoundContext extends GameContext {
    wins: number;
    losses: number;
    vigintis: number; // blackjack wins
}

export interface ScoreRowContext extends InterruptContext {
    criterionId: ScoringCriterionId;
    score: HandScore;
}
