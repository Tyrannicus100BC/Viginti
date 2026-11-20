import { afterEach, describe, expect, it } from 'vitest';
import { createInitialState, getValidActions, processAction } from '../engine';
import { BOSS_REGISTRY, getBustLimit, isBossStage } from '../bosses';
import { createChallenges } from '../challenges';
import type { GameState } from '../GameState';
import type { Card, PlayerHand } from '../../types';
import { finishOpeningPack } from './fixtures';
import { RelicManager } from '../../logic/relics/manager';
import { generateRelicPackChoices } from '../../logic/relicPacks';
import { generateShopItems } from '../../logic/rewards/generator';
import { SeededRNG } from '../rng';
import { evaluateHandScore, getBlackjackScore } from '../../logic/scoring';
import { getRewardCard } from '../../logic/rewardCards';
import { useGameBridge } from '../../store/gameBridge';

const act = (state: GameState, action: Parameters<typeof processAction>[1]) => processAction(state, action).nextState;
const start = (seed = 42) => act(createInitialState(), { type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed });
const card = (rank: Card['rank'], id: string = rank): Card => ({ id, rank, suit: 'hearts', isFaceUp: true });
const hand = (cards: Card[], value: number, id = 0): PlayerHand => ({ id, cards, blackjackValue: value, isBust: false, isHeld: false });
const boss = (): GameState => ({ ...finishOpeningPack(start()), challengeStage: 2, bossId: 'high_limit', challenges: createChallenges(2), phase: 'playing' });
afterEach(() => useGameBridge.getState().reset());

describe('direct mixed rewards', () => {
    it('opens six unified major rewards with mixed rows and no nested packs', () => {
        for (let seed = 1; seed <= 100; seed++) {
            const state = start(seed);
            expect(state.offeredPacks).toEqual([]);
            expect(state.pendingPack).toEqual({ packId: 'mixed_major', picksRemaining: 1 });
            expect(state.pendingPackChoices).toHaveLength(6);
            expect(new Set(state.pendingPackChoices).size).toBe(6);
            for (const id of state.pendingPackChoices) {
                const reward = getRewardCard(id)!;
                expect(reward).toBeDefined();
                expect(new Set(reward.rows.map(row => row.kind)).size).toBeGreaterThanOrEqual(2);
            }
            expect(start(seed)).toEqual(state);
        }
    });

    it('draws three unified minor rewards with no challenges or table actions', () => {
        const families = new Set<string>();
        let repeatedFamily = false;
        for (let seed = 1; seed <= 100; seed++) {
            const base = finishOpeningPack(start(seed));
            const state = act({ ...base, phase: 'deal_over', challengeRewards: [{ id: 'side', tier: 'minor', title: 'Side' }] }, { type: 'deal' });
            expect(state.pendingPackChoices).toHaveLength(3);
            expect(state.pendingPack?.picksRemaining).toBe(1);
            const types = state.pendingPackChoices.flatMap(id => getRewardCard(id)!.rows.map(row => row.kind));
            types.forEach(type => families.add(type));
            repeatedFamily ||= new Set(types).size < 3;
            expect(state.pendingPackChoices.some(id => id.startsWith('challenge_') || RelicManager.getRelicConfig(id)?.tableAction)).toBe(false);
        }
        expect(families).toEqual(new Set(['raise', 'deck', 'relic']));
        expect(repeatedFamily).toBe(true);
    });
});

describe('boss cadence and rewards', () => {
    it('uses bosses on antes 3, 6, 9 and keeps their rule for all four rounds', () => {
        let state = finishOpeningPack(start());
        for (let stage = 0; stage < 9; stage++) {
            expect(!!state.bossId).toBe(isBossStage(stage));
            const anteBossId = state.bossId;
            const bustLimit = state.bossId === 'high_limit' ? 25 : 21;
            for (let round = 0; round < 4; round++) {
                state = act({ ...state, phase: 'scoring', playerHands: [], runningSummary: { chips: 100, mult: 1 } }, { type: 'score_round' });
                expect(state.bossId).toBe(anteBossId);
                expect(getBustLimit(state)).toBe(bustLimit);
                expect(state.challengeRewards).toHaveLength(round === 3 ? isBossStage(stage) ? 2 : 1 : 0);
            }
            state = act(state, { type: 'deal' });
            expect(state.pendingPack?.packId).toBe('mixed_major');
            const currentAnte = state.ante;
            state = finishOpeningPack(state);
            if (isBossStage(stage)) {
                expect(state.pendingPack).toEqual({ packId: 'mixed_major', picksRemaining: 1 });
                expect(state.pendingPackChoices).toHaveLength(6);
                expect(state.pendingPackChoices.every(id => !!getRewardCard(id))).toBe(true);
                expect(state.ante).toBe(currentAnte);
                expect(state.bossId).toBe(anteBossId);
                expect(getBustLimit(state)).toBe(bustLimit);
                const id = state.pendingPackChoices[0];
                state = act(state, { type: 'choose_pack_card', cardId: id });
                expect(state.pendingPack).toBeNull();
                state = act(state, { type: 'finish_pack' });
            }
            expect(state.challengeStage).toBe(stage + 1);
            expect(state.ante).toBeGreaterThan(currentAnte);
        }
    });

    it('excludes table actions from all normal pools and allows boss rewards with four active effects', () => {
        const passives = RelicManager.getAllRelics().filter(relic => !relic.tableAction);
        expect(generateRelicPackChoices(new SeededRNG(1), 100, []).every(id => !RelicManager.getRelicConfig(id)?.tableAction)).toBe(true);
        expect(generateShopItems([{ type: 'Relic', count: 100 }, { type: 'TableAction', count: 100 }], []).every(item => !RelicManager.getRelicConfig(item.id)?.tableAction)).toBe(true);
        const base = { ...boss(), phase: 'deal_over' as const, inventory: passives.slice(0, 4).map(relic => ({ id: relic.id, state: {} })),
            challengeRewards: [{ id: 'boss', title: 'Boss', tier: 'major' as const, kind: 'table_action' as const }] };
        const state = act(base, { type: 'deal' });
        expect(getValidActions(state).filter(action => action.type === 'choose_pack_card')).toHaveLength(6);
        const chosen = act(state, { type: 'choose_pack_card', cardId: state.pendingPackChoices[0] });
        expect(chosen.inventory).toHaveLength(4);
        expect(chosen.pendingPack).toBeNull();
    });

    it('preserves boss identity and queued bonus reward across saves', () => {
        const state = { ...boss(), phase: 'deal_over', challengeRewards: [{ id: 'boss', title: 'Boss', tier: 'major', kind: 'table_action' }] };
        expect(useGameBridge.getState().loadGameState(JSON.stringify(state))).toBe(true);
        expect(useGameBridge.getState().gameState.bossId).toBe(BOSS_REGISTRY[0].id);
        expect(useGameBridge.getState().gameState.challengeRewards).toEqual(state.challengeRewards);
    });
});

describe('boss bust rule', () => {
    it('allows 22–25 on card placement and busts at 26', () => {
        for (const [rank, value] of [['2', 22], ['4', 24], ['5', 25], ['6', 26]] as const) {
            const state = { ...boss(), playerHands: [hand([card('K'), card('Q')], 20)], drawnCards: [card(rank)], selectedDrawIndex: 0 };
            const result = act(state, { type: 'place_card', handIndex: 0 });
            expect(result.playerHands[0]).toMatchObject({ blackjackValue: value, isBust: value > 25 });
        }
    });

    it('values aces against the boss limit and does not score safe totals as busts', () => {
        const cards = [card('A', 'a1'), card('A', 'a2'), card('3')];
        expect(getBlackjackScore(cards, [], false, 25)).toBe(25);
        expect(getBlackjackScore(cards)).toBe(15);
        const safe = evaluateHandScore([card('K'), card('Q'), card('4')], true, false, [], 1, undefined, 'win', {}, 25);
        expect(safe.criteria.some(row => row.id === 'bust')).toBe(false);
        expect(safe.criteria.some(row => row.id === 'win')).toBe(true);
    });

    it('resolves the dealer and player against the same cap', () => {
        const state = { ...boss(), phase: 'resolving_outcomes' as const, dealer: { cards: [card('K'), card('Q'), card('4')], blackjackValue: 24, isRevealed: true },
            playerHands: [hand([card('K'), card('Q'), card('3')], 23), hand([card('K'), card('Q'), card('5')], 25, 1)] };
        const result = act(state, { type: 'resolve_hand_outcome' });
        expect(result.playerHands.map(hand => hand.outcome)).toEqual(['loss', 'win']);
        expect(act({ ...state, bossId: null }, { type: 'resolve_hand_outcome' }).playerHands[0].outcome).toBe('win');
    });

    it('recalculates table action hands using the boss cap', () => {
        const state = { ...boss(), inventory: [{ id: 'hold', state: {} }], tableActionCharges: { hold: 0 }, tableActionHeldCards: { hold: card('4') },
            playerHands: [hand([card('K'), card('Q')], 20)] };
        const targeting = act(state, { type: 'activate_table_action', relicId: 'hold' });
        const result = act(targeting, { type: 'select_table_action_target', handIndex: 0 });
        expect(result.playerHands[0]).toMatchObject({ blackjackValue: 24, isBust: false });
    });
});
