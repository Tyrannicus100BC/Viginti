import { afterEach, describe, expect, it } from 'vitest';
import { createInitialState, processAction } from '../engine';
import { applyPackCard, getDeckProbabilityRaiseChanges, getPackCard } from '../../logic/packCards';
import { createRewardCard } from '../../logic/rewardCards';
import { normalizeDeckProbabilities } from '../../logic/specialCards';
import { useGameBridge } from '../../store/gameBridge';

const base = createInitialState().deckProbabilities;
const moreHearts = getPackCard('deck_v3_0_0')!;
afterEach(() => useGameBridge.getState().reset());

describe('deck probability tooltip history', () => {
    it('records direct and rebalanced suit changes without changing the original deck', () => {
        const original = JSON.stringify(base);
        const changed = applyPackCard(base, moreHearts);
        const [hearts] = getDeckProbabilityRaiseChanges(changed, { kind: 'suit', target: 'hearts' });
        expect(hearts).toMatchObject({ before: 0.25, description: 'More Hearts', indirect: false });
        expect(hearts.after).toBeCloseTo(0.3);
        const [spades] = getDeckProbabilityRaiseChanges(changed, { kind: 'suit', target: 'spades' });
        expect(spades.before).toBe(0.25);
        expect(spades.after).toBeCloseTo(0.7 / 3);
        expect(spades.indirect).toBe(true);
        expect(getDeckProbabilityRaiseChanges(changed, { kind: 'rank', target: 'ace' })).toEqual([]);
        expect(getDeckProbabilityRaiseChanges(changed, { kind: 'special', target: 'chip' })).toEqual([]);
        expect(JSON.stringify(base)).toBe(original);
    });

    it('keeps repeated upgrades in acquisition order and tracks rank decreases', () => {
        const twice = applyPackCard(applyPackCard(base, moreHearts), moreHearts);
        const changes = getDeckProbabilityRaiseChanges(twice, { kind: 'suit', target: 'hearts' });
        expect(changes).toHaveLength(2);
        expect(changes[0].before).toBeCloseTo(0.25);
        expect(changes[0].after).toBeCloseTo(0.3);
        expect(changes[1].before).toBeCloseTo(0.3);
        expect(changes[1].after).toBeCloseTo(0.35);
        const changed = applyPackCard(twice, getPackCard('deck_v3_0_18')!); // Fewer aces.
        const [aces] = getDeckProbabilityRaiseChanges(changed, { kind: 'rank', target: 'ace' });
        expect(aces.before).toBe(0.1);
        expect(aces.after).toBeCloseTo(0.1 * 2 / 3);
        expect(aces.description).toBe('Fewer Aces');
        expect(aces.indirect).toBe(false);
    });

    it('records special bonuses and indirect changes when their shared budget fills up', () => {
        const changed = applyPackCard({ ...base, specialWeights: [{ type: 'chip', chance: 0.99 }] }, getPackCard('deck_v3_0_36')!);
        expect(getDeckProbabilityRaiseChanges(changed, { kind: 'special', target: 'mult' })[0])
            .toMatchObject({ before: 0, after: 0.05, description: 'More Mult Cards', indirect: false });
        const [cash] = getDeckProbabilityRaiseChanges(changed, { kind: 'special', target: 'chip' });
        expect(cash.indirect).toBe(true);
        expect(cash.after).toBeLessThan(cash.before);
    });

    it('captures mixed reward deck rows and retains their history through save/load', () => {
        const reward = createRewardCard('Common', [{ kind: 'raise', raiseId: 'raise_v10_0_simple_pair_cash~2' },
            { kind: 'deck', cardId: moreHearts.id }]);
        const state = { ...createInitialState(), phase: 'pack_choice' as const,
            pendingPack: { packId: 'mixed_major' as const, picksRemaining: 1 }, pendingPackChoices: [reward.id] };
        const chosen = processAction(state, { type: 'choose_pack_card', cardId: reward.id }).nextState;
        expect(chosen.deckProbabilities.upgradeHistory).toHaveLength(1);
        expect(useGameBridge.getState().loadGameState(JSON.stringify(chosen))).toBe(true);
        expect(useGameBridge.getState().gameState.deckProbabilities).toEqual(chosen.deckProbabilities);
    });

    it('accepts legacy decks without inventing an upgrade history', () => {
        expect(getDeckProbabilityRaiseChanges(normalizeDeckProbabilities(base), { kind: 'suit', target: 'hearts' })).toEqual([]);
        expect(base.upgradeHistory).toBeUndefined();
    });
});
