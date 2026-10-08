import { describe, it, expect } from 'vitest';
import { createInitialState, processAction, getValidActions } from '../engine';
import type { GameState } from '../GameState';
import { TUTORIAL_STEPS } from '../tutorial/definitions';
import { BASE_ANTE, STARTING_CASH, HANDS_PER_ANTE } from '../economy';

function start(): GameState {
    return processAction(createInitialState(), {
        type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 42,
        globalTutorialsCompleted: TUTORIAL_STEPS.map(s => s.id),
    }).nextState;
}
const act = (state: GameState, action: Parameters<typeof processAction>[1]) => processAction(state, action).nextState;
const card = (id: string) => ({ id, suit: 'hearts' as const, rank: 'K' as const, isFaceUp: true });
const place = (state: GameState, handIndex: number) => act({ ...state,
    drawnCards: [{ ...card(`card-${handIndex}-${state.playerHands[handIndex].cards.length}`), rank: '2' }], selectedDrawIndex: 0,
}, { type: 'place_card', handIndex });

function settle(state: GameState, winningIds: number[]) {
    const hands = state.playerHands.map(h => h.isInactive ? h : {
        ...h, cards: [card(`hand-${h.id}`)], blackjackValue: winningIds.includes(h.id) ? 20 : 10,
    });
    const resolving = { ...state, playerHands: hands, phase: 'resolving_outcomes' as const,
        dealer: { cards: [card('dealer')], blackjackValue: 17, isRevealed: true } };
    return act(act(resolving, { type: 'resolve_hand_outcome' }), { type: 'score_round' });
}

// A scored push lets cadence tests isolate the economy from hand payouts.
function push(state: GameState) {
    return processAction({ ...state, phase: 'scoring', runningSummary: { chips: 0, mult: 1 },
        playerHands: state.playerHands.map(h => h.id === 1 ? { ...h, cards: [card('push')], outcome: 'push', isHeld: true } : h),
    }, { type: 'score_round' });
}

describe('Cash ante and side-hand tickets', () => {
    it('starts with a funded bankroll, ten tickets, and five hands until increase', () => {
        expect(start()).toMatchObject({ comps: 10, cash: STARTING_CASH, ante: BASE_ANTE, handsUntilAnteIncrease: HANDS_PER_ANTE });
    });

    it.each([0, 1, 2, 10])('pays cash and opens only the center when holding %i tickets', comps => {
        const state = { ...start(), comps };
        const result = processAction(state, { type: 'deal' });
        const dealt = result.nextState;
        expect(dealt.comps).toBe(comps);
        expect(dealt.cash).toBe(STARTING_CASH - BASE_ANTE);
        expect(dealt.playerHands.filter(h => !h.isInactive).map(h => h.id)).toEqual([1]);
        expect(dealt.playerHands[1].cards).toHaveLength(1);
        expect(result.events).toContainEqual(expect.objectContaining({ type: 'deal_started', cash: dealt.cash, ante: BASE_ANTE, activeHandIds: [1] }));
        const drawn = act(dealt, { type: 'draw' });
        expect(drawn.comps).toBe(comps);
        expect(getValidActions(drawn).filter(a => a.type === 'place_card')).toHaveLength(comps > 0 ? 3 : 1);
        expect(place(dealt, 1).comps).toBe(comps);
        if (comps === 0) expect(place(dealt, 0).playerHands[0].cards).toHaveLength(0);
    });

    it('charges one ticket for each side hand only on its first placement', () => {
        let state = act(start(), { type: 'deal' });
        for (const [handIndex, remaining] of [[0, 9], [2, 8]]) {
            state = place(state, handIndex);
            expect(state.comps).toBe(remaining);
            expect(state.playerHands[handIndex].isInactive).toBe(false);
            state = place(state, handIndex);
            expect(state.comps).toBe(remaining);
            expect(state.playerHands[handIndex].cards).toHaveLength(2);
        }
    });

    it('allows the last ticket to open one side, blocking the other but allowing free hits', () => {
        const dealt = act({ ...start(), comps: 1 }, { type: 'deal' });
        const opened = place(dealt, 0);
        expect(opened.comps).toBe(0);
        expect(place(opened, 0).playerHands[0].cards).toHaveLength(2);
        expect(place(opened, 2).playerHands[2].cards).toHaveLength(0);
    });

    it('charges the same opening cost when Hold places a saved card', () => {
        const dealt = act(act(start(), { type: 'debug_add_relic', relicId: 'hold' }), { type: 'deal' });
        const targeting = { ...dealt, interactionMode: 'select_hand' as const, activeTableActionId: 'hold', tableActionHeldCards: { hold: card('held') } };
        expect(getValidActions(targeting)).toContainEqual({ type: 'select_table_action_target', handIndex: 0 });
        const placed = act(targeting, { type: 'select_table_action_target', handIndex: 0 });
        expect(placed.comps).toBe(9);
        expect(placed.playerHands[0].isInactive).toBe(false);
        expect(placed.tableActionHeldCards.hold).toBe(null);
        const withoutTickets = { ...targeting, comps: 0 };
        expect(act(withoutTickets, { type: 'select_table_action_target', handIndex: 0 })).toEqual(withoutTickets);
    });

    it.each([0, 1])('auto-stands after center bust only when no side can be opened (%i tickets)', comps => {
        const dealt = act({ ...start(), comps }, { type: 'deal' });
        const ready = { ...dealt, playerHands: dealt.playerHands.map(h => h.id === 1 ? { ...h, cards: [card('a'), card('b')], blackjackValue: 20 } : h), drawnCards: [card('bust')], selectedDrawIndex: 0 };
        const result = processAction(ready, { type: 'place_card', handIndex: 1 });
        expect(result.events.some(e => e.type === 'auto_stand_triggered')).toBe(comps === 0);
    });

    it('cannot redeal during a live hand to erase its result', () => {
        const dealt = act(start(), { type: 'deal' });
        expect(act(dealt, { type: 'deal', forceContinue: true })).toEqual(dealt);
    });

    it('awards exactly one ticket per winning hand and cash separately from bankroll', () => {
        const dealt = place(act(start(), { type: 'deal' }), 0);
        const settled = settle(dealt, [0, 1]);
        expect(settled.comps).toBe(11);
        expect(settled.cash).toBe(dealt.cash + settled.totalScore);
        expect(settled.phase).toBe('deal_over');
        expect(act(settled, { type: 'score_round' })).toEqual(settled);
    });

    it.each([20, 21])('lists and awards one ticket for a winning %i hand', blackjackValue => {
        const state = act(start(), { type: 'deal' });
        const result = processAction({ ...state, phase: 'scoring', playerHands: state.playerHands.map(h => h.id === 1 ? {
            ...h, blackjackValue, cards: blackjackValue === 21 ? [{ ...card('ace'), rank: 'A' }, card('ten')] : [card('ten-a'), { ...card('ten-b'), suit: 'clubs' }], outcome: 'win',
        } : h) }, { type: 'score_round' });
        expect(result.nextState.comps).toBe(state.comps + 1);
        expect(result.events).toContainEqual(expect.objectContaining({ type: 'scoring_row_intro', criterion: expect.objectContaining({ id: blackjackValue === 21 ? 'viginti' : 'win', compTickets: 1 }) }));
    });

    it('keeps playing with no tickets when cash covers the ante', () => {
        const settled = settle(act({ ...start(), cash: BASE_ANTE * 2 + 10, comps: 0 }, { type: 'deal' }), []);
        expect(settled.phase).toBe('deal_over');
        expect(getValidActions(settled).map(a => a.type)).toEqual(['deal', 'enter_gift_shop']);
    });

    it('rejects an unaffordable deal without charging cash or drawing cards', () => {
        const result = processAction({ ...start(), cash: BASE_ANTE - 1, comps: 100 }, { type: 'deal' });
        expect(result.nextState.phase).toBe('game_over');
        expect(result.nextState.cash).toBe(BASE_ANTE - 1);
        expect(result.nextState.dealsTaken).toBe(0);
        expect(result.events.some(e => e.type === 'cards_dealt')).toBe(false);
    });

    it('lets the last cash ante earn enough to continue before checking bankruptcy', () => {
        const dealt = act({ ...start(), cash: BASE_ANTE, comps: 0 }, { type: 'deal' });
        const raised = { ...dealt, handUpgrades: { raise_win_cash: 1 } };
        const settled = settle(raised, [1]);
        expect(settled.cash).toBeGreaterThanOrEqual(BASE_ANTE);
        expect(settled.phase).toBe('deal_over');
    });

    it('ends after losses when cash cannot cover the next ante regardless of tickets', () => {
        const settled = settle(act({ ...start(), cash: BASE_ANTE, comps: 100 }, { type: 'deal' }), []);
        expect(settled.cash).toBe(0);
        expect(settled.comps).toBe(100);
        expect(settled.phase).toBe('game_over');
        expect(getValidActions(settled)).toEqual([]);
    });

    it('increases every five completed deals, after final score, and refreshes stock once', () => {
        let state = { ...start(), cash: 1000 };
        for (let hand = 1; hand <= 10; hand++) {
            state = act(state, { type: 'deal' });
            const result = push(state);
            state = result.nextState;
            expect(state.ante).toBe(BASE_ANTE + Math.floor(hand / 5) * 10);
            expect(state.handsUntilAnteIncrease).toBe(5 - hand % 5);
            if (hand % 5 === 0) {
                const types = result.events.map(e => e.type);
                expect(types.indexOf('ante_increased')).toBeGreaterThan(types.indexOf('deal_scoring_complete'));
                expect(types.indexOf('shop_restocked')).toBeGreaterThan(types.indexOf('ante_increased'));
                expect(state.shopItems).toHaveLength(6);
                const visited = act(act(state, { type: 'enter_gift_shop' }), { type: 'leave_shop' });
                expect(visited.rngState).toBe(state.rngState);
                expect(visited.shopItems).toEqual(state.shopItems);
            } else expect(result.events.some(e => e.type === 'ante_increased' || e.type === 'shop_restocked')).toBe(false);
        }
    });

    it('checks bankruptcy against the increased ante even when the old one is affordable', () => {
        const result = push(act({ ...start(), cash: BASE_ANTE * 2 + 5, handsUntilAnteIncrease: 1 }, { type: 'deal' }));
        expect(result.nextState).toMatchObject({ cash: BASE_ANTE + 5, ante: BASE_ANTE + 10, phase: 'game_over' });
        const types = result.events.map(e => e.type);
        expect(types.indexOf('game_over')).toBeGreaterThan(types.indexOf('ante_increased'));
    });

    it('recharges formerly per-casino actions on increase, after completing the fifth hand', () => {
        const state = act(start(), { type: 'debug_add_relic', relicId: 'redraw' });
        const fifth = act({ ...state, phase: 'deal_over', dealsTaken: 4, handsUntilAnteIncrease: 1, tableActionCharges: { ...state.tableActionCharges, redraw: 0 } }, { type: 'deal' });
        expect(fifth.tableActionCharges.redraw).toBe(0);
        expect(push(fifth).nextState.tableActionCharges.redraw).toBe(3);
    });
});
