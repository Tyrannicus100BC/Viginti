import type { GameState } from './GameState';
import type { SeededRNG } from './rng';
import { getPlayerBustLimit } from '../logic/scoring';
import type { HandRules } from '../logic/rules';

export interface BossDefinition {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly rules?: HandRules;
    readonly hooks: { readonly getBustLimit?: (value: number) => number };
}
export const BOSS_REGISTRY: readonly BossDefinition[] = [{
    id: 'high_limit', name: 'High Limit',
    description: 'Player and dealer hands bust above 25 for this ante. Exactly 21 still scores its usual bonus.',
    hooks: { getBustLimit: () => 25 },
}, {
    id: 'tight_fit', name: 'Tight Fit',
    description: 'Your hands can hold at most 3 cards.',
    rules: { maxCards: 3 }, hooks: {},
}, {
    id: 'threes_company', name: 'Three’s Company',
    description: 'Your hands need at least 3 cards to win, even when the dealer busts. Card patterns still score normally.',
    rules: { minWinCards: 3 }, hooks: {},
}, {
    id: 'hard_aces', name: 'Hard Aces',
    description: 'Your Aces always count as 1. Dealer Aces and card patterns are unchanged.',
    rules: { hardAces: true }, hooks: {},
}, {
    id: 'dead_hand', name: 'Dead Hand',
    description: 'Busted hands earn no Pair, Straight, Flush, or Royalty payouts.',
    rules: { noBustPatterns: true }, hooks: {},
}, {
    id: 'underhand', name: 'Underhand',
    description: 'Win by finishing below the dealer without busting. Ties lose. A dealer bust still wins for any non-busted hand.',
    rules: { winBelowDealer: true }, hooks: {},
}];
const DEFAULT_HAND_RULES: HandRules = {};
export const isBossStage = (stage: number) => (stage + 1) % 3 === 0;
export const getBoss = (state: Pick<GameState, 'bossId'>) => BOSS_REGISTRY.find(boss => boss.id === state.bossId);
export const getHandRules = (state: Pick<GameState, 'bossId'>): HandRules => getBoss(state)?.rules ?? DEFAULT_HAND_RULES;
export const getDealerBustLimit = (state: Pick<GameState, 'bossId'>) => getBoss(state)?.hooks.getBustLimit?.(21) ?? 21;
export const getBustLimit = (state: Pick<GameState, 'bossId'> & Partial<Pick<GameState, 'inventory'>>) =>
    getPlayerBustLimit(state.inventory ?? [], getDealerBustLimit(state));
export const chooseBoss = (stage: number, rng: SeededRNG): string | null => isBossStage(stage) ? rng.pick(BOSS_REGISTRY).id : null;
