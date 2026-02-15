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
import { createStandardDeck } from '../logic/deck';
import { getBlackjackScore, evaluateHandScore } from '../logic/scoring';
import {
    executeValueHook,
    executeCheckHook,
    executeOnCardPlaced,
    executeOnHandBust,
    executeOnScoreRow,
    executeOnHandCompletion,
    executeOnRoundCompletion,
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
    processEnterGiftShop,
    processBuyShopItem,
    processRestockShop,
    processSellRelic,
    processLeaveShop,
    processEnhanceCard,
    processDestroyCard,
} from './actions/shopActions';

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
    switch (action.type) {
        case 'start_game':
            return processStartGame(state, action.cityId, action.gamblerId, action.seed);
        case 'deal':
            return processDeal(state);
        case 'draw':
            return processDraw(state);
        case 'select_drawn_card':
            return processSelectDrawnCard(state, action.drawIndex);
        case 'place_card':
            return processPlaceCard(state, action.handIndex);
        case 'stand':
            return processStand(state);
        case 'next_round':
            return processNextRound(state, action.forceContinue);
        case 'complete_round_early':
            return processCompleteRoundEarly(state);
        // Table actions
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
            actions.push({ type: 'deal' });
            break;

        case 'playing': {
            const hasDrawn = state.drawnCards.some(c => c !== null);
            const anyPlayable = state.playerHands.some(
                h => !h.isBust && !h.isHeld && h.blackjackValue !== 21
            );

            if (!hasDrawn) {
                // Can draw
                actions.push({ type: 'draw' });
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
                        if (!hand.isBust && !hand.isHeld && hand.blackjackValue !== 21) {
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
                        if (!hand.isBust && !hand.isHeld && hand.blackjackValue !== 21 && hand.cards.length > 0) {
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

        case 'round_over':
            actions.push({ type: 'next_round' });
            break;

        case 'casino_win':
            actions.push({ type: 'enter_gift_shop' });
            break;

        case 'gift_shop': {
            // Can always leave
            actions.push({ type: 'leave_shop' });

            // Get city config for disabled buttons
            const city = CITY_DEFINITIONS.find(c => c.id === state.selectedCityId) || CITY_DEFINITIONS[0];
            const casinoIdx = state.round - 1;
            const disabledButtons = city.getGiftShopDisabledButtons?.(casinoIdx) ?? [];

            // Buyable items
            for (const item of state.shopItems) {
                if (!item.purchased && state.comps >= item.cost) {
                    actions.push({ type: 'buy_shop_item', itemId: item.id });
                }
            }

            // Restock
            if (!disabledButtons.includes('restock') && state.comps >= state.giftShopRestockCost) {
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
                for (const card of state.deck) {
                    if (card.rank && !card.specialEffect) {
                        actions.push({ type: 'enhance_card', cardId: card.id, enhancement: { type: 'chip', value: 5 } });
                    }
                }
            }

            // Destroy cards
            if (!disabledButtons.includes('destroy')) {
                const destroyCost = 2 + (state.removalCount * 2);
                if (state.comps >= destroyCost) {
                    for (const card of state.deck) {
                        actions.push({ type: 'destroy_card', cardId: card.id });
                    }
                }
            }

            break;
        }

        case 'game_over':
            // Could restart or quit
            break;
    }

    return actions;
}

// ─── Create Initial State ───────────────────────────────

export function createInitialState(): GameState {
    return {
        selectedCityId: null,
        selectedGamblerId: null,
        round: 1,
        dealsTaken: 0,
        handsRemaining: BASE_DEALS_PER_CASINO,
        totalScore: 0,
        targetScore: 0,
        comps: 5,
        phase: 'init',
        deck: [],
        discardPile: [],
        dealer: { cards: [], isRevealed: false, blackjackValue: 0 },
        playerHands: [],
        drawnCards: [],
        selectedDrawIndex: null,
        cardsPlacedThisTurn: 0,
        interactionMode: 'default',
        activeTableActionId: null,
        inventory: [],
        tableActionCharges: {},
        tableActionHeldCards: {},
        modifiers: { drawCountMod: 0, placeCountMod: 0 },
        shopItems: [],
        giftShopRestockCost: 3,
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
    seed?: number
): ActionResult {
    const rng = new SeededRNG(seed ?? Math.floor(Math.random() * 2147483647));
    const events: GameEvent[] = [];

    // Find city and gambler definitions
    const city = CITY_DEFINITIONS.find(c => c.id === cityId) || CITY_DEFINITIONS[0];
    const gambler = GAMBLER_DEFINITIONS.find(g => g.id === gamblerId) || GAMBLER_DEFINITIONS[0];

    // Create initial deck from gambler
    const deck = rng.shuffle(gambler.getInitialDeck());
    const inventory = gambler.getInitialRelics();

    // Calculate target score for round 1
    const targetScore = city.casinoTargets[0] ?? 100;

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

    const handsRemaining = executeValueHook(
        'getDealsPerCasino',
        BASE_DEALS_PER_CASINO,
        { inventory }
    );

    const nextState: GameState = {
        ...state,
        selectedCityId: cityId,
        selectedGamblerId: gamblerId,
        round: 1,
        dealsTaken: 0,
        handsRemaining,
        totalScore: 0,
        targetScore,
        comps: 5,
        phase: 'entering_casino',
        deck,
        discardPile: [],
        dealer: { cards: [], isRevealed: false, blackjackValue: 0 },
        playerHands: [],
        drawnCards: [],
        selectedDrawIndex: null,
        cardsPlacedThisTurn: 0,
        interactionMode: 'default',
        activeTableActionId: null,
        inventory,
        tableActionCharges,
        tableActionHeldCards,
        modifiers: { drawCountMod: 0, placeCountMod: 0 },
        shopItems: [],
        giftShopRestockCost: 3,
        shopRewardSummary: null,
        runningSummary: null,
        rngState: rng.getState(),
        redrawDiscard: null,
        removalCount: 0,
    };

    events.push({ type: 'phase_changed', from: 'init', to: 'entering_casino' });

    return { nextState, events };
}

function processDeal(state: GameState): ActionResult {
    if (state.phase !== 'entering_casino' && state.phase !== 'playing' && state.phase !== 'round_over') {
        return { nextState: state, events: [] };
    }

    const rng = new SeededRNG(state.rngState);
    const events: GameEvent[] = [];
    const deckRef = [...state.deck];
    const discardRef = [...state.discardPile];

    // Collect previous round cards into discard (if re-dealing mid-casino)
    const additionalDiscard: Card[] = [];
    if (state.dealer.cards.length > 0) {
        additionalDiscard.push(...state.dealer.cards);
    }
    for (const hand of state.playerHands) {
        if (hand.cards.length > 0) {
            additionalDiscard.push(...hand.cards);
        }
    }
    discardRef.push(...additionalDiscard);

    // Create empty player hands
    const playerHands: PlayerHand[] = Array.from({ length: INITIAL_HAND_COUNT }, (_, i) => ({
        id: i,
        cards: [],
        isHeld: false,
        isBust: false,
        blackjackValue: 0,
    }));

    // Deal initial player card to center hand
    const playerCard = deckRef.pop()!;
    playerCard.isFaceUp = true;
    playerCard.origin = 'deck';
    playerHands[1] = {
        ...playerHands[1],
        cards: [playerCard],
        blackjackValue: getBlackjackScore([playerCard], state.inventory as RelicInstance[]),
    };

    // Deal dealer cards (skip special cards like chip/mult/score)
    const burnedCards: Card[] = [];
    const drawForDealer = (): Card | undefined => {
        let c = deckRef.pop();
        while (c && (c.type === 'chip' || c.type === 'mult' || c.type === 'score')) {
            burnedCards.push(c);
            c = deckRef.pop();
        }
        return c;
    };
    const dealerCard1 = drawForDealer()!;
    const dealerCard2 = drawForDealer()!;
    dealerCard1.isFaceUp = false;
    dealerCard1.origin = 'deck';
    dealerCard2.isFaceUp = true;
    dealerCard2.origin = 'deck';

    const dealerCards: [Card, Card] = [dealerCard1, dealerCard2];

    const newDealsTaken = state.dealsTaken + (state.phase === 'entering_casino' ? 1 : 1);
    const dealsPerCasino = executeValueHook(
        'getDealsPerCasino',
        BASE_DEALS_PER_CASINO,
        { inventory: state.inventory as RelicInstance[] }
    );
    const newHandsRemaining = dealsPerCasino - newDealsTaken;

    events.push({
        type: 'cards_dealt',
        playerCard,
        playerHandIndex: 1,
        dealerCards,
    });
    events.push({ type: 'initial_deal_complete' });
    events.push({
        type: 'round_started',
        round: state.round,
        handsRemaining: newHandsRemaining,
    });

    const nextState: GameState = {
        ...state,
        phase: 'playing',
        deck: deckRef,
        discardPile: [...discardRef, ...burnedCards],
        playerHands,
        dealer: {
            cards: dealerCards,
            isRevealed: false,
            blackjackValue: getBlackjackScore([dealerCard2], state.inventory as RelicInstance[], true),
        },
        drawnCards: [],
        selectedDrawIndex: null,
        cardsPlacedThisTurn: 0,
        dealsTaken: newDealsTaken,
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

function processDraw(state: GameState): ActionResult {
    if (state.phase !== 'playing' || state.drawnCards.some(c => c !== null)) {
        return { nextState: state, events: [] };
    }

    const rng = new SeededRNG(state.rngState);
    const events: GameEvent[] = [];
    const inventory = state.inventory as RelicInstance[];

    // Calculate draw count
    let drawCount = 1 + state.modifiers.drawCountMod;
    drawCount = executeValueHook('getDrawCount', drawCount, { inventory });

    let deckRef = [...state.deck];
    let discardRef = [...state.discardPile];

    // Auto-reshuffle if needed
    if (deckRef.length < drawCount && discardRef.length > 0) {
        const combined = [...deckRef, ...discardRef];
        deckRef = rng.shuffle(combined);
        discardRef = [];
        events.push({ type: 'deck_reshuffled', deckSize: deckRef.length });
    }

    // Draw cards
    const drawnCards: Card[] = [];
    for (let i = 0; i < drawCount; i++) {
        const card = deckRef.pop();
        if (!card) break;
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
        deck: deckRef,
        discardPile: discardRef,
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
    const { playerHands, drawnCards, selectedDrawIndex, cardsPlacedThisTurn, modifiers, inventory, discardPile } = state;

    if (selectedDrawIndex === null || !drawnCards[selectedDrawIndex]) {
        return { nextState: state, events: [] };
    }

    let invArr = inventory as RelicInstance[];
    const events: GameEvent[] = [];
    const cardToPlace = drawnCards[selectedDrawIndex]!;

    // Place card into hand
    const targetHand = playerHands[handIndex];
    if (!targetHand || targetHand.isBust || targetHand.isHeld) {
        return { nextState: state, events: [] };
    }

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

    const anyPlayable = updatedHands.some(h => !h.isBust && !h.isHeld && h.blackjackValue !== 21);
    const hasRemainingCards = remainingDrawn.some(c => c !== null);
    const canPlaceMore = newPlacedCount < totalPlaceCount && hasRemainingCards && anyPlayable;

    let nextDrawIndex: number | null = null;
    let nextDiscardPile = [...discardPile];

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
        // Discard leftover drawn cards
        const leftovers = remainingDrawn.filter((c): c is Card => c !== null);
        if (leftovers.length > 0) {
            nextDiscardPile.push(...leftovers);
            events.push({ type: 'leftover_cards_discarded', cards: leftovers });
        }
    }

    events.push({
        type: 'placement_complete',
        canPlaceMore,
        nextDrawIndex,
    });

    // Auto-stand detection
    const allUnplayable = updatedHands.every(h => h.isBust || h.isHeld || h.blackjackValue === 21);
    if (!canPlaceMore && allUnplayable) {
        events.push({ type: 'auto_stand_triggered' });
    }

    const nextState: GameState = {
        ...state,
        playerHands: updatedHands,
        drawnCards: canPlaceMore ? remainingDrawn : [],
        selectedDrawIndex: canPlaceMore ? nextDrawIndex : null,
        cardsPlacedThisTurn: canPlaceMore ? newPlacedCount : 0,
        discardPile: nextDiscardPile,
        modifiers: canPlaceMore ? state.modifiers : { ...modifiers, placeCountMod: 0 },
        inventory: invArr,
    };

    return { nextState, events };
}

function processStand(state: GameState): ActionResult {
    if (state.phase !== 'playing') {
        return { nextState: state, events: [] };
    }

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
    const deckRef = [...state.deck];
    const baseStopValue = 17;
    const dealerStopValue = executeValueHook('getDealerStopValue', baseStopValue, { inventory: invArr });
    const burnedCards: Card[] = [];

    while (dVal < dealerStopValue) {
        // Skip non-standard cards in deck
        let c = deckRef.pop();
        while (c && (c.type === 'chip' || c.type === 'mult' || c.type === 'score')) {
            burnedCards.push(c);
            c = deckRef.pop();
        }
        if (!c) break;

        c.isFaceUp = true;
        c.origin = 'deck';
        dCards.push(c);
        dVal = getBlackjackScore(dCards, invArr, true);

        events.push({ type: 'dealer_hit', card: c, newValue: dVal, burnedCards: [...burnedCards] });
    }

    if (dVal > 21) {
        events.push({ type: 'dealer_bust', value: dVal });
    } else {
        events.push({ type: 'dealer_stand', value: dVal });
    }

    // 3. Evaluate each player hand
    const scoredHands = state.playerHands.map((h, i) => {
        let outcome: 'win' | 'loss' | 'bust' = 'loss';

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

        return { ...h, outcome };
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

    // 4. Scoring pipeline
    let runningSummary = { chips: 0, mult: 0 };
    let currentInv = invArr;

    const finalHands = scoredHands.map((hand, i) => {
        if (hand.outcome !== 'win' || hand.cards.length === 0) {
            return { ...hand, finalScore: null, resultRevealed: true };
        }

        // Evaluate hand score through relic hooks
        const score = evaluateHandScore(
            hand.cards,
            true,
            hand.isDoubled ?? false,
            invArr,
            state.handsRemaining
        );

        events.push({ type: 'scoring_hand_focus', handIndex: i });

        // Emit scoring rows + onScoreRow relic hooks
        for (const criterion of score.criteria) {
            events.push({ type: 'scoring_row', handIndex: i, criterion });

            // Execute onScoreRow interrupt hooks (produces relic_activated events)
            const scoreRowResult = executeOnScoreRow(
                currentInv,
                criterion.id,
                score,
                runningSummary,
            );
            events.push(...scoreRowResult.events);
            runningSummary = scoreRowResult.runningSummary ?? runningSummary;
            currentInv = scoreRowResult.inventory;
        }

        // Update running summary with this hand's score
        runningSummary = {
            chips: runningSummary.chips + score.totalChips,
            mult: runningSummary.mult + score.totalMultiplier,
        };

        events.push({ type: 'summary_update', ...runningSummary });

        // Execute onHandCompletion interrupt hooks (e.g., royalty face cards bonus)
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

    // 5. Execute onRoundCompletion interrupt hooks
    const wins = scoredHands.filter(h => h.outcome === 'win').length;
    const losses = scoredHands.filter(h => h.outcome === 'loss').length;
    const vigintis = scoredHands.filter(h => h.outcome === 'win' && h.blackjackValue === 21).length;

    const roundCompResult = executeOnRoundCompletion(
        currentInv,
        wins,
        losses,
        vigintis,
        runningSummary,
        finalHands,
    );
    events.push(...roundCompResult.events);
    runningSummary = roundCompResult.runningSummary ?? runningSummary;
    currentInv = roundCompResult.inventory;

    // Remove any relics flagged for removal (e.g., faded_tag)
    if (roundCompResult.relicsToRemove && roundCompResult.relicsToRemove.length > 0) {
        currentInv = currentInv.filter(r => !roundCompResult.relicsToRemove!.includes(r.id));
    }

    // 6. Round scoring complete
    const finalScore = Math.floor(runningSummary.chips * runningSummary.mult);
    events.push({
        type: 'round_scoring_complete',
        totalChips: runningSummary.chips,
        totalMult: runningSummary.mult,
        finalScore,
    });

    // 7. Update total score
    const newTotalScore = state.totalScore + finalScore;
    events.push({ type: 'chip_collection', amount: finalScore, newTotalScore });

    // 7. Determine next phase
    const hasReachedTarget = newTotalScore >= state.targetScore;
    const newHandsRemaining = state.handsRemaining;
    let nextPhase: GameState['phase'] = 'round_over';

    if (!hasReachedTarget && newHandsRemaining <= 0) {
        nextPhase = 'round_over';
    }

    if (hasReachedTarget) {
        events.push({ type: 'target_reached', totalScore: newTotalScore, targetScore: state.targetScore });
    }

    events.push({ type: 'phase_changed', from: 'playing', to: nextPhase });

    const nextState: GameState = {
        ...state,
        phase: nextPhase,
        deck: deckRef,
        discardPile: [...state.discardPile, ...burnedCards],
        dealer: { cards: dCards, isRevealed: true, blackjackValue: dVal },
        playerHands: finalHands,
        totalScore: newTotalScore,
        runningSummary,
        tableActionCharges: newCharges,
        inventory: currentInv,
        rngState: rng.getState(),
    };

    return { nextState, events };
}

function processNextRound(state: GameState, forceContinue?: boolean): ActionResult {
    const events: GameEvent[] = [];

    const hasReachedTarget = state.totalScore >= state.targetScore;

    // Game over — no hands left and haven't reached target
    if (!hasReachedTarget && state.handsRemaining <= 0 && !forceContinue) {
        events.push({ type: 'game_over', won: false, finalScore: state.totalScore });
        events.push({ type: 'phase_changed', from: state.phase, to: 'game_over' });
        return {
            nextState: { ...state, phase: 'game_over' },
            events,
        };
    }

    // Casino cleared — go to gift shop
    if (hasReachedTarget && !forceContinue) {
        // Calculate reward summary
        const invArr = state.inventory as RelicInstance[];
        const hasDoubleDown = invArr.some(r => r.id === 'double_down');
        const dealsBonus = state.handsRemaining * 2;
        const doubleDownBonus = hasDoubleDown ? ((state.tableActionCharges['double_down'] ?? 0) * 1) : 0;
        const hasSurrender = invArr.some(r => r.id === 'surrender');
        const surrenderBonus = hasSurrender ? ((state.tableActionCharges['surrender'] ?? 0) * 1) : 0;
        const interestedBonus = Math.min(5, Math.floor(state.comps / 5));
        const winBonus = 2;

        const rewardSummary = {
            dealsBonus,
            doubleDownBonus,
            surrenderBonus,
            interestedBonus,
            winBonus,
            total: dealsBonus + doubleDownBonus + surrenderBonus + interestedBonus + winBonus,
        };

        events.push({ type: 'casino_cleared', round: state.round, score: state.totalScore });
        events.push({ type: 'phase_changed', from: state.phase, to: 'casino_win' });

        return {
            nextState: {
                ...state,
                phase: 'casino_win',
                shopRewardSummary: rewardSummary,
            },
            events,
        };
    }

    // Continue playing — deal next hand in same casino
    return processDeal(state);
}

function processCompleteRoundEarly(state: GameState): ActionResult {
    const events: GameEvent[] = [];
    const bonusComps = state.handsRemaining * 5;

    events.push({ type: 'comps_earned', amount: bonusComps, newTotal: state.comps + bonusComps, reason: 'early_completion' });

    const updatedState = {
        ...state,
        comps: state.comps + bonusComps,
    };

    // Delegate to nextRound
    return processNextRound(updatedState);
}
