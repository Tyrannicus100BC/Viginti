export type TutorialHighlight = {
    readonly elementId: string;
    readonly type: 'rect' | 'circle';
    readonly padding?: number;
};

export type TutorialCompletionCondition = 'click' | 'custom';
export type TutorialScrim = 'auto' | 'dim' | 'none';
export type TutorialScope = 'session' | 'global';

export interface TutorialDisplayConfig {
    readonly id: string;
    readonly text: string;
    readonly highlight?: TutorialHighlight;
    readonly scrim?: TutorialScrim;
    readonly blockInput?: boolean;
    readonly messagePosition?: 'left' | 'right' | 'top' | 'bottom' | 'center';
    readonly completionType: TutorialCompletionCondition;
}

// Pure engine definition of a tutorial step
export interface TutorialStep {
    readonly id: string;
    readonly type: 'message'; // For now, only messages. Could be 'sequence' later.
    
    // Display configuration
    readonly display: TutorialDisplayConfig;

    // Logic
    readonly scope: TutorialScope;
    readonly triggerCondition?: TutorialCondition; // When to START this tutorial
    readonly completeCondition?: TutorialCondition; // When to COMPLETE this tutorial (if custom)
    readonly nextStepId?: string; // ID of step to trigger immediately after completion
    
    // Input constraints
    readonly allowedActions?: string[]; // If present, only these action types are allowed while active
    readonly blockInput?: boolean; // If true, blocks all actions except acknowledge/allowed
    
    // Action to run on completion (e.g. 'deal_first_hand')
    readonly onCompleteAction?: string;
}

// Function types for logic
export type TutorialCondition = (state: any, lastEvents: any[]) => boolean; 
// We use 'any' here to avoid circular dependency on GameState/GameEvent in types file
// In implementation we will cast or use generic

