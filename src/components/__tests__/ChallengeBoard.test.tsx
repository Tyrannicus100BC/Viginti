import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChallengeBoard } from '../ChallengeBoard';
import { createInitialState, processAction } from '../../engine/engine';
import { finishOpeningPack } from '../../engine/__tests__/fixtures';
import { useGameBridge } from '../../store/gameBridge';
import type { PlayerHand } from '../../types';
import { completeChallenges } from '../../engine/challenges';

const displayedIds = () => [...renderToStaticMarkup(<ChallengeBoard />).matchAll(/data-challenge-id="([^"]+)"/g)].map(match => match[1]);
// Render the current client snapshot instead of Zustand's initial SSR snapshot.
beforeEach(() => { vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) => getSnapshot()); });
afterEach(() => { vi.restoreAllMocks(); useGameBridge.getState().reset(); });

describe('replacement challenge presentation', () => {
    it('keeps replacements hidden through every minor and major pack until returning to the table', () => {
        const ready = finishOpeningPack(processAction(createInitialState(), {
            type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 42,
        }).nextState);
        const extra = { ...ready.challenges[1], id: 'extra-minor', source: 'pack' as const };
        const completed = completeChallenges([...ready.challenges, extra].map(goal => ({ ...goal, progress: goal.target })));
        const oldIds = completed.challenges.filter(goal => goal.completed).map(goal => goal.id);
        const bridge = useGameBridge.getState();
        bridge.loadGameState(JSON.stringify({ ...ready, phase: 'deal_over',
            challenges: completed.challenges, challengeRewards: completed.rewards }));
        expect(displayedIds()).toEqual(oldIds);
        bridge.dispatchSync({ type: 'deal' });
        for (const packId of ['mixed_minor', 'mixed_minor', 'mixed_major']) {
            expect(useGameBridge.getState().pendingPack?.packId).toBe(packId);
            expect(displayedIds()).toEqual(oldIds);
            bridge.dispatchSync({ type: 'skip_pack' });
            expect(displayedIds()).toEqual(oldIds);
            bridge.dispatchSync({ type: 'finish_pack' });
        }
        expect(useGameBridge.getState().phase).toBe('deal_over');
        expect(displayedIds()).toEqual(['1-rounds', '1-straights']);
    });

    it('shows the completed challenge until returning from its reward, then shows a fresh replacement', () => {
        const ready = finishOpeningPack(processAction(createInitialState(), {
            type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 42,
        }).nextState);
        const hands: PlayerHand[] = [
            { id: 0, cards: [{ id: 'p1', rank: '2', suit: 'clubs' }, { id: 'p2', rank: '2', suit: 'hearts' }],
                blackjackValue: 4, isHeld: true, isBust: false, outcome: 'loss' },
            { id: 1, cards: [{ id: 's1', rank: '4', suit: 'clubs' }, { id: 's2', rank: '5', suit: 'hearts' }],
                blackjackValue: 9, isHeld: true, isBust: false, outcome: 'loss' },
        ];
        const settled = processAction({ ...ready, phase: 'scoring', playerHands: hands,
            runningSummary: { chips: 0, mult: 1 }, challenges: ready.challenges.map(challenge => challenge.main
                ? challenge : { ...challenge, progress: challenge.target - 1 }),
        }, { type: 'score_round' }).nextState;
        const oldId = '0-pairs';
        const nextId = `${oldId}-next`;
        const bridge = useGameBridge.getState();
        expect(bridge.loadGameState(JSON.stringify(settled))).toBe(true);
        expect(displayedIds()).toEqual(['0-rounds', oldId]);
        expect(useGameBridge.getState().challenges.find(challenge => challenge.id === oldId)?.completed).toBe(true);
        expect(useGameBridge.getState().challenges.find(challenge => challenge.id === nextId)).toBeUndefined();

        bridge.dispatchSync({ type: 'deal' });
        expect(useGameBridge.getState().phase).toBe('pack_choice');
        expect(displayedIds()).not.toContain(nextId);
        bridge.dispatchSync({ type: 'skip_pack' });
        expect(displayedIds()).not.toContain(nextId);
        bridge.dispatchSync({ type: 'finish_pack' });
        expect(useGameBridge.getState().phase).toBe('deal_over');
        expect(displayedIds()).toEqual(['0-rounds', nextId]);
        expect(useGameBridge.getState().challenges.find(challenge => challenge.id === nextId)?.progress).toBe(0);
    });
});
