import type { GameState, TutorialState } from '../GameState';
import type { GameEvent } from '../GameEvent';
import type { PlayerAction } from '../PlayerAction';
import { TUTORIAL_STEPS } from './definitions';
import type { TutorialStep } from './types';

type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};

// ─── Helpers ────────────────────────────────────────────

function getStep(id: string): TutorialStep | undefined {
    return TUTORIAL_STEPS.find(s => s.id === id);
}

function isStepCompleted(state: TutorialState, step: TutorialStep): boolean {
    if (step.scope === 'global') {
        return state.globalCompletedStepIds.includes(step.id);
    }
    return state.completedStepIds.includes(step.id);
}

// ─── Core Logic ─────────────────────────────────────────

export function initialTutorialState(): TutorialState {
    return {
        activeStepId: null,
        completedStepIds: [],
        globalCompletedStepIds: [],
    };
}

export function checkTutorialTriggers(
    state: GameState,
    recentEvents: GameEvent[]
): {
    nextTutorialState: TutorialState;
    tutorialEvents: GameEvent[];
    triggeredAction?: string; // If a step completes and triggers an action
} {
    let nextState: Mutable<TutorialState> = { ...state.tutorial };
    const newEvents: GameEvent[] = [];
    let triggeredAction: string | undefined;

    // 1. Check active step completion
    if (nextState.activeStepId) {
        const activeStep = getStep(nextState.activeStepId);
        if (activeStep) {
            // Custom completion condition (e.g. event fired)
            if (activeStep.completeCondition && activeStep.completeCondition(state, recentEvents)) {
                
                // Mark complete
                if (activeStep.scope === 'global') {
                    nextState.globalCompletedStepIds = [...nextState.globalCompletedStepIds, activeStep.id];
                } else {
                    nextState.completedStepIds = [...nextState.completedStepIds, activeStep.id];
                }
                
                nextState.activeStepId = null;
                newEvents.push({ type: 'tutorial_completed', stepId: activeStep.id, scope: activeStep.scope });

                if (activeStep.onCompleteAction) {
                    triggeredAction = activeStep.onCompleteAction;
                }

                // Chain next step if defined
                if (activeStep.nextStepId) {
                    const nextStep = getStep(activeStep.nextStepId);
                    if (nextStep && !isStepCompleted(nextState, nextStep)) {
                        nextState.activeStepId = nextStep.id;
                        newEvents.push({ type: 'tutorial_triggered', stepId: nextStep.id, config: nextStep.display });
                        return { nextTutorialState: nextState, tutorialEvents: newEvents, triggeredAction };
                    }
                }
            }
        } else {
            // Active step ID not found in definitions? clear it.
            nextState.activeStepId = null;
        }
    }

    // 2. If no active step (or just cleared), check triggers
    if (!nextState.activeStepId) {
        for (const step of TUTORIAL_STEPS) {
            if (isStepCompleted(nextState, step)) continue;

            if (step.triggerCondition && step.triggerCondition(state, recentEvents)) {
                nextState.activeStepId = step.id;
                newEvents.push({ type: 'tutorial_triggered', stepId: step.id, config: step.display });
                break; // One at a time
            }
        }
    }

    return { nextTutorialState: nextState, tutorialEvents: newEvents, triggeredAction };
}

export function handleTutorialAction(
    state: GameState,
    action: PlayerAction
): {
    nextTutorialState: TutorialState;
    tutorialEvents: GameEvent[];
    triggeredAction?: string;
} {
    // Only handle 'acknowledge_tutorial'
    if (action.type !== 'acknowledge_tutorial') {
        return { nextTutorialState: state.tutorial, tutorialEvents: [] };
    }

    let nextState: Mutable<TutorialState> = { ...state.tutorial };
    const newEvents: GameEvent[] = [];
    let triggeredAction: string | undefined;

    const stepId = action.stepId;
    if (nextState.activeStepId !== stepId) {
        // Warning: acknowledged step that isn't active. Ignore.
        return { nextTutorialState: nextState, tutorialEvents: [] };
    }

    const activeStep = getStep(stepId);
    if (!activeStep) {
         nextState.activeStepId = null; // Clear invalid
         return { nextTutorialState: nextState, tutorialEvents: [] };
    }

    // Mark complete
    if (activeStep.scope === 'global') {
        nextState.globalCompletedStepIds = [...nextState.globalCompletedStepIds, stepId];
    } else {
        nextState.completedStepIds = [...nextState.completedStepIds, stepId];
    }
    
    nextState.activeStepId = null;
    newEvents.push({ type: 'tutorial_completed', stepId, scope: activeStep.scope });

    if (activeStep.onCompleteAction) {
        triggeredAction = activeStep.onCompleteAction;
    }

    // Chain
    if (activeStep.nextStepId) {
        const nextStep = getStep(activeStep.nextStepId);
        if (nextStep && !isStepCompleted(nextState, nextStep)) {
            nextState.activeStepId = nextStep.id;
            newEvents.push({ type: 'tutorial_triggered', stepId: nextStep.id, config: nextStep.display });
        }
    }

    return { nextTutorialState: nextState, tutorialEvents: newEvents, triggeredAction };
}

export function getTutorialRestrictedActions(activeStepId: string): string[] | undefined {
    const step = getStep(activeStepId);
    if (!step) return undefined;
    
    // If blockInput is true, return allowedActions (or empty if none)
    if (step.display.blockInput || step.blockInput) { // Check both pure logic and display config
        return step.allowedActions ?? []; 
    }
    
    return undefined; // No restrictions
}

export function canAcknowledgeTutorial(activeStepId: string): boolean {
    const step = getStep(activeStepId);
    if (!step) return false;
    return step.display.completionType === 'click';
}
