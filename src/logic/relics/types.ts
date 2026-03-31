
import type { Card, HandScore, ScoringCriterionId } from '../../types';

export type HookType = 'value' | 'interrupt';

export type RelicRarity = 'Common' | 'Uncommon' | 'Rare';

export type TableActionRecharge =
    | 'none'
    | 'casino'
    | 'bust'
    | 'loss'
    | 'bust_or_loss';

export type TableActionConfig = {
    label: string;
    accentColor: string;
    maxCharges: number;
    chargeCost: number;
    recharge: TableActionRecharge;
    prompt?: string;
    promptWhenHeld?: string;
};

export type Relic = {
    id: string;
    name: string;
    rarity: RelicRarity;
    description: string;
    categories: string[];
    icon?: string;
    tableAction?: TableActionConfig;
    handType?: {
        id: ScoringCriterionId;
        name: string;
        chips: number;
        mult: number;
        order: number;
        chipCards?: boolean;
        chipRun?: number;
        multRun?: number;
    };
    extraHandTypes?: Record<string, {
        id: ScoringCriterionId;
        name: string;
        chips: number;
        mult: number;
        order: number;
        chipCards?: boolean;
    }>;
}

export type RelicDefinition = {
    name: string;
    rarity: RelicRarity;
    categories: string[];
    description: string;
    properties?: Record<string, any>;
    hooks?: RelicHooks;
    tableAction?: TableActionConfig;
    handType?: {
        id: ScoringCriterionId;
        name: string;
        chips: number;
        mult: number;
        order: number;
        chipCards?: boolean;
        chipRun?: number;
        multRun?: number;
    };
    extraHandTypes?: Record<string, {
        id: ScoringCriterionId;
        name: string;
        chips: number;
        mult: number;
        order: number;
        chipCards?: boolean;
    }>;
    // Optional overrides if strict control is needed
    id?: string;
    icon?: string;
}

export type RelicConfig = Relic & {
    hooks: RelicHooks;
    properties?: Record<string, any>;
    tableAction?: TableActionConfig;
    handType?: {
        id: ScoringCriterionId; // Maps to the ID used in criteria
        name: string;      // Display Name
        chips: number;     // Base Chips
        mult: number;      // Base Mult
        order: number;     // Sort order for UI
        chipCards?: boolean;
        chipRun?: number;
        multRun?: number;
    };
    extraHandTypes?: Record<string, {
        id: ScoringCriterionId;
        name: string;
        chips: number;
        mult: number;
        order: number;
        chipCards?: boolean;
    }>;
}


export type RelicInstance = {
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
export type RelicHooks = {
    // Value Hooks (Sync, expected to return modified value)
    getDealsPerCasino?: ValueHook<(value: number, context: GameContext, relicState: any, config: RelicConfig) => number>;
    getDealerStopValue?: ValueHook<(value: number, context: GameContext, relicState: any, config: RelicConfig) => number>;
    getDrawCount?: ValueHook<(value: number, context: GameContext, relicState: any, config: RelicConfig) => number>;
    getPlaceCount?: ValueHook<(value: number, context: GameContext, relicState: any, config: RelicConfig) => number>;
    getCardValue?: ValueHook<(value: number, context: CardValueContext, relicState: any, config: RelicConfig) => number>;
    getMaxCharms?: ValueHook<(value: number, context: GameContext, relicState: any, config: RelicConfig) => number>;
    getMaxAngles?: ValueHook<(value: number, context: GameContext, relicState: any, config: RelicConfig) => number>;
    adjustBlackjackScore?: ValueHook<(value: number, context: { handCards: Card[] }, relicState: any, config: RelicConfig) => number>;
    onEvaluateHandScore?: ValueHook<(score: HandScore, context: HandContext, relicState: any, config: RelicConfig) => HandScore>;
    
    // Check Hooks (Synchronous, returns boolean)
    onCheckCardPlace?: ValueHook<(context: CardPlacedContext, relicState: any, config: RelicConfig) => boolean>;
    
    // Interrupt Hooks (Async, can pause flow)
    onCardPlaced?: ValueHook<(context: CardPlacedContext, relicState: any, config: RelicConfig) => Promise<void>>;
    onScoreRow?: ValueHook<(context: ScoreRowContext, relicState: any, config: RelicConfig) => Promise<void>>;
    onHandCompletion?: ValueHook<(context: HandCompletionContext, relicState: any, config: RelicConfig) => Promise<void>>;
    onHandBust?: ValueHook<(context: HandBustContext, relicState: any, config: RelicConfig) => Promise<void>>;
    onDealCompletion?: ValueHook<(context: DealCompletionContext, relicState: any, config: RelicConfig) => Promise<void>>;
}

export type ValueHook<T> = T | PrioritizedHook<T>;

export type HighlightOptions = {
    preDelay?: number;
    duration?: number;
    postDelay?: number;
    trigger?: () => Promise<void> | void;
}

export type HighlightRelicFn = (relicId: string, options?: HighlightOptions) => Promise<void>;

export type GameContext = {
    inventory: RelicInstance[]; // List of relic instances
    dryRun?: boolean;
}

export type CardValueContext = GameContext & {
    card: Card;
}

export type HandContext = GameContext & {
    handCards: Card[];
    isWin: boolean;
    isDoubled: boolean;
    handsRemaining: number;
    blackjackValue: number;
    categoryCounts?: Record<string, number>;
}

export type InterruptContext = GameContext & {
    highlightRelic: HighlightRelicFn;
}

export type HandCompletionContext = InterruptContext & {
    handCards: Card[];
    score: HandScore;
    modifyRunningSummary: (chipsToAdd: number, multToAdd: number) => void;
}

export type DealCompletionContext = InterruptContext & {
    wins: number;
    losses: number;
    vigintis: number;
    runningSummary: { chips: number; mult: number };
    modifyRunningSummary: (chipsToAdd: number, multToAdd: number) => void;
    removeRelic?: (relicId: string) => void;
    playerHands: any[]; // Avoid circular dependency with PlayerHand from main types
}

export type DealSummary = {
    totalChips: number;
    totalMult: number;
    finalScore: number;
}

export type DealContext = GameContext & {
    wins: number;
    losses: number;
    vigintis: number; // blackjack wins
}

export type ScoreRowContext = InterruptContext & {
    criterionId: ScoringCriterionId;
    score: HandScore;
    modifyRunningSummary: (chipsToAdd: number, multToAdd: number) => void;
    categoryCounts?: Record<string, number>;
}

export type HandBustContext = InterruptContext & {
    handId: number;
    handCards: Card[];
    modifyHand: (cards: Card[]) => void;
}

export type CardPlacedContext = InterruptContext & {
    handId: number;
    handCards: Card[];
    placedCard: Card;
    blackjackValue: number;
    modifyHand: (cards: Card[]) => void;
    revealDealerHiddenCard: () => void;
}
