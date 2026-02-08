
import type { TutorialStep } from './tutorials';
import { TutorialHooks } from './hooks';
import { TutorialManager } from './tutorials';

export const GLOBAL_TUTORIAL_STEPS: TutorialStep[] = [];

export const STAND_TUTORIAL_ID = 'stand_now';
export const NEXT_CASINO_TUTORIAL_ID = 'next_casino_after_first_win';
export const VIGINTI_TUTORIAL_ID = 'viginti_first';
export const BUST_TUTORIAL_ID = 'bust_first';

type StandPromptOptions = {
    allowAllUnplayable?: boolean;
};

const hasVigintiHand = (context: any) =>
    Array.isArray(context?.playerHands) &&
    context.playerHands.some((hand: any) => hand.blackjackValue === 21 && !hand.isBust);

const hasBustHand = (context: any) =>
    Array.isArray(context?.playerHands) &&
    context.playerHands.some((hand: any) => hand.isBust);

const isOutcomeTutorialPending = (context: any) => {
    const manager = TutorialManager.getInstance();
    return (
        (!manager.isCompleted(VIGINTI_TUTORIAL_ID) && hasVigintiHand(context)) ||
        (!manager.isCompleted(BUST_TUTORIAL_ID) && hasBustHand(context))
    );
};

export const shouldPromptStandNow = (context: any, options?: StandPromptOptions) => {
    if (!context || context.phase !== 'playing' || context.isInitialDeal) return false;
    if (context.isDealerPlaying) return false;
    if (context.interactionMode && context.interactionMode !== 'default') return false;
    if (isOutcomeTutorialPending(context)) return false;

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
    if (allUnplayable && !options?.allowAllUnplayable) return false;

    const drawnCards = Array.isArray(context.drawnCards) ? context.drawnCards : [];
    const isDrawAreaClear = drawnCards.length === 0 || drawnCards.every((card: any) => card === null);
    return isDrawAreaClear;
};

export const ATLANTIC_CITY_TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: 'welcome',
        text: "Welcome to Viginti\n\nDeal Your First Hand",
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
        text: "This is the Dealer's Hand\n\nBeat Their Score to Win Money",
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
        text: "You Have Three Hands to Play\n\nEach is a Chance to Beat the Dealer",
        highlight: { elementId: 'player-hands-zone', type: 'rect', padding: 10 },
        completionType: 'click',
        scope: 'session',
        autoTrigger: false,
        condition: (context: any) => true, // Chained from prev
        nextStepId: 'draw_indicator'
    },
    {
        id: 'draw_indicator',
        text: "Hit to Take a Card",
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
        text: "Choose a Hand for This Card",
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
        text: "Keep Taking Cards\n\nDon't Go Over 21",
        scrim: 'none',
        completionType: 'custom',
        scope: 'session',
        autoTrigger: false,
        waitForEventId: 'player_place_animation_complete',
        hooks: TutorialHooks.onCardPlaced('get_close'), // Clears after placing the next drawn card
        condition: (context: any) => true, // Chained
    },
    {
        id: STAND_TUTORIAL_ID,
        text: "Your Hands are Strong\n\nLet the Dealer Play",
        highlight: { elementId: 'stand-button', type: 'rect', padding: 8 },
        scrim: 'none',
        completionType: 'custom',
        scope: 'session',
        autoTrigger: true,
        startDelayMs: 500,
        blockInputDuringDelay: true,
        condition: (context: any) => shouldPromptStandNow(context, { allowAllUnplayable: true })
    },
    {
        id: 'dealer_turn',
        text: "Dealer's Turn",
        completionType: 'custom',
        scope: 'session',
        scrim: 'none',
        autoTrigger: false,
        condition: (context: any) => true
    },
    {
        id: 'win_money_first',
        text: "Winning Hands Earn You Money",
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
        text: "Repay Your Debt to the Casino",
        highlight: { elementId: 'hud-debt', type: 'rect', padding: 6 },
        scrim: 'none',
        completionType: 'click',
        scope: 'session',
        autoTrigger: false,
        continueActionId: 'mark_draw_tutorial_ready',
        condition: (context: any) => true,
        nextStepId: 'hud_draws'
    },
    {
        id: 'hud_draws',
        text: "Your Time is Limited\n\nRepay Your Debt Quickly",
        highlight: { elementId: 'hud-draws', type: 'rect', padding: 6 },
        scrim: 'none',
        completionType: 'custom',
        scope: 'session',
        autoTrigger: true,
        waitForEventId: 'deal_action_available',
        completeOnEventId: 'hud_draws_decremented',
        completeDelayMs: 500,
        condition: (context: any) => {
            const totalScore = context?.totalScore ?? 0;
            const targetScore = context?.targetScore ?? 0;
            const handsRemaining = context?.handsRemaining ?? 0;
            return totalScore < targetScore && handsRemaining > 0;
        }
    },
    {
        id: NEXT_CASINO_TUTORIAL_ID,
        text: "You Repaid Your Debt\n\nLet's Get Out of Here",
        highlight: { elementId: 'next-casino-button', type: 'rect', padding: 8 },
        scrim: 'none',
        completionType: 'custom',
        scope: 'session',
        autoTrigger: true,
        condition: (context: any) => (
            context.phase === 'round_over' &&
            context.round === 1 &&
            (context.totalScore ?? 0) >= (context.targetScore ?? 0)
        )
    },
    {
        id: 'lost_all_hands',
        text: "You Lost Every Hand\n\nYou'll Never Get Out of Debt",
        completionType: 'click',
        scope: 'session',
        autoTrigger: false,
        condition: (context: any) => Array.isArray(context.playerHands) &&
            context.playerHands.length > 0 &&
            context.playerHands.every((hand: any) => hand.outcome === 'loss')
    },
    {
        id: VIGINTI_TUTORIAL_ID,
        text: "You got Viginti\n\nExactly 21 Always Wins",
        highlight: { elementId: 'player-hand-0', type: 'rect', padding: 8 },
        completionType: 'click',
        scope: 'session',
        startDelayMs: 520,
        blockInputDuringDelay: true,
        condition: (context: any) => context.playerHands?.some((hand: any) => hand.blackjackValue === 21 && !hand.isBust)
    },
    {
        id: BUST_TUTORIAL_ID,
        text: "You Busted this Hand\n\nDon't Go Over 21",
        highlight: { elementId: 'player-hand-0', type: 'rect', padding: 8 },
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
