
import type { RelicHooks, CardPlacedContext } from '../relics/types';
import { TutorialManager } from './tutorials';

export const TutorialHooks = {
    // Generic completion hook helper
    completeOnEvent: (stepId: string) => {
        return async () => {
            TutorialManager.getInstance().completeStep(stepId);
        };
    },

    // Example custom conditions
    
    // Step 3 Completion: Clears when player draws
    // We need a hook that listens for "Draw"
    onPlayerDraw: (stepId: string): RelicHooks => ({
         // Using getDrawCount as a proxy for "Draw"? Or is there a better event?
         // If `getDrawCount` is called, it means a draw is happening.
         getDrawCount: (val: number) => {
             TutorialManager.getInstance().completeStep(stepId);
             return val;
         }
    }),

    onCardPlaced: (stepId: string): RelicHooks => ({
        onCardPlaced: async (context: CardPlacedContext) => {
            TutorialManager.getInstance().completeStep(stepId);
        }
    })
};
