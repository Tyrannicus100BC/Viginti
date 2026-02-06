
import type { RelicHooks } from '../relics/types';

export type TutorialHighlight = {
    elementId: string; // ID of the HTML element to highlight
    type: 'rect' | 'circle';
    padding?: number;
};

export type TutorialCompletionCondition = 'click' | 'custom';

export interface TutorialStep {
    id: string;
    text: string;
    highlight?: TutorialHighlight;
    condition: (context: any) => boolean; // Global condition to START this tutorial
    completionType: TutorialCompletionCondition;
    
    // If completionType is 'custom', this hook handles checking for completion
    // The hook effectively is "on[Event]" -> check logic -> if passed, call manager.completeStep(id)
    hooks?: RelicHooks;
    
    // Next step in chain (optional)
    nextStepId?: string;
}

export class TutorialManager {
    private static instance: TutorialManager;
    private completedSteps: Set<string> = new Set();
    private activeStep: TutorialStep | null = null;
    private listeners: ((step: TutorialStep | null) => void)[] = [];
    private allSteps: Record<string, TutorialStep> = {};

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

    private loadProgress() {
        try {
            const saved = localStorage.getItem('viginti_tutorials_completed');
            if (saved) {
                this.completedSteps = new Set(JSON.parse(saved));
            }
        } catch (e) {
            console.error('Failed to load tutorials', e);
        }
    }

    private saveProgress() {
        try {
            localStorage.setItem('viginti_tutorials_completed', JSON.stringify(Array.from(this.completedSteps)));
        } catch (e) {
            console.error('Failed to save tutorials', e);
        }
    }

    public isCompleted(stepId: string): boolean {
        return this.completedSteps.has(stepId);
    }

    public completeStep(stepId: string) {
        if (!this.completedSteps.has(stepId)) {
            this.completedSteps.add(stepId);
            this.saveProgress();
            
            if (this.activeStep?.id === stepId) {
                const nextId = this.activeStep.nextStepId;
                this.activeStep = null;
                this.notifyListeners();

                if (nextId) {
                    this.tryTriggerStep(nextId);
                }
            }
        }
    }

    public reset() {
        this.completedSteps.clear();
        this.activeStep = null;
        this.saveProgress();
        this.notifyListeners();
        // Potentially re-evaluate initial triggers? 
        // For now, simple reset.
    }

    public tryTriggerStep(stepId: string, context?: any): boolean {
        // Don't trigger if already completed or if another step is active (unless we allow queuing/overriding? For now, 1 at a time)
        if (this.completedSteps.has(stepId)) return false;
        if (this.activeStep) return false; // One tutorial at a time

        const step = this.allSteps[stepId];
        if (!step) return false;

        // Check condition
        if (step.condition(context)) {
            this.activeStep = step;
            this.notifyListeners();
            return true;
        }
        return false;
    }

    // Called by UI to dismiss click-to-continue steps
    public handleOverlayClick() {
        if (this.activeStep && this.activeStep.completionType === 'click') {
            this.completeStep(this.activeStep.id);
        }
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
}
