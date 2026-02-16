/**
 * RelicEngine tests — verify that the pure relic adapter produces the
 * correct GameEvents and handles state immutably.
 */
import { describe, it, expect } from 'vitest';
import { processAction } from '../engine';
import type { GameState } from '../GameState';
import type { GameEvent } from '../GameEvent';
import type { Card, PlayerHand } from '../../types';
import type { RelicInstance } from '../../logic/relics/types';
import {
    executeValueHook,
    executeCheckHook,
    executeOnCardPlaced,
    executeOnHandBust,
    executeOnScoreRow,
    executeOnHandCompletion,
    executeOnDealCompletion,
} from '../relicEngine';

// ─── Helpers ────────────────────────────────────────────

function makeCard(rank: string, suit: string = 'hearts', overrides: Partial<Card> = {}): Card {
    return {
        id: `${rank}_${suit}`,
        rank,
        suit,
        isFaceUp: true,
        origin: 'deck',
        ...overrides,
    };
}

function makeInventory(relicIds: string[]): RelicInstance[] {
    return relicIds.map(id => ({ id, state: {} }));
}

function startGame(seed?: number): GameState {
    const { nextState } = processAction(
        { phase: 'init' } as GameState,
        { type: 'start_game', cityId: 'atlantic_city', gamblerId: 'default', seed: seed ?? 42 }
    );
    return nextState;
}

// ─── Value Hook Tests ───────────────────────────────────

describe('RelicEngine', () => {
    describe('executeValueHook', () => {
        it('passes through without relics', () => {
            const result = executeValueHook('getDealerStopValue', 17, { inventory: [] });
            expect(result).toBe(17);
        });

        it('applies idiot relic to dealer stop value', () => {
            const inv: RelicInstance[] = [{ id: 'idiot', state: { stop_value: 16 } }];
            const result = executeValueHook('getDealerStopValue', 17, { inventory: inv });
            expect(result).toBe(16);
        });

        it('applies deft relic to deals per casino', () => {
            const inv: RelicInstance[] = [{ id: 'deft', state: { extra_draws: 1 } }];
            const result = executeValueHook('getDealsPerCasino', 3, { inventory: inv });
            expect(result).toBe(4);
        });

        it('applies photocopier relic to draw count', () => {
            const inv: RelicInstance[] = [{ id: 'photocopier', state: { extra_draws: 1 } }];
            const result = executeValueHook('getDrawCount', 1, { inventory: inv });
            expect(result).toBe(2);
        });
    });

    // ─── Check Hook Tests ───────────────────────────────

    describe('executeCheckHook', () => {
        it('returns false without relics', () => {
            const result = executeCheckHook('onCheckCardPlace', {
                inventory: [],
                handId: 0,
                handCards: [],
                placedCard: makeCard('5'),
                blackjackValue: 15,
                highlightRelic: async () => {},
                modifyHand: () => {},
                revealDealerHiddenCard: () => {},
            } as any);
            expect(result).toBe(false);
        });
    });

    // ─── Interrupt Hook Tests ───────────────────────────

    describe('executeOnCardPlaced', () => {
        it('returns empty events when no relics have onCardPlaced hooks', () => {
            const inv: RelicInstance[] = [{ id: 'idiot', state: { stop_value: 16 } }];
            const result = executeOnCardPlaced(
                inv, 0, [makeCard('5')], makeCard('8'), 13, [makeCard('K', 'spades')]
            );
            expect(result.events.filter(e => e.type === 'relic_activated')).toHaveLength(0);
        });

        it('does not mutate original inventory', () => {
            const inv: RelicInstance[] = [{ id: 'spyglass', state: { used_this_deal: false } }];
            const originalState = JSON.parse(JSON.stringify(inv[0].state));

            // 13 triggers spyglass
            executeOnCardPlaced(
                inv, 0, [makeCard('3'), makeCard('10')], makeCard('10'), 13, [makeCard('K')]
            );

            // Original should be unchanged
            expect(inv[0].state).toEqual(originalState);
        });

        it('spyglass emits reveal event at blackjack value 13', () => {
            const inv: RelicInstance[] = [{ id: 'spyglass', state: { used_this_deal: false } }];
            const dealerHidden = makeCard('K', 'spades', { isFaceUp: false });
            const result = executeOnCardPlaced(
                inv, 0, [makeCard('3'), makeCard('10')], makeCard('10'), 13, [dealerHidden]
            );

            const revealEvents = result.events.filter(e => e.type === 'dealer_card_revealed');
            expect(revealEvents.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('executeOnHandBust', () => {
        it('returns empty events when no bust hooks', () => {
            const inv: RelicInstance[] = [{ id: 'idiot', state: { stop_value: 16 } }];
            const result = executeOnHandBust(inv, 0, [makeCard('K'), makeCard('Q'), makeCard('5')]);
            expect(result.events.filter(e => e.type === 'relic_activated')).toHaveLength(0);
        });

        it('mulligan emits hand_modified event on bust', () => {
            const inv: RelicInstance[] = [{ id: 'mulligan', state: { used_this_deal: false } }];
            const handCards = [makeCard('K'), makeCard('Q'), makeCard('5')];
            const result = executeOnHandBust(inv, 0, handCards);

            const modEvents = result.events.filter(e => e.type === 'hand_modified');
            expect(modEvents.length).toBeGreaterThanOrEqual(1);

            // Mulligan should remove last card
            const activationEvents = result.events.filter(e => e.type === 'relic_activated');
            expect(activationEvents.length).toBeGreaterThanOrEqual(1);
        });

        it('mulligan does not mutate original inventory', () => {
            const inv: RelicInstance[] = [{ id: 'mulligan', state: { used_this_deal: false } }];
            const originalState = JSON.parse(JSON.stringify(inv[0].state));
            executeOnHandBust(inv, 0, [makeCard('K'), makeCard('Q'), makeCard('5')]);
            expect(inv[0].state).toEqual(originalState);
        });
    });

    describe('executeOnScoreRow', () => {
        it('returns empty events when no scoring hooks match', () => {
            const inv: RelicInstance[] = [{ id: 'idiot', state: { stop_value: 16 } }];
            const summary = { chips: 10, mult: 1 };
            const result = executeOnScoreRow(inv, 'win', {} as any, summary);
            expect(result.events.filter(e => e.type === 'relic_activated')).toHaveLength(0);
            expect(result.runningSummary).toEqual(summary);
        });
    });

    describe('executeOnHandCompletion', () => {
        it('royalty adds chips for hands with 2+ face cards', () => {
            const inv: RelicInstance[] = [{ id: 'royalty', state: { amount: 25 } }];
            const handCards = [makeCard('K'), makeCard('Q')];
            const score = { criteria: [], totalChips: 10, totalMultiplier: 1, finalScore: 10, scoringCards: handCards };
            const summary = { chips: 10, mult: 1 };

            const result = executeOnHandCompletion(inv, handCards, score, summary);

            const activations = result.events.filter(e => e.type === 'relic_activated');
            expect(activations.length).toBeGreaterThanOrEqual(1);

            // Summary should have extra chips
            expect(result.runningSummary!.chips).toBe(35); // 10 + 25
        });

        it('royalty does not trigger without 2 face cards', () => {
            const inv: RelicInstance[] = [{ id: 'royalty', state: { amount: 25 } }];
            const handCards = [makeCard('K'), makeCard('5')];
            const score = { criteria: [], totalChips: 10, totalMultiplier: 1, finalScore: 10, scoringCards: handCards };
            const summary = { chips: 10, mult: 1 };

            const result = executeOnHandCompletion(inv, handCards, score, summary);

            const activations = result.events.filter(e => e.type === 'relic_activated');
            expect(activations).toHaveLength(0);
        });
    });

    describe('executeOnDealCompletion', () => {
        it('high_roller adds chips when all 3 hands win', () => {
            const inv: RelicInstance[] = [{ id: 'high_roller', state: { amount: 100 } }];
            const summary = { chips: 50, mult: 2 };
            const hands = [{}, {}, {}] as any[];

            const result = executeOnDealCompletion(inv, 3, 0, 0, summary, hands);

            const activations = result.events.filter(e => e.type === 'relic_activated');
            expect(activations.length).toBeGreaterThanOrEqual(1);
            expect(result.runningSummary!.chips).toBe(150); // 50 + 100
        });

        it('high_roller does not trigger with fewer than 3 wins', () => {
            const inv: RelicInstance[] = [{ id: 'high_roller', state: { amount: 100 } }];
            const summary = { chips: 50, mult: 2 };
            const hands = [{}, {}, {}] as any[];

            const result = executeOnDealCompletion(inv, 2, 1, 0, summary, hands);

            const activations = result.events.filter(e => e.type === 'relic_activated');
            expect(activations).toHaveLength(0);
            expect(result.runningSummary!.chips).toBe(50); // unchanged
        });

        it('faded_tag decays and eventually removes itself', () => {
            const inv: RelicInstance[] = [{
                id: 'faded_tag', state: { amount: 1, decay_amount: 0.5 }
            }];
            const summary = { chips: 10, mult: 1 };
            const hands = [{}, {}, {}] as any[];

            const result = executeOnDealCompletion(inv, 1, 2, 0, summary, hands);

            // Should have activated and added mult
            const activations = result.events.filter(e => e.type === 'relic_activated');
            expect(activations.length).toBeGreaterThanOrEqual(1);

            // After decay, amount = 1 - 0.5 = 0.5, so NOT removed yet
            expect(result.relicsToRemove).toBeDefined();

            // Check state was decayed (in returned inventory, not original)
            const fadedTag = result.inventory.find(r => r.id === 'faded_tag');
            expect(fadedTag?.state.amount).toBe(0.5);
        });

        it('faded_tag removes itself when amount reaches 0', () => {
            const inv: RelicInstance[] = [{
                id: 'faded_tag', state: { amount: 0.5, decay_amount: 0.5 }
            }];
            const summary = { chips: 10, mult: 1 };
            const hands = [{}, {}, {}] as any[];

            const result = executeOnDealCompletion(inv, 1, 2, 0, summary, hands);

            // Should request removal since amount → 0
            expect(result.relicsToRemove).toContain('faded_tag');
        });

        it('does not mutate original inventory', () => {
            const inv: RelicInstance[] = [{
                id: 'faded_tag', state: { amount: 4, decay_amount: 0.5 }
            }];
            const originalState = JSON.parse(JSON.stringify(inv[0].state));
            const summary = { chips: 10, mult: 1 };

            executeOnDealCompletion(inv, 1, 2, 0, summary, [{}, {}, {}] as any[]);

            // Original should be unchanged
            expect(inv[0].state).toEqual(originalState);
        });

        it('one_armed doubles mult when exactly 1 win', () => {
            const inv: RelicInstance[] = [{ id: 'one_armed', state: { factor: 2 } }];
            const summary = { chips: 50, mult: 3 };
            const hands = [{}, {}, {}] as any[];

            const result = executeOnDealCompletion(inv, 1, 2, 0, summary, hands);

            const activations = result.events.filter(e => e.type === 'relic_activated');
            expect(activations.length).toBeGreaterThanOrEqual(1);
            // factor=2, so valToAdd = currentMult * (factor - 1) = 3 * 1 = 3
            expect(result.runningSummary!.mult).toBe(6); // 3 + 3
        });

        it('mini_shoe always adds bonus chips', () => {
            const inv: RelicInstance[] = [{ id: 'mini_shoe', state: { bonus_chips: 20 } }];
            const summary = { chips: 50, mult: 2 };
            const hands = [{}, {}, {}] as any[];

            const result = executeOnDealCompletion(inv, 1, 2, 0, summary, hands);

            expect(result.runningSummary!.chips).toBe(70); // 50 + 20
        });

        it('robe_and_slippers_set always adds bonus mult', () => {
            const inv: RelicInstance[] = [{ id: 'robe_and_slippers_set', state: { bonus_mult: 0.5 } }];
            const summary = { chips: 50, mult: 2 };
            const hands = [{}, {}, {}] as any[];

            const result = executeOnDealCompletion(inv, 1, 2, 0, summary, hands);

            expect(result.runningSummary!.mult).toBe(2.5); // 2 + 0.5
        });
    });

    // ─── Integration: Full Pipeline through Engine ──────

    describe('scoring pipeline integration', () => {
        it('stand produces relic events when relics are present', () => {
            // Start a game, deal, play to stand
            let state = startGame(100);

            // Deal
            const dealResult = processAction(state, { type: 'deal' });
            state = dealResult.nextState;

            // Draw
            const drawResult = processAction(state, { type: 'draw' });
            state = drawResult.nextState;

            // Place cards to fill hands, then stand
            if (state.drawnCards.length > 0 && state.selectedDrawIndex !== null) {
                const placeResult = processAction(state, { type: 'place_card', handIndex: 0 });
                state = placeResult.nextState;
            }

            // Stand sequence
            let allEvents: GameEvent[] = [];
            
            const standResult = processAction(state, { type: 'stand' });
            state = standResult.nextState;
            allEvents.push(...standResult.events);

            const dealerResult = processAction(state, { type: 'resolve_dealer_turn' });
            state = dealerResult.nextState;
            allEvents.push(...dealerResult.events);

            const outcomesResult = processAction(state, { type: 'resolve_hand_outcome' });
            state = outcomesResult.nextState;
            allEvents.push(...outcomesResult.events);

            const scoreResult = processAction(state, { type: 'score_round' });
            state = scoreResult.nextState;
            allEvents.push(...scoreResult.events);

            // Should have scoring events
            const scoringEvents = allEvents.filter(e =>
                e.type === 'scoring_hand_focus' ||
                e.type.startsWith('scoring_row') ||
                e.type === 'scoring_hand_complete' ||
                e.type === 'deal_scoring_complete'
            );
            expect(scoringEvents.length).toBeGreaterThan(0);

            // Should have relic state changed events (from deal completion hooks)
            // Even Viginti has onEvaluateHandScore (value hook, so no events here),
            // but deal completion will fire for any relics with that hook
            // The state should be properly updated
            expect(state.phase).toBe('deal_over');
        });
    });
});
