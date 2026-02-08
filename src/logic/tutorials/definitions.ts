
import type { TutorialStep } from './tutorials';
import { TutorialHooks } from './hooks';

export const GLOBAL_TUTORIAL_STEPS: TutorialStep[] = [];

export const STAND_TUTORIAL_ID = 'stand_now';

export const shouldPromptStandNow = (context: any) => {
    if (!context || context.phase !== 'playing' || context.isInitialDeal) return false;
    if (context.isDealerPlaying) return false;
    if (context.interactionMode && context.interactionMode !== 'default') return false;

    const hands = Array.isArray(context.playerHands) ? context.playerHands : [];
    if (hands.length === 0) return false;

    const allStandReady = hands.every((hand: any) => {
        if (!hand) return false;
        if (hand.isBust) return true;
        if (hand.blackjackValue === 21) return true;
        return hand.blackjackValue >= 17;
    });

    if (!allStandReady) return false;

    const allUnplayable = hands.every((hand: any) => hand.isBust || hand.isHeld || hand.blackjackValue === 21);
    if (allUnplayable) return false;

    const drawnCards = Array.isArray(context.drawnCards) ? context.drawnCards : [];
    const isDrawAreaClear = drawnCards.length === 0 || drawnCards.every((card: any) => card === null);
    return isDrawAreaClear;
};

export const ATLANTIC_CITY_TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: 'welcome',
        text: "Welcome to Viginti\n\nClick to Deal your first Round",
        completionType: 'click',
        scope: 'session',
        scrim: 'none',
        startDelayMs: 240,
        blockInputDuringDelay: true,
        continueActionId: 'deal_first_hand',
        autoTrigger: true,
        condition: (context: any) => context.phase === 'entering_casino' && context.round === 1,
        nextStepId: 'dealer_cards'
    },
    {
        id: 'dealer_cards',
        text: "This is the Dealer's Hand\n\nBeat their Score to win Money",
        highlight: { elementId: 'dealer-hand-zone', type: 'rect', padding: 10 },
        completionType: 'click',
        scope: 'session',
        autoTrigger: true,
        waitForEventId: 'dealer_initial_deal_complete',
        blockInputUntilEvent: true,
        armCondition: (context: any) => context.phase === 'playing' && context.dealerCards.length > 0 && context.isInitialDeal,
        condition: (context: any) => context.phase === 'playing' && context.dealerCards.length > 0 && !context.isInitialDeal,
        // Wait, isInitialDeal is true during the deal animation?
        // App.tsx: `phase === 'playing' && !isDealerPlaying && !isInitialDeal`
        // We probably want to trigger AFTER the initial deal is done.
        // So condition: `phase === 'playing' && !isInitialDeal`
        nextStepId: 'player_hands'
    },
    {
        id: 'player_hands',
        text: "You have three Hands to Play\n\nEach is a chance to beat the Dealer",
        highlight: { elementId: 'player-hands-zone', type: 'rect', padding: 10 },
        completionType: 'click',
        scope: 'session',
        autoTrigger: false,
        condition: (context: any) => true, // Chained from prev
        nextStepId: 'draw_indicator'
    },
    {
        id: 'draw_indicator',
        text: "Now Draw a Card",
        highlight: { elementId: 'draw-hit-spot-anchor', type: 'rect', padding: 0 },
        scrim: 'none',
        completionType: 'custom',
        scope: 'session',
        autoTrigger: false,
        hooks: TutorialHooks.onPlayerHit('draw_indicator'),
        condition: (context: any) => true, // Chained
        nextStepId: 'place_card'
    },
    {
        id: 'place_card',
        text: "Choose a Hand for this Card",
        scrim: 'none',
        completionType: 'custom',
        scope: 'session',
        autoTrigger: false,
        hooks: TutorialHooks.onCardPlaced('place_card'),
        waitForEventId: 'player_draw_animation_complete',
        armCondition: (context: any) => true, // Arm immediately when chained
        condition: (context: any) => (context.drawnCards ?? []).some((card: any) => card !== null),
        nextStepId: 'get_close'
    },
    {
        id: 'get_close',
        text: "Keep drawing Cards\n\nDon't go over 21",
        scrim: 'none',
        completionType: 'custom',
        scope: 'session',
        autoTrigger: false,
        waitForEventId: 'player_place_animation_complete',
        hooks: TutorialHooks.onPlayerHit('get_close'), // Clears when player hits again
        condition: (context: any) => true, // Chained
    },
    {
        id: STAND_TUTORIAL_ID,
        text: "Your Hands are strong\n\nLet the Dealer play",
        highlight: { elementId: 'stand-button', type: 'rect', padding: 8 },
        scrim: 'none',
        completionType: 'custom',
        scope: 'session',
        autoTrigger: true,
        startDelayMs: 500,
        blockInputDuringDelay: true,
        condition: shouldPromptStandNow
    },
    {
        id: 'dealer_turn',
        text: "Now the Dealer's turn",
        completionType: 'custom',
        scope: 'session',
        scrim: 'none',
        autoTrigger: false,
        condition: (context: any) => true
    },
    {
        id: 'win_money_first',
        text: "Each winning Hand earns you Money",
        completionType: 'click',
        scope: 'session',
        autoTrigger: false,
        scrim: 'none',
        dismissAfterEventId: 'scoring_sequence_complete',
        condition: (context: any) => context.phase === 'scoring' &&
            Array.isArray(context.playerHands) &&
            context.playerHands.some((hand: any) => hand.finalScore),
        nextStepId: 'hud_debt'
    },
    {
        id: 'hud_debt',
        text: "Earn this amount to beat the Casino",
        highlight: { elementId: 'hud-debt', type: 'rect', padding: 6 },
        completionType: 'click',
        scope: 'session',
        autoTrigger: false,
        waitForEventId: 'total_winnings_shown',
        continueActionId: 'mark_draw_tutorial_ready',
        condition: (context: any) => true,
        nextStepId: 'hud_draws'
    },
    {
        id: 'hud_draws',
        text: "This is how many Draws you have left\n\nClick to Draw again",
        highlight: { elementId: 'hud-draws', type: 'rect', padding: 6 },
        completionType: 'click',
        scope: 'session',
        autoTrigger: false,
        waitForEventId: 'draw_available_after_debt',
        condition: (context: any) => true
    },
    {
        id: 'lost_all_hands',
        text: "You lost every Hand\n\nYou'll never get out of Debt at this rate",
        completionType: 'click',
        scope: 'session',
        autoTrigger: false,
        condition: (context: any) => Array.isArray(context.playerHands) &&
            context.playerHands.length > 0 &&
            context.playerHands.every((hand: any) => hand.outcome === 'loss')
    },
    {
        id: 'viginti_first',
        text: "You got Viginti\n\nExactly 21 always wins",
        completionType: 'click',
        scope: 'session',
        startDelayMs: 520,
        blockInputDuringDelay: true,
        condition: (context: any) => context.playerHands?.some((hand: any) => hand.blackjackValue === 21 && !hand.isBust)
    },
    {
        id: 'bust_first',
        text: "You Busted this Hand\n\nDon't go over 21",
        completionType: 'click',
        scope: 'session',
        startDelayMs: 520,
        blockInputDuringDelay: true,
        condition: (context: any) => context.playerHands?.some((hand: any) => hand.isBust)
    }
];

export const TUTORIAL_STEPS: TutorialStep[] = [
    ...GLOBAL_TUTORIAL_STEPS,
    ...ATLANTIC_CITY_TUTORIAL_STEPS
];

export const INITIAL_TUTORIAL_IDS = ['welcome'];
