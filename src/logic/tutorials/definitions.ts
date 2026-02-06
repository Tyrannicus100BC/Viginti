
import type { TutorialStep } from './tutorials';
import { TutorialHooks } from './hooks';

export const TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: 'welcome',
        text: "Welcome to Viginti\nClick to deal your first hand",
        completionType: 'click',
        condition: (context: any) => context.phase === 'entering_casino' && context.round === 1,
        nextStepId: 'dealer_cards'
    },
    {
        id: 'dealer_cards',
        text: "These are the dealer's cards. You'll have to beat their hand",
        highlight: { elementId: 'dealer-hand-zone', type: 'rect', padding: 10 },
        completionType: 'click',
        condition: (context: any) => context.phase === 'playing' && context.dealerCards.length > 0 && !context.isInitialDeal,
        // Wait, isInitialDeal is true during the deal animation?
        // App.tsx: `phase === 'playing' && !isDealerPlaying && !isInitialDeal`
        // We probably want to trigger AFTER the initial deal is done.
        // So condition: `phase === 'playing' && !isInitialDeal`
        nextStepId: 'player_hands'
    },
    {
        id: 'player_hands',
        text: "You have three hands. You start with one card delt.\nClick to hit and draw another card",
        highlight: { elementId: 'player-hands-zone', type: 'rect', padding: 10 },
        completionType: 'custom',
        hooks: TutorialHooks.onPlayerHit('player_hands'),
        condition: (context: any) => true, // Chained from prev
        nextStepId: 'place_card'
    },
    {
        id: 'place_card',
        text: "Now choose which of your three hands to place this card into",
        highlight: { elementId: 'player-hands-zone', type: 'rect', padding: 10 }, // Or draw area? "choose which of your three hands". Hands are targets.
        completionType: 'custom',
        hooks: TutorialHooks.onCardPlaced('place_card'),
        condition: (context: any) => true, // Chained
        nextStepId: 'get_close'
    },
    {
        id: 'get_close',
        text: "Try to get close to 21 in each hand without busting",
        completionType: 'custom',
        hooks: TutorialHooks.onPlayerHit('get_close'), // Clears when player hits again
        condition: (context: any) => true, // Chained
    }
];

export const INITIAL_TUTORIAL_IDS = ['welcome'];
