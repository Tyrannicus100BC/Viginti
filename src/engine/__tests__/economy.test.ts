import { describe, it, expect } from 'vitest';
import { createInitialState, processAction, getValidActions } from '../engine';
import type { GameState } from '../GameState';
import { TUTORIAL_STEPS } from '../tutorial/definitions';
import { BASE_ANTE, STARTING_CASH, getNextAnte } from '../economy';
import { getRelicSellCashValue } from '../../logic/rewards/generator';

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
    it.each([[50, 75], [75, 115], [115, 175], [175, 265]])('rounds the 50%% increase from $%i to the nearest $5 ($%i)', (ante, next) => {
        expect(getNextAnte(ante)).toBe(next);
    });

    it('starts with a funded bankroll, five tickets, four rounds until increase, and no new stock badge', () => {
        expect(createInitialState().shopHasNewStock).toBe(false);
        expect(start()).toMatchObject({ comps: 5, cash: STARTING_CASH, ante: BASE_ANTE, handsUntilAnteIncrease: 4, shopHasNewStock: false });
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
        for (const [handIndex, remaining] of [[0, 4], [2, 3]]) {
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
        expect(placed.comps).toBe(4);
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
        expect(settled.comps).toBe(6);
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
        expect(result.events).toContainEqual(expect.objectContaining({ type: 'scoring_row_intro', newComps: state.comps + 1, criterion: expect.objectContaining({ id: blackjackValue === 21 ? 'viginti' : 'win', compTickets: 1 }) }));
        const reward = result.events.findIndex(event => event.type === 'comps_earned');
        expect(result.events[reward - 1]).toMatchObject({ type: 'scoring_row_intro', criterion: { compTickets: 1 } });
        expect(reward).toBeLessThan(result.events.findIndex(event => event.type === 'chip_collection'));
    });

    it('keeps playing with no tickets when cash covers the ante', () => {
        const settled = settle(act({ ...start(), cash: BASE_ANTE * 2 + 10, comps: 0 }, { type: 'deal' }), []);
        expect(settled.phase).toBe('deal_over');
        expect(getValidActions(settled).map(a => a.type)).toEqual(['deal', 'enter_gift_shop']);
    });

    it.each(['entering_casino', 'deal_over'] as const)('ends on an unaffordable Deal from %s without charging cash or drawing cards', phase => {
        const state = { ...start(), phase, cash: BASE_ANTE - 1, comps: 100 };
        expect(getValidActions(state)).toEqual([{ type: 'deal' }, { type: 'enter_gift_shop' }]);
        const result = processAction(state, { type: 'deal' });
        expect(result.nextState.phase).toBe('game_over');
        expect(result.nextState.cash).toBe(BASE_ANTE - 1);
        expect(result.nextState.dealsTaken).toBe(0);
        expect(result.nextState.rngState).toBe(state.rngState);
        expect(result.events).toContainEqual({ type: 'game_over', won: false, finalScore: state.totalScore });
        expect(result.events.some(e => e.type === 'cards_dealt')).toBe(false);
    });

    it.each(['entering_casino', 'deal_over'] as const)('plays at zero cash after paying an exact ante from %s', phase => {
        for (const ante of [50, 65, 80]) {
            const state = { ...start(), phase, cash: ante, ante, comps: 0 };
            expect(getValidActions(state)).toContainEqual({ type: 'deal' });
            const result = processAction(state, { type: 'deal' });
            expect(result.nextState).toMatchObject({ phase: 'playing', cash: 0, ante });
            expect(result.events.some(event => event.type === 'game_over')).toBe(false);
            expect(result.events).toContainEqual(expect.objectContaining({ type: 'deal_started', cash: 0, ante }));
            const drawn = act(result.nextState, { type: 'draw' });
            expect(drawn).toMatchObject({ phase: 'playing', cash: 0 });
            expect(drawn.drawnCards.some(card => card !== null)).toBe(true);
            expect(getValidActions(drawn)).toContainEqual({ type: 'place_card', handIndex: 1 });
        }
    });

    it.each(['entering_casino', 'deal_over'] as const)('returns from the shop with exactly the ante and can pay down to zero (%s)', shopReturnPhase => {
        const state = { ...start(), phase: 'gift_shop' as const, shopReturnPhase, cash: 65, ante: 65 };
        const returned = processAction(state, { type: 'leave_shop' });
        expect(returned.nextState.phase).toBe(shopReturnPhase);
        expect(returned.events.some(event => event.type === 'game_over')).toBe(false);
        expect(act(returned.nextState, { type: 'deal' })).toMatchObject({ phase: 'playing', cash: 0 });
    });

    it('lets the last cash ante earn enough to continue before checking bankruptcy', () => {
        const dealt = act({ ...start(), cash: BASE_ANTE, comps: 0 }, { type: 'deal' });
        const raised = { ...dealt, handUpgrades: { raise_win_cash: 1 } };
        const settled = settle(raised, [1]);
        expect(settled.cash).toBeGreaterThanOrEqual(BASE_ANTE);
        expect(settled.phase).toBe('deal_over');
    });

    it('waits for Deal after losses when cash cannot cover the next ante regardless of tickets', () => {
        const settled = settle(act({ ...start(), cash: BASE_ANTE, comps: 100 }, { type: 'deal' }), []);
        expect(settled.cash).toBe(0);
        expect(settled.comps).toBe(100);
        expect(settled.phase).toBe('deal_over');
        expect(getValidActions(settled)).toEqual([{ type: 'deal' }, { type: 'enter_gift_shop' }]);
        expect(act(settled, { type: 'deal' }).phase).toBe('game_over');
    });

    it('lets players sell a relic after losing to afford another deal', () => {
        const owned = act(start(), { type: 'debug_add_relic', relicId: 'hold' });
        const refund = getRelicSellCashValue('hold');
        const ante = 80;
        // Leave one relic sale's worth missing after the ante and $10 loss.
        const settled = settle(act({ ...owned, ante, cash: ante * 2 - refund + 10 }, { type: 'deal' }), []);
        expect(settled).toMatchObject({ phase: 'deal_over', cash: ante - refund });
        const inShop = act(settled, { type: 'enter_gift_shop' });
        const index = inShop.inventory.findIndex(relic => relic.id === 'hold');
        expect(getValidActions(inShop)).toContainEqual({ type: 'sell_relic', relicId: 'hold', index });
        const sold = act(inShop, { type: 'sell_relic', relicId: 'hold', index });
        expect(sold.cash).toBe(ante);
        expect(sold.inventory.some(relic => relic.id === 'hold')).toBe(false);
        const back = act(sold, { type: 'leave_shop' });
        expect(back.phase).toBe('deal_over');
        expect(act(back, { type: 'deal' })).toMatchObject({ phase: 'playing', cash: 0, dealsTaken: 2 });
    });

    it('compounds the ante every four completed deals, after final score, and refreshes stock once', () => {
        let state = { ...start(), cash: 10000 };
        const antes = [50, 75, 115, 175, 265];
        for (let hand = 1; hand <= 16; hand++) {
            state = act(state, { type: 'deal' });
            const result = push(state);
            state = result.nextState;
            expect(state.ante).toBe(antes[Math.floor(hand / 4)]);
            expect(state.handsUntilAnteIncrease).toBe(4 - hand % 4);
            expect(state.shopHasNewStock).toBe(hand >= 4);
            if (hand % 4 === 0) {
                const types = result.events.map(e => e.type);
                expect(types.indexOf('ante_increased')).toBeGreaterThan(types.indexOf('deal_scoring_complete'));
                expect(types.indexOf('shop_restocked')).toBeGreaterThan(types.indexOf('ante_increased'));
                expect(state.shopItems).toHaveLength(6);
                const visited = act(act(state, { type: 'enter_gift_shop' }), { type: 'leave_shop' });
                expect(visited.shopHasNewStock).toBe(false);
                expect(visited.rngState).toBe(state.rngState);
                expect(visited.shopItems).toEqual(state.shopItems);
            } else expect(result.events.some(e => e.type === 'ante_increased' || e.type === 'shop_restocked')).toBe(false);
        }
    });

    it('waits for Deal to check the increased ante even when the old one is affordable', () => {
        const result = push(act({ ...start(), cash: BASE_ANTE * 2 + 5, handsUntilAnteIncrease: 1 }, { type: 'deal' }));
        expect(result.nextState).toMatchObject({ cash: BASE_ANTE + 5, ante: 75, phase: 'deal_over' });
        expect(result.events.some(event => event.type === 'game_over')).toBe(false);
        expect(act(result.nextState, { type: 'deal' }).phase).toBe('game_over');
    });

    it.each(['double_down', 'surrender', 'discard', 'redraw', 'hold', 'switch'])('refills %s every two owned rounds independently of the ante', relicId => {
        let state = act({ ...start(), cash: 10000, handsUntilAnteIncrease: 1 }, { type: 'debug_add_relic', relicId });
        const capacity = state.tableActionCharges[relicId];
        for (let round = 1; round <= 4; round++) {
            state = act({ ...state, tableActionCharges: { ...state.tableActionCharges, [relicId]: 0 } }, { type: 'deal' });
            expect(state.tableActionCharges[relicId]).toBe(0);
            const before = state;
            const result = push(state);
            state = result.nextState;
            expect(state.tableActionCharges[relicId]).toBe(round % 2 === 0 ? capacity : 0);
            expect(before.inventory.find(relic => relic.id === relicId)?.state.rounds_since_recharge).toBe((round - 1) % 2);
            expect(result.events.some(event => event.type === 'charge_gained' && event.relicId === relicId && event.reason === 'rounds')).toBe(round % 2 === 0);
        }
    });

    it('keeps unvisited new stock badged across rounds, clears it on a visit and badges the next refresh', () => {
        let state = { ...start(), cash: 10000 };
        for (let round = 1; round <= 5; round++) {
            state = push(act(state, { type: 'deal' })).nextState;
        }
        expect(state.shopHasNewStock).toBe(true);
        const inShop = act(state, { type: 'enter_gift_shop' });
        expect(inShop.shopHasNewStock).toBe(false);
        state = act(inShop, { type: 'leave_shop' });
        expect(state.shopHasNewStock).toBe(false);
        state = act(act(state, { type: 'enter_gift_shop' }), { type: 'leave_shop' });
        expect(state.shopHasNewStock).toBe(false);
        for (let round = 6; round <= 8; round++) {
            state = push(act(state, { type: 'deal' })).nextState;
            expect(state.shopHasNewStock).toBe(round === 8);
        }
        expect(act(state, { type: 'start_game', cityId: 'las_vegas', gamblerId: 'default' }).shopHasNewStock).toBe(false);
    });
});
