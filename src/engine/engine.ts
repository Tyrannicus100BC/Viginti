import { canAcquireRelic, INITIAL_RELIC_SLOTS, getRelicSlotCost } from '../logic/relics/inventory';
import { getRaise } from '../logic/handScoring';
/**
 * Game Engine — the main entry point for processing player actions.
 * 
 * This is the core of the game logic separation:
 *   processAction(state, action) → { nextState, events }
 * 
 * Everything here is PURE and SYNCHRONOUS.
 * No setTimeout, no DOM, no sound, no animation — just game logic.
 */

import type { GameState } from './GameState';
import type { PlayerAction } from './PlayerAction';
import type { GameEvent } from './GameEvent';
import { SeededRNG } from './rng';
import { INITIAL_HAND_COUNT, BASE_DEALS_PER_CASINO } from './GameState';
import type { Card, PlayerHand } from '../types';
import type { RelicInstance } from '../logic/relics/types';
import { GAMBLER_DEFINITIONS } from '../logic/gamblers/definitions';
import { CITY_DEFINITIONS } from '../logic/cities/definitions';
// RelicManager access is now via relicEngine.ts
import { drawCardFromProbabilities } from '../logic/deck';
import { STARTING_COMP_TICKETS, STARTING_CASH, BASE_ANTE, ANTE_INCREASE_AMOUNT, HANDS_PER_ANTE, BASE_SHOP_RESTOCK_COST, getRemovalCashCost, canPlayHand } from './economy';
import { getBlackjackScore, evaluateHandScore } from '../logic/scoring';
import {
    executeValueHook,
    executeCheckHook,
    executeOnCardPlaced,
    executeOnHandBust,
    executeOnScoreRow,
    executeOnHandCompletion,
    executeOnDealCompletion,
    getRelicConfig,
} from './relicEngine';
import {
    processActivateTableAction,
    processCancelTableAction,
    processSelectTableActionHand,
    processSelectTableActionCard,
    processSelectTableActionDrawCard,
} from './actions/tableActions';
import {
    generateRunShopItems,
    processEnterGiftShop,
    processBuyShopItem,
    processChooseRaise,
    processBuyRelicSlot,
    processRestockShop,
    processSellRelic,
    processLeaveShop,
    processEnhanceCard,
    processDestroyCard,
} from './actions/shopActions';
import {
    checkTutorialTriggers,
    handleTutorialAction,
    getTutorialRestrictedActions,
    canAcknowledgeTutorial,
    initialTutorialState
} from './tutorial/tutorialEngine';
import { TUTORIAL_STEPS } from './tutorial/definitions';

// ─── Result Type ────────────────────────────────────────

export interface ActionResult {
    nextState: GameState;
    events: GameEvent[];
}

// ─── Engine Dispatch ────────────────────────────────────

/**
 * Process a player action against the current game state.
 * Returns the next immutable game state and a list of events that occurred.
 */
export function processAction(state: GameState, action: PlayerAction): ActionResult {
    let result: ActionResult;

    if (action.type === 'acknowledge_tutorial') {
        const { nextTutorialState, tutorialEvents } = handleTutorialAction(state, action);
        result = {
            nextState: { ...state, tutorial: nextTutorialState },
            events: tutorialEvents
        };
    } else {
        result = processCoreAction(state, action);
    }

    const { nextTutorialState, tutorialEvents } = checkTutorialTriggers(result.nextState, result.events);
    
    return {
        nextState: {
            ...result.nextState,
            tutorial: nextTutorialState
        },
        events: [...result.events, ...tutorialEvents]
    };
}

function processCoreAction(state: GameState, action: PlayerAction): ActionResult {
    switch (action.type) {
        case 'start_game':
            return processStartGame(state, action.cityId, action.gamblerId, action.seed, action.globalTutorialsCompleted, action.skipAtlanticTutorials);
        case 'deal':
            return processDeal(state, action.forceContinue);
        case 'leave_casino':
            return processLeaveCasino(state);
        case 'draw':
            return processDraw(state);
        case 'select_drawn_card':
            return processSelectDrawnCard(state, action.drawIndex);
        case 'place_card':
            return processPlaceCard(state, action.handIndex);
        case 'stand':
            return processStand(state);
        case 'resolve_dealer_turn':
            return processResolveDealerTurn(state);
        case 'resolve_hand_outcome':
            return processResolveHandOutcome(state);
        case 'score_round':
            return processScoreRound(state);
        case 'complete_deal_early':
            return processCompleteDealEarly(state);
        case 'activate_table_action':
            return processActivateTableAction(state, action.relicId);
        case 'cancel_table_action':
            return processCancelTableAction(state);
        case 'select_table_action_target':
            return processSelectTableActionHand(state, action.handIndex);
        case 'select_table_action_card':
            return processSelectTableActionCard(state, action.target, action.handIndex, action.cardId);
        case 'select_table_action_draw_card':
            return processSelectTableActionDrawCard(state, action.drawIndex);
        // Shop actions
        case 'enter_gift_shop':
            return processEnterGiftShop(state);
        case 'choose_raise':
            return processChooseRaise(state, action.raiseId);
        case 'buy_relic_slot':
            return processBuyRelicSlot(state);
        case 'buy_shop_item':
            return processBuyShopItem(state, action.itemId);
        case 'restock_shop':
            return processRestockShop(state);
        case 'sell_relic':
            return processSellRelic(state, action.relicId, action.index);
        case 'leave_shop':
            return processLeaveShop(state);
        // Deck management
        case 'enhance_card':
            return processEnhanceCard(state, action.cardId, action.enhancement);
        case 'destroy_card':
            return processDestroyCard(state, action.cardId);
        // Debug actions
        case 'debug_win':
            return processDebugWin(state);
        case 'debug_victory':
            return processDebugVictory(state);
        case 'debug_add_relic':
            return processDebugAddRelic(state, action.relicId);
        case 'debug_remove_relic':
            return processDebugRemoveRelic(state, action.relicId);
        case 'debug_fill_charges':
            return processDebugFillCharges(state, action.relicId);
        case 'debug_give_cash':
            return processDebugGiveCash(state, action.amount);
        case 'debug_draw_card':
            return processDebugDrawCard(state, action.cardId);
        case 'debug_undo':
            return { nextState: state, events: [] }; // Handled by Bridge
        default:
            return { nextState: state, events: [] };
    }
}

// ─── Valid Actions ──────────────────────────────────────

/**
 * Returns the list of actions that are currently legal given the game state.
 * Critical for the LLM simulator — the LLM needs to know what it can do.
 */
export function getValidActions(state: GameState): PlayerAction[] {
    const actions: PlayerAction[] = [];

    switch (state.phase) {
        case 'init':
            // Can start a new game with any city/gambler combination
            // For now, list available options
            for (const city of CITY_DEFINITIONS) {
                for (const gambler of GAMBLER_DEFINITIONS) {
                    actions.push({ type: 'start_game', cityId: city.id, gamblerId: gambler.id });
                }
            }
            break;

        case 'entering_casino':
            if (state.cash >= state.ante) {
                actions.push({ type: 'deal' });
                actions.push({ type: 'enter_gift_shop' });
            }
            break;

        case 'playing': {
            const hasDrawn = state.drawnCards.some(c => c !== null);
            const anyPlayable = state.playerHands.some(
                h => canPlayHand(h, state.comps)
            );

            if (!hasDrawn) {
                // Can draw
                if (anyPlayable) actions.push({ type: 'draw' });
                // Can stand
                actions.push({ type: 'stand' });
            } else {
                // Can select a drawn card (if multiple)
                const availableDrawIndices = state.drawnCards
                    .map((c, i) => c !== null ? i : -1)
                    .filter(i => i >= 0);
                for (const i of availableDrawIndices) {
                    if (i !== state.selectedDrawIndex) {
                        actions.push({ type: 'select_drawn_card', drawIndex: i });
                    }
                }

                // Can place into any non-bust, non-held hand
                if (state.selectedDrawIndex !== null && anyPlayable) {
                    for (const hand of state.playerHands) {
                        if (canPlayHand(hand, state.comps)) {
                            actions.push({ type: 'place_card', handIndex: hand.id });
                        }
                    }
                }
            }

            // Table actions — if in targeting mode, show targeting options; otherwise show activatable actions
            if (state.interactionMode !== 'default') {
                // Always can cancel
                actions.push({ type: 'cancel_table_action' });

                if (state.interactionMode === 'select_hand') {
                    // Hand targeting: double_down, surrender, hold (place)
                    for (const hand of state.playerHands) {
                        if (canPlayHand(hand, state.comps) && (hand.cards.length > 0 || state.activeTableActionId === 'hold')) {
                            actions.push({ type: 'select_table_action_target', handIndex: hand.id });
                        }
                    }
                } else if (state.interactionMode === 'select_card') {
                    // Card targeting: discard, switch
                    for (const hand of state.playerHands) {
                        if (!hand.isBust && hand.blackjackValue !== 21) {
                            for (const card of hand.cards) {
                                actions.push({ type: 'select_table_action_card', target: 'player', handIndex: hand.id, cardId: card.id });
                            }
                        }
                    }
                    if (state.activeTableActionId === 'discard') {
                        for (const card of state.dealer.cards) {
                            if (card.isFaceUp || state.dealer.isRevealed) {
                                actions.push({ type: 'select_table_action_card', target: 'dealer', cardId: card.id });
                            }
                        }
                    }
                } else if (state.interactionMode === 'select_draw') {
                    // Draw card targeting: redraw, hold (pick)
                    for (let i = 0; i < state.drawnCards.length; i++) {
                        if (state.drawnCards[i] !== null) {
                            actions.push({ type: 'select_table_action_draw_card', drawIndex: i });
                        }
                    }
                }
            } else {
                // Show activatable table actions
                const invArr = state.inventory as RelicInstance[];
                for (const relic of invArr) {
                    const config = getRelicConfig(relic.id);
                    if (!config?.tableAction) continue;

                    const charges = state.tableActionCharges[relic.id] ?? 0;
                    const ta = config.tableAction;

                    // Check basic preconditions per action type
                    let canActivate = false;
                    switch (relic.id) {
                        case 'double_down':
                        case 'surrender': {
                            const hasPlayable = state.playerHands.some(h => !h.isBust && !h.isHeld && h.blackjackValue !== 21 && h.cards.length > 0);
                            canActivate = charges >= ta.chargeCost && !hasDrawn && hasPlayable;
                            break;
                        }
                        case 'discard':
                            canActivate = charges >= ta.chargeCost;
                            break;
                        case 'redraw':
                            canActivate = charges >= ta.chargeCost && hasDrawn;
                            break;
                        case 'hold': {
                            const hasHeld = !!state.tableActionHeldCards[relic.id];
                            canActivate = hasHeld || (charges >= ta.chargeCost && hasDrawn);
                            break;
                        }
                        case 'switch': {
                            const hasDealerFaceUp = state.dealer.cards.some(c => c.isFaceUp);
                            const hasPlayerCard = state.playerHands.some(h => !h.isBust && h.blackjackValue !== 21 && h.cards.length > 0);
                            canActivate = charges >= ta.chargeCost && hasDealerFaceUp && hasPlayerCard;
                            break;
                        }
                    }

                    if (canActivate) {
                        actions.push({ type: 'activate_table_action', relicId: relic.id });
                    }
                }
            }

            break;
        }

        case 'deal_over':
            if (state.cash >= state.ante) {
                actions.push({ type: 'deal' });
                actions.push({ type: 'enter_gift_shop' });
            }
            break;

        case 'gift_shop': {
            if (state.pendingRaiseChoices.length) {
                state.pendingRaiseChoices.forEach(raiseId => actions.push({ type: 'choose_raise', raiseId }));
                break;
            }
            if (state.cash >= getRelicSlotCost(state.relicSlots)) actions.push({ type: 'buy_relic_slot' });
            // Can always leave
            actions.push({ type: 'leave_shop' });

            const disabledButtons: string[] = [];

            // Buyable items
            for (const item of state.shopItems) {
                if (!item.purchased && state.cash >= item.cost && canAddShopItem(state, item.id)) {
                    actions.push({ type: 'buy_shop_item', itemId: item.id });
                }
            }

            // Restock
            if (!disabledButtons.includes('restock') && state.cash >= state.giftShopRestockCost) {
                actions.push({ type: 'restock_shop' });
            }

            // Sell relics
            if (!disabledButtons.includes('sell')) {
                const invArr = state.inventory as RelicInstance[];
                invArr.forEach((inst, idx) => {
                    actions.push({ type: 'sell_relic', relicId: inst.id, index: idx });
                });
            }

            // Enhance cards
            if (!disabledButtons.includes('enhance')) {
                const deck = (state as any).deck || [];
                for (const card of deck) {
                    if (card.rank && !card.specialEffect) {
                        actions.push({ type: 'enhance_card', cardId: card.id, enhancement: { type: 'chip', value: 5 } });
                    }
                }
            }

            // Destroy cards
            if (!disabledButtons.includes('destroy')) {
                const destroyCost = getRemovalCashCost(state.removalCount);
                if (state.cash >= destroyCost) {
                    const deck = (state as any).deck || [];
                    for (const card of deck) {
                        actions.push({ type: 'destroy_card', cardId: card.id });
                    }
                }
            }

            break;
        }

        case 'dealer_turn':
            actions.push({ type: 'resolve_dealer_turn' });
            break;

        case 'resolving_outcomes':
            actions.push({ type: 'resolve_hand_outcome' });
            break;

        case 'scoring':
            actions.push({ type: 'score_round' });
            break;

        case 'game_over':
            // Could restart or quit
            break;
    }

    // Tutorial restrictions
    if (state.tutorial && state.tutorial.activeStepId) {
        // Allow acknowledge if applicable
        if (canAcknowledgeTutorial(state.tutorial.activeStepId)) {
            actions.push({ type: 'acknowledge_tutorial', stepId: state.tutorial.activeStepId });
        }
        
        // Apply restrictions
        const restricted = getTutorialRestrictedActions(state.tutorial.activeStepId);
        if (restricted) {
             return actions.filter(a => 
                 a.type === 'acknowledge_tutorial' || restricted.includes(a.type)
             );
        }
    }

    return actions;
}

// ─── Create Initial State ───────────────────────────────

export function createInitialState(): GameState {
    return {
        tutorial: initialTutorialState(),
        selectedCityId: null,
        selectedGamblerId: null,
        deal: 1,
        dealsTaken: 0,
        handsRemaining: BASE_DEALS_PER_CASINO,
        totalScore: 0,
        targetScore: 0,
        comps: STARTING_COMP_TICKETS,
        cash: STARTING_CASH,
        ante: BASE_ANTE,
        handsUntilAnteIncrease: HANDS_PER_ANTE,
        shopDealsAtLastFreeRestock: 0,
        shopReturnPhase: 'entering_casino',
        phase: 'init',
        dealer: { cards: [], isRevealed: false, blackjackValue: 0 },
        playerHands: [],
        drawnCards: [],
        selectedDrawIndex: null,
        cardsPlacedThisTurn: 0,
        interactionMode: 'default',
        activeTableActionId: null,
        inventory: [],
        relicSlots: INITIAL_RELIC_SLOTS,
        pendingRaiseChoices: [],
        handUpgrades: {},
        tableActionCharges: {},
        tableActionHeldCards: {},
        deckProbabilities: {
            suits: { hearts: 25, diamonds: 25, clubs: 25, spades: 25 },
            ranks: { ace: 10, face: 30, upper: 30, lower: 30 },
            specialChance: 0,
            specialWeights: []
        },
        modifiers: { drawCountMod: 0, placeCountMod: 0 },
        shopStockInitialized: false,
        shopItems: [],
        giftShopRestockCost: BASE_SHOP_RESTOCK_COST,
        shopRewardSummary: null,
        runningSummary: null,
        rngState: SeededRNG.random().getState(),
        redrawDiscard: null,
        removalCount: 0,
    };
}

// ─── Action Implementations ─────────────────────────────

function processStartGame(
    state: GameState,
    cityId: string,
    gamblerId: string,
    seed?: number,
    globalTutorialsCompleted?: string[],
    skipAtlanticTutorials?: boolean
): ActionResult {
    const rng = new SeededRNG(seed ?? Math.floor(Math.random() * 2147483647));
    const events: GameEvent[] = [];

    // Find city and gambler definitions
    const gambler = GAMBLER_DEFINITIONS.find(g => g.id === gamblerId) || GAMBLER_DEFINITIONS[0];

    // Create initial deck probabilities from gambler
    const deckProbabilities = gambler.getInitialProbabilities();
    const inventory = gambler.getInitialRelics();

    const targetScore = 0; // Legacy field; cash targets no longer govern the run.

    // Build table action charges for initial relics
    const tableActionCharges: Record<string, number> = {};
    const tableActionHeldCards: Record<string, Card | null> = {};
    for (const relic of inventory) {
        const config = getRelicConfig(relic.id);
        if (config?.tableAction) {
            tableActionCharges[relic.id] = config.tableAction.maxCharges;
            tableActionHeldCards[relic.id] = null;
        }
    }

    const playerHands: PlayerHand[] = Array.from({ length: INITIAL_HAND_COUNT }, (_, i) => ({
        id: i,
        cards: [],
        isHeld: false,
        isBust: false,
        blackjackValue: 0,
    }));

    const nextState: GameState = {
        ...state,
        selectedCityId: cityId,
        selectedGamblerId: gamblerId,
        deal: 1,
        dealsTaken: 0,
        handsRemaining: INITIAL_HAND_COUNT,
        totalScore: 0,
        targetScore,
        comps: STARTING_COMP_TICKETS,
        cash: STARTING_CASH,
        ante: BASE_ANTE,
        handsUntilAnteIncrease: HANDS_PER_ANTE,
        shopDealsAtLastFreeRestock: 0,
        shopReturnPhase: 'entering_casino',
        phase: 'entering_casino',
        deckProbabilities,
        dealer: { cards: [], isRevealed: false, blackjackValue: 0 },
        playerHands,
        drawnCards: [],
        selectedDrawIndex: null,
        cardsPlacedThisTurn: 0,
        interactionMode: 'default',
        activeTableActionId: null,
        inventory,
        relicSlots: INITIAL_RELIC_SLOTS,
        pendingRaiseChoices: [],
        handUpgrades: {},
        tableActionCharges,
        tableActionHeldCards,
        modifiers: { drawCountMod: 0, placeCountMod: 0 },
        shopStockInitialized: false,
        shopItems: [],
        giftShopRestockCost: BASE_SHOP_RESTOCK_COST,
        shopRewardSummary: null,
        runningSummary: null,
        rngState: rng.getState(),
        redrawDiscard: null,
        removalCount: 0,
    };

    events.push({ type: 'phase_changed', from: 'init', to: 'entering_casino' });

    // Initialize tutorial state
    const tutorialState = initialTutorialState();
    let completedSteps = globalTutorialsCompleted || [];
    
    if (skipAtlanticTutorials && cityId === 'atlantic_city') {
         completedSteps = Array.from(new Set([...completedSteps, ...TUTORIAL_STEPS.map(s => s.id)]));
    }

    if (completedSteps.length > 0) {
        tutorialState.globalCompletedStepIds = completedSteps;
    }

    return { 
        nextState: { ...nextState, tutorial: tutorialState }, 
        events 
    };
}

function canAddShopItem(state: GameState, itemId: string): boolean {
    return state.shopItems.find(item => item.id === itemId)?.type === 'RaisePack' || !!getRaise(itemId) || canAcquireRelic(itemId, state.inventory, state.relicSlots);
}

function processDeal(state: GameState, _forceContinue?: boolean): ActionResult {
    if (state.phase !== 'entering_casino' && state.phase !== 'deal_over') {
        return { nextState: state, events: [] };
    }
    if (state.cash < state.ante) {
        return {
            nextState: { ...state, phase: 'game_over' },
            events: [
                { type: 'game_over', won: false, finalScore: state.totalScore },
                { type: 'phase_changed', from: state.phase, to: 'game_over' },
            ],
        };
    }
    const activeHandIds = [1];

    const rng = new SeededRNG(state.rngState);
    const events: GameEvent[] = [];

    const playerHands: PlayerHand[] = Array.from({ length: INITIAL_HAND_COUNT }, (_, i) => ({
        id: i,
        cards: [],
        isHeld: false,
        isInactive: !activeHandIds.includes(i),
        isBust: false,
        blackjackValue: 0,
    }));

    // Deal initial player card to center hand
    const playerCard = drawCardFromProbabilities(state.deckProbabilities, rng);
    playerCard.isFaceUp = true;
    playerCard.origin = 'deck';
    playerHands[1] = {
        ...playerHands[1],
        cards: [playerCard],
        blackjackValue: getBlackjackScore([playerCard], state.inventory as RelicInstance[]),
    };

    // Deal dealer cards
    const dealerCard1 = drawCardFromProbabilities(state.deckProbabilities, rng);
    const dealerCard2 = drawCardFromProbabilities(state.deckProbabilities, rng);
    
    // Check if player has spyglass
    const isDealerRevealed = executeValueHook('getDealerRevealed', false, { inventory: state.inventory as RelicInstance[] });
    
    dealerCard1.isFaceUp = isDealerRevealed;
    dealerCard1.origin = 'deck';
    dealerCard2.isFaceUp = true;
    dealerCard2.origin = 'deck';

    const dealerCards: [Card, Card] = [dealerCard1, dealerCard2];

    const newDealsTaken = state.dealsTaken + 1;
    const newHandsRemaining = 1;
    const newComps = state.comps;
    const newCash = state.cash - state.ante;

    events.push({
        type: 'deal_started',
        deal: newDealsTaken,
        handsRemaining: newHandsRemaining,
        activeHandIds,
        comps: newComps,
        cash: newCash,
        ante: state.ante,
    });
    events.push({
        type: 'cards_dealt',
        playerCard,
        playerHandIndex: 1,
        dealerCards,
    });
    events.push({ type: 'initial_deal_complete' });

    const nextState: GameState = {
        ...state,
        phase: 'playing',
        playerHands,
        dealer: {
            cards: dealerCards,
            isRevealed: false,
            blackjackValue: getBlackjackScore(dealerCards.filter(c => c.isFaceUp), state.inventory as RelicInstance[], true),
        },
        drawnCards: [],
        selectedDrawIndex: null,
        cardsPlacedThisTurn: 0,
        deal: newDealsTaken,
        dealsTaken: newDealsTaken,
        comps: newComps,
        cash: newCash,
        handsRemaining: newHandsRemaining,
        runningSummary: null,
        modifiers: { drawCountMod: 0, placeCountMod: 0 },
        interactionMode: 'default',
        activeTableActionId: null,
        redrawDiscard: null,
        rngState: rng.getState(),
    };

    events.push({ type: 'phase_changed', from: state.phase, to: 'playing' });

    return { nextState, events };
}

// Compatibility alias for old callers; there are no casino payouts.
function processLeaveCasino(state: GameState): ActionResult {
    return processEnterGiftShop(state);
}

function processDraw(state: GameState): ActionResult {
    if (state.phase !== 'playing' || state.drawnCards.some(c => c !== null) || !state.playerHands.some(h => canPlayHand(h, state.comps))) {
        return { nextState: state, events: [] };
    }

    const rng = new SeededRNG(state.rngState);
    const events: GameEvent[] = [];
    const inventory = state.inventory as RelicInstance[];

    // Calculate draw count
    let drawCount = 1 + state.modifiers.drawCountMod;
    drawCount = executeValueHook('getDrawCount', drawCount, { inventory });

    // Draw cards
    const drawnCards: Card[] = [];
    for (let i = 0; i < drawCount; i++) {
        const card = drawCardFromProbabilities(state.deckProbabilities, rng);
        card.isFaceUp = true;
        card.origin = 'deck';
        drawnCards.push(card);
        events.push({ type: 'card_drawn', card, drawIndex: i });
    }

    const centerIndex = Math.floor((drawnCards.length - 1) / 2);
    const selectedIndex = Math.max(0, centerIndex);

    events.push({ type: 'draw_complete', drawnCards, selectedIndex });

    const nextState: GameState = {
        ...state,
        drawnCards,
        selectedDrawIndex: selectedIndex,
        modifiers: { ...state.modifiers, drawCountMod: 0 }, // Consume draw mod
        interactionMode: 'default',
        activeTableActionId: null,
        rngState: rng.getState(),
    };

    return { nextState, events };
}

function processSelectDrawnCard(state: GameState, drawIndex: number): ActionResult {
    if (drawIndex < 0 || drawIndex >= state.drawnCards.length || state.drawnCards[drawIndex] === null) {
        return { nextState: state, events: [] };
    }

    return {
        nextState: { ...state, selectedDrawIndex: drawIndex },
        events: [],
    };
}

function processPlaceCard(state: GameState, handIndex: number): ActionResult {
    const { playerHands, drawnCards, selectedDrawIndex, cardsPlacedThisTurn, modifiers, inventory } = state;

    if (state.phase !== 'playing' || selectedDrawIndex === null || !drawnCards[selectedDrawIndex]) {
        return { nextState: state, events: [] };
    }

    let invArr = inventory as RelicInstance[];
    const events: GameEvent[] = [];
    const cardToPlace = drawnCards[selectedDrawIndex]!;

    // Place card into hand
    const targetHand = playerHands[handIndex];
    if (!targetHand || !canPlayHand(targetHand, state.comps)) {
        return { nextState: state, events: [] };
    }

    const newComps = state.comps - (targetHand.isInactive ? 1 : 0);
    if (targetHand.isInactive) events.push({ type: 'side_hand_opened', handIndex, cost: 1, newComps });

    const isSpecial = cardToPlace.type === 'chip' || cardToPlace.type === 'mult' || cardToPlace.type === 'score';
    const spacing = 120;
    const drawOffset = (selectedDrawIndex - (drawnCards.length - 1) / 2) * spacing;
    const cardToAdd: Card = {
        ...cardToPlace,
        origin: 'draw_pile' as const,
        animationOffset: drawOffset,
    };
    const newCards = isSpecial ? [cardToAdd, ...targetHand.cards] : [...targetHand.cards, cardToAdd];
    const newBJValue = getBlackjackScore(newCards, invArr);
    const isBust = newBJValue > 21;

    let updatedHand: PlayerHand = {
        ...targetHand,
        isInactive: false,
        cards: newCards,
        blackjackValue: newBJValue,
        isBust,
    };

    events.push({
        type: 'card_placed',
        card: cardToAdd,
        handIndex,
        newBlackjackValue: newBJValue,
    });

    // Remove from drawn cards
    const remainingDrawn = [...drawnCards];
    remainingDrawn[selectedDrawIndex] = null;

    let updatedHands = playerHands.map((h, idx) =>
        idx === handIndex ? updatedHand : h
    );

    // ─── Relic Hooks: onCheckCardPlace + onCardPlaced ───
    // Check hooks (synchronous, pure)
    const checkContext = {
        inventory: invArr,
        handId: handIndex,
        placedCard: cardToPlace,
        handCards: updatedHand.cards,
        blackjackValue: updatedHand.blackjackValue,
        highlightRelic: async () => {},
        modifyHand: () => {},
        revealDealerHiddenCard: () => {},
    };
    const shouldWait = executeCheckHook('onCheckCardPlace', checkContext as any);
    if (shouldWait) {
        events.push({ type: 'relic_activated', relicId: '_check_wait', description: 'Relic wants to intervene' });
    }

    // Execute onCardPlaced interrupt hooks purely
    const cardPlacedResult = executeOnCardPlaced(
        invArr,
        handIndex,
        updatedHand.cards,
        cardToPlace,
        updatedHand.blackjackValue,
        state.dealer.cards,
    );
    events.push(...cardPlacedResult.events);
    // Apply hand modifications from relics (e.g., safety_net_20 discards hand)
    if (cardPlacedResult.events.some(e => e.type === 'hand_modified' && e.handIndex === handIndex)) {
        const modifiedEvent = cardPlacedResult.events.find(
            (e): e is Extract<GameEvent, { type: 'hand_modified' }> => e.type === 'hand_modified' && e.handIndex === handIndex
        );
        if (modifiedEvent) {
            updatedHand = {
                ...updatedHand,
                cards: modifiedEvent.newCards,
                blackjackValue: getBlackjackScore(modifiedEvent.newCards, invArr),
                isBust: false,
            };
            updatedHands = updatedHands.map((h, idx) => idx === handIndex ? updatedHand : h);
        }
    }
    // Update inventory with relic state changes
    invArr = cardPlacedResult.inventory;

    // Bust handling
    if (isBust && !playerHands[handIndex].isBust) {
        events.push({ type: 'hand_bust', handIndex, blackjackValue: newBJValue });

        // Execute onHandBust interrupt hooks purely (e.g., mulligan removes last card)
        const bustResult = executeOnHandBust(invArr, handIndex, updatedHand.cards);
        events.push(...bustResult.events);
        // Apply hand modifications from bust hooks
        if (bustResult.events.some(e => e.type === 'hand_modified' && e.handIndex === handIndex)) {
            const modifiedEvent = bustResult.events.find(
                (e): e is Extract<GameEvent, { type: 'hand_modified' }> => e.type === 'hand_modified' && e.handIndex === handIndex
            );
            if (modifiedEvent) {
                const newBJ = getBlackjackScore(modifiedEvent.newCards, invArr);
                updatedHand = {
                    ...updatedHand,
                    cards: modifiedEvent.newCards,
                    blackjackValue: newBJ,
                    isBust: newBJ > 21,
                };
                updatedHands = updatedHands.map((h, idx) => idx === handIndex ? updatedHand : h);
            }
        }
        invArr = bustResult.inventory;

        // Charge table actions on bust
        const newCharges = { ...state.tableActionCharges };
        for (const instance of invArr) {
            const config = getRelicConfig(instance.id);
            if (config?.tableAction) {
                const recharge = config.tableAction.recharge;
                if (recharge === 'bust' || recharge === 'bust_or_loss') {
                    const current = newCharges[instance.id] ?? 0;
                    newCharges[instance.id] = Math.min(config.tableAction.maxCharges, current + 1);
                    events.push({
                        type: 'charge_gained',
                        relicId: instance.id,
                        newCharges: newCharges[instance.id],
                        reason: 'bust',
                    });
                }
            }
        }
    }

    // Placement sequencing
    const newPlacedCount = cardsPlacedThisTurn + 1;
    let totalPlaceCount = 1 + modifiers.placeCountMod;
    totalPlaceCount = executeValueHook('getPlaceCount', totalPlaceCount, { inventory: invArr });

    const anyPlayable = updatedHands.some(h => canPlayHand(h, newComps));
    const hasRemainingCards = remainingDrawn.some(c => c !== null);
    const canPlaceMore = newPlacedCount < totalPlaceCount && hasRemainingCards && anyPlayable;

    let nextDrawIndex: number | null = null;

    if (canPlaceMore) {
        // Find next available card
        for (let i = selectedDrawIndex + 1; i < remainingDrawn.length; i++) {
            if (remainingDrawn[i] !== null) { nextDrawIndex = i; break; }
        }
        if (nextDrawIndex === null) {
            for (let i = 0; i < selectedDrawIndex; i++) {
                if (remainingDrawn[i] !== null) { nextDrawIndex = i; break; }
            }
        }
    } else {
        // Leftover drawn cards are simply discarded (visual only, no pile)
        const leftovers = remainingDrawn.filter((c): c is Card => c !== null);
        if (leftovers.length > 0) {
            events.push({ type: 'leftover_cards_discarded', cards: leftovers });
        }
    }

    events.push({
        type: 'placement_complete',
        canPlaceMore,
        nextDrawIndex,
    });

    // Auto-stand detection
    const allUnplayable = updatedHands.every(h => !canPlayHand(h, newComps));
    if (!canPlaceMore && allUnplayable) {
        events.push({ type: 'auto_stand_triggered' });
    }

    const nextState: GameState = {
        ...state,
        playerHands: updatedHands,
        comps: newComps,
        drawnCards: canPlaceMore ? remainingDrawn : [],
        selectedDrawIndex: canPlaceMore ? nextDrawIndex : null,
        cardsPlacedThisTurn: canPlaceMore ? newPlacedCount : 0,
        modifiers: canPlaceMore ? state.modifiers : { ...modifiers, placeCountMod: 0 },
        inventory: invArr,
    };

    return { nextState, events };
}

function processStand(state: GameState): ActionResult {
    if (state.phase !== 'playing') {
        return { nextState: state, events: [] };
    }

    const events: GameEvent[] = [];
    events.push({ type: 'phase_changed', from: 'playing', to: 'dealer_turn' });

    return {
        nextState: { ...state, phase: 'dealer_turn' },
        events,
    };
}

function processResolveDealerTurn(state: GameState): ActionResult {
    if (state.phase !== 'dealer_turn') return { nextState: state, events: [] };

    const rng = new SeededRNG(state.rngState);
    const events: GameEvent[] = [];
    const invArr = state.inventory as RelicInstance[];

    // 1. Dealer Reveal
    let dCards = [...state.dealer.cards.map(c => ({ ...c }))];
    let dVal = state.dealer.blackjackValue;

    if (!state.dealer.isRevealed && dCards.length >= 2) {
        dCards[0] = { ...dCards[0], isFaceUp: true };
        dVal = getBlackjackScore(dCards, invArr, true);
        events.push({ type: 'dealer_reveal', card: dCards[0], newValue: dVal });
    }

    // 2. Dealer Draw Loop
    const dealerStopValue = executeValueHook('getDealerStopValue', 17, { inventory: invArr });
    let debugDeck = (state as any).deck ? [...(state as any).deck] : null;
    const isDebugWin = (state as any).debugWin === true;

    while (dVal < dealerStopValue || (isDebugWin && dVal <= 21)) {
        let c: Card;
        if (debugDeck && debugDeck.length > 0) {
            c = debugDeck.pop()!;
        } else {
            c = drawCardFromProbabilities(state.deckProbabilities, rng);
        }

        c.isFaceUp = true;
        c.origin = 'deck';
        dCards.push(c);
        dVal = getBlackjackScore(dCards, invArr, true);

        events.push({ type: 'dealer_hit', card: c, newValue: dVal, burnedCards: [] });
    }

    if (dVal > 21) {
        events.push({ type: 'dealer_bust', value: dVal });
    } else {
        events.push({ type: 'dealer_stand', value: dVal });
    }

    events.push({ type: 'phase_changed', from: 'dealer_turn', to: 'resolving_outcomes' });

    const nextState: any = {
        ...state,
        phase: 'resolving_outcomes',
        dealer: { cards: dCards, isRevealed: true, blackjackValue: dVal },
        rngState: rng.getState(),
    };
    if (debugDeck) {
        nextState.deck = debugDeck;
    }
    delete nextState.debugWin;

    return {
        nextState,
        events,
    };
}

function processResolveHandOutcome(state: GameState): ActionResult {
    if (state.phase !== 'resolving_outcomes') return { nextState: state, events: [] };

    const events: GameEvent[] = [];
    const dVal = state.dealer.blackjackValue;
    const invArr = state.inventory as RelicInstance[];

    // 3. Evaluate each player hand
    const scoredHands = state.playerHands.map((h, i) => {
        if (h.isInactive) return { ...h, outcome: null, resultRevealed: false };
        let outcome: 'win' | 'loss' | 'bust' | null = 'loss';

        if (h.cards.length === 0) {
            outcome = 'loss';
        } else if (h.isBust) {
            outcome = 'bust';
        } else if (h.blackjackValue === 21) {
            outcome = dVal > 21 || h.blackjackValue >= dVal ? 'win' : 'loss';
        } else if (dVal > 21) {
            outcome = 'win';
        } else if (h.blackjackValue >= dVal) {
            outcome = 'win';
        }

        events.push({ type: 'hand_outcome', handIndex: i, outcome, blackjackValue: h.blackjackValue });

        return { ...h, outcome, resultRevealed: true };
    });

    // Charge table actions on loss
    const newCharges = { ...state.tableActionCharges };
    for (const hand of scoredHands) {
        if (hand.outcome === 'loss' && !hand.isBust && hand.cards.length > 0) {
            for (const instance of invArr) {
                const config = getRelicConfig(instance.id);
                if (config?.tableAction) {
                    const recharge = config.tableAction.recharge;
                    if (recharge === 'loss' || recharge === 'bust_or_loss') {
                        const current = newCharges[instance.id] ?? 0;
                        newCharges[instance.id] = Math.min(config.tableAction.maxCharges, current + 1);
                        events.push({
                            type: 'charge_gained',
                            relicId: instance.id,
                            newCharges: newCharges[instance.id],
                            reason: 'loss',
                        });
                    }
                }
            }
        }
    }
    
    // Transition to scoring
    const hasWin = scoredHands.some(h => h.outcome === 'win');
    if (hasWin) {
        events.push({ type: 'dealer_fade_out' });
    }
    events.push({ type: 'phase_changed', from: 'resolving_outcomes', to: 'scoring' });

    return {
        nextState: {
            ...state,
            phase: 'scoring',
            playerHands: scoredHands,
            tableActionCharges: newCharges,
            runningSummary: { chips: 0, mult: 1 },
        },
        events,
    };
}

function processScoreRound(state: GameState): ActionResult {
    if (state.phase !== 'scoring') return { nextState: state, events: [] };

    const events: GameEvent[] = [];
    let runningSummary = state.runningSummary || { chips: 0, mult: 1 };
    let currentInv = state.inventory as RelicInstance[];
    const scoredHands = state.playerHands;

    // Pre-calculate to count category instances across all scored hands
    const categoryCounts: Record<string, number> = { flush: 0, rank: 0, straight: 0 };
    scoredHands.forEach(hand => {
        if (hand.cards.length === 0) return;
        const isWin = hand.outcome === 'win';
        const preScore = evaluateHandScore(hand.cards, isWin, hand.isDoubled ?? false, currentInv, state.comps, undefined, hand.outcome, state.handUpgrades);
        preScore.criteria.forEach(c => {
            if (c.id === 'flush' || c.id.startsWith('flush_')) categoryCounts.flush++;
            if (c.id === 'straight' || c.id.startsWith('straight_')) categoryCounts.straight++;
            if (c.id === 'rank' || c.id.startsWith('rank_') || c.id === 'pair' || c.id === 'three_kind') categoryCounts.rank++;
        });
    });

    // 4. Scoring pipeline
    const finalHands = scoredHands.map((hand, i) => {
        if (hand.cards.length === 0) {
            return { ...hand, finalScore: null, resultRevealed: true };
        }

        const isWin = hand.outcome === 'win';
        const score = evaluateHandScore(
            hand.cards,
            isWin,
            hand.isDoubled ?? false,
            currentInv,
            state.comps,
            categoryCounts,
            hand.outcome,
            state.handUpgrades
        );

        events.push({ type: 'scoring_hand_focus', handIndex: i });

        for (const criterion of score.criteria) {
             const introCriterion = { ...criterion, chips: 0, multiplier: 0 };
             if (criterion.id === 'win' || criterion.id === 'viginti') {
                 introCriterion.cardIds = [];
             }
             events.push({ type: 'scoring_row_intro', handIndex: i, criterion: introCriterion });

             if (criterion.matches && criterion.matches.length > 0) {
                 let rowChips = 0;
                 let rowMult = 0;
                 for (const match of criterion.matches) {
                     rowChips += match.chips;
                     rowMult += match.multiplier;
                     
                     if (match.chips !== 0) {
                         events.push({ type: 'scoring_row_chips', handIndex: i, criterionId: criterion.id, chips: rowChips });
                         runningSummary = { ...runningSummary, chips: runningSummary.chips + match.chips };
                         events.push({ type: 'summary_update', ...runningSummary });
                     }
                     
                     if (match.multiplier !== 0) {
                         events.push({ type: 'scoring_row_mult', handIndex: i, criterionId: criterion.id, multiplier: rowMult });
                         runningSummary = { ...runningSummary, mult: runningSummary.mult + match.multiplier };
                         events.push({ type: 'summary_update', ...runningSummary });
                     }
                 }
            } else {
                 if (criterion.chips !== 0) {
                     events.push({ type: 'scoring_row_chips', handIndex: i, criterionId: criterion.id, chips: criterion.chips });
                     runningSummary = { ...runningSummary, chips: runningSummary.chips + criterion.chips };
                     events.push({ type: 'summary_update', ...runningSummary });
                 }
                 
                 if (criterion.multiplier !== 0) {
                     events.push({ type: 'scoring_row_mult', handIndex: i, criterionId: criterion.id, multiplier: criterion.multiplier });
                     runningSummary = { ...runningSummary, mult: runningSummary.mult + criterion.multiplier };
                     events.push({ type: 'summary_update', ...runningSummary });
                 }
            }

            const scoreRowResult = executeOnScoreRow(
                currentInv,
                criterion.id,
                score,
                runningSummary,
                categoryCounts
            );
            events.push(...scoreRowResult.events);
            runningSummary = scoreRowResult.runningSummary ?? runningSummary;
            currentInv = scoreRowResult.inventory;
        }

        const handCompResult = executeOnHandCompletion(
            currentInv,
            hand.cards,
            score,
            runningSummary,
        );
        events.push(...handCompResult.events);
        runningSummary = handCompResult.runningSummary ?? runningSummary;
        currentInv = handCompResult.inventory;

        events.push({ type: 'scoring_hand_complete', handIndex: i });

        return { ...hand, finalScore: score, resultRevealed: true };
    });

    // 5. Execute onDealCompletion
    const wins = scoredHands.filter(h => h.outcome === 'win').length;
    const losses = scoredHands.filter(h => h.outcome === 'loss').length;
    const vigintis = scoredHands.filter(h => h.outcome === 'win' && h.blackjackValue === 21).length;

    const dealCompResult = executeOnDealCompletion(
        currentInv,
        wins,
        losses,
        vigintis,
        runningSummary,
        finalHands,
    );
    events.push(...dealCompResult.events);
    runningSummary = dealCompResult.runningSummary ?? runningSummary;
    currentInv = dealCompResult.inventory;

    if (dealCompResult.relicsToRemove && dealCompResult.relicsToRemove.length > 0) {
        currentInv = currentInv.filter(r => !dealCompResult.relicsToRemove!.includes(r.id));
    }

    // 6. Deal scoring complete
    // Decimal raises should not lose a dollar at an integer payout boundary.
    const finalScore = Math.floor(Number((runningSummary.chips * runningSummary.mult).toFixed(8)));
    events.push({
        type: 'deal_scoring_complete',
        totalChips: runningSummary.chips,
        totalMult: runningSummary.mult,
        finalScore,
    });

    // 7. Update total score
    const newTotalScore = state.totalScore + finalScore;
    const newCash = Math.max(0, state.cash + finalScore);
    events.push({ type: 'chip_collection', amount: finalScore, newTotalScore, newCash });

    const ticketRewards = finalHands.reduce((total, hand) => total + (hand.finalScore?.criteria.reduce((sum, row) => sum + (row.compTickets ?? 0), 0) ?? 0), 0);
    let newComps = state.comps + ticketRewards;
    if (ticketRewards > 0) {
        events.push({ type: 'comps_earned', amount: ticketRewards, newTotal: newComps, reason: 'winning_hands' });
    }
    const increaseDue = state.handsUntilAnteIncrease <= 1;
    const ante = state.ante + (increaseDue ? ANTE_INCREASE_AMOUNT : 0);
    const handsUntilAnteIncrease = increaseDue ? HANDS_PER_ANTE : state.handsUntilAnteIncrease - 1;
    const rng = new SeededRNG(state.rngState);
    let shopItems = state.shopItems;
    let tableActionCharges = state.tableActionCharges;
    if (increaseDue) {
        events.push({ type: 'ante_increased', previousAnte: state.ante, ante, handsUntilAnteIncrease });
        shopItems = generateRunShopItems({ ...state, inventory: currentInv }, rng);
        events.push({ type: 'shop_restocked', newItems: [...shopItems], cost: 0, newCash });
        tableActionCharges = Object.fromEntries(Object.entries(state.tableActionCharges).map(([id, charges]) => {
            const action = getRelicConfig(id)?.tableAction;
            return [id, action?.recharge === 'casino' ? action.maxCharges : charges];
        }));
        const ticketBonus = Math.max(0, executeValueHook('getDealsPerCasino', BASE_DEALS_PER_CASINO, { inventory: currentInv }) - BASE_DEALS_PER_CASINO);
        if (ticketBonus > 0) {
            newComps += ticketBonus;
            events.push({ type: 'comps_earned', amount: ticketBonus, newTotal: newComps, reason: 'ante_increase_bonus' });
        }
    }
    const nextPhase: GameState['phase'] = newCash >= ante ? 'deal_over' : 'game_over';
    if (nextPhase === 'game_over') {
        events.push({ type: 'game_over', won: false, finalScore: newTotalScore });
    }

    events.push({ type: 'phase_changed', from: 'scoring', to: nextPhase });

    const hasWin = scoredHands.some(h => h.outcome === 'win');
    return {
        nextState: {
            ...state,
            phase: nextPhase,
            playerHands: finalHands,
            totalScore: newTotalScore,
            cash: newCash,
            ante,
            handsUntilAnteIncrease,
            shopItems,
            shopStockInitialized: state.shopStockInitialized || increaseDue,
            shopDealsAtLastFreeRestock: increaseDue ? state.dealsTaken : state.shopDealsAtLastFreeRestock,
            giftShopRestockCost: increaseDue ? BASE_SHOP_RESTOCK_COST : state.giftShopRestockCost,
            tableActionCharges,
            comps: newComps,
            runningSummary,
            inventory: currentInv,
            rngState: rng.getState(),
            ...(hasWin ? { dealer: { cards: [], isRevealed: false, blackjackValue: 0 } } : {}),
        },
        events,
    };
}


function processCompleteDealEarly(state: GameState): ActionResult {
    return processDeal(state);
}

// ─── Debug Action Implementations ────────────────────────

function processDebugWin(state: GameState): ActionResult {
    if (state.phase !== 'playing') return { nextState: state, events: [] };

    // 1. Force all hands to stand
    const updatedHands = state.playerHands.map(h => ({ ...h, isHeld: true }));
    
    // 2. Rig the deck to ensure dealer bust
    const deck = [...((state as any).deck || [])];
    // Put several 10-value cards at the top of the deck (end of array, which is popped from)
    for (let i = 0; i < 5; i++) {
        deck.push({
            id: `debug-rig-${Date.now()}-${i}`,
            suit: 'spades',
            rank: 'K',
            isFaceUp: false,
            origin: 'deck',
            type: 'standard'
        } as Card);
    }
    
    // 3. Set debug flag to force dealer to hit until they bust
    const riggedState = {
        ...state,
        playerHands: updatedHands,
        deck,
        debugWin: true
    };

    return processStand(riggedState);
}

function processDebugVictory(state: GameState): ActionResult {
    return {
        nextState: { ...state, phase: 'victory' },
        events: [{ type: 'phase_changed', from: state.phase, to: 'victory' }]
    };
}

function processDebugAddRelic(state: GameState, relicId: string): ActionResult {
    const config = getRelicConfig(relicId);
    if (!config) return { nextState: state, events: [] };
    
    const instance: RelicInstance = {
        id: relicId,
        state: config.properties ? { ...config.properties } : {}
    };
    
    const newInventory = [...state.inventory, instance];
    const newCharges = { ...state.tableActionCharges };
    const newHeld = { ...state.tableActionHeldCards };
    
    if (config.tableAction) {
        newCharges[relicId] = config.tableAction.maxCharges;
        newHeld[relicId] = null;
    }
    
    return {
        nextState: {
            ...state,
            inventory: newInventory,
            tableActionCharges: newCharges,
            tableActionHeldCards: newHeld
        },
        events: []
    };
}

function processDebugRemoveRelic(state: GameState, relicId: string): ActionResult {
    const newInventory = state.inventory.filter(r => r.id !== relicId);
    const newCharges = { ...state.tableActionCharges };
    delete newCharges[relicId];
    const newHeld = { ...state.tableActionHeldCards };
    delete newHeld[relicId];
    
    return {
        nextState: {
            ...state,
            inventory: newInventory,
            tableActionCharges: newCharges,
            tableActionHeldCards: newHeld
        },
        events: []
    };
}

function processDebugFillCharges(state: GameState, relicId: string): ActionResult {
    const config = getRelicConfig(relicId);
    if (!config || !config.tableAction) return { nextState: state, events: [] };
    
    return {
        nextState: {
            ...state,
            tableActionCharges: {
                ...state.tableActionCharges,
                [relicId]: config.tableAction.maxCharges
            }
        },
        events: [
            { type: 'charge_gained', relicId, newCharges: config.tableAction.maxCharges, reason: 'bust' }
        ]
    };
}

function processDebugGiveCash(state: GameState, amount: number): ActionResult {
    return {
        nextState: { ...state, cash: state.cash + amount },
        events: [],
    };
}

function processDebugDrawCard(state: GameState, cardId: string): ActionResult {
    let card: Card | undefined;
    let deck = (state as any).deck;
    let updatedDeck = deck ? [...deck] : [];

    if (cardId.startsWith('debug_')) {
        const parts = cardId.split('_');
        const suitStr = parts[1];
        const rankStr = parts[2];
        const rank = rankStr as Rank;
        const suit = suitStr as Suit;
        card = {
            id: `debug_${suit}_${rank}_${Date.now()}`,
            suit,
            rank,
            type: 'standard',
            isFaceUp: true,
            origin: 'deck',
        };
    } else if (deck) {
        const cardIndex = updatedDeck.findIndex((c: Card) => c.id === cardId);
        if (cardIndex !== -1) {
            card = updatedDeck.splice(cardIndex, 1)[0];
            card.isFaceUp = true;
            card.origin = 'deck';
        }
    }

    if (!card) return { nextState: state, events: [] };
    
    return {
        nextState: {
            ...state,
            ...(deck ? { deck: updatedDeck } : {}),
            drawnCards: [card],
            selectedDrawIndex: 0
        },
        events: [
            { type: 'card_drawn', card, drawIndex: 0 },
            { type: 'draw_complete', drawnCards: [card], selectedIndex: 0 }
        ]
    };
}
