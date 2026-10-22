import type { GameState } from './GameState';
import type { SeededRNG } from './rng';

export interface BossDefinition {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly hooks: { readonly getBustLimit?: (value: number) => number };
}
export const BOSS_REGISTRY: readonly BossDefinition[] = [{
    id: 'high_limit', name: 'High Limit',
    description: 'Player and dealer hands bust above 25 for this ante. Exactly 21 still scores its usual bonus.',
    hooks: { getBustLimit: () => 25 },
}];
export const isBossStage = (stage: number) => (stage + 1) % 3 === 0;
export const getBoss = (state: Pick<GameState, 'bossId'>) => BOSS_REGISTRY.find(boss => boss.id === state.bossId);
export const getBustLimit = (state: Pick<GameState, 'bossId'>) => getBoss(state)?.hooks.getBustLimit?.(21) ?? 21;
export const chooseBoss = (stage: number, rng: SeededRNG): string | null => isBossStage(stage) ? rng.pick(BOSS_REGISTRY).id : null;
