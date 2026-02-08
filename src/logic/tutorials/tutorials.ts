
import type { RelicHooks } from '../relics/types';
import { getGlobalTutorialsCompleted, resetGlobalTutorialsCompleted, setGlobalTutorialsCompleted } from '../../store/persistence';

export type TutorialHighlight = {
    elementId: string; // ID of the HTML element to highlight
    type: 'rect' | 'circle';
    padding?: number;
};

export type TutorialCompletionCondition = 'click' | 'custom';
export type TutorialScrim = 'auto' | 'dim' | 'none';
export type TutorialScope = 'session' | 'global';

export type TutorialActionContext = {
    stepId: string;
    step: TutorialStep;
};

export type TutorialContinueAction = (context: TutorialActionContext) => Promise<void> | void;

export interface TutorialStep {
    id: string;
    text: string;
    highlight?: TutorialHighlight;
    condition: (context: any) => boolean; // Global condition to START this tutorial
    completionType: TutorialCompletionCondition;
    scope?: TutorialScope; // session = reset on new run, global = persisted
    completeOnEventId?: string; // Auto-complete when this event fires
    completeDelayMs?: number; // Optional delay before auto-complete

    // Optional UI behavior
    scrim?: TutorialScrim; // auto = dim when no highlight, dim = always, none = never
    startDelayMs?: number; // Delay before showing once condition is met
    blockInputDuringDelay?: boolean; // Eat clicks while waiting to show
    continueActionId?: string; // Action to run after dismiss for click-to-continue
    autoTrigger?: boolean; // If false, only triggered by chaining

    // Optional event-driven activation
    waitForEventId?: string; // Wait for external event before showing
    armCondition?: (context: any) => boolean; // Condition to begin waiting for event
    blockInputUntilEvent?: boolean; // Block input while waiting for event
    dismissAfterEventId?: string; // If set, click-to-continue is disabled until this event fires
    
    // If completionType is 'custom', this hook handles checking for completion
    // The hook effectively is "on[Event]" -> check logic -> if passed, call manager.completeStep(id)
    hooks?: RelicHooks;
    
    // Next step in chain (optional)
    nextStepId?: string;
}

export class TutorialManager {
    private static instance: TutorialManager;
    private completedSessionSteps: Set<string> = new Set();
    private completedGlobalSteps: Set<string> = new Set();
    private activeStep: TutorialStep | null = null;
    private listeners: ((step: TutorialStep | null) => void)[] = [];
    private allSteps: Record<string, TutorialStep> = {};
    private actionRegistry: Record<string, TutorialContinueAction> = {};
    private inputLocked = false;
    private lastContext: any = null;
    private externalContext: Record<string, any> = {};
    private pendingActivation: { stepId: string; timeoutId: number } | null = null;
    private waitingSteps: Map<string, { eventId: string; blockInput: boolean }> = new Map();
    private waitingByEvent: Map<string, Set<string>> = new Map();
    private firedEvents: Set<string> = new Set();
    private sessionTutorialsEnabled = false;

    private constructor() {
        this.loadProgress();
    }

    public static getInstance(): TutorialManager {
        if (!TutorialManager.instance) {
            TutorialManager.instance = new TutorialManager();
        }
        return TutorialManager.instance;
    }

    public registerSteps(steps: TutorialStep[]) {
        steps.forEach(step => {
            this.allSteps[step.id] = step;
        });
    }

    public registerActions(actions: Record<string, TutorialContinueAction>) {
        this.actionRegistry = { ...this.actionRegistry, ...actions };
    }

    public setContext(partial: Record<string, any>) {
        this.externalContext = { ...this.externalContext, ...partial };
    }

    public getContext() {
        return this.externalContext;
    }

    public isInputLocked() {
        return this.inputLocked;
    }

    private loadProgress() {
        this.completedGlobalSteps = new Set(getGlobalTutorialsCompleted());
    }

    private saveProgress() {
        setGlobalTutorialsCompleted(Array.from(this.completedGlobalSteps));
    }

    private getStepScope(stepId: string, step?: TutorialStep): TutorialScope {
        const resolved = step ?? this.allSteps[stepId];
        return resolved?.scope ?? 'session';
    }

    private isStepCompleted(stepId: string, step?: TutorialStep): boolean {
        const scope = this.getStepScope(stepId, step);
        if (scope === 'global') {
            return this.completedGlobalSteps.has(stepId);
        }
        return this.completedSessionSteps.has(stepId);
    }

    public isCompleted(stepId: string): boolean {
        return this.isStepCompleted(stepId);
    }

    public completeStep(stepId: string) {
        const step = this.allSteps[stepId];
        const scope = this.getStepScope(stepId, step);
        const completedSet = scope === 'global' ? this.completedGlobalSteps : this.completedSessionSteps;

        if (!completedSet.has(stepId)) {
            completedSet.add(stepId);
            if (scope === 'global') {
                this.saveProgress();
            }
            
            if (this.activeStep?.id === stepId) {
                const nextId = this.activeStep.nextStepId;
                this.activeStep = null;
                this.updateInputLock();

                if (nextId) {
                    this.notifyListeners();
                    this.tryTriggerStep(nextId, this.lastContext, 'chain');
                    return;
                }

                if (this.activateReadyEventSteps()) {
                    return;
                }

                if (this.activateReadyAutoSteps()) {
                    return;
                }

                this.notifyListeners();
            }
        }
    }

    public reset() {
        this.completedSessionSteps.clear();
        this.completedGlobalSteps.clear();
        this.activeStep = null;
        this.waitingSteps.clear();
        this.waitingByEvent.clear();
        this.firedEvents.clear();
        this.updateInputLock();
        this.clearPendingActivation();
        resetGlobalTutorialsCompleted();
        this.notifyListeners();
        // Potentially re-evaluate initial triggers? 
        // For now, simple reset.
    }

    public setCompletedSteps(stepIds: string[]) {
        const sessionIds: string[] = [];
        const globalIds: string[] = [];

        stepIds.forEach(stepId => {
            const scope = this.getStepScope(stepId);
            if (scope === 'global') {
                globalIds.push(stepId);
            } else {
                sessionIds.push(stepId);
            }
        });

        this.completedSessionSteps = new Set(sessionIds);
        this.completedGlobalSteps = new Set(globalIds);
        this.activeStep = null;
        this.waitingSteps.clear();
        this.waitingByEvent.clear();
        this.firedEvents.clear();
        this.updateInputLock();
        this.clearPendingActivation();
        this.saveProgress();
        this.notifyListeners();
    }

    public resetSessionTutorials() {
        this.completedSessionSteps.clear();
        this.activeStep = null;
        this.waitingSteps.clear();
        this.waitingByEvent.clear();
        this.firedEvents.clear();
        this.updateInputLock();
        this.clearPendingActivation();
        this.notifyListeners();
    }

    public setSessionTutorialsEnabled(enabled: boolean) {
        this.sessionTutorialsEnabled = enabled;
        if (!enabled) {
            this.resetSessionTutorials();
        }
    }

    public areSessionTutorialsEnabled() {
        return this.sessionTutorialsEnabled;
    }

    public tryTriggerStep(stepId: string, context?: any, source: 'auto' | 'chain' = 'auto'): boolean {
        const step = this.allSteps[stepId];
        if (!step) return false;
        if (this.getStepScope(stepId, step) === 'session' && !this.sessionTutorialsEnabled) return false;

        // Don't trigger if already completed or if another step is active (unless we allow queuing/overriding? For now, 1 at a time)
        if (this.isStepCompleted(stepId, step)) return false;
        if (this.activeStep) return false; // One tutorial at a time

        if (context !== undefined) {
            this.lastContext = context;
        }

        if (source === 'auto' && step.autoTrigger === false) return false;

        if (step.waitForEventId) {
            if (this.firedEvents.has(step.waitForEventId)) {
                if (step.condition(context ?? this.lastContext)) {
                    this.activateStep(step);
                    return true;
                }
                return false;
            }

            const armCondition = step.armCondition ?? step.condition;
            if (!armCondition(context ?? this.lastContext)) return false;

            this.armStep(step);
            return true;
        }

        // Check condition
        if (step.condition(context ?? this.lastContext)) {
            if (step.startDelayMs && step.startDelayMs > 0) {
                if (this.pendingActivation?.stepId === stepId) return true;

                this.clearPendingActivation();

                const timeoutId = window.setTimeout(() => {
                    this.pendingActivation = null;

                    if (this.activeStep || this.isStepCompleted(stepId, step)) return;
                    if (!step.condition(this.lastContext)) {
                        this.updateInputLock();
                        return;
                    }

                    this.activateStep(step);
                }, step.startDelayMs);

                this.pendingActivation = { stepId, timeoutId };
                this.updateInputLock();
                return true;
            }

            this.activateStep(step);
            return true;
        }
        return false;
    }

    // Called by UI to dismiss click-to-continue steps
    public async handleOverlayClick() {
        if (!this.activeStep || this.activeStep.completionType !== 'click') return false;
        if (!this.canDismissActiveStep()) return false;
        const step = this.activeStep;
        this.completeStep(step.id);
        await this.runContinueAction(step);
        return true;
    }

    public canDismissActiveStep() {
        if (!this.activeStep || this.activeStep.completionType !== 'click') return false;
        const requiredEvent = this.activeStep.dismissAfterEventId;
        if (requiredEvent && !this.firedEvents.has(requiredEvent)) return false;
        return true;
    }

    public releaseInputLock() {
        this.updateInputLock();
    }

    public async runContinueAction(step: TutorialStep) {
        if (!step.continueActionId) return;
        const action = this.actionRegistry[step.continueActionId];
        if (!action) {
            console.warn(`Tutorial continue action not registered: ${step.continueActionId}`);
            return;
        }
        await action({ stepId: step.id, step });
    }

    public getActiveStep() {
        return this.activeStep;
    }

    public subscribe(listener: (step: TutorialStep | null) => void) {
        this.listeners.push(listener);
        listener(this.activeStep);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notifyListeners() {
        this.listeners.forEach(l => l(this.activeStep));
    }

    private activateStep(step: TutorialStep) {
        this.activeStep = step;
        this.clearPendingActivation();
        this.updateInputLock();
        this.notifyListeners();
    }

    private clearPendingActivation() {
        if (this.pendingActivation) {
            clearTimeout(this.pendingActivation.timeoutId);
            this.pendingActivation = null;
            this.updateInputLock();
        }
    }

    private armStep(step: TutorialStep) {
        if (!step.waitForEventId) return;
        if (this.waitingSteps.has(step.id)) return;

        this.waitingSteps.set(step.id, {
            eventId: step.waitForEventId,
            blockInput: !!step.blockInputUntilEvent
        });

        const waitingSet = this.waitingByEvent.get(step.waitForEventId) ?? new Set<string>();
        waitingSet.add(step.id);
        this.waitingByEvent.set(step.waitForEventId, waitingSet);
        this.updateInputLock();
    }

    public signalEvent(eventId: string, context?: any) {
        this.firedEvents.add(eventId);
        if (context !== undefined) {
            this.lastContext = context;
        }

        if (this.activeStep && this.activeStep.completeOnEventId === eventId) {
            const delay = this.activeStep.completeDelayMs ?? 0;
            if (delay > 0) {
                window.setTimeout(() => {
                    this.completeStep(this.activeStep!.id);
                }, delay);
            } else {
                this.completeStep(this.activeStep.id);
            }
        }

        const waitingSet = this.waitingByEvent.get(eventId);
        if (!waitingSet || waitingSet.size === 0) {
            return;
        }

        // Only trigger one at a time
        if (this.activeStep) return;

        for (const stepId of Array.from(waitingSet)) {
            const step = this.allSteps[stepId];
            if (!step || this.isStepCompleted(stepId, step)) {
                waitingSet.delete(stepId);
                this.waitingSteps.delete(stepId);
                continue;
            }

            const conditionMet = step.condition(this.lastContext);
            waitingSet.delete(stepId);
            this.waitingSteps.delete(stepId);

            if (conditionMet && !this.activeStep) {
                this.activateStep(step);
                break;
            }
        }

        if (waitingSet.size === 0) {
            this.waitingByEvent.delete(eventId);
        }

        this.updateInputLock();
    }

    private updateInputLock() {
        const waitingBlocks = Array.from(this.waitingSteps.values()).some(w => w.blockInput);
        const activeBlocks = this.activeStep?.completionType === 'click';
        const pendingStep = this.pendingActivation ? this.allSteps[this.pendingActivation.stepId] : null;
        const pendingBlocks = !!pendingStep?.blockInputDuringDelay;
        this.inputLocked = waitingBlocks || !!activeBlocks || pendingBlocks;
    }

    private activateReadyAutoSteps(): boolean {
        if (this.activeStep) return false;
        if (this.lastContext == null) return false;

        for (const step of Object.values(this.allSteps)) {
            if (this.activeStep) break;
            this.tryTriggerStep(step.id, this.lastContext, 'auto');
        }

        return !!this.activeStep;
    }

    private activateReadyEventSteps(): boolean {
        if (this.activeStep) return false;

        for (const [stepId, waiting] of this.waitingSteps.entries()) {
            if (!this.firedEvents.has(waiting.eventId)) continue;
            const step = this.allSteps[stepId];
            if (!step || this.isStepCompleted(stepId, step)) {
                this.waitingSteps.delete(stepId);
                continue;
            }

            if (!step.condition(this.lastContext)) {
                this.waitingSteps.delete(stepId);
                continue;
            }

            const eventSet = this.waitingByEvent.get(waiting.eventId);
            if (eventSet) {
                eventSet.delete(stepId);
                if (eventSet.size === 0) {
                    this.waitingByEvent.delete(waiting.eventId);
                }
            }
            this.waitingSteps.delete(stepId);
            this.activateStep(step);
            return true;
        }

        this.updateInputLock();
        return false;
    }
}
