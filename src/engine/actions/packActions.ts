/** Free pack rewards at the start of a run and at each ante increase. */
import { generateRelicPackChoices } from '../../logic/relicPacks';
import { applyPackCard, generatePackCardChoices, getPackCard } from '../../logic/packCards';
import { getRaise, generateRaiseChoices } from '../../logic/handScoring';
import { getPackDefinition, hasPendingPack, PACKS, rollPackDefinition, type PackId } from '../../logic/packs';
import type { Card } from '../../types';
import type { RelicInstance } from '../../logic/relics/types';
import type { GameState } from '../GameState';
import type { ActionResult } from '../engine';
import { RelicManager } from '../../logic/relics/manager';
import { SeededRNG } from '../rng';
import { canAcquireRelic } from '../../logic/relics/inventory';

export function generatePackOffers(rng: SeededRNG): PackId[] {
    return (['raise', 'deck', 'relic'] as const).map(family => rollPackDefinition(rng.next(), family).id);
}

export function processOpenPack(state: GameState, packId: PackId): ActionResult {
    if (state.phase !== 'pack_choice' || hasPendingPack(state) || !state.offeredPacks.includes(packId)) {
        return { nextState: state, events: [] };
    }
    const rng = new SeededRNG(state.rngState);
    const pack = getPackDefinition(packId);
    return {
        nextState: {
            ...state,
            offeredPacks: [],
            pendingRaiseChoices: pack.family === 'raise' ? generateRaiseChoices(rng, pack.offerCount).map(raise => raise.id) : [],
            pendingPackChoices: pack.family === 'relic'
                ? generateRelicPackChoices(rng, pack.offerCount, state.inventory)
                : pack.family === 'deck' ? generatePackCardChoices(rng, pack.offerCount, state.deckProbabilities).map(card => card.id) : [],
            pendingPack: { packId, picksRemaining: pack.pickCount },
            rngState: rng.getState(),
        },
        events: [{ type: 'pack_opened', packId }],
    };
}

export function processFinishPack(state: GameState): ActionResult {
    if (state.phase !== 'pack_choice' || state.offeredPacks.length || hasPendingPack(state)) {
        return { nextState: state, events: [] };
    }
    if (state.debugPackReturn) {
        const { phase, offeredPacks, packReturnPhase } = state.debugPackReturn;
        return {
            nextState: { ...state, phase, offeredPacks, packReturnPhase, debugPackReturn: null },
            events: [{ type: 'phase_changed', from: 'pack_choice', to: phase }],
        };
    }
    return {
        nextState: { ...state, phase: state.packReturnPhase },
        events: [{ type: 'phase_changed', from: 'pack_choice', to: state.packReturnPhase }],
    };
}

/** Open an extra pack without consuming a reward or advancing the current round. */
export function processDebugOpenPack(state: GameState, packId: PackId): ActionResult {
    if ((state.phase !== 'entering_casino' && state.phase !== 'deal_over' &&
        state.phase !== 'playing' && state.phase !== 'pack_choice') ||
        hasPendingPack(state) || state.debugPackReturn || !PACKS.some(pack => pack.id === packId) ||
        (state.phase === 'pack_choice' && !state.offeredPacks.length)) {
        return { nextState: state, events: [] };
    }
    const opened = processOpenPack({
        ...state,
        phase: 'pack_choice',
        offeredPacks: [packId],
        debugPackReturn: {
            phase: state.phase,
            offeredPacks: state.offeredPacks,
            packReturnPhase: state.packReturnPhase,
        },
    }, packId);
    return {
        nextState: opened.nextState,
        events: [{ type: 'phase_changed', from: state.phase, to: 'pack_choice' }, ...opened.events],
    };
}

function getTableActionConfig(relicId: string) {
    const config = RelicManager.getRelicConfig(relicId);
    return config?.tableAction;
}

function buildTableActionCharges(
    inventory: readonly RelicInstance[],
    existingCharges: Readonly<Record<string, number>> = {}
): Record<string, number> {
    const charges: Record<string, number> = {};
    inventory.forEach(instance => {
        const action = getTableActionConfig(instance.id);
        if (!action) return;
        const current = existingCharges[instance.id];
        const next = current ?? action.maxCharges;
        charges[instance.id] = Math.max(0, Math.min(action.maxCharges, next));
    });
    return charges;
}

function buildTableActionHeldCards(
    inventory: readonly RelicInstance[],
    existingHeld: Readonly<Record<string, Card | null>> = {}
): Record<string, Card | null> {
    const held: Record<string, Card | null> = {};
    inventory.forEach(instance => {
        const action = getTableActionConfig(instance.id);
        if (!action) return;
        held[instance.id] = existingHeld[instance.id] ?? null;
    });
    return held;
}

export function processChooseRaise(state: GameState, raiseId: string): ActionResult {
    if (state.phase !== 'pack_choice' || !state.pendingRaiseChoices.includes(raiseId) || !getRaise(raiseId)) {
        return { nextState: state, events: [] };
    }
    const picksRemaining = (state.pendingPack?.picksRemaining ?? 1) - 1;
    return {
        nextState: {
            ...state,
            handUpgrades: { ...state.handUpgrades, [raiseId]: (state.handUpgrades[raiseId] ?? 0) + 1 },
            pendingRaiseChoices: picksRemaining > 0 ? state.pendingRaiseChoices.filter(id => id !== raiseId) : [],
            pendingPack: picksRemaining > 0 ? { packId: state.pendingPack!.packId, picksRemaining } : null,
        },
        events: [{ type: 'raise_chosen', raiseId }],
    };
}

export function processChoosePackCard(state: GameState, cardId: string): ActionResult {
    if (state.phase !== 'pack_choice' || !state.pendingPackChoices.includes(cardId) || !state.pendingPack) {
        return { nextState: state, events: [] };
    }
    const family = getPackDefinition(state.pendingPack.packId).family;
    let updated = state;
    if (family === 'relic') {
        if (!canAcquireRelic(cardId, state.inventory, state.relicSlots)) return { nextState: state, events: [] };
        const relic = RelicManager.getRelicConfig(cardId)!;
        const inventory = [...state.inventory, { id: cardId, state: { ...relic.properties } }];
        updated = { ...state, inventory,
            tableActionCharges: buildTableActionCharges(inventory, state.tableActionCharges),
            tableActionHeldCards: buildTableActionHeldCards(inventory, state.tableActionHeldCards) };
    } else {
        const card = getPackCard(cardId);
        if (family !== 'deck' || !card) return { nextState: state, events: [] };
        updated = { ...state, deckProbabilities: applyPackCard(state.deckProbabilities, card) };
    }
    const picksRemaining = state.pendingPack.picksRemaining - 1;
    return {
        nextState: { ...updated,
            pendingPackChoices: picksRemaining > 0 ? state.pendingPackChoices.filter(id => id !== cardId) : [],
            pendingPack: picksRemaining > 0 ? { ...state.pendingPack, picksRemaining } : null },
        events: [{ type: 'pack_card_chosen', cardId }],
    };
}

export function processSkipPack(state: GameState): ActionResult {
    if (state.phase !== 'pack_choice' || (!hasPendingPack(state) && !state.pendingPack)) return { nextState: state, events: [] };
    return { nextState: { ...state, pendingRaiseChoices: [], pendingPackChoices: [], pendingPack: null }, events: [{ type: 'pack_skipped' }] };
}

