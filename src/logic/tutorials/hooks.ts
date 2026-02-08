
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
    
    // Step 3 Completion: Clears when player hits
    // We need a hook that listens for "Hit"
    // Relic System doesn't seem to have "onHit" explicit hook in the types I saw?
    // Let's check hooks.ts types again.
    // It has `getDrawCount`, `onCardPlaced`.
    // "Hit" usually triggers a draw. 
    // Maybe `onCardPlaced` is for when player places a card? 
    // Request says: "clears when player hits". 
    // If "Hit" just draws a card to the "staging area" (if that's how it works) or directly to hand?
    // "You start with one card delt. Click to hit and draw another card"
    // "Now choose which of your three hands to place this card into"
    // So "Hit" -> Draw card to placement area.
    // Then "Place" -> Put card in hand.
    
    // I need to verify what event corresponds to "Hit". 
    // `getDrawCount` is a value hook, might be called when drawing.
    
    onPlayerHit: (stepId: string): RelicHooks => ({
         // Using getDrawCount as a proxy for "Hit"? Or is there a better event?
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
