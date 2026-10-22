import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, getValidActions, processAction } from '../engine';
import type { GameState } from '../GameState';
import { SeededRNG } from '../rng';
import { advanceChallenges, completeChallenges, createChallenges } from '../challenges';
import { generatePackOffers } from '../actions/packActions';
import { generateRaiseChoices, getRaise } from '../../logic/handScoring';
import { generatePackCardChoices, getPackCard } from '../../logic/packCards';
import { generateRelicPackChoices } from '../../logic/relicPacks';
import { generateChallengeCardChoices, getChallengeCard } from '../../logic/challengeCards';
import { PACK_RARITY_WEIGHTS, type PackId, type PackQuality } from '../../logic/packs';
import { RelicManager } from '../../logic/relics/manager';
import { useGameBridge } from '../../store/gameBridge';
import { finishOpeningPack } from './fixtures';

const act = (state: GameState, action: Parameters<typeof processAction>[1]) => processAction(state, action).nextState;
const start = () => act(createInitialState(), { type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: 42 });
const open = (id: PackId, overrides: Partial<GameState> = {}) => act({ ...start(), ...overrides, pendingPack: null, pendingRaiseChoices: [], pendingPackChoices: [], offeredPacks: [id] }, { type: 'open_pack', packId: id });
const family = (id: string) => getRaise(id) ? 'raise' : getPackCard(id) ? 'deck' : RelicManager.getRelicConfig(id) ? 'relic' : 'unknown';
afterEach(() => { vi.restoreAllMocks(); useGameBridge.getState().reset(); });

const generators = {
    raise: (rng: SeededRNG, quality: PackQuality) => generateRaiseChoices(rng, 1, quality)[0].rarity,
    deck: (rng: SeededRNG, quality: PackQuality) => generatePackCardChoices(rng, 1, createInitialState().deckProbabilities, quality)[0].rarity,
    relic: (rng: SeededRNG, quality: PackQuality) => RelicManager.getRelicConfig(generateRelicPackChoices(rng, 1, [], [], quality)[0])!.rarity,
    challenge: (rng: SeededRNG, quality: PackQuality) => {
        // Challenge metric shuffle and nonce precede the rarity roll.
        vi.spyOn(rng, 'shuffle').mockImplementation(values => [...values]);
        vi.spyOn(rng, 'roll').mockReturnValue(1);
        return generateChallengeCardChoices(rng, 1, 0, quality)[0].rarity;
    },
};

describe.each(Object.entries(generators))('%s pack quality', (_, generate) => {
    it.each(['average', 'excellent', 'exceptional'] as const)('uses %s odds for actual offers', quality => {
        const counts = { Common: 0, Uncommon: 0, Rare: 0 };
        for (let ticket = 0; ticket < 100; ticket++) {
            const rng = new SeededRNG(42);
            vi.spyOn(rng, 'next').mockReturnValueOnce((ticket + .5) / 100);
            counts[generate(rng, quality)]++;
        }
        expect(counts).toEqual(PACK_RARITY_WEIGHTS[quality]);
    });
});

describe('pack variety and mixed choices', () => {
    it('uses fixed major and minor rewards instead of choosing a family', () => {
        expect(generatePackOffers(new SeededRNG(42))).toEqual(['mixed_major']);
        expect(generatePackOffers(new SeededRNG(42), 'minor')).toEqual(['mixed_minor']);
    });

    it.each(['raise', 'deck', 'relic'])('applies a %s chosen from a mixed pack', selectedFamily => {
        const state = open('mixed_basic_exceptional');
        expect(new Set(state.pendingPackChoices.map(family))).toEqual(new Set(['raise', 'deck', 'relic']));
        const id = state.pendingPackChoices.find(id => family(id) === selectedFamily)!;
        const chosen = act(state, { type: 'choose_pack_card', cardId: id });
        if (selectedFamily === 'raise') expect(chosen.handUpgrades[id]).toBe(1);
        if (selectedFamily === 'deck') expect(chosen.deckProbabilities).not.toEqual(state.deckProbabilities);
        if (selectedFamily === 'relic') expect(chosen.inventory.at(-1)?.id).toBe(id);
        expect(chosen.pendingPack).toBeNull();
        expect(act(chosen, { type: 'choose_pack_card', cardId: id })).toEqual(chosen);
    });

    it('keeps other mixed cards available when relic slots are full, including between picks and saves', () => {
        const inventory = RelicManager.getAllRelics().filter(relic => !relic.tableAction).slice(0, 5).map(relic => ({ id: relic.id, state: {} }));
        let state = open('mixed_mega_excellent', { inventory });
        const relic = state.pendingPackChoices.find(id => family(id) === 'relic')!;
        state = act(state, { type: 'choose_pack_card', cardId: relic });
        expect(state.inventory).toHaveLength(6);
        expect(useGameBridge.getState().loadGameState(JSON.stringify(state))).toBe(true);
        state = useGameBridge.getState().gameState;
        const valid = getValidActions(state).filter(action => action.type === 'choose_pack_card');
        expect(valid.length).toBeGreaterThan(0);
        expect(valid.every(action => family(action.cardId) !== 'relic')).toBe(true);
        state = act(state, valid[0]);
        expect(state.pendingPack).toBeNull();
        expect(state.inventory).toHaveLength(6);
    });

    it('fills mixed offers even after the relic pool is exhausted', () => {
        const inventory = RelicManager.getAllRelics().map(relic => ({ id: relic.id, state: {} }));
        const state = open('mixed_mega', { inventory });
        expect(state.pendingPackChoices).toHaveLength(5);
        expect(new Set(state.pendingPackChoices).size).toBe(5);
        expect(state.pendingPackChoices.every(id => family(id) !== 'relic')).toBe(true);
    });
});

describe('acquired challenge goals', () => {
    it.each([
        { rarity: 0, targets: [4, 5, 6] },
        { rarity: 1, targets: [3, 4, 5] },
        { rarity: 2, targets: [5, 7, 8] },
    ])('requires fewer pairs than straights than flushes at rarity $rarity', ({ rarity, targets }) => {
        const metrics = ['pairs', 'straights', 'flushes'];
        const cards = metrics.map(metric => getChallengeCard(`challenge_v1_${metric}_${rarity}_0_1`)!);
        expect(cards.map(card => card.challenge.target)).toEqual(targets);
        cards.forEach((card, index) => expect(card.challenge.description)
            .toBe(`Score ${targets[index]} ${metrics[index]}`));
        expect(cards[0].challenge.target).toBeLessThan(cards[1].challenge.target);
        expect(cards[1].challenge.target).toBeLessThan(cards[2].challenge.target);
    });

    it('adds only selected goals from the opening pack and carries them into the first round', () => {
        let state = open('challenge_mega_exceptional');
        expect(state.challenges).toEqual([]);
        const id = state.pendingPackChoices[0];
        expect(useGameBridge.getState().loadGameState(JSON.stringify(state))).toBe(true);
        state = act(useGameBridge.getState().gameState, { type: 'choose_pack_card', cardId: id });
        expect(state.challenges).toEqual([getChallengeCard(id)!.challenge]);
        state = act(state, { type: 'skip_pack' });
        state = act(state, { type: 'finish_pack' });
        expect(state.challenges).toHaveLength(3);
        expect(state.challenges.at(-1)?.id).toBe(id);
        expect(state.challenges.at(-1)?.progress).toBe(0);
    });

    it('preserves an unfinished extra goal and its progress across a main reward and ante increase', () => {
        const extra = { ...getChallengeCard('challenge_v1_pairs_0_0_1')!.challenge, progress: 2 };
        const board = createChallenges().map(goal => goal.metric === 'rounds' ? { ...goal, progress: goal.target, completed: true } : goal);
        const state = { ...finishOpeningPack(start()), phase: 'pack_choice' as const, packReturnPhase: 'deal_over' as const,
            offeredPacks: [], challenges: [...board, extra], challengeRewards: [{ id: board[0].id, title: board[0].title, tier: 'major' as const }] };
        const returned = act(state, { type: 'finish_pack' });
        expect(returned.ante).toBe(100);
        expect(returned.challenges).toHaveLength(3);
        expect(returned.challenges.at(-1)).toEqual(extra);
    });

    it('awards an acquired rare goal once alongside a main reward without another ante increase', () => {
        const extra = getChallengeCard('challenge_v1_wins_2_0_1')!.challenge;
        const challenges = [...createChallenges(), extra];
        const completion = completeChallenges(advanceChallenges(challenges, { wins: extra.target, rounds: 4 }));
        expect(completion.rewards.map(reward => reward.tier)).toEqual(['major', 'major']);
        expect(completeChallenges(completion.challenges).rewards).toEqual([]);
        const base = finishOpeningPack(start());
        let state: GameState = { ...base, phase: 'deal_over', challenges: completion.challenges, challengeRewards: completion.rewards };
        // Use the normal deal action to enter queued rewards.
        state = act(state, { type: 'deal' });
        while (state.phase === 'pack_choice') state = finishOpeningPack(state);
        expect(state.ante).toBe(100);
        expect(state.challengeStage).toBe(1);
        expect(state.challenges.some(goal => goal.id === extra.id)).toBe(false);
    });

    it('a rare extra goal alone grants a major pack without changing ante or other progress', () => {
        const extra = getChallengeCard('challenge_v1_wins_2_0_1')!.challenge;
        const board = completeChallenges(advanceChallenges([...createChallenges(), extra], { wins: extra.target }));
        const base = finishOpeningPack(start());
        let state: GameState = { ...base, phase: 'deal_over', challenges: board.challenges, challengeRewards: board.rewards };
        state = finishOpeningPack(act(state, { type: 'deal' }));
        expect(state.ante).toBe(50);
        expect(state.challengeStage).toBe(0);
        expect(state.challengeRewards).toEqual([]);
    });
});
