import { afterEach, describe, expect, it, vi } from 'vitest';
import { playEvents } from '../EventPlayer';
import type { GameEvent } from '../../engine/GameEvent';

afterEach(() => vi.useRealTimers());

describe('ante increase presentation', () => {
    it('finishes final-score collection, shows a brief popup, then advances the phase', async () => {
        vi.useFakeTimers();
        const patches: Record<string, unknown>[] = [];
        const events: GameEvent[] = [
            { type: 'deal_scoring_complete', totalChips: 25, totalMult: 1, finalScore: 25 },
            { type: 'chip_collection', amount: 25, newTotalScore: 25, newCash: 115 },
            { type: 'ante_increased', previousAnte: 10, ante: 20, handsUntilAnteIncrease: 5 },
            { type: 'phase_changed', from: 'scoring', to: 'deal_over' },
        ];
        const playing = playEvents(events, { updateUI: patch => patches.push(patch), sfx: null, getSpeed: () => 1 });
        await vi.advanceTimersByTimeAsync(1100);
        expect(patches).toContainEqual({ isCollectingChips: false });
        expect(patches.some(patch => patch.anteIncrease)).toBe(false);
        await vi.advanceTimersByTimeAsync(200);
        expect(patches.at(-1)).toMatchObject({ anteIncrease: { previousAnte: 10, ante: 20 }, ante: 20, handsUntilAnteIncrease: 5 });
        expect(patches.some(patch => patch.phase === 'deal_over')).toBe(false);
        await vi.advanceTimersByTimeAsync(1600);
        await playing;
        const show = patches.findIndex(patch => !!patch.anteIncrease);
        const hide = patches.findIndex(patch => patch.anteIncrease === null);
        const phase = patches.findIndex(patch => patch.phase === 'deal_over');
        expect(show).toBeGreaterThan(patches.findIndex(patch => patch.isCollectingChips === false));
        expect(hide).toBeGreaterThan(show);
        expect(phase).toBeGreaterThan(hide);
        expect(patches).toContainEqual(expect.objectContaining({ cash: 115 }));
    });
});
