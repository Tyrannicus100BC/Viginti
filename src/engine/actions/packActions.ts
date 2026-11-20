import { createChallenges, renewSideChallenges, type RewardTier } from '../challenges';
import { chooseBoss } from '../bosses';
import { getNextAnte } from '../economy';
import type { GameEvent } from '../GameEvent';
/** Free opening packs and queued challenge rewards. */
import { generateRelicPackChoices } from '../../logic/relicPacks';
import { applyPackCard, getPackCard } from '../../logic/packCards';
import { getPackDefinition, hasPendingPack, PACKS, type PackId } from '../../logic/packs';
import type { Card, PlayerHand } from '../../types';
import type { RelicInstance } from '../../logic/relics/types';
import type { GameState } from '../GameState';
import type { ActionResult } from '../engine';
import { RelicManager } from '../../logic/relics/manager';
import { SeededRNG } from '../rng';
import { acquireRelicEffect, canAcquireRelic, INITIAL_RELIC_SLOTS } from '../../logic/relics/inventory';
import { generateRewardCardChoices, getRewardCard } from '../../logic/rewardCards';
import { INITIAL_HAND_COUNT } from '../GameState';

export function generatePackOffers(_rng: SeededRNG, tier: RewardTier = 'major'): PackId[] {
    return [tier === 'major' ? 'mixed_major' : 'mixed_minor'];
}

/** Open the reward immediately; there is no pack-family selection screen. */
export function openReward(state: GameState): ActionResult {
    const packId = state.challengeRewards[0]?.tier === 'minor' ? 'mixed_minor' : 'mixed_major';
    return processOpenPack({ ...state, phase: 'pack_choice', offeredPacks: [packId] }, packId);
}

/** The normal table advance opens earned rewards before it can deal another round. */
export function processBeginChallengeRewards(state: GameState): ActionResult {
    if ((state.phase !== 'deal_over' && state.phase !== 'entering_casino') || !state.challengeRewards.length) return { nextState: state, events: [] };
    // Claim minor packs in HUD order before major rewards, even when goals
    // completed on different hands or the queue came from an older save.
    const boardOrder = new Map(state.challenges.map((challenge, index) => [challenge.id, index]));
    const challengeRewards = [...state.challengeRewards].sort((left, right) =>
        Number(left.tier === 'major') - Number(right.tier === 'major')
        || (boardOrder.get(left.id) ?? boardOrder.size) - (boardOrder.get(right.id) ?? boardOrder.size));
    const rng = new SeededRNG(state.rngState);
    const playerHands: PlayerHand[] = Array.from({ length: INITIAL_HAND_COUNT }, (_, id) => ({
        id, cards: [], isHeld: false, isInactive: false, isBust: false, blackjackValue: 0,
    }));
    const opened = openReward({ ...state, phase: 'pack_choice', packReturnPhase: 'deal_over',
            challengeRewards,
            playerHands, dealer: { cards: [], isRevealed: false, blackjackValue: 0 },
            runningSummary: null, drawnCards: [], selectedDrawIndex: null, cardsPlacedThisTurn: 0,
            interactionMode: 'default', activeTableActionId: null, redrawDiscard: null,
            offeredPacks: [], rngState: rng.getState() });
    return { nextState: opened.nextState,
        events: [{ type: 'round_dismissed', playerHands }, { type: 'phase_changed', from: state.phase, to: 'pack_choice' }, ...opened.events],
    };
}

export function processOpenPack(state: GameState, packId: PackId): ActionResult {
    if (state.phase !== 'pack_choice' || !PACKS.some(pack => pack.id === packId) || hasPendingPack(state) || !state.offeredPacks.includes(packId)) {
        return { nextState: state, events: [] };
    }
    const rng = new SeededRNG(state.rngState);
    const pack = getPackDefinition(packId);
    const choices = packId === 'relic_boss'
        ? generateRelicPackChoices(rng, pack.offerCount, state.inventory, [], pack.quality, true)
        : generateRewardCardChoices(rng, pack.offerCount, state.deckProbabilities, state.inventory, pack.quality).map(card => card.id);
    return {
        nextState: {
            ...state,
            offeredPacks: [],
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
    // The opening reward does not consume any separately queued challenge reward.
    const openingReward = state.packReturnPhase === 'entering_casino' && state.dealsTaken === 0;
    const challengeRewards = openingReward ? state.challengeRewards : state.challengeRewards.slice(1);
    if (challengeRewards.length) {
        return openReward({ ...state, challengeRewards, packReturnPhase: 'deal_over' });
    }
    // Retain completed goals and the current ante through every reward in the queue.
    const advance = state.challengeRewards.length > 0 && state.challenges.some(challenge => challenge.main && challenge.completed);
    const ante = advance ? getNextAnte(state.ante) : state.ante;
    const challengeStage = state.challengeStage + (advance ? 1 : 0);
    const challenges = advance || openingReward
        ? [...createChallenges(challengeStage, ante), ...state.challenges.filter(challenge => challenge.source === 'pack' && !challenge.completed)]
        : renewSideChallenges(state.challenges);
    const rng = new SeededRNG(state.rngState);
    const bossId = advance ? chooseBoss(challengeStage, rng) : state.bossId;
    const events: GameEvent[] = [];
    if (advance) {
        events.push({ type: 'ante_increased', previousAnte: state.ante, ante });
    }
    events.push({ type: 'challenges_updated', challenges });
    events.push({ type: 'phase_changed', from: 'pack_choice', to: state.packReturnPhase });
    return {
        nextState: { ...state, challengeRewards, ante, challengeStage, bossId, rngState: rng.getState(), challenges: challenges.filter(goal => !goal.completed), phase: state.packReturnPhase },
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

export function processChoosePackCard(state: GameState, cardId: string): ActionResult {
    if (state.phase !== 'pack_choice' || !state.pendingPackChoices.includes(cardId) || !state.pendingPack) {
        return { nextState: state, events: [] };
    }
    let updated = state;
    const reward = getRewardCard(cardId);
    if (reward && state.pendingPack.packId !== 'relic_boss') {
        // Validate before changing anything; a reward's rows are one atomic choice.
        if (reward.rows.some(row => row.kind === 'relic' && !canAcquireRelic(row.relicId, state.inventory))) return { nextState: state, events: [] };
        for (const row of reward.rows) {
            if (row.kind === 'raise') updated = { ...updated, handUpgrades: {
                ...updated.handUpgrades, [row.raiseId]: (updated.handUpgrades[row.raiseId] ?? 0) + 1 } };
            else if (row.kind === 'deck') updated = { ...updated, deckProbabilities: applyPackCard(updated.deckProbabilities, getPackCard(row.cardId)!) };
            else updated = { ...updated, inventory: acquireRelicEffect(updated.inventory, row.relicId) };
        }
        updated = { ...updated, relicSlots: INITIAL_RELIC_SLOTS,
            tableActionCharges: buildTableActionCharges(updated.inventory, updated.tableActionCharges),
            tableActionHeldCards: buildTableActionHeldCards(updated.inventory, updated.tableActionHeldCards) };
    } else if (state.pendingPack.packId === 'relic_boss' && RelicManager.getRelicConfig(cardId)?.tableAction) {
        if (!canAcquireRelic(cardId, state.inventory, state.relicSlots)) return { nextState: state, events: [] };
        const inventory = acquireRelicEffect(state.inventory, cardId);
        updated = { ...state, inventory,
            tableActionCharges: buildTableActionCharges(inventory, state.tableActionCharges),
            tableActionHeldCards: buildTableActionHeldCards(inventory, state.tableActionHeldCards) };
    } else return { nextState: state, events: [] };
    const picksRemaining = state.pendingPack.picksRemaining - 1;
    return {
        nextState: { ...updated,
            pendingPackChoices: picksRemaining > 0 ? state.pendingPackChoices.filter(id => id !== cardId) : [],
            pendingPack: picksRemaining > 0 ? { ...state.pendingPack, picksRemaining } : null },
        events: [{ type: 'pack_card_chosen', cardId }],
    };
}

export function processSkipPack(state: GameState): ActionResult {
    if (state.phase !== 'pack_choice' || (!hasPendingPack(state) && !state.offeredPacks.length)) return { nextState: state, events: [] };
    return { nextState: { ...state, offeredPacks: [], pendingPackChoices: [], pendingPack: null }, events: [{ type: 'pack_skipped' }] };
}

