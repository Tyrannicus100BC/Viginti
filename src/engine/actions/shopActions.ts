/**
 * Pure shop action processing functions.
 * Handles: enter_gift_shop, buy_shop_item, restock_shop, sell_relic,
 *          leave_shop, enhance_card, destroy_card
 */

import type { Card, PlayerHand } from '../../types';
import type { RelicInstance } from '../../logic/relics/types';
import type { GameState, ShopItem, INITIAL_HAND_COUNT, BASE_DEALS_PER_CASINO } from '../GameState';
import type { GameEvent } from '../GameEvent';
import type { ActionResult } from '../engine';
import { RelicManager } from '../../logic/relics/manager';
import { generateShopItems, getRelicCompCost } from '../../logic/rewards/generator';
import { CITY_DEFINITIONS } from '../../logic/cities/definitions';
import { SeededRNG } from '../rng';
import { executeValueHook } from '../relicEngine';

// ─── Helpers ────────────────────────────────────────────

function getTableActionConfig(relicId: string) {
    const config = RelicManager.getRelicConfig(relicId);
    return config?.tableAction;
}

function buildTableActionCharges(
    inventory: readonly RelicInstance[],
    existingCharges: Readonly<Record<string, number>> = {},
    options?: { resetPerCasino?: boolean }
): Record<string, number> {
    const charges: Record<string, number> = {};
    inventory.forEach(instance => {
        const action = getTableActionConfig(instance.id);
        if (!action) return;
        const current = existingCharges[instance.id];
        let next = current ?? (action.recharge === 'casino' ? action.maxCharges : 0);
        if (options?.resetPerCasino && action.recharge === 'casino') {
            next = action.maxCharges;
        }
        charges[instance.id] = Math.max(0, Math.min(action.maxCharges, next));
    });
    return charges;
}

function buildTableActionHeldCards(
    inventory: readonly RelicInstance[],
    existingHeld: Readonly<Record<string, Card | null>> = {},
    options?: { resetPerCasino?: boolean }
): Record<string, Card | null> {
    const held: Record<string, Card | null> = {};
    inventory.forEach(instance => {
        const action = getTableActionConfig(instance.id);
        if (!action) return;
        held[instance.id] = options?.resetPerCasino ? null : (existingHeld[instance.id] ?? null);
    });
    return held;
}

function getMaxCharms(inventory: readonly RelicInstance[]): number {
    return executeValueHook('getMaxCharms', 5, { inventory, dryRun: true });
}

function getMaxAngles(inventory: readonly RelicInstance[]): number {
    return executeValueHook('getMaxAngles', 5, { inventory, dryRun: true });
}

// ─── Sell Price Table ───────────────────────────────────

const SELL_PRICES: Record<string, number> = {
    Common: 2,
    Uncommon: 4,
    Rare: 6,
};

function getRelicSellPrice(relicId: string): number {
    const config = RelicManager.getRelicConfig(relicId);
    if (!config) return 2;
    return SELL_PRICES[config.rarity] ?? 2;
}

// ─── Enter Gift Shop ───────────────────────────────────

export function processEnterGiftShop(state: GameState): ActionResult {
    if (state.phase !== 'casino_win') return { nextState: state, events: [] };

    const { inventory, tableActionCharges, handsRemaining, comps, selectedCityId, round, rngState } = state;

    // Calculate Rewards
    const dealsBonus = handsRemaining * 2;
    const hasDoubleDownRelic = inventory.some(r => r.id === 'double_down');
    const doubleDownBonus = hasDoubleDownRelic ? ((tableActionCharges['double_down'] ?? 0) * 1) : 0;
    const hasSurrenderRelic = inventory.some(r => r.id === 'surrender');
    const surrenderBonus = hasSurrenderRelic ? ((tableActionCharges['surrender'] ?? 0) * 1) : 0;
    const interestedBonus = Math.min(5, Math.floor(comps / 5));
    const winBonus = 2;
    const totalBonus = dealsBonus + doubleDownBonus + surrenderBonus + interestedBonus + winBonus;

    // Generate shop items via seeded RNG
    const city = CITY_DEFINITIONS.find(c => c.id === selectedCityId) || CITY_DEFINITIONS[0];
    const casinoIndex = round - 1;
    const rewardConfig = city.getRewards(casinoIndex);
    const shopPriceOverrides = city.getShopPriceOverrides?.(casinoIndex);

    const rng = new SeededRNG(rngState);
    const shopItems = generateShopItems(rewardConfig, inventory as RelicInstance[], shopPriceOverrides, rng);

    const rewardSummary = { dealsBonus, doubleDownBonus, surrenderBonus, interestedBonus, winBonus, total: totalBonus };

    const events: GameEvent[] = [];
    events.push({ type: 'shop_entered', items: shopItems, rewardSummary });
    events.push({ type: 'comps_earned', amount: totalBonus, newTotal: comps + totalBonus, reason: 'casino_rewards' });

    const nextState: GameState = {
        ...state,
        phase: 'gift_shop',
        shopItems,
        shopRewardSummary: rewardSummary,
        comps: comps + totalBonus,
        giftShopRestockCost: 3,
        removalCount: 0,
        rngState: rng.getState(),
    };

    return { nextState, events };
}

// ─── Buy Shop Item ──────────────────────────────────────

export function processBuyShopItem(state: GameState, itemId: string): ActionResult {
    if (state.phase !== 'gift_shop') return { nextState: state, events: [] };

    const { comps, inventory, shopItems } = state;
    const item = shopItems.find(i => i.id === itemId);
    if (!item || item.purchased) return { nextState: state, events: [] };

    const fallbackCost = getRelicCompCost(item.id);
    const cost = item.cost ?? fallbackCost;

    if (comps < cost) return { nextState: state, events: [] };

    // Check slots
    const baseRelic = RelicManager.getRelicConfig(item.id);
    if (!baseRelic) return { nextState: state, events: [] };

    const isCharm = baseRelic.categories.includes('Charm');
    const isAngle = baseRelic.categories.includes('Angle');

    if (isCharm) {
        const currentCharms = inventory.filter(inst => {
            const config = RelicManager.getRelicConfig(inst.id);
            return config?.categories.includes('Charm');
        }).length;
        if (currentCharms >= getMaxCharms(inventory)) {
            return { nextState: state, events: [] };
        }
    }

    if (isAngle) {
        const currentAngles = inventory.filter(inst => {
            const config = RelicManager.getRelicConfig(inst.id);
            return config?.categories.includes('Angle');
        }).length;
        if (currentAngles >= getMaxAngles(inventory)) {
            return { nextState: state, events: [] };
        }
    }

    // Create relic instance
    const newInstance: RelicInstance = {
        id: item.id,
        state: { ...(baseRelic.properties || {}) }
    };

    const newInventory = [...inventory, newInstance];
    const newComps = comps - cost;

    // Recalculate deals
    const dealsPerCasino = executeValueHook('getDealsPerCasino', 3, { inventory: newInventory });

    const events: GameEvent[] = [];
    events.push({ type: 'item_purchased', itemId, relic: newInstance, newComps });

    const nextState: GameState = {
        ...state,
        comps: newComps,
        inventory: newInventory,
        handsRemaining: dealsPerCasino - state.dealsTaken,
        shopItems: shopItems.map(i => i.id === itemId ? { ...i, purchased: true } : i),
        tableActionCharges: buildTableActionCharges(newInventory, state.tableActionCharges),
        tableActionHeldCards: buildTableActionHeldCards(newInventory, state.tableActionHeldCards),
    };

    return { nextState, events };
}

// ─── Restock Shop ───────────────────────────────────────

export function processRestockShop(state: GameState): ActionResult {
    if (state.phase !== 'gift_shop') return { nextState: state, events: [] };

    const { comps, giftShopRestockCost, inventory, selectedCityId, round, rngState } = state;
    if (comps < giftShopRestockCost) return { nextState: state, events: [] };

    const city = CITY_DEFINITIONS.find(c => c.id === selectedCityId) || CITY_DEFINITIONS[0];
    const casinoIndex = round - 1;
    const rewardConfig = city.getRewards(casinoIndex);
    const shopPriceOverrides = city.getShopPriceOverrides?.(casinoIndex);

    const rng = new SeededRNG(rngState);
    const newItems = generateShopItems(rewardConfig, inventory as RelicInstance[], shopPriceOverrides, rng);
    const newComps = comps - giftShopRestockCost;

    const events: GameEvent[] = [];
    events.push({ type: 'shop_restocked', newItems, cost: giftShopRestockCost, newComps });

    const nextState: GameState = {
        ...state,
        comps: newComps,
        shopItems: newItems,
        giftShopRestockCost: giftShopRestockCost + 3,
        rngState: rng.getState(),
    };

    return { nextState, events };
}

// ─── Sell Relic ─────────────────────────────────────────

export function processSellRelic(state: GameState, relicId: string, index: number): ActionResult {
    if (state.phase !== 'gift_shop') return { nextState: state, events: [] };

    const { inventory, comps } = state;
    const instance = inventory[index];
    if (!instance || instance.id !== relicId) return { nextState: state, events: [] };

    const refund = getRelicSellPrice(relicId);
    const newComps = comps + refund;
    const newInventory = [...inventory];
    newInventory.splice(index, 1);

    const events: GameEvent[] = [];
    events.push({ type: 'relic_sold', relicId, refund, newComps });

    const nextState: GameState = {
        ...state,
        inventory: newInventory,
        comps: newComps,
        tableActionCharges: buildTableActionCharges(newInventory, state.tableActionCharges),
        tableActionHeldCards: buildTableActionHeldCards(newInventory, state.tableActionHeldCards),
    };

    return { nextState, events };
}

// ─── Leave Shop ─────────────────────────────────────────

export function processLeaveShop(state: GameState): ActionResult {
    if (state.phase !== 'gift_shop') return { nextState: state, events: [] };

    const { inventory, round, totalScore, selectedCityId, rngState, tableActionCharges, tableActionHeldCards } = state;

    // Get city definition
    const city = CITY_DEFINITIONS.find(c => c.id === selectedCityId) || CITY_DEFINITIONS[0];
    const newRound = round + 1;

    // Check victory — if we've cleared all casinos
    if (round >= city.casinoTargets.length) {
        const events: GameEvent[] = [];
        events.push({ type: 'game_over', won: true, finalScore: totalScore });
        return {
            nextState: { ...state, phase: 'victory' },
            events,
        };
    }

    // Calculate next target score
    const targetIdx = newRound - 1;
    const cityTarget = city.casinoTargets[targetIdx] !== undefined
        ? city.casinoTargets[targetIdx]
        : (city.casinoTargets[city.casinoTargets.length - 1] + (targetIdx - city.casinoTargets.length + 1) * 1000);
    const newTargetScore = totalScore + cityTarget;

    // Collect ALL cards from everywhere
    const heldCards = Object.values(tableActionHeldCards).filter((card): card is Card => !!card);
    const allCards: Card[] = [
        ...(state.deck as Card[]),
        ...(state.discardPile as Card[]),
        ...(state.dealer.cards as Card[]),
        ...state.playerHands.flatMap(h => h.cards as Card[]),
        ...(state.drawnCards.filter((c): c is Card => c !== null)),
        ...heldCards
    ];

    // Reset all cards to face down / no origin
    const resetCards = allCards.map(c => ({
        ...c,
        isFaceUp: false,
        origin: undefined as any,
    }));

    // Seeded shuffle
    const rng = new SeededRNG(rngState);
    const shuffledDeck = [...resetCards];
    for (let i = shuffledDeck.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [shuffledDeck[i], shuffledDeck[j]] = [shuffledDeck[j], shuffledDeck[i]];
    }

    const emptyHands: PlayerHand[] = Array.from({ length: 3 }, (_, i) => ({
        id: i,
        cards: [],
        isHeld: false,
        isBust: false,
        blackjackValue: 0,
    }));

    const dealsPerCasino = executeValueHook('getDealsPerCasino', 3, { inventory });

    const events: GameEvent[] = [];
    events.push({ type: 'shop_left' });
    events.push({ type: 'next_casino_setup', round: newRound, targetScore: newTargetScore });

    const nextState: GameState = {
        ...state,
        deck: shuffledDeck,
        playerHands: emptyHands,
        dealer: { cards: [], isRevealed: false, blackjackValue: 0 },
        phase: 'entering_casino',
        round: newRound,
        targetScore: newTargetScore,
        totalScore,
        dealsTaken: 0,
        handsRemaining: dealsPerCasino,
        discardPile: [],
        drawnCards: [],
        selectedDrawIndex: null,
        cardsPlacedThisTurn: 0,
        redrawDiscard: null,
        interactionMode: 'default',
        activeTableActionId: null,
        tableActionCharges: buildTableActionCharges(inventory, tableActionCharges, { resetPerCasino: true }),
        tableActionHeldCards: buildTableActionHeldCards(inventory, {}, { resetPerCasino: true }),
        runningSummary: null,
        shopItems: [],
        giftShopRestockCost: 3,
        shopRewardSummary: null,
        modifiers: { drawCountMod: 0, placeCountMod: 0 },
        rngState: rng.getState(),
    };

    return { nextState, events };
}

// ─── Enhance Card ───────────────────────────────────────

const ENHANCE_COSTS = [1, 3, 5, 7];

function getEnhanceCost(effect: { type: 'chip' | 'mult' | 'score'; value: number }): number {
    let level = 0;
    if (effect.type === 'score') level = [-1, -2, -3, -4].indexOf(-effect.value);
    if (effect.type === 'mult') level = [1, 2, 3, 4].indexOf(effect.value);
    if (effect.type === 'chip') level = [5, 10, 20, 50].indexOf(effect.value);
    return ENHANCE_COSTS[level] || 0;
}

export function processEnhanceCard(
    state: GameState,
    cardId: string,
    enhancement: { type: 'chip' | 'mult' | 'score'; value: number }
): ActionResult {
    if (state.phase !== 'gift_shop') return { nextState: state, events: [] };

    const { comps, deck } = state;
    const cost = getEnhanceCost(enhancement);
    if (comps < cost) return { nextState: state, events: [] };

    // Check card exists in deck
    const cardIdx = deck.findIndex(c => c.id === cardId);
    if (cardIdx === -1) return { nextState: state, events: [] };

    const newDeck = deck.map(c =>
        c.id === cardId
            ? { ...c, specialEffect: enhancement }
            : c
    );

    const events: GameEvent[] = [];
    events.push({ type: 'card_enhanced', cardId, enhancement });

    const nextState: GameState = {
        ...state,
        deck: newDeck,
        comps: comps - cost,
    };

    return { nextState, events };
}

// ─── Destroy Card ───────────────────────────────────────

export function processDestroyCard(state: GameState, cardId: string): ActionResult {
    if (state.phase !== 'gift_shop') return { nextState: state, events: [] };

    const { comps, deck, removalCount } = state;
    const cost = 2 + (removalCount * 2);
    if (comps < cost) return { nextState: state, events: [] };

    // Check card exists
    const cardIdx = deck.findIndex(c => c.id === cardId);
    if (cardIdx === -1) return { nextState: state, events: [] };

    const events: GameEvent[] = [];
    events.push({ type: 'card_destroyed', cardId });

    const nextState: GameState = {
        ...state,
        deck: deck.filter(c => c.id !== cardId),
        comps: comps - cost,
        removalCount: removalCount + 1,
    };

    return { nextState, events };
}
