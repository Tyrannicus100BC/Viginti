import { describe, expect, it } from 'vitest';
import { createInitialState, getValidActions, processAction } from '../engine';
import type { GameState } from '../GameState';
import type { PlayerAction } from '../PlayerAction';
import { BASE_ANTE, getNextAnte } from '../economy';
import { CHALLENGE_ROUNDS } from '../challenges';
import { TUTORIAL_STEPS } from '../tutorial/definitions';
import { finishOpeningPack } from './fixtures';

const act = (state: GameState, action: PlayerAction) => processAction(state, action).nextState;
const start = () => act(createInitialState(), {
    type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 42,
    globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id),
});
const ready = () => finishOpeningPack(start());
const card = (id: string) => ({ id, rank: '2' as const, suit: 'hearts' as const, isFaceUp: true });

// Empty scoring isolates cadence and bankroll from card payouts.
const settle = (state: GameState) => processAction({ ...state, phase: 'scoring', playerHands: [], runningSummary: { chips: 0, mult: 1 } }, { type: 'score_round' });

describe('free pack cadence and cash antes', () => {
    it('offers an optional opening pack before the first deal without charging cash or ante', () => {
        const state = start();
        expect(state).toMatchObject({ phase: 'pack_choice', cash: 100, ante: BASE_ANTE, dealsTaken: 0, relicSlots: 6 });
        expect(state.pendingPack?.packId).toBe('mixed_major');
        expect(getValidActions(state)).toEqual([...state.pendingPackChoices.map(cardId => ({ type: 'choose_pack_card', cardId })), { type: 'skip_pack' }]);
        expect(act(state, { type: 'deal' })).toEqual(state);
        expect(act(state, { type: 'finish_pack' })).toEqual(state);
        const opened = act(state, { type: 'open_pack', packId: state.offeredPacks[0] });
        expect(opened.offeredPacks).toEqual([]);
        expect(opened.cash).toBe(100);
        expect(act(opened, { type: 'open_pack', packId: state.offeredPacks[1] })).toEqual(opened);
        const returned = finishOpeningPack(opened);
        expect(returned).toMatchObject({ phase: 'entering_casino', cash: 100, dealsTaken: 0 });
        expect(act(returned, { type: 'open_pack', packId: state.offeredPacks[0] })).toEqual(returned);
    });

    it('can skip unopened opening packs and deal without gaining an upgrade', () => {
        const state = start();
        const skipped = processAction(state, { type: 'skip_pack' });
        expect(skipped.events).toEqual([{ type: 'pack_skipped' }]);
        expect(skipped.nextState).toEqual({ ...state, offeredPacks: [], pendingPack: null, pendingPackChoices: [] });
        expect(act(skipped.nextState, { type: 'skip_pack' })).toEqual(skipped.nextState);
        const returned = act(skipped.nextState, { type: 'finish_pack' });
        expect(returned).toMatchObject({ phase: 'entering_casino', cash: 100, ante: BASE_ANTE, dealsTaken: 0 });
        expect(returned.challenges.length).toBeGreaterThan(0);
        expect(act(returned, { type: 'deal' })).toMatchObject({ phase: 'playing', cash: 50, dealsTaken: 1 });
    });

    it('charges one cash ante and keeps all three hands available', () => {
        let state = act(ready(), { type: 'deal' });
        expect(state.cash).toBe(50);
        expect(state.playerHands.map(hand => hand.isInactive)).toEqual([false, false, false]);
        for (const handIndex of [0, 2, 0]) {
            state = { ...state, drawnCards: [card(`side-${handIndex}-${state.playerHands[handIndex].cards.length}`)], selectedDrawIndex: 0 };
            expect(getValidActions(state)).toContainEqual({ type: 'place_card', handIndex });
            state = act(state, { type: 'place_card', handIndex });
            expect(state.cash).toBe(50);
        }
        expect(state.playerHands[0].cards).toHaveLength(2);
        expect(state.playerHands[2].cards).toHaveLength(1);
        expect(state).not.toHaveProperty('comps');
    });

    it('places a held card into either empty side hand without a charge to open it', () => {
        const base = act(ready(), { type: 'deal' });
        for (const handIndex of [0, 2]) {
            const state = { ...base, inventory: [{ id: 'hold', state: {} }],
                tableActionCharges: { hold: 0 }, tableActionHeldCards: { hold: card('saved') } };
            const targeting = act(state, { type: 'activate_table_action', relicId: 'hold' });
            expect(targeting.interactionMode).toBe('select_hand');
            const placed = act(targeting, { type: 'select_table_action_target', handIndex });
            expect(placed.playerHands[handIndex].cards).toHaveLength(1);
            expect(placed.cash).toBe(base.cash);
            expect(placed.tableActionHeldCards.hold).toBeNull();
        }
    });

    it('does not auto-stand when the center busts and the sides remain empty', () => {
        const state = act(ready(), { type: 'deal' });
        const result = processAction({ ...state, playerHands: state.playerHands.map(hand => hand.id === 1 ? {
            ...hand, cards: [{ ...card('king'), rank: 'K' }, { ...card('queen'), rank: 'Q' }], blackjackValue: 20,
        } : hand), drawnCards: [card('bust')], selectedDrawIndex: 0 }, { type: 'place_card', handIndex: 1 });
        expect(result.nextState.playerHands[1].isBust).toBe(true);
        expect(result.events.some(event => event.type === 'auto_stand_triggered')).toBe(false);
        expect(getValidActions(result.nextState)).toContainEqual({ type: 'draw' });
    });

    it('queues a reward every four rounds and increases the ante only after redemption', () => {
        let state = { ...ready(), cash: 10000 };
        const antes = [50, 100, 175, 290, 460];
        for (let round = 1; round <= 16; round++) {
            const previous = state;
            const dealt = act(state, { type: 'deal' });
            expect(dealt.cash).toBe(previous.cash - previous.ante);
            const result = settle(dealt);
            state = result.nextState;
            expect(state.ante).toBe(previous.ante);
            expect(state.offeredPacks).toEqual([]);
            expect(state.phase).toBe('deal_over');
            expect(result.events.some(event => event.type === 'ante_increased')).toBe(false);
            expect(state.challenges.find(challenge => challenge.metric === 'rounds')?.progress).toBe((round - 1) % CHALLENGE_ROUNDS + 1);
            if (round % CHALLENGE_ROUNDS === 0) {
                const cash = state.cash;
                state = act(state, { type: 'deal' });
                expect(state).toMatchObject({ phase: 'pack_choice', cash, ante: previous.ante });
                expect(state.pendingPack?.packId).toBe('mixed_major');
                expect(act(state, { type: 'deal' })).toEqual(state);
                while (state.phase === 'pack_choice') state = finishOpeningPack(state);
                expect(state).toMatchObject({ phase: 'deal_over', cash, relicSlots: 6 });
                expect(state.ante).toBe(antes[Math.floor(round / CHALLENGE_ROUNDS)]);
                expect(state.challenges.find(challenge => challenge.metric === 'rounds')?.progress).toBe(0);
                expect(state.challenges.some(challenge => challenge.metric === 'earnings')).toBe(false);
                expect(getValidActions(state)).toEqual([{ type: 'deal' }]);
            } else expect(state.challengeRewards).toEqual([]);
            expect(act(state, { type: 'score_round' })).toEqual(state);
        }
    });

    it.each(['entering_casino', 'deal_over'] as const)('checks affordability only when Deal is requested from %s', phase => {
        const insufficient = { ...ready(), phase, cash: 49 };
        expect(getValidActions(insufficient)).toEqual([{ type: 'deal' }]);
        const result = processAction(insufficient, { type: 'deal' });
        expect(result.nextState).toMatchObject({ phase: 'game_over', cash: 49, dealsTaken: 0 });
        expect(result.nextState.rngState).toBe(insufficient.rngState);
        expect(result.events.some(event => event.type === 'cards_dealt')).toBe(false);
        const exact = act({ ...ready(), phase, cash: 50 }, { type: 'deal' });
        expect(exact).toMatchObject({ phase: 'playing', cash: 0 });
        expect(act(exact, { type: 'draw' }).drawnCards.length).toBeGreaterThan(0);
    });

    it('grants the ante reward even at zero cash, then checks the increased ante on Deal', () => {
        const result = settle({ ...ready(), cash: 0, challenges: ready().challenges.map(challenge => challenge.metric === 'rounds' ? { ...challenge, progress: 3 } : challenge), dealsTaken: 4 });
        expect(result.nextState).toMatchObject({ phase: 'deal_over', cash: 0, ante: 50 });
        const opened = act(result.nextState, { type: 'deal' });
        expect(opened).toMatchObject({ phase: 'pack_choice', cash: 0, ante: 50 });
        const returned = finishOpeningPack(opened);
        expect(returned.ante).toBe(100);
        expect(returned.phase).toBe('deal_over');
        expect(act(returned, { type: 'deal' }).phase).toBe('game_over');
    });

    it('rounds each compounded ante to the nearest five dollars', () => {
        expect([50, 100, 175, 290].map(getNextAnte)).toEqual([100, 175, 290, 460]);
    });

    it.each(['enter_gift_shop', 'buy_shop_item', 'restock_shop', 'buy_relic_slot', 'sell_relic', 'enhance_card', 'destroy_card'])('rejects removed action %s', type => {
        const state = ready();
        expect(act(state, { type } as unknown as PlayerAction)).toEqual(state);
    });
});
