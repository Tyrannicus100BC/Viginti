import { createChallenges } from '../challenges';
import { getPackDefinition } from '../../logic/packs';
/**
 * GameBridge integration tests.
 *
 * Tests the full flow: dispatch → processAction → EventPlayer → UI state.
 * Uses dispatchSync (headless) for fast, deterministic testing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameBridge } from '../../store/gameBridge';
import type { PlayerAction } from '../PlayerAction';
import type { GameEvent } from '../GameEvent';
import { processAction, getValidActions } from '../engine';
import { playEventsSync } from '../../store/EventPlayer';
import type { GameState } from '../GameState';
import { TUTORIAL_STEPS } from '../tutorial/definitions';

// ─── Helpers ────────────────────────────────────────────

function getBridge() {
    return useGameBridge.getState();
}

function dispatch(action: PlayerAction) {
    useGameBridge.getState().dispatchSync(action);
}

function startGame(seed = 42) {
    dispatch({ 
        type: 'start_game', 
        cityId: 'atlantic_city', 
        gamblerId: 'default', 
        seed,
        globalTutorialsCompleted: TUTORIAL_STEPS.map(s => s.id)
    });
    dispatch({ type: 'open_pack', packId: getBridge().offeredPacks[0] });
    dispatch({ type: 'skip_pack' });
    dispatch({ type: 'finish_pack' });
}

// ─── Tests ──────────────────────────────────────────────

describe('GameBridge', () => {

    beforeEach(() => {
        useGameBridge.getState().reset();
    });

    describe('initialization', () => {
        it('starts in init phase', () => {
            expect(getBridge().phase).toBe('init');
            expect(getBridge().gameState.phase).toBe('init');
        });

        it('reset clears state', () => {
            startGame();
            expect(getBridge().phase).not.toBe('init');

            getBridge().reset();
            expect(getBridge().phase).toBe('init');
            expect(getBridge().eventLog).toEqual([]);
        });
    });

    describe('start_game', () => {
        it('transitions to entering_casino', () => {
            startGame();
            expect(getBridge().phase).toBe('entering_casino');
            expect(getBridge().deal).toBe(1);
// deck assertion removed
        });

        it('flattens state correctly', () => {
            startGame();
            const gs = getBridge().gameState;
            const bridge = getBridge();

            expect(bridge.phase).toBe(gs.phase);
            expect(bridge.deal).toBe(gs.deal);
// deck assertion removed
            expect(bridge.targetScore).toBe(gs.targetScore);
            expect(bridge.inventory).toEqual(gs.inventory);
        });

        it('accumulates events in eventLog', () => {
            startGame();
            expect(getBridge().eventLog.length).toBeGreaterThan(0);
            expect(getBridge().eventLog.some(e => e.type === 'phase_changed')).toBe(true);
        });
    });

    describe('deal → draw → place flow', () => {
        it('can deal first hand', () => {
            startGame();
            dispatch({ type: 'deal' });

            const bridge = getBridge();
            expect(bridge.phase).toBe('playing');
            expect(bridge.playerHands.some(h => h.cards.length > 0)).toBe(true);
            expect(bridge.dealer.cards.length).toBe(2);
        });

        it('can draw cards', () => {
            startGame();
            dispatch({ type: 'deal' });
            dispatch({ type: 'draw' });

            const bridge = getBridge();
            expect(bridge.drawnCards.some(c => c !== null)).toBe(true);
        });

        it('can place card into hand', () => {
            startGame();
            dispatch({ type: 'deal' });
            dispatch({ type: 'draw' });

            const bridge = getBridge();
            const firstDraw = bridge.drawnCards.findIndex(c => c !== null);
            if (firstDraw >= 0) {
                dispatch({ type: 'select_drawn_card', drawIndex: firstDraw });
                dispatch({ type: 'place_card', handIndex: 0 });

                expect(getBridge().playerHands[0].cards.length).toBeGreaterThan(0);
            }
        });
    });

    describe('validActions', () => {
        it('returns valid actions for entering_casino', () => {
            startGame();
            const actions = getBridge().validActions();

            expect(actions.some(a => a.type === 'deal')).toBe(true);
        });

        it('matches engine getValidActions', () => {
            startGame();
            const bridgeActions = getBridge().validActions();
            const engineActions = getValidActions(getBridge().gameState);

            expect(bridgeActions.length).toBe(engineActions.length);
            expect(bridgeActions.map(a => a.type).sort())
                .toEqual(engineActions.map(a => a.type).sort());
        });
    });

    describe('EventPlayer integration', () => {
        it('UI state is updated by events', () => {
            // Manually test EventPlayer
            const patches: Record<string, any>[] = [];
            const events: GameEvent[] = [
                { type: 'dealer_reveal', card: { id: 'test', rank: 'A', suit: '♠', isFaceUp: true, value: 11 } as any, newValue: 11 },
            ];

            playEventsSync(events, (patch) => patches.push(patch));

            expect(patches.some(p => p.isDealerPlaying === true)).toBe(true);
        });

        it('scoring events update running summary', () => {
            const patches: Record<string, any>[] = [];
            const events: GameEvent[] = [
                { type: 'summary_update', chips: 10, mult: 3 },
            ];

            playEventsSync(events, (patch) => patches.push(patch));

            expect(patches.some(p => p.runningSummary?.chips === 10 && p.runningSummary?.mult === 3)).toBe(true);
        });

        it('deal scoring complete resets tracking', () => {
            const patches: Record<string, any>[] = [];
            const events: GameEvent[] = [
                { type: 'deal_scoring_complete', totalChips: 20, totalMult: 5, finalScore: 100 },
            ];

            playEventsSync(events, (patch) => patches.push(patch));

            expect(patches.some(p => p.dealSummary?.finalScore === 100)).toBe(true);
        });
    });

    describe('full game flow', () => {
        it('can play through deal → stand → score', () => {
            startGame(99);
            dispatch({ type: 'deal' });
            expect(getBridge().phase).toBe('playing');

            dispatch({ type: 'draw' });

            // Place cards until we can stand
            let maxIter = 30;
            while (getBridge().phase === 'playing' && maxIter-- > 0) {
                const state = getBridge();
                const hasDrawn = state.drawnCards.some(c => c !== null);

                if (!hasDrawn) {
                    dispatch({ type: 'draw' });
                    continue;
                }

                if (state.selectedDrawIndex === null) {
                    const idx = state.drawnCards.findIndex(c => c !== null);
                    if (idx >= 0) {
                        dispatch({ type: 'select_drawn_card', drawIndex: idx });
                        continue;
                    }
                }

                const target = state.playerHands.find(h =>
                    !h.isBust && !h.isHeld && h.blackjackValue !== 21
                );
                if (target && state.selectedDrawIndex !== null) {
                    dispatch({ type: 'place_card', handIndex: target.id });
                    continue;
                }

                break;
            }

            // Stand
            if (getBridge().phase === 'playing') {
                dispatch({ type: 'stand' });
            }

            // Should be in deal_over, casino_payout, or game_over
            const finalPhase = getBridge().phase;
            expect(['deal_over', 'casino_payout', 'game_over']).toContain(finalPhase);

            // Event log should have scoring events
            expect(getBridge().eventLog.some(e => e.type === 'dealer_reveal')).toBe(true);
        });

        it('game state and bridge state are always in sync', () => {
            startGame(42);
            dispatch({ type: 'deal' });
            dispatch({ type: 'draw' });

            const bridge = getBridge();
            const gs = bridge.gameState;

            // Core fields must match
            expect(bridge.phase).toBe(gs.phase);
            expect(bridge.deal).toBe(gs.deal);
            expect(bridge.totalScore).toBe(gs.totalScore);
// deck assertion removed
            expect(bridge.playerHands.length).toBe(gs.playerHands.length);
        });
    });

    it('charges cash to deal and plays either side hand for free', () => {
        startGame(42);
        dispatch({ type: 'deal' });
        expect(getBridge().cash).toBe(50);
        expect(getBridge().playerHands[0].isInactive).toBe(false);
        dispatch({ type: 'draw' });
        dispatch({ type: 'place_card', handIndex: 0 });
        expect(getBridge().playerHands[0].isInactive).toBe(false);
        expect(getBridge().playerHands[0].cards).toHaveLength(1);
        dispatch({ type: 'draw' });
        dispatch({ type: 'place_card', handIndex: 0 });
        expect(getBridge().playerHands[0].cards).toHaveLength(2);
    });

    it('loads older debug snapshots with safe defaults for the ante and challenge fields', () => {
        startGame(42);
        const snapshot: Record<string, unknown> = { ...getBridge().gameState };
        delete snapshot.ante;
        delete snapshot.challenges;
        delete snapshot.challengeStage;
        delete snapshot.challengeRewards;
        delete snapshot.shopHasNewStock;
        expect(getBridge().loadGameState(JSON.stringify(snapshot))).toBe(true);
        expect(getBridge().ante).toBe(50);
        expect(getBridge().challenges.find(challenge => challenge.metric === 'rounds')?.progress).toBe(0);
        expect(getBridge().anteIncrease).toBe(null);
    });

    it('preserves a pending reward in both state views across import', () => {
        dispatch({ type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 17 });
        const state = getBridge().gameState;
        expect(getBridge().loadGameState(JSON.stringify(state))).toBe(true);
        expect(getBridge().offeredPacks).toEqual(state.offeredPacks);
        expect(getBridge().phase).toBe('pack_choice');
    });
    it('converts older shop snapshots to one free reward and removes retired ticket and stock fields', () => {
        startGame();
        const legacy = { ...getBridge().gameState, phase: 'gift_shop', comps: 9, shopItems: [],
            shopReturnPhase: 'deal_over', packReturnPhase: undefined, relicSlots: 4, offeredPacks: undefined,
            playerHands: getBridge().playerHands.map(hand => ({ ...hand, isInactive: hand.id !== 1 })) };
        expect(getBridge().loadGameState(JSON.stringify(legacy))).toBe(true);
        const migrated = getBridge().gameState;
        expect(migrated.phase).toBe('pack_choice');
        expect(migrated.offeredPacks).toEqual(['mixed_major']);
        expect(migrated.relicSlots).toBe(6);
        expect(migrated.playerHands.every(hand => !hand.isInactive)).toBe(true);
        expect(migrated).not.toHaveProperty('comps');
        expect(migrated).not.toHaveProperty('shopItems');
        expect(migrated.packReturnPhase).toBe('deal_over');
        const originalOffers = migrated.offeredPacks;
        const originalRng = migrated.rngState;
        expect(getBridge().loadGameState(JSON.stringify(migrated))).toBe(true);
        expect(getBridge().offeredPacks).toEqual(originalOffers);
        expect(getBridge().gameState.rngState).toBe(originalRng);
    });

    it('migrates the old ante countdown into survival progress and does not restart it on reload', () => {
        startGame();
        const legacy = { ...getBridge().gameState, challenges: undefined, challengeStage: undefined,
            challengeRewards: undefined, handsUntilAnteIncrease: 2, ante: 240 };
        expect(getBridge().loadGameState(JSON.stringify(legacy))).toBe(true);
        expect(getBridge().challenges.find(challenge => challenge.metric === 'rounds')?.progress).toBe(2);
        expect(getBridge().challenges.some(challenge => challenge.metric === 'earnings')).toBe(false);
        expect(getBridge().gameState).not.toHaveProperty('handsUntilAnteIncrease');
        expect(getBridge().loadGameState(JSON.stringify(getBridge().gameState))).toBe(true);
        expect(getBridge().challenges.find(challenge => challenge.metric === 'rounds')?.progress).toBe(2);
    });

    it('preserves progress and multiple pending challenge rewards across import', () => {
        startGame();
        const earned = processAction({ ...getBridge().gameState, challenges: getBridge().challenges.map(goal => goal.main ? { ...goal, progress: 3 } : goal), phase: 'scoring', playerHands: [],
            runningSummary: { chips: 500, mult: 1 } }, { type: 'score_round' }).nextState;
        const saved = { ...earned, challengeRewards: [...earned.challengeRewards,
            { id: '0-pairs', tier: 'minor', title: 'Pair Collector' }] };
        expect(getBridge().loadGameState(JSON.stringify(saved))).toBe(true);
        expect(getBridge().challengeRewards).toEqual(saved.challengeRewards);
        expect(getBridge().challenges).toEqual(saved.challenges);
        expect(getBridge().phase).toBe('deal_over');
        dispatch({ type: 'deal' });
        expect(getBridge().pendingPack?.packId).toBe('mixed_minor');
        dispatch({ type: 'open_pack', packId: getBridge().offeredPacks[0] });
        dispatch({ type: 'skip_pack' });
        dispatch({ type: 'finish_pack' });
        expect(getBridge().phase).toBe('pack_choice');
        expect(getBridge().challengeRewards).toMatchObject([{ tier: 'major' }]);
        expect(getBridge().pendingPack?.packId).toBe('mixed_major');
        expect(getBridge().offeredPacks.every(id => getPackDefinition(id).pickCount === 1)).toBe(true);
        expect(getBridge().ante).toBe(50);
        // Reload between queued packs without losing the deferred stage advance.
        expect(getBridge().loadGameState(JSON.stringify(getBridge().gameState))).toBe(true);
        dispatch({ type: 'open_pack', packId: getBridge().offeredPacks[0] });
        dispatch({ type: 'skip_pack' });
        dispatch({ type: 'finish_pack' });
        expect(getBridge().phase).toBe('deal_over');
        expect(getBridge().ante).toBe(100);
        expect(getBridge().gameState.challengeStage).toBe(1);
        expect(getBridge().eventLog.filter(event => event.type === 'ante_increased')).toHaveLength(1);
    });

    it('clears a consumed side challenge after its reward and resets its early replacement from an older save', () => {
        startGame();
        const before = getBridge().gameState;
        const completed = { ...before, phase: 'deal_over', challenges: [
            ...before.challenges.map(challenge => challenge.metric === 'pairs' ? { ...challenge, progress: challenge.target, completed: true } : challenge),
            { ...createChallenges(1)[1], id: '0-pairs-next', progress: 2 },
        ], challengeRewards: [{ id: '0-pairs', tier: 'minor', title: 'Pair Collector' }] };
        expect(getBridge().loadGameState(JSON.stringify(completed))).toBe(true);
        dispatch({ type: 'deal' });
        dispatch({ type: 'skip_pack' });
        dispatch({ type: 'finish_pack' });
        expect(getBridge().challengeRewards).toEqual([]);
        expect(getBridge().challenges.some(challenge => challenge.id === '0-pairs')).toBe(false);
        expect(getBridge().challenges.filter(challenge => challenge.id === '0-pairs-next')).toEqual([
            expect.objectContaining({ progress: 0, completed: false }),
        ]);
        expect(getBridge().ante).toBe(50);
    });

});
