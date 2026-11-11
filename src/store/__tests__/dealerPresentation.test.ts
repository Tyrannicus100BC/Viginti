import { afterEach, describe, expect, it, vi } from 'vitest';
import { playEvents } from '../EventPlayer';
import type { GameEvent } from '../../engine/GameEvent';
import type { Card } from '../../types';
import { animationDuration } from '../../utils/animationTiming';
import { createInitialState, processAction } from '../../engine/engine';

const card: Card = { id: 'dealer-hit', rank: '4', suit: 'clubs', isFaceUp: true, origin: 'deck' };

afterEach(() => vi.useRealTimers());

describe('dealer turn presentation', () => {
    it('deals each hit before marking the hand as standing and preserves stand through scoring', async () => {
        vi.useFakeTimers();
        const patches: Record<string, any>[] = [];
        const playing = playEvents([
            { type: 'dealer_hit', card, newValue: 18, burnedCards: [] },
            { type: 'dealer_stand', value: 18 },
            { type: 'phase_changed', from: 'resolving_outcomes', to: 'scoring' },
        ], { updateUI: patch => patches.push(patch), sfx: null, getSpeed: () => 1 });

        expect(patches[0].dealer({ cards: [], blackjackValue: 14 })).toMatchObject({ cards: [card], blackjackValue: 18 });
        await vi.advanceTimersByTimeAsync(animationDuration(600) - 1);
        expect(patches.some(patch => patch.dealerHasStood === true)).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(patches.at(-1)).toEqual({ dealerHasStood: true });
        await vi.runAllTimersAsync();
        await playing;
        expect(patches.some(patch => patch.dealerHasStood === false)).toBe(false);
        expect(patches.some(patch => 'dealerMessage' in patch || 'dealerMessageExiting' in patch)).toBe(false);
    });

    it('keeps bust sound and shake without creating a separate callout', async () => {
        const patches: Record<string, any>[] = [];
        const play = vi.fn();
        await playEvents([{ type: 'dealer_bust', value: 24 }], {
            updateUI: patch => patches.push(patch), sfx: { play }, getSpeed: () => 1, headless: true,
        });
        expect(play).toHaveBeenCalledWith('bust');
        expect(patches).toEqual([{ isShaking: true }, { isShaking: false }]);
    });

    it.each([
        [18, [21, 21, 20]],
        [24, [21, 21, 20]],
        [18, [25, 21, 20]],
        [24, [25, 21, 20]],
    ])('resolves the third hand immediately after dealer total %s with player totals %j', async (dealerValue, values) => {
        vi.useFakeTimers();
        const patches: Record<string, any>[] = [];
        const play = vi.fn();
        const result = processAction({
            ...createInitialState(), phase: 'resolving_outcomes',
            dealer: { cards: [], blackjackValue: dealerValue, isRevealed: true },
            playerHands: values.map((value, id) => ({
                id, cards: (value === 21 ? ['A', 'K'] : value === 25 ? ['K', 'Q', '5'] : ['K', 'Q'])
                    .map((rank, i) => ({ ...card, id: `hand_${id}_${i}`, rank: rank as Card['rank'] })),
                blackjackValue: value, isHeld: true, isBust: value > 21,
            })),
        }, { type: 'resolve_hand_outcome' });
        const playing = playEvents(result.events, {
            updateUI: patch => patches.push(patch), sfx: { play }, getSpeed: () => 1,
        });

        // No elapsed time: the first presented result belongs to hand three.
        expect(patches[0].playerHands([{ id: 0 }, { id: 1 }, { id: 2 }])).toEqual([
            { id: 0 }, { id: 1 }, { id: 2, outcome: 'win', resultRevealed: true, blackjackValue: 20 },
        ]);
        expect(play.mock.calls).toEqual([['win']]);
        await vi.advanceTimersByTimeAsync(animationDuration(300) - 1);
        expect(patches.some(patch => patch.dealerVisible === false)).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(patches.some(patch => patch.dealerVisible === false)).toBe(true);
        await vi.runAllTimersAsync();
        await playing;
        expect(play.mock.calls).toEqual([['win']]);
    });

    it('clears stand when the next deal begins', async () => {
        const patches: Record<string, any>[] = [];
        const event: GameEvent = { type: 'deal_started', handsRemaining: 3, cash: 100, ante: 50, deal: 2, activeHandIds: [0] };
        await playEvents([event], { updateUI: patch => patches.push(patch), sfx: null, getSpeed: () => 1, headless: true });
        expect(patches[0]).toMatchObject({ dealerHasStood: false, dealer: { cards: [], isRevealed: false } });
    });
});
