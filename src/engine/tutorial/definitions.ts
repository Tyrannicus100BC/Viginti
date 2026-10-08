import type { GameState } from '../GameState';
import type { GameEvent } from '../GameEvent';
import type { TutorialStep } from './types';

// ─── Helpers ────────────────────────────────────────────

const ATLANTIC_CITY_ID = 'atlantic_city';
const isAtlanticCity = (state: GameState) => state.selectedCityId === ATLANTIC_CITY_ID;

const hasVigintiHand = (state: GameState) =>
    state.playerHands.some(hand => hand.blackjackValue === 21 && !hand.isBust);

const hasBustHand = (state: GameState) =>
    state.playerHands.some(hand => hand.isBust);

const isOutcomeTutorialPending = (state: GameState) => {
    // We check if the tutorial is completed in the state
    return (
        (!state.tutorial.completedStepIds.includes('viginti_first') && hasVigintiHand(state)) ||
        (!state.tutorial.completedStepIds.includes('bust_first') && hasBustHand(state))
    );
};

export const shouldPromptStandNow = (state: GameState): boolean => {
    if (state.phase !== 'playing') return false;
    // isInitialDeal logic? Engine doesn't have explicit flag, but can check drawnCards
    // Actually, 'playing' implies initial deal is done.
    
    // Check if dealer is playing (phase would be playing, but dealer turn?)
    // In engine, if dealer turn, user valid actions are none or just "acknowledge"? 
    // Actually, if it's dealer turn, getValidActions returns empty array or wait events?
    // Engine phase 'playing' covers both player and dealer turns? 
    // No, dealer turn is handled inside 'stand' action processing usually, 
    // UNLESS we pause for animations.
    // In pure engine, dealer plays immediately on Stand.
    // But 'EventPlayer' handles animations.
    // The tutorial condition needs to key off STATE.
    
    // If we can take actions, it's player turn.
    // But 'shouldPromptStandNow' is a hint.
    
    const hands = state.playerHands;
    if (hands.length === 0) return false;

    // Check if outcome tutorials pending
    if (isOutcomeTutorialPending(state)) return false;

    const allStandReady = hands.every(hand => {
        if (hand.isInactive || hand.isHeld) return true;
        if (hand.isBust) return true;
        if (hand.blackjackValue === 21) return true;
        return hand.blackjackValue >= 17;
    });

    if (!allStandReady) return false;

    // Check draw area clear
    const isDrawAreaClear = state.drawnCards.every(c => c === null);
    
    // Also check if we have unplaced cards? 
    // If draw area is clear, we have no unplaced cards.
    
    return isDrawAreaClear;
};


// ─── Definitions ────────────────────────────────────────

export const NEXT_CASINO_TUTORIAL_ID = 'next_casino_after_first_win';
export const STAND_TUTORIAL_ID = 'stand_now';

export const TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: 'welcome',
        type: 'message',
        display: {
            id: 'welcome',
            text: "Welcome to Viginti\n\nPay the Cash Ante to Deal\nWin or Viginti Earns One Comp Ticket",
            completionType: 'click',
            scrim: 'none',
            blockInput: true,
        },
        scope: 'global',
        triggerCondition: (state: GameState, events: GameEvent[]) => 
            isAtlanticCity(state) && state.phase === 'entering_casino' && state.deal === 1,
        onCompleteAction: 'deal', // Just a hint, engine doesn't execute this automatically necessarily?
        // Actually, older logic had 'continueActionId'.
        // Here, completionType is 'click'.
        // If we want the click to Trigger 'deal', we need to handle that in the UI or engine.
        // Let's assume the user has to click 'deal' button?
        // The defining characteristic of 'welcome' was it blocked input until clicked?
        // 'continueActionId: deal_first_hand' meant clicking the overlay ran that action.
        // Pure engine can't "run action" on overlay click easily unless we send 'acknowledge_tutorial' 
        // and the engine interprets that as "run the continue action".
        // Let's stick to standard flow: User closes tutorial, then clicks Deal.
        // Or if we detailed "onCompleteAction", the bridge could dispatch it.
        // Let's rely on user action for now.
    },
    {
        id: 'dealer_cards',
        type: 'message',
        display: {
            id: 'dealer_cards',
            text: "This is the Dealer's Hand\n\nBeat Their Score to Win Money",
            highlight: { elementId: 'dealer-hand-zone', type: 'rect', padding: 10 },
            completionType: 'click',
        },
        scope: 'global',
        triggerCondition: (state, events) => 
            isAtlanticCity(state) && events.some(e => e.type === 'initial_deal_complete'),
        nextStepId: 'player_hands',
    },
    {
        id: 'player_hands',
        type: 'message',
        display: {
            id: 'player_hands',
            text: "Start in the Center Hand\n\nOpen Each Side Hand for One Comp Ticket",
            highlight: { elementId: 'player-hands-zone', type: 'rect', padding: 10 },
            completionType: 'click',
        },
        scope: 'global',
        // Triggered by chain from dealer_cards, so condition might be false or true?
        // If chained, we force trigger.
        // But for safety:
        triggerCondition: (state) => false, // Only manual chain
        nextStepId: 'draw_indicator',
    },
    {
        id: 'draw_indicator',
        type: 'message',
        display: {
            id: 'draw_indicator',
            text: "Draw to Take a Card",
            highlight: { elementId: 'draw-hit-spot-anchor', type: 'rect', padding: 0 },
            scrim: 'none',
            completionType: 'custom',
        },
        scope: 'global',
        triggerCondition: (state) => false, // Chained
        completeCondition: (state, events) => events.some(e => e.type === 'card_drawn'),
        nextStepId: 'place_card',
    },
    {
        id: 'place_card',
        type: 'message',
        display: {
            id: 'place_card',
            text: "Choose a Hand for This Card",
            scrim: 'none',
            completionType: 'custom',
        },
        scope: 'global',
        triggerCondition: (state, events) => isAtlanticCity(state) && events.some(e => e.type === 'card_drawn'),  
        // Wait, if chained, we don't need triggerCondition.
        // But this one was "waitForEventId: player_draw_animation_complete".
        // In pure logic, "card_drawn" happens, then "place_card" tutorial should show.
        // But "card_drawn" is the event that completes previous step!
        // So yes, it chains.
        
        completeCondition: (state, events) => events.some(e => e.type === 'card_placed'),
        nextStepId: 'get_close',
    },
    {
        id: 'get_close',
        type: 'message',
        display: {
            id: 'get_close',
            text: "Keep Taking Cards\n\nDon't Go Over 21",
            scrim: 'none',
            completionType: 'custom',
        },
        scope: 'global',
        triggerCondition: (state) => false, // Chained
        completeCondition: (state, events) => events.some(e => e.type === 'card_placed'), // Clears next time they place?
        // Actually this one just stays until ...?
        // Old logic: "hooks: TutorialHooks.onCardPlaced('get_close')" -> Clears on placement.
        // So it shows up, then user draws/places, and it clears.
    },
    {
        id: STAND_TUTORIAL_ID,
        type: 'message',
        display: {
            id: 'stand_now',
            text: "Your Hands are Strong\n\nLet the Dealer Play",
            highlight: { elementId: 'stand-button', type: 'rect', padding: 8 },
            scrim: 'none',
            completionType: 'custom',
            blockInput: true, // Only Stand allowed? We should enforce via allowedActions
        },
        scope: 'global',
        allowedActions: ['stand'],
        triggerCondition: (state) => isAtlanticCity(state) && shouldPromptStandNow(state),
        completeCondition: (state, events) => events.some(e => e.type === 'auto_stand_triggered' || e.type === 'dealer_reveal'),
        // Or if user clicks stand -> events has dealer_reveal
    },
    {
        id: 'win_money_first',
        type: 'message',
        display: {
            id: 'win_money_first',
            text: "Winning Hands Earn Cash\n\nWin or Viginti Also Earns One Comp Ticket",
            completionType: 'click',
            scrim: 'none',
        },
        scope: 'global',
        triggerCondition: (state, events) => 
            isAtlanticCity(state) &&
            state.phase === 'scoring' && 
            state.playerHands.some(h => h.outcome === 'win') &&
            !state.tutorial.completedStepIds.includes('win_money_first'),
            // We use triggerCondition to prevent re-triggering if not implicitly handled by engine
        nextStepId: 'hud_debt',
    },
    {
        id: 'hud_debt',
        type: 'message',
        display: {
            id: 'hud_debt',
            text: "Spend Your Winnings in the Gift Shop",
            highlight: { elementId: 'hud-cash', type: 'rect', padding: 6 },
            scrim: 'none',
            completionType: 'click',
        },
        scope: 'global',
        triggerCondition: (state) => false, // Chained
        nextStepId: 'hud_draws',
    },
    {
        id: 'hud_draws',
        type: 'message',
        display: {
            id: 'hud_draws',
            text: "Cash Keeps You Playing\n\nPay the Ante to Deal · It Increases Every Five Hands",
            highlight: { elementId: 'hud-ante', type: 'rect', padding: 6 },
            scrim: 'none',
            completionType: 'custom',
        },
        scope: 'global',
        triggerCondition: (state) => false, // Chained
        completeCondition: (state, events) => events.some(e => e.type === 'deal_started'), // Wait for next deal?
        // Old logic: "waitForEventId: deal_action_available", "completeOnEventId: hud_draws_decremented"
        // In pure engine, start of next round (or deal) decrements draws/handsRemaining.
        // 'initial_deal_complete' or 'round_started'?
        // 'round_started' happens at deal.
    },
    {
        id: NEXT_CASINO_TUTORIAL_ID,
        type: 'message',
        display: {
            id: 'next_casino_after_first_win',
            text: "Visit the Gift Shop\n\nCome Back Whenever You Like",
            highlight: { elementId: 'gift-shop-button', type: 'rect', padding: 8 },
            scrim: 'none',
            completionType: 'custom',
        },
        scope: 'global',
        triggerCondition: (state) => 
            isAtlanticCity(state) &&
            state.phase === 'deal_over' &&
            state.deal === 1 && 
            state.cash >= state.ante,
        completeCondition: (state, events) => events.some(e => e.type === 'shop_entered' || e.type === 'deal_started'),
    },
    {
        id: 'comp_tickets',
        type: 'message',
        display: {
            id: 'comp_tickets',
            text: "Open Side Hands with Comp Tickets\n\nOne Ticket Opens Each Side · Further Cards Are Free",
            highlight: { elementId: 'hud-comps', type: 'rect', padding: 6 },
            scrim: 'dim',
            completionType: 'click',
        },
        scope: 'global',
        triggerCondition: (state, events) => 
            isAtlanticCity(state) &&
            state.phase === 'deal_over' &&
            events.some(e => e.type === 'comps_earned'),
    },
    {
        id: 'spend_comps',
        type: 'message',
        display: {
            id: 'spend_comps',
            text: "Spend Cash for Upgrades\n\nShop Refreshes When the Ante Increases",
            highlight: { elementId: 'gift-shop-score', type: 'rect', padding: 12 },
            scrim: 'none',
            completionType: 'click',
        },
        scope: 'global',
        triggerCondition: (state, events) => 
            isAtlanticCity(state) &&
            state.phase === 'gift_shop' &&
            events.some(e => e.type === 'shop_entered'),
    },
    {
        id: 'keep_playing',
        type: 'message',
        display: {
            id: 'keep_playing',
            text: "Keep On Playing\n\nDon't Go Over 21",
            scrim: 'none',
            completionType: 'custom',
        },
        scope: 'global',
        triggerCondition: (state) => 
            isAtlanticCity(state) && state.phase === 'playing' && state.deal === 2,
        completeCondition: (state, events) => events.some(e => e.type === 'card_placed'),
    },
    {
        id: 'gift_shop_table_actions',
        type: 'message',
        display: {
            id: 'gift_shop_table_actions',
            text: "Relics Change the Rules\n\nBuy Them with Cash · Unlock More Slots",
            highlight: { elementId: 'gift-shop-control', type: 'rect', padding: 12 },
            scrim: 'dim',
            completionType: 'click',
            blockInput: false,
            messagePosition: 'left',
        },
        scope: 'global',
        triggerCondition: (state, events) => 
            isAtlanticCity(state) &&
            state.phase === 'gift_shop' && 
            state.deal === 2 &&
            events.some(e => e.type === 'shop_entered'),
        completeCondition: (state, events) => events.some(e => e.type === 'item_purchased'),
        allowedActions: ['buy_shop_item'],
    },
    {
        id: 'gift_shop_raise_intro',
        type: 'message',
        display: {
            id: 'gift_shop_raise_intro',
            text: "Buy a Raise Pack\n\nChoose 1 of 3 · Permanent Bonuses and Tradeoffs",
            highlight: { elementId: 'gift-shop-raises', type: 'rect', padding: 12 },
            scrim: 'dim',
            completionType: 'click',
            blockInput: false,
            messagePosition: 'left',
        },
        scope: 'global',
        triggerCondition: (state, events) => 
            isAtlanticCity(state) &&
            state.phase === 'gift_shop' && 
            state.deal === 3 &&
            events.some(e => e.type === 'shop_entered'),
        completeCondition: (state, events) => events.some(e => e.type === 'item_purchased'),
        allowedActions: ['buy_shop_item'],
    },
    {
        id: 'lost_all_hands',
        type: 'message',
        display: {
            id: 'lost_all_hands',
            text: "You Lost Every Hand\n\nNo Tickets Returned This Deal",
            completionType: 'click',
        },
        scope: 'global',
        triggerCondition: (state, events) => 
            isAtlanticCity(state) &&
            events.some(e => e.type === 'hand_outcome') &&
            state.playerHands.length > 0 &&
            state.playerHands.every(hand => hand.outcome === 'loss'),
    },
    {
        id: 'viginti_first',
        type: 'message',
        display: {
            id: 'viginti_first',
            text: "You got Viginti\n\nExactly 21 Always Wins",
            highlight: { elementId: 'player-hand-0', type: 'rect', padding: 8 }, // Dynamic?
            completionType: 'click',
            blockInput: true,
        },
        scope: 'global', // Actually global in old logic check, but scope property sets reset behavior?
        // Old logic: manually checked persistence.
        // New logic: scope 'session' means we check state.completedStepIds.
        // If we want it once per session, 'session'.
        // If once ever, 'global'.
        // The definitions say "scope: session" in old file, but logic checked persistence?
        // Ah, `isOutcomeTutorialPending` checked `manager.isCompleted(VIGINTI_TUTORIAL_ID)`.
        // I should probably set scope to 'global' if I want it persisted.
        triggerCondition: (state) => isAtlanticCity(state) && hasVigintiHand(state),
    },
    {
        id: 'bust_first',
        type: 'message',
        display: {
            id: 'bust_first',
            text: "You Busted this Hand\n\nDon't Go Over 21",
            highlight: { elementId: 'player-hand-0', type: 'rect', padding: 8 },
            completionType: 'click',
            blockInput: true,
        },
        scope: 'global',
        triggerCondition: (state) => isAtlanticCity(state) && hasBustHand(state),
    },
];
