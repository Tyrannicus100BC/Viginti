/**
 * Pure table action processing functions.
 * Handles: double_down, surrender, discard, redraw, hold, switch
 * 
 * Each table action is a relic-based action with:
 * - Charges (cost to use, recharge conditions)
 * - Activation (enter targeting mode)  
 * - Resolution (apply effect on target selection)
 */

import type { Card, PlayerHand, DealerHand } from '../../types';
import type { RelicInstance } from '../../logic/relics/types';
import type { GameState, InteractionMode } from '../GameState';
import type { GameEvent } from '../GameEvent';
import type { ActionResult } from '../engine';
import { RelicManager } from '../../logic/relics/manager';
import { getBlackjackScore } from '../../logic/scoring';

// ─── Helpers ────────────────────────────────────────────

function getTableActionConfig(relicId: string) {
    const config = RelicManager.getRelicConfig(relicId);
    return config?.tableAction;
}

function chargeTableActions(
    invArr: readonly RelicInstance[],
    charges: Record<string, number>,
    event: 'bust' | 'loss',
    events: GameEvent[]
): Record<string, number> {
    const newCharges = { ...charges };
    for (const instance of invArr) {
        const config = RelicManager.getRelicConfig(instance.id);
        if (!config?.tableAction) continue;
        const recharge = config.tableAction.recharge;
        const shouldGain = recharge === 'bust_or_loss' || recharge === event;
        if (!shouldGain) continue;
        const current = newCharges[instance.id] ?? 0;
        newCharges[instance.id] = Math.min(config.tableAction.maxCharges, current + 1);
        events.push({
            type: 'charge_gained',
            relicId: instance.id,
            newCharges: newCharges[instance.id],
            reason: event,
        });
    }
    return newCharges;
}

function getDealerDisplayValue(dealer: DealerHand, inventory: readonly RelicInstance[]): number {
    const visibleCards = dealer.isRevealed ? dealer.cards : dealer.cards.filter(c => c.isFaceUp);
    return getBlackjackScore(visibleCards, inventory as RelicInstance[]);
}

function checkAutoStand(hands: readonly PlayerHand[], drawnCards: readonly (Card | null)[]): boolean {
    const allUnplayable = hands.every(h => h.isBust || h.isHeld || h.blackjackValue === 21);
    const hasRemainingCards = drawnCards.some(c => c !== null);
    return allUnplayable && !hasRemainingCards;
}

// ─── Activate Table Action ──────────────────────────────

export function processActivateTableAction(state: GameState, relicId: string): ActionResult {
    if (state.phase !== 'playing') return { nextState: state, events: [] };
    if (state.interactionMode !== 'default') return { nextState: state, events: [] };

    const action = getTableActionConfig(relicId);
    if (!action) return { nextState: state, events: [] };

    const charges = state.tableActionCharges[relicId] ?? 0;
    const hasDrawnCards = state.drawnCards.some(c => c !== null);
    const hasHeldCard = !!state.tableActionHeldCards[relicId];
    const invArr = state.inventory;

    let nextMode: InteractionMode | null = null;

    switch (relicId) {
        case 'double_down':
        case 'surrender': {
            const hasPlayableHand = state.playerHands.some(
                h => !h.isBust && !h.isHeld && h.blackjackValue !== 21 && h.cards.length > 0
            );
            if (!hasPlayableHand || hasDrawnCards || charges < action.chargeCost) return { nextState: state, events: [] };
            nextMode = 'select_hand';
            break;
        }
        case 'discard': {
            if (charges < action.chargeCost) return { nextState: state, events: [] };
            nextMode = 'select_card';
            break;
        }
        case 'redraw': {
            if (charges < action.chargeCost || !hasDrawnCards) return { nextState: state, events: [] };
            nextMode = 'select_draw';
            break;
        }
        case 'hold': {
            if (hasHeldCard) {
                nextMode = 'select_hand';
            } else {
                if (charges < action.chargeCost || !hasDrawnCards) return { nextState: state, events: [] };
                nextMode = 'select_draw';
            }
            break;
        }
        case 'switch': {
            if (charges < action.chargeCost) return { nextState: state, events: [] };
            const hasDealerFaceUp = state.dealer.cards.some(c => c.isFaceUp);
            const hasPlayerCard = state.playerHands.some(h => !h.isBust && h.blackjackValue !== 21 && h.cards.length > 0);
            if (!hasDealerFaceUp || !hasPlayerCard) return { nextState: state, events: [] };
            nextMode = 'select_card';
            break;
        }
        default:
            return { nextState: state, events: [] };
    }

    if (!nextMode) return { nextState: state, events: [] };

    const prompt = action.prompt || `Select target for ${relicId}`;
    return {
        nextState: { ...state, activeTableActionId: relicId, interactionMode: nextMode },
        events: [{ type: 'table_action_activated', relicId, prompt }],
    };
}

// ─── Cancel Table Action ────────────────────────────────

export function processCancelTableAction(state: GameState): ActionResult {
    if (!state.activeTableActionId) return { nextState: state, events: [] };
    const relicId = state.activeTableActionId;
    return {
        nextState: { ...state, activeTableActionId: null, interactionMode: 'default' },
        events: [{ type: 'table_action_cancelled', relicId }],
    };
}

// ─── Select Table Action Hand ───────────────────────────

export function processSelectTableActionHand(state: GameState, handIndex: number): ActionResult {
    if (state.interactionMode !== 'select_hand' || !state.activeTableActionId) {
        return { nextState: state, events: [] };
    }

    const relicId = state.activeTableActionId;
    const action = getTableActionConfig(relicId);
    if (!action) return { nextState: state, events: [] };

    if (relicId === 'double_down') return processDoubleDown(state, handIndex);
    if (relicId === 'surrender') return processSurrender(state, handIndex);
    if (relicId === 'hold') return processHoldPlace(state, handIndex);

    return { nextState: state, events: [] };
}

// ─── Select Table Action Card ───────────────────────────

export function processSelectTableActionCard(
    state: GameState,
    target: 'player' | 'dealer',
    handIndex: number | undefined,
    cardId: string
): ActionResult {
    if (state.interactionMode !== 'select_card' || !state.activeTableActionId) {
        return { nextState: state, events: [] };
    }

    const relicId = state.activeTableActionId;
    if (relicId === 'discard') return processDiscard(state, target, handIndex, cardId);
    if (relicId === 'switch') return processSwitch(state, handIndex, cardId);

    return { nextState: state, events: [] };
}

// ─── Select Table Action Draw Card ──────────────────────

export function processSelectTableActionDrawCard(state: GameState, drawIndex: number): ActionResult {
    if (state.interactionMode !== 'select_draw' || !state.activeTableActionId) {
        return { nextState: state, events: [] };
    }

    const relicId = state.activeTableActionId;
    if (relicId === 'redraw') return processRedraw(state, drawIndex);
    if (relicId === 'hold') return processHoldPick(state, drawIndex);

    return { nextState: state, events: [] };
}

// ─── Double Down ────────────────────────────────────────

function processDoubleDown(state: GameState, handIndex: number): ActionResult {
    const relicId = 'double_down';
    const action = getTableActionConfig(relicId)!;
    const charges = state.tableActionCharges[relicId] ?? 0;
    if (charges < action.chargeCost) return { nextState: state, events: [] };

    const hand = state.playerHands[handIndex];
    if (!hand || hand.isBust || hand.isHeld || hand.blackjackValue === 21 || hand.cards.length === 0) {
        return { nextState: state, events: [] };
    }

    const deckRef = [...state.deck];
    const card = deckRef.pop();
    if (!card) return { nextState: state, events: [] };

    card.isFaceUp = true;
    card.origin = 'double_down';

    const invArr = state.inventory as RelicInstance[];
    const isSpecial = card.type === 'chip' || card.type === 'mult' || card.type === 'score';
    const newCards = isSpecial ? [card, ...hand.cards] : [...hand.cards, card];
    const newVal = getBlackjackScore(newCards, invArr);
    const isBust = newVal > 21;

    const updatedHands = state.playerHands.map((h, idx) => {
        if (idx !== handIndex) return h;
        return { ...h, cards: newCards, blackjackValue: newVal, isBust, isHeld: true, isDoubled: true };
    });

    const newCharges = {
        ...state.tableActionCharges,
        [relicId]: Math.max(0, charges - action.chargeCost),
    };

    const events: GameEvent[] = [];
    events.push({ type: 'charge_spent', relicId, newCharges: newCharges[relicId] });
    events.push({
        type: 'table_action_resolved',
        relicId,
        description: `Double down on hand ${handIndex}: drew ${card.rank} of ${card.suit}`,
    });
    events.push({
        type: 'card_placed',
        card,
        handIndex,
        newBlackjackValue: newVal,
    });

    let finalCharges = newCharges;
    if (isBust) {
        events.push({ type: 'hand_bust', handIndex, blackjackValue: newVal });
        finalCharges = chargeTableActions(invArr, newCharges, 'bust', events);
        // NOTE: onHandBust relic hooks will be added in Phase 3
    }

    const nextState: GameState = {
        ...state,
        deck: deckRef,
        playerHands: updatedHands,
        tableActionCharges: finalCharges,
        interactionMode: 'default',
        activeTableActionId: null,
    };

    // Auto-stand check
    if (checkAutoStand(updatedHands, state.drawnCards)) {
        events.push({ type: 'auto_stand_triggered' });
    }

    return { nextState, events };
}

// ─── Surrender ──────────────────────────────────────────

function processSurrender(state: GameState, handIndex: number): ActionResult {
    const relicId = 'surrender';
    const action = getTableActionConfig(relicId)!;
    const charges = state.tableActionCharges[relicId] ?? 0;
    if (charges < action.chargeCost) return { nextState: state, events: [] };

    const hand = state.playerHands[handIndex];
    if (!hand || hand.isBust || hand.cards.length === 0) return { nextState: state, events: [] };

    const cardsToDiscard = [...hand.cards];
    const updatedHands = state.playerHands.map((h, idx) => {
        if (idx !== handIndex) return h;
        return {
            ...h,
            cards: [],
            blackjackValue: 0,
            isBust: false,
            isHeld: true,
            isDoubled: false,
            finalScore: null,
            resultRevealed: false,
        };
    });

    const events: GameEvent[] = [];
    events.push({ type: 'charge_spent', relicId, newCharges: Math.max(0, charges - action.chargeCost) });
    events.push({
        type: 'table_action_resolved',
        relicId,
        description: `Surrendered hand ${handIndex}`,
    });
    for (const c of cardsToDiscard) {
        events.push({ type: 'card_discarded_to_pile', card: c });
    }

    const nextState: GameState = {
        ...state,
        playerHands: updatedHands,
        discardPile: [...state.discardPile, ...cardsToDiscard],
        tableActionCharges: {
            ...state.tableActionCharges,
            [relicId]: Math.max(0, charges - action.chargeCost),
        },
        interactionMode: 'default',
        activeTableActionId: null,
    };

    if (checkAutoStand(updatedHands, state.drawnCards)) {
        events.push({ type: 'auto_stand_triggered' });
    }

    return { nextState, events };
}

// ─── Discard ────────────────────────────────────────────

function processDiscard(
    state: GameState,
    target: 'player' | 'dealer',
    handIndex: number | undefined,
    cardId: string
): ActionResult {
    const relicId = 'discard';
    const action = getTableActionConfig(relicId)!;
    const charges = state.tableActionCharges[relicId] ?? 0;
    if (charges < action.chargeCost) return { nextState: state, events: [] };

    const invArr = state.inventory as RelicInstance[];
    const events: GameEvent[] = [];

    if (target === 'player') {
        if (handIndex === undefined) return { nextState: state, events: [] };
        const hand = state.playerHands[handIndex];
        if (!hand || hand.isBust || hand.blackjackValue === 21 || hand.cards.length === 0) {
            return { nextState: state, events: [] };
        }

        const cardIndex = hand.cards.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return { nextState: state, events: [] };

        const removedCard = hand.cards[cardIndex];
        const nextCards = hand.cards.filter((_, idx) => idx !== cardIndex);
        const nextVal = nextCards.length > 0 ? getBlackjackScore(nextCards, invArr) : 0;
        const isBust = nextVal > 21;

        const updatedHands = state.playerHands.map((h, idx) => {
            if (idx !== handIndex) return h;
            return { ...h, cards: nextCards, blackjackValue: nextVal, isBust };
        });

        events.push({ type: 'charge_spent', relicId, newCharges: Math.max(0, charges - action.chargeCost) });
        events.push({ type: 'table_action_resolved', relicId, description: `Discarded ${removedCard.rank} of ${removedCard.suit} from hand ${handIndex}` });
        events.push({ type: 'card_discarded_to_pile', card: removedCard });

        let finalCharges: Record<string, number> = {
            ...state.tableActionCharges,
            [relicId]: Math.max(0, charges - action.chargeCost),
        };

        if (isBust && !hand.isBust) {
            events.push({ type: 'hand_bust', handIndex, blackjackValue: nextVal });
            finalCharges = chargeTableActions(invArr, finalCharges, 'bust', events);
        }

        return {
            nextState: {
                ...state,
                playerHands: updatedHands,
                discardPile: [...state.discardPile, removedCard],
                tableActionCharges: finalCharges,
                interactionMode: 'default',
                activeTableActionId: null,
            },
            events,
        };
    }

    // Discard dealer card
    const { dealer } = state;
    const cardIndex = dealer.cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { nextState: state, events: [] };

    const targetCard = dealer.cards[cardIndex];
    if (!dealer.isRevealed && !targetCard.isFaceUp) return { nextState: state, events: [] };
    if (dealer.blackjackValue >= 21) return { nextState: state, events: [] };

    const nextDealerCards = dealer.cards.filter((_, idx) => idx !== cardIndex);
    const nextDealer: DealerHand = {
        ...dealer,
        cards: nextDealerCards,
        blackjackValue: getDealerDisplayValue({ ...dealer, cards: nextDealerCards }, invArr),
    };

    events.push({ type: 'charge_spent', relicId, newCharges: Math.max(0, charges - action.chargeCost) });
    events.push({ type: 'table_action_resolved', relicId, description: `Discarded dealer's ${targetCard.rank} of ${targetCard.suit}` });
    events.push({ type: 'card_discarded_to_pile', card: targetCard });

    return {
        nextState: {
            ...state,
            dealer: nextDealer,
            discardPile: [...state.discardPile, targetCard],
            tableActionCharges: {
                ...state.tableActionCharges,
                [relicId]: Math.max(0, charges - action.chargeCost),
            },
            interactionMode: 'default',
            activeTableActionId: null,
        },
        events,
    };
}

// ─── Redraw ─────────────────────────────────────────────

function processRedraw(state: GameState, drawIndex: number): ActionResult {
    const relicId = 'redraw';
    const action = getTableActionConfig(relicId)!;
    const charges = state.tableActionCharges[relicId] ?? 0;
    if (charges < action.chargeCost) return { nextState: state, events: [] };

    const targetCard = state.drawnCards[drawIndex];
    if (!targetCard) return { nextState: state, events: [] };

    const deckRef = [...state.deck];
    const newCard = deckRef.pop() || null;
    if (newCard) {
        newCard.isFaceUp = true;
        newCard.origin = 'deck';
    }

    const nextDrawn = [...state.drawnCards];
    nextDrawn[drawIndex] = newCard;

    const events: GameEvent[] = [];
    events.push({ type: 'charge_spent', relicId, newCharges: Math.max(0, charges - action.chargeCost) });
    events.push({ type: 'table_action_resolved', relicId, description: `Redrew ${targetCard.rank} of ${targetCard.suit}` });
    events.push({ type: 'card_discarded_to_pile', card: targetCard });
    if (newCard) {
        events.push({ type: 'card_drawn', card: newCard, drawIndex });
    }

    return {
        nextState: {
            ...state,
            deck: deckRef,
            drawnCards: nextDrawn,
            discardPile: [...state.discardPile, targetCard],
            redrawDiscard: { card: targetCard, index: drawIndex },
            tableActionCharges: {
                ...state.tableActionCharges,
                [relicId]: Math.max(0, charges - action.chargeCost),
            },
            interactionMode: 'default',
            activeTableActionId: null,
        },
        events,
    };
}

// ─── Hold (Pick Phase — select drawn card to hold) ──────

function processHoldPick(state: GameState, drawIndex: number): ActionResult {
    const relicId = 'hold';
    const action = getTableActionConfig(relicId)!;
    const charges = state.tableActionCharges[relicId] ?? 0;
    if (charges < action.chargeCost) return { nextState: state, events: [] };

    const targetCard = state.drawnCards[drawIndex];
    if (!targetCard) return { nextState: state, events: [] };

    const deckRef = [...state.deck];
    const newCard = deckRef.pop() || null;
    if (newCard) {
        newCard.isFaceUp = true;
        newCard.origin = 'deck';
    }

    const nextDrawn = [...state.drawnCards];
    nextDrawn[drawIndex] = newCard;

    const events: GameEvent[] = [];
    events.push({ type: 'charge_spent', relicId, newCharges: Math.max(0, charges - action.chargeCost) });
    events.push({
        type: 'table_action_resolved',
        relicId,
        description: `Held ${targetCard.rank} of ${targetCard.suit}`,
    });

    return {
        nextState: {
            ...state,
            deck: deckRef,
            drawnCards: nextDrawn,
            tableActionHeldCards: { ...state.tableActionHeldCards, [relicId]: targetCard },
            tableActionCharges: {
                ...state.tableActionCharges,
                [relicId]: Math.max(0, charges - action.chargeCost),
            },
            interactionMode: 'default',
            activeTableActionId: null,
        },
        events,
    };
}

// ─── Hold (Place Phase — place held card into hand) ─────

function processHoldPlace(state: GameState, handIndex: number): ActionResult {
    const relicId = 'hold';
    const heldCard = state.tableActionHeldCards[relicId];
    if (!heldCard) return { nextState: state, events: [] };

    const hand = state.playerHands[handIndex];
    if (!hand || hand.isBust || hand.isHeld || hand.blackjackValue === 21) {
        return { nextState: state, events: [] };
    }

    const invArr = state.inventory as RelicInstance[];
    const cardToPlace: Card = { ...heldCard, origin: 'draw_pile', animationOffset: 0 };
    const isSpecial = cardToPlace.type === 'chip' || cardToPlace.type === 'mult' || cardToPlace.type === 'score';
    const newCards = isSpecial ? [cardToPlace, ...hand.cards] : [...hand.cards, cardToPlace];
    const newVal = getBlackjackScore(newCards, invArr);
    const isBust = newVal > 21;

    const updatedHands = state.playerHands.map((h, idx) => {
        if (idx !== handIndex) return h;
        return { ...h, cards: newCards, blackjackValue: newVal, isBust };
    });

    const events: GameEvent[] = [];
    events.push({
        type: 'table_action_resolved',
        relicId,
        description: `Placed held ${heldCard.rank} of ${heldCard.suit} into hand ${handIndex}`,
    });
    events.push({ type: 'card_placed', card: cardToPlace, handIndex, newBlackjackValue: newVal });

    let finalCharges = { ...state.tableActionCharges };
    if (isBust && !hand.isBust) {
        events.push({ type: 'hand_bust', handIndex, blackjackValue: newVal });
        finalCharges = chargeTableActions(invArr, finalCharges, 'bust', events);
    }

    const nextState: GameState = {
        ...state,
        playerHands: updatedHands,
        tableActionHeldCards: { ...state.tableActionHeldCards, [relicId]: null },
        tableActionCharges: finalCharges,
        interactionMode: 'default',
        activeTableActionId: null,
    };

    if (checkAutoStand(updatedHands, state.drawnCards)) {
        events.push({ type: 'auto_stand_triggered' });
    }

    return { nextState, events };
}

// ─── Switch ─────────────────────────────────────────────

function processSwitch(state: GameState, handIndex: number | undefined, cardId: string): ActionResult {
    const relicId = 'switch';
    const action = getTableActionConfig(relicId)!;
    const charges = state.tableActionCharges[relicId] ?? 0;
    if (charges < action.chargeCost) return { nextState: state, events: [] };
    if (handIndex === undefined) return { nextState: state, events: [] };

    const invArr = state.inventory as RelicInstance[];
    const hand = state.playerHands[handIndex];
    if (!hand || hand.isBust || hand.blackjackValue === 21 || hand.cards.length === 0) {
        return { nextState: state, events: [] };
    }

    const playerCardIndex = hand.cards.findIndex(c => c.id === cardId);
    if (playerCardIndex === -1) return { nextState: state, events: [] };

    const dealerCardIndex = state.dealer.cards.findIndex(c => c.isFaceUp);
    if (dealerCardIndex === -1) return { nextState: state, events: [] };

    const playerCard = hand.cards[playerCardIndex];
    const dealerCard = state.dealer.cards[dealerCardIndex];

    const newHandCards = [...hand.cards];
    newHandCards[playerCardIndex] = { ...dealerCard, isFaceUp: true };
    const newDealerCards = [...state.dealer.cards];
    newDealerCards[dealerCardIndex] = { ...playerCard, isFaceUp: true };

    const newHandValue = getBlackjackScore(newHandCards, invArr);
    const isBust = newHandValue > 21;

    const updatedHands = state.playerHands.map((h, idx) => {
        if (idx !== handIndex) return h;
        return { ...h, cards: newHandCards, blackjackValue: newHandValue, isBust };
    });

    const updatedDealer: DealerHand = {
        ...state.dealer,
        cards: newDealerCards,
        blackjackValue: getDealerDisplayValue({ ...state.dealer, cards: newDealerCards }, invArr),
    };

    const events: GameEvent[] = [];
    events.push({ type: 'charge_spent', relicId, newCharges: Math.max(0, charges - action.chargeCost) });
    events.push({
        type: 'table_action_resolved',
        relicId,
        description: `Switched ${playerCard.rank}↔${dealerCard.rank}`,
    });

    let finalCharges: Record<string, number> = {
        ...state.tableActionCharges,
        [relicId]: Math.max(0, charges - action.chargeCost),
    };

    if (isBust && !hand.isBust) {
        events.push({ type: 'hand_bust', handIndex, blackjackValue: newHandValue });
        finalCharges = chargeTableActions(invArr, finalCharges, 'bust', events);
    }

    const nextState: GameState = {
        ...state,
        playerHands: updatedHands,
        dealer: updatedDealer,
        tableActionCharges: finalCharges,
        interactionMode: 'default',
        activeTableActionId: null,
    };

    if (checkAutoStand(updatedHands, state.drawnCards)) {
        events.push({ type: 'auto_stand_triggered' });
    }

    return { nextState, events };
}
