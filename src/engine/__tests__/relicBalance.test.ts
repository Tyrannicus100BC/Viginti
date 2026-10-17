import { finishOpeningPack } from './fixtures';
import { describe, expect, it } from 'vitest';
import { createInitialState, processAction } from '../engine';
import type { GameState } from '../GameState';
import { executeOnCardPlaced, executeOnDealCompletion, executeOnHandBust, executeOnScoreRow, executeValueHook } from '../relicEngine';
import { RelicManager } from '../../logic/relics/manager';
import { generateRelicPackChoices } from '../../logic/relicPacks';
import { generateShopItems } from '../../logic/rewards/generator';
import { evaluateHandScore } from '../../logic/scoring';
import { useGameBridge } from '../../store/gameBridge';
import { SeededRNG } from '../rng';
import type { Card } from '../../types';

const card = (rank: Card['rank'], id: string = rank): Card => ({ id, rank, suit: 'hearts' });
const instance = (id: string) => ({ id, state: { ...RelicManager.getRelicConfig(id)!.properties } });
const act = (state: GameState, action: Parameters<typeof processAction>[1]) => processAction(state, action).nextState;
const start = () => finishOpeningPack(act(createInitialState(), { type: 'start_game', cityId: 'atlantic_city', gamblerId: 'default', seed: 42 }));
const removed = ['flusher', 'soap', 'badge', 'medal', 'ruler', 'protractor', 'old_receipt', 'lucky_rock',
    'burnt_match', 'lost_key', 'feather', 'odd_sock', 'high_roller', 'one_armed', 'royalty', 'key_ring', 'deft'];

describe('relic balance', () => {
    it('removes the requested categories and relics from the catalogue, shops and packs', () => {
        for (const id of removed) expect(RelicManager.getRelicConfig(id)).toBeUndefined();
        for (const relic of RelicManager.getAllRelics()) {
            expect(relic.categories.some(category => ['Rank', 'Flush', 'Straight', 'Suit', 'Suite', 'Hands'].includes(category))).toBe(false);
        }
        const packs = generateRelicPackChoices(new SeededRNG(42), 100, []);
        const shop = generateShopItems([{ type: 'Relic', count: 100 }], [], undefined, new SeededRNG(42));
        expect(packs.length).toBe(RelicManager.getAllRelics().length);
        expect([...packs, ...shop.map(item => item.id)].some(id => removed.includes(id))).toBe(false);
    });

    it.each([
        ['star_bead', ['9', '8'], 0.2, 'win'],
        ['star_bead', ['9', '9'], 0.4, 'win'],
        ['star_bead', ['9', '8', '4'], 0.2, 'viginti'],
        ['heart_button', ['10', '4'], 0.2, 'win'],
        ['heart_button', ['10', '7', '4'], 0.2, 'viginti'],
        ['lucky_acorn', ['K', '8'], 0.2, 'win'],
        ['lucky_acorn', ['K', 'K'], 0.4, 'win'],
        ['lucky_acorn', ['A', 'K'], 0.2, 'viginti'],
    ] as const)('%s adds its bonus for %s to the outcome row', (id, ranks, bonus, outcomeId) => {
        const cards = ranks.map((rank, index) => card(rank, `${index}`));
        const inventory = [instance(id)];
        const base = evaluateHandScore(cards, true);
        const score = evaluateHandScore(cards, true, false, inventory);
        expect(score.criteria.map(row => row.id)).toEqual(base.criteria.map(row => row.id));
        expect(score.criteria.find(row => row.id === outcomeId)?.multiplier).toBeCloseTo(base.criteria.find(row => row.id === outcomeId)!.multiplier + bonus);
        expect(score.totalMultiplier).toBeCloseTo(base.totalMultiplier + bonus);
        const summary = { chips: score.totalChips, mult: score.totalMultiplier };
        const highlighted = executeOnScoreRow(inventory, outcomeId, score, summary);
        expect(highlighted.events).toContainEqual(expect.objectContaining({ type: 'relic_activated', relicId: id }));
        expect(highlighted.runningSummary).toEqual(summary);
        for (const outcome of ['loss', 'push', 'bust'] as const) {
            expect(evaluateHandScore(cards, false, false, inventory, 0, undefined, outcome))
                .toEqual(evaluateHandScore(cards, false, false, [], 0, undefined, outcome));
        }
    });

    it('stacks card relics and Raises on Viginti without extra relic rows', () => {
        const inventory = ['star_bead', 'heart_button', 'lucky_acorn'].map(instance);
        const cards = [card('9'), card('K'), card('2')];
        const score = evaluateHandScore(cards, true, false, inventory, 0, undefined, 'win', { raise_win_mult: 1 });
        expect(score.criteria.map(row => row.id)).toEqual(['viginti', 'flush']);
        expect(score.criteria[0]).toMatchObject({ id: 'viginti', multiplier: 1 });
    });

    it('Faded Tag supplies five rounds of decaying multiplier then expires exactly', () => {
        let inventory = [instance('faded_tag')];
        for (const amount of [0.5, 0.4, 0.3, 0.2, 0.1]) {
            const before = inventory[0].state.amount;
            const result = executeOnDealCompletion(inventory, 1, 0, 0, { chips: 10, mult: 1 }, []);
            expect(result.runningSummary?.mult).toBeCloseTo(1 + amount);
            expect(inventory[0].state.amount).toBe(before);
            inventory = result.inventory;
            expect(result.relicsToRemove?.includes('faded_tag')).toBe(amount === 0.1);
        }
        expect(inventory[0].state.amount).toBe(0);
    });

    it.each([
        ['robe_and_slippers_set', 0.2], ['cozy_socks', 0.1],
    ] as const)('%s adds a flat %s and activates the owned relic each round', (id, bonus) => {
        const inventory = [instance(id)];
        for (const [wins, losses, vigintis] of [[3, 0, 1], [0, 3, 0]]) {
            const result = executeOnDealCompletion(inventory, wins, losses, vigintis, { chips: 50, mult: 3 }, []);
            expect(result.runningSummary).toEqual({ chips: 50, mult: 3 + bonus });
            expect(result.events).toContainEqual(expect.objectContaining({ type: 'relic_activated', relicId: id }));
            expect(result.inventory).toEqual(inventory);
        }
    });

    it('Faded Bill pays $50, $40, $30, $20 and $10 before expiring', () => {
        let state: GameState = { ...start(), cash: 1000, inventory: [instance('faded_bill')] };
        for (const amount of [50, 40, 30, 20, 10]) {
            const before = state;
            const result = processAction({ ...state, phase: 'scoring', runningSummary: { chips: 10, mult: 2 }, playerHands: [] }, { type: 'score_round' });
            state = result.nextState;
            expect(state.cash).toBe(before.cash + (10 + amount) * 2);
            expect(before.inventory[0].state.amount).toBe(amount);
            expect(result.events).toContainEqual(expect.objectContaining({ type: 'relic_activated', relicId: 'faded_bill' }));
            if (amount > 10) expect(state.inventory[0].state.amount).toBe(amount - 10);
            else {
                expect(state.inventory).toEqual([]);
                expect(result.events).toContainEqual({ type: 'relic_removed', relicId: 'faded_bill' });
            }
        }
    });

    it('Cozy Socks stacks with Robe and Slippers as a separate relic', () => {
        const result = executeOnDealCompletion(['cozy_socks', 'robe_and_slippers_set'].map(instance), 1, 2, 0, { chips: 50, mult: 3 }, []);
        expect(result.runningSummary?.mult).toBeCloseTo(3.3);
        expect(result.events.filter(event => event.type === 'relic_activated').map(event => event.relicId))
            .toEqual(['cozy_socks', 'robe_and_slippers_set']);
    });

    it('Photocopier counts actual draws across rounds, without mutating earlier states or consuming rejected draws', () => {
        let state = act({ ...start(), cash: 10000 }, { type: 'debug_add_relic', relicId: 'photocopier' });
        for (const expected of [1, 2, 1, 2]) {
            state = act(state, { type: 'deal' });
            const before = state;
            const countBefore = state.inventory[0].state.draws_taken;
            state = act(state, { type: 'draw' });
            expect(state.drawnCards).toHaveLength(expected);
            expect(before.inventory[0].state.draws_taken).toBe(countBefore);
            expect(act(state, { type: 'draw' })).toEqual(state);
            state = act({ ...state, phase: 'scoring', runningSummary: { chips: 0, mult: 1 }, playerHands: [] }, { type: 'score_round' });
        }
    });

    it('Second Chance gives one extra card on the next draw and no extra placements', () => {
        const inventory = [instance('second_chance')];
        expect(executeValueHook('getDrawCount', 1, { inventory })).toBe(1);
        const bust = executeOnHandBust(inventory, 1, [card('K'), card('Q'), card('5')]);
        expect(inventory[0].state.pending_bonus).toBe(false);
        for (let preview = 0; preview < 2; preview++) {
            expect(executeValueHook('getDrawCount', 1, { inventory: bust.inventory, dryRun: true })).toBe(2);
        }
        expect(executeValueHook('getDrawCount', 1, { inventory: bust.inventory })).toBe(2);
        expect(executeValueHook('getPlaceCount', 1, { inventory: bust.inventory })).toBe(1);
        expect(executeValueHook('getDrawCount', 1, { inventory: bust.inventory })).toBe(1);
    });

    it('Safety Net discards the first 20, enhances winning rows once and resets each round', () => {
        const cards = [card('K'), card('Q')];
        const inventory = [instance('safety_net')];
        const trigger = executeOnCardPlaced(inventory, 1, cards, cards[1], 20, []);
        expect(trigger.events).toContainEqual(expect.objectContaining({ type: 'hand_modified', newCards: [] }));
        expect(trigger.events).toContainEqual(expect.objectContaining({ type: 'relic_activated', relicId: 'safety_net' }));
        expect(trigger.inventory[0].state.armed).toBe(true);
        expect(executeOnCardPlaced(trigger.inventory, 1, cards, cards[1], 20, []).events.some(event => event.type === 'hand_modified')).toBe(false);
        for (const winningCards of [cards, [card('A'), card('K')]]) {
            const base = evaluateHandScore(winningCards, true);
            const score = evaluateHandScore(winningCards, true, false, trigger.inventory);
            expect(score.criteria.map(row => row.id)).toEqual(base.criteria.map(row => row.id));
            expect(score.criteria[0].multiplier).toBeCloseTo(base.criteria[0].multiplier + 0.1);
            const summary = { chips: 50, mult: 2 };
            expect(executeOnScoreRow(trigger.inventory, score.criteria[0].id, score, summary).runningSummary).toEqual(summary);
        }
        expect(evaluateHandScore(cards, false, false, trigger.inventory, 0, undefined, 'loss')).toEqual(evaluateHandScore(cards, false, false, [], 0, undefined, 'loss'));
        expect(executeOnDealCompletion(trigger.inventory, 1, 0, 0, { chips: 10, mult: 1 }, []).inventory[0].state.armed).toBe(false);
    });

    it('settles card and Safety Net bonuses once on the Win row', () => {
        const safety = instance('safety_net');
        safety.state.armed = true;
        const state: GameState = { ...start(), phase: 'scoring', cash: 10000,
            inventory: [instance('lucky_acorn'), safety], runningSummary: { chips: 0, mult: 1 },
            playerHands: [{ id: 1, cards: [card('K'), { ...card('8'), suit: 'spades' }], blackjackValue: 18, isBust: false, isHeld: true, outcome: 'win' }] };
        const result = processAction(state, { type: 'score_round' });
        expect(result.nextState.cash).toBe(10013);
        expect(result.events.filter(event => event.type === 'scoring_row_mult')).toEqual([
            { type: 'scoring_row_mult', handIndex: 0, criterionId: 'win', multiplier: 0.3 },
        ]);
        expect(result.events).toContainEqual({ type: 'deal_scoring_complete', totalChips: 10, totalMult: 1.3, finalScore: 13 });
    });

    it('imports the new balance while preserving progress, charge depletion and remaining pack choices', () => {
        const legacy: GameState = { ...start(), inventory: [
            { id: 'faded_tag', state: { amount: 0.3, decay_amount: 0.5 } },
            { id: 'faded_bill', state: { amount: 20, decay_amount: 10 } },
            { id: 'lucky_acorn', state: { bonus_mult: 1 } },
            { id: 'safety_net', state: { bonus_chips: 20, armed: true } },
            { id: 'second_chance', state: { extra_draw: 2, extra_place: 1, pending_bonus: true, active_bonus: true } },
            { id: 'photocopier', state: { extra_draws: 1, draws_taken: 3 } },
            { id: 'redraw', state: { rounds_since_recharge: 1 } },
            { id: 'deft', state: { extra_draws: 1 } },
        ], tableActionCharges: { redraw: 0 },
            pendingPack: { packId: 'relic_basic', picksRemaining: 1 }, pendingPackChoices: ['badge', 'star_bead'] };
        expect(useGameBridge.getState().loadGameState(JSON.stringify(legacy))).toBe(true);
        const loaded = useGameBridge.getState().gameState;
        const states = Object.fromEntries(loaded.inventory.map(relic => [relic.id, relic.state]));
        expect(states.faded_tag).toEqual({ amount: 0.3, decay_amount: 0.1 });
        expect(states.faded_bill).toEqual({ amount: 20, decay_amount: 10 });
        expect(states.lucky_acorn.bonus_mult).toBe(0.2);
        expect(states.safety_net).toEqual({ bonus_mult: 0.1, armed: true });
        expect(states.second_chance).toEqual({ extra_draw: 1, pending_bonus: true });
        expect(states.photocopier.draws_taken).toBe(3);
        expect(states.redraw.rounds_since_recharge).toBe(1);
        expect(loaded.tableActionCharges.redraw).toBe(0);
        expect(states.deft).toBeUndefined();
        expect(loaded.pendingPackChoices).toEqual(['star_bead']);
        expect(useGameBridge.getState().loadGameState(JSON.stringify(loaded))).toBe(true);
        expect(useGameBridge.getState().gameState.inventory).toEqual(loaded.inventory);
    });

    it.each(['double_down', 'surrender', 'discard', 'redraw', 'hold', 'switch'])('%s starts fully charged when selected from a pack', id => {
        const config = RelicManager.getRelicConfig(id)!;
        const pack: GameState = { ...start(), phase: 'pack_choice', pendingPack: { packId: 'relic_basic', picksRemaining: 1 }, pendingPackChoices: [id] };
        const chosen = act(pack, { type: 'choose_pack_card', cardId: id });
        expect(chosen.tableActionCharges[id]).toBe(config.tableAction!.maxCharges);
        expect(chosen.inventory[0].state.rounds_since_recharge).toBe(0);
    });
});
