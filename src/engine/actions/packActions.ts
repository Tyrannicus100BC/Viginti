import { generateChallengeCardChoices, getChallengeCard } from '../../logic/challengeCards';
import { createChallenges, type RewardTier } from '../challenges';
import { getNextAnte } from '../economy';
import type { GameEvent } from '../GameEvent';
/** Free opening packs and queued challenge rewards. */
import { generateRelicPackChoices } from '../../logic/relicPacks';
import { applyPackCard, generatePackCardChoices, getPackCard } from '../../logic/packCards';
import { getRaise, generateRaiseChoices } from '../../logic/handScoring';
import { getPackDefinition, hasPendingPack, PACKS, PACK_FAMILIES, rollPackDefinition, type PackId } from '../../logic/packs';
import type { Card, PlayerHand } from '../../types';
import type { RelicInstance } from '../../logic/relics/types';
import type { GameState } from '../GameState';
import type { ActionResult } from '../engine';
import { RelicManager } from '../../logic/relics/manager';
import { SeededRNG } from '../rng';
import { canAcquireRelic } from '../../logic/relics/inventory';
import { INITIAL_HAND_COUNT } from '../GameState';

export function generatePackOffers(rng: SeededRNG, tier?: RewardTier): PackId[] {
    // Three distinct families, with quantity and quality competing for reward value.
    const variants = rng.shuffle(tier === 'major'
        ? ['mega_excellent', 'jumbo_exceptional', 'mega']
        : ['basic_excellent', 'jumbo', 'basic']);
    // Opening and major rewards always include the two core upgrade families.
    const families = tier === 'minor'
        ? rng.shuffle(PACK_FAMILIES).slice(0, 3)
        : rng.shuffle(['raise', 'relic', rng.pick(PACK_FAMILIES.filter(family => family !== 'raise' && family !== 'relic'))] as const);
    return families.map((family, index) => {
        if (!tier) return rollPackDefinition(rng.next(), family, rng.next()).id;
        return `${family}_${variants[index]}` as PackId;
    });
}

/** The normal table advance opens earned rewards before it can deal another round. */
export function processBeginChallengeRewards(state: GameState): ActionResult {
    if ((state.phase !== 'deal_over' && state.phase !== 'entering_casino') || !state.challengeRewards.length) return { nextState: state, events: [] };
    const rng = new SeededRNG(state.rngState);
    const playerHands: PlayerHand[] = Array.from({ length: INITIAL_HAND_COUNT }, (_, id) => ({
        id, cards: [], isHeld: false, isInactive: false, isBust: false, blackjackValue: 0,
    }));
    return {
        nextState: { ...state, phase: 'pack_choice', packReturnPhase: 'deal_over',
            playerHands, dealer: { cards: [], isRevealed: false, blackjackValue: 0 },
            runningSummary: null, drawnCards: [], selectedDrawIndex: null, cardsPlacedThisTurn: 0,
            interactionMode: 'default', activeTableActionId: null, redrawDiscard: null,
            offeredPacks: generatePackOffers(rng, state.challengeRewards[0].tier), rngState: rng.getState() },
        events: [{ type: 'round_dismissed', playerHands }, { type: 'phase_changed', from: state.phase, to: 'pack_choice' }],
    };
}

export function processOpenPack(state: GameState, packId: PackId): ActionResult {
    if (state.phase !== 'pack_choice' || hasPendingPack(state) || !state.offeredPacks.includes(packId)) {
        return { nextState: state, events: [] };
    }
    const rng = new SeededRNG(state.rngState);
    const pack = getPackDefinition(packId);
    let choices: string[] = [];
    if (pack.family === 'relic') choices = generateRelicPackChoices(rng, pack.offerCount, state.inventory, [], pack.quality);
    if (pack.family === 'deck') choices = generatePackCardChoices(rng, pack.offerCount, state.deckProbabilities, pack.quality).map(card => card.id);
    if (pack.family === 'challenge') choices = generateChallengeCardChoices(rng, pack.offerCount, state.challengeStage, pack.quality).map(card => card.id);
    if (pack.family === 'mixed') {
        // Every mixed pack contains all three upgrade families while relics remain available.
        const families = rng.shuffle(['raise', 'deck', 'relic'] as const);
        for (let index = 0; index < pack.offerCount; index++) {
            const family = index < 3 ? families[index] : rng.pick(families);
            let id: string | undefined;
            if (family === 'relic') id = generateRelicPackChoices(rng, 1, state.inventory, choices, pack.quality)[0];
            if (family === 'deck') {
                do { id = generatePackCardChoices(rng, 1, state.deckProbabilities, pack.quality)[0].id; } while (choices.includes(id));
            }
            if (family === 'raise' || !id) {
                do { id = generateRaiseChoices(rng, 1, pack.quality)[0].id; } while (choices.includes(id));
            }
            choices.push(id);
        }
        choices = rng.shuffle(choices);
    }
    return {
        nextState: {
            ...state,
            offeredPacks: [],
            pendingRaiseChoices: pack.family === 'raise' ? generateRaiseChoices(rng, pack.offerCount, pack.quality).map(raise => raise.id) : [],
            pendingPackChoices: choices,
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
    // Debug earnings can complete a goal while the free opening pack is still open.
    // That opening pack does not consume the newly earned challenge reward.
    const openingReward = state.packReturnPhase === 'entering_casino' && state.dealsTaken === 0;
    const challengeRewards = openingReward ? state.challengeRewards : state.challengeRewards.slice(1);
    if (challengeRewards.length) {
        const rng = new SeededRNG(state.rngState);
        return {
            nextState: { ...state, challengeRewards, packReturnPhase: 'deal_over',
                offeredPacks: generatePackOffers(rng, challengeRewards[0].tier), rngState: rng.getState() },
            events: [],
        };
    }
    // Retain completed goals and the current ante through every reward in the queue.
    const advance = state.challengeRewards.length > 0 && state.challenges.some(challenge => challenge.main && challenge.completed);
    const ante = advance ? getNextAnte(state.ante) : state.ante;
    const challengeStage = state.challengeStage + (advance ? 1 : 0);
    const challenges = advance || openingReward
        ? [...createChallenges(challengeStage, ante), ...state.challenges.filter(challenge => challenge.source === 'pack' && !challenge.completed)]
        : state.challenges;
    const events: GameEvent[] = [];
    if (advance) {
        events.push({ type: 'ante_increased', previousAnte: state.ante, ante });
    }
    if (advance || openingReward) events.push({ type: 'challenges_updated', challenges });
    events.push({ type: 'phase_changed', from: 'pack_choice', to: state.packReturnPhase });
    return {
        nextState: { ...state, challengeRewards, ante, challengeStage, challenges, phase: state.packReturnPhase },
        events,
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
    if ((family === 'relic' || family === 'mixed') && RelicManager.getRelicConfig(cardId)) {
        if (!canAcquireRelic(cardId, state.inventory, state.relicSlots)) return { nextState: state, events: [] };
        const relic = RelicManager.getRelicConfig(cardId)!;
        const inventory = [...state.inventory, { id: cardId, state: { ...relic.properties } }];
        updated = { ...state, inventory,
            tableActionCharges: buildTableActionCharges(inventory, state.tableActionCharges),
            tableActionHeldCards: buildTableActionHeldCards(inventory, state.tableActionHeldCards) };
    } else if (family === 'challenge') {
        const card = getChallengeCard(cardId);
        if (!card || state.challenges.some(challenge => challenge.id === cardId)) return { nextState: state, events: [] };
        updated = { ...state, challenges: [...state.challenges, card.challenge] };
    } else if (family === 'mixed' && getRaise(cardId)) {
        updated = { ...state, handUpgrades: { ...state.handUpgrades, [cardId]: (state.handUpgrades[cardId] ?? 0) + 1 } };
    } else {
        const card = getPackCard(cardId);
        if ((family !== 'deck' && family !== 'mixed') || !card) return { nextState: state, events: [] };
        updated = { ...state, deckProbabilities: applyPackCard(state.deckProbabilities, card) };
    }
    const picksRemaining = state.pendingPack.picksRemaining - 1;
    return {
        nextState: { ...updated,
            pendingPackChoices: picksRemaining > 0 ? state.pendingPackChoices.filter(id => id !== cardId) : [],
            pendingPack: picksRemaining > 0 ? { ...state.pendingPack, picksRemaining } : null },
        events: [{ type: 'pack_card_chosen', cardId }, ...(family === 'challenge' ? [{ type: 'challenges_updated' as const, challenges: updated.challenges }] : [])],
    };
}

export function processSkipPack(state: GameState): ActionResult {
    if (state.phase !== 'pack_choice' || (!hasPendingPack(state) && !state.offeredPacks.length)) return { nextState: state, events: [] };
    return { nextState: { ...state, offeredPacks: [], pendingRaiseChoices: [], pendingPackChoices: [], pendingPack: null }, events: [{ type: 'pack_skipped' }] };
}

