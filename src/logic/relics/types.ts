
import type { Card, HandScore, ScoringCriterionId } from '../../types';

export type HookType = 'value' | 'interrupt';

export interface Relic {
    id: string;
    name: string;
    description: string;
    icon?: string;
}

export interface RelicConfig extends Relic {
    hooks: RelicHooks;
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
    getDealsPerCasino?: ValueHook<(value: number, context: GameContext) => number>;
    getDealerStopValue?: ValueHook<(value: number, context: GameContext) => number>;
    getCardValue?: ValueHook<(value: number, context: CardValueContext) => number>;
    adjustBlackjackScore?: ValueHook<(value: number, context: { handCards: Card[] }) => number>;
    onEvaluateHandScore?: ValueHook<(score: HandScore, context: HandContext) => HandScore>;
    
    // Interrupt Hooks (Async, can pause flow)
    onScoreRow?: ValueHook<(context: ScoreRowContext) => Promise<void>>;
    onRoundCompletion?: ValueHook<(context: RoundCompletionContext) => Promise<void>>;
}

export type ValueHook<T> = T | PrioritizedHook<T>;

export interface GameContext {
    inventory: string[]; // List of relic IDs
}

export interface CardValueContext extends GameContext {
    card: Card;
}

export interface HandContext extends GameContext {
    handCards: Card[];
    isWin: boolean;
    isDoubled: boolean;
}

export interface RoundCompletionContext extends GameContext {
    wins: number;
    losses: number;
    vigintis: number;
    runningSummary: { chips: number; mult: number };
    modifyRunningSummary: (chipsToAdd: number, multToAdd: number) => void;
    highlightRelic: (relicId: string) => Promise<void>; 
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

export interface ScoreRowContext extends GameContext {
    criterionId: ScoringCriterionId;
    score: HandScore;
    // Method to trigger UI effects
    highlightRelic: (relicId: string) => Promise<void>; 
}
