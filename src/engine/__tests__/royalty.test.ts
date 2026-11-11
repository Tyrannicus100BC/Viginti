import { afterEach, describe, expect, it } from 'vitest';
import type { Card, Rank } from '../../types';
import { evaluateHandScore } from '../../logic/scoring';
import { generateRaise, generateRaiseChoices, getHandPatterns, getHandPayout, getRaise } from '../../logic/handScoring';
import { createRewardCard, generateRewardCardChoices, getRewardCard } from '../../logic/rewardCards';
import { describeRaiseReward } from '../../logic/rewardDescriptions';
import { generateShopItems } from '../../logic/rewards/generator';
import { createInitialState, processAction } from '../engine';
import { SeededRNG } from '../rng';
import { useGameBridge } from '../../store/gameBridge';

const cards = (ranks: Rank[]): Card[] => ranks.map((rank, i) => ({ id: `royal-${i}`, rank,
    suit: (['hearts', 'clubs', 'spades', 'diamonds'] as const)[i % 4] }));
afterEach(() => useGameBridge.getState().reset());

describe('Royalty base scoring', () => {
    it.each<{ ranks: Rank[]; count: number }>([
        { ranks: [], count: 0 },
        { ranks: ['10'], count: 0 },
        { ranks: ['A', 'K'], count: 0 },
        { ranks: ['9', '10'], count: 0 },
        { ranks: ['A', 'A'], count: 0 },
        { ranks: ['10', 'Q'], count: 1 },
        { ranks: ['J', 'K'], count: 1 },
        { ranks: ['K', 'K'], count: 1 },
        { ranks: ['10', 'Q', 'K'], count: 2 },
        { ranks: ['K', '2', 'J', 'A', '10'], count: 2 },
        { ranks: ['K', 'Q', 'J', '10', 'K'], count: 4 },
    ])('scores $ranks as Royalty ×$count', ({ ranks, count }) => {
        const hand = cards(ranks);
        const rows = evaluateHandScore(hand, false).criteria.filter(row => row.id === 'royalty');
        if (!count) { expect(rows).toEqual([]); return; }
        const qualifying = hand.filter(card => ['10', 'J', 'Q', 'K'].includes(card.rank));
        expect(rows).toMatchObject([{ name: 'Royalty', count, chips: qualifying.length * 10,
            multiplier: expect.closeTo(count * .05), cardIds: qualifying.map(card => card.id) }]);
    });

    it('stacks with pairs, straights and flushes without requiring consecutive placement', () => {
        const hand = cards(['K', 'Q', 'K']);
        hand.forEach(card => { card.suit = 'hearts'; });
        expect(getHandPatterns(hand).map(pattern => pattern.id)).toEqual(['pair', 'flush', 'straight', 'royalty']);
        expect(evaluateHandScore(hand, false).criteria.find(row => row.id === 'royalty')).toMatchObject({ count: 2, chips: 30, multiplier: .1 });
    });

    it.each(['win', 'loss', 'push', 'bust'] as const)('retains Royalty on a %s', outcome => {
        const hand = cards(outcome === 'bust' ? ['10', 'Q', 'K'] : ['10', 'Q']);
        expect(evaluateHandScore(hand, outcome === 'win', false, [], 0, undefined, outcome).criteria.find(row => row.id === 'royalty'))
            .toMatchObject({ count: hand.length - 1, chips: hand.length * 10 });
    });

    it('excludes standalone special cards even when their rank is royal', () => {
        const hand = cards(['10', 'Q', 'K']);
        hand[1].type = 'chip';
        hand[2].type = 'mult';
        expect(getHandPatterns(hand).some(pattern => pattern.id === 'royalty')).toBe(false);
        hand.push({ id: 'jack', rank: 'J', suit: 'diamonds', type: 'standard' });
        expect(getHandPatterns(hand).find(pattern => pattern.id === 'royalty')?.cards.map(card => card.id)).toEqual([hand[0].id, 'jack']);
    });

    it('scales Raises and participating card bonuses, counting card values once', () => {
        const hand = cards(['10', 'Q', 'K', 'A', '2']);
        hand[0].specialEffect = { type: 'chip', value: 7 };
        hand[1].specialEffect = { type: 'mult', value: .04 };
        hand[3].specialEffect = { type: 'chip', value: 99 };
        hand[4].specialEffect = { type: 'mult', value: .99 };
        const upgrades = { 'raise_v10_0_simple_royalty_cash~4': 2, 'raise_v10_0_simple_royalty_mult~3': 1 };
        const row = evaluateHandScore(hand, false, false, [], 0, undefined, 'bust', upgrades).criteria.find(row => row.id === 'royalty')!;
        expect(row).toMatchObject({ count: 2, chips: 60, multiplier: .24, cardIds: hand.slice(0, 3).map(card => card.id) });
        expect(row.breakdown?.reduce((sum, entry) => sum + entry.chips, 0)).toBe(row.chips);
        expect(row.breakdown?.reduce((sum, entry) => sum + entry.multiplier, 0)).toBeCloseTo(row.multiplier);
        const penalty = evaluateHandScore(hand, false, false, [], 0, undefined, 'bust', { 'raise_v10_0_tradeoff_win_cash_royalty_mult~8~3': 1 });
        expect(penalty.criteria.find(row => row.id === 'royalty')?.multiplier).toBe(.12);
    });
});

describe('Royalty rewards', () => {
    it.each(['Common', 'Uncommon', 'Rare'] as const)('rolls cash, multiplier and tradeoff rewards at %s rarity', rarity => {
        const effects = new Set<string>();
        const kinds = new Set<string>();
        for (let seed = 1; seed <= 1000; seed++) {
            const raise = generateRaise(new SeededRNG(seed), rarity);
            for (const affix of raise.affixes!) for (const effect of affix.modifiers) {
                if (effect.handTypeId !== 'royalty') continue;
                expect(getRaise(raise.id)).toEqual(raise);
                kinds.add(affix.kind);
                effects.add(`${effect.chips ? 'cash' : 'mult'}:${effect.chips < 0 || effect.mult < 0 ? 'penalty' : 'bonus'}`);
            }
        }
        expect(effects).toEqual(new Set(['cash:bonus', 'mult:bonus', 'cash:penalty', 'mult:penalty']));
        expect(kinds).toEqual(new Set(rarity === 'Common' ? ['simple', 'tradeoff'] : ['simple', 'tradeoff', 'double']));
    });

    it.each(['average', 'excellent', 'exceptional'] as const)('includes Royalty in Raise offers and mixed rewards at %s quality', quality => {
        const probabilities = createInitialState().deckProbabilities;
        let raises = 0, rewards = 0;
        for (let seed = 1; seed <= 100; seed++) {
            raises += generateRaiseChoices(new SeededRNG(seed), 5, quality).filter(raise => raise.modifiers.some(effect => effect.handTypeId === 'royalty')).length;
            for (const reward of generateRewardCardChoices(new SeededRNG(seed), 6, probabilities, [], quality)) {
                if (reward.rows.some(row => row.kind === 'raise' && getRaise(row.raiseId)?.modifiers.some(effect => effect.handTypeId === 'royalty'))) {
                    expect(getRewardCard(reward.id)).toEqual(reward);
                    rewards++;
                }
            }
        }
        expect(raises).toBeGreaterThan(0);
        expect(rewards).toBeGreaterThan(0);
    });

    it('includes Royalty in direct Raise loot', () => {
        const targets = new Set<string>();
        for (let seed = 1; seed <= 100; seed++) {
            for (const item of generateShopItems([{ type: 'Raise', count: 3 }], [], undefined, new SeededRNG(seed))) {
                getRaise(item.id)?.modifiers.forEach(effect => targets.add(effect.handTypeId));
            }
        }
        expect(targets).toContain('royalty');
    });

    it('applies Royalty reward rows, preserves them through save/load, and scores settlement events', () => {
        const raiseId = 'raise_v10_0_simple_royalty_mult~3';
        const reward = createRewardCard('Common', [{ kind: 'raise', raiseId }, { kind: 'deck', cardId: 'deck_v3_0_0' }]);
        const pending = { ...createInitialState(), phase: 'pack_choice' as const,
            pendingPack: { packId: 'mixed_minor' as const, picksRemaining: 1 }, pendingPackChoices: [reward.id] };
        const chosen = processAction(pending, { type: 'choose_pack_card', cardId: reward.id }).nextState;
        expect(chosen.handUpgrades).toEqual({ [raiseId]: 1 });
        expect(useGameBridge.getState().loadGameState(JSON.stringify(chosen))).toBe(true);
        const loaded = useGameBridge.getState().gameState;
        expect(getHandPayout('royalty', loaded.handUpgrades)).toMatchObject({ chips: 0, mult: .08, count: 1, icon: '/hands/royalty.svg' });
        const hand = cards(['10', 'Q', 'K']);
        const result = processAction({ ...loaded, phase: 'scoring', runningSummary: { chips: 0, mult: 1 },
            playerHands: [{ id: 0, cards: hand, blackjackValue: 30, isBust: true, isHeld: true, outcome: 'bust' }] }, { type: 'score_round' });
        expect(result.events).toContainEqual(expect.objectContaining({ type: 'scoring_row_intro', criterion: expect.objectContaining({ id: 'royalty', count: 2, cardIds: hand.map(card => card.id) }) }));
        expect(result.events).toContainEqual(expect.objectContaining({ type: 'scoring_row_mult', criterionId: 'royalty', multiplier: .16 }));
        expect(describeRaiseReward(getRaise(raiseId)!.modifiers[0])).toBe('Two or more 10s, Jacks, Queens, or Kings. Aces do not qualify. Adds 3% multiplier per qualifying card after the first this run.');
    });

    it('retains the original secondary targets of saved v2 rewards', () => {
        expect(getRaise('raise_v2_1_flush_cash_1_bonus')?.modifiers).toEqual([
            { handTypeId: 'flush', chips: 10, mult: 0 }, { handTypeId: 'win', chips: 0, mult: .05 },
        ]);
        expect(getRaise('raise_v2_2_straight_mult_4_trade')?.modifiers).toEqual([
            { handTypeId: 'straight', chips: 0, mult: .2 }, { handTypeId: 'pair', chips: -5, mult: 0 }, { handTypeId: 'flush', chips: 0, mult: .05 },
        ]);
    });
});
