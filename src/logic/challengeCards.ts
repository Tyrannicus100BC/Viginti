import type { Challenge, ChallengeMetric } from '../engine/challenges';
import { PATTERN_CHALLENGE_TARGETS } from '../engine/challenges';
import type { SeededRNG } from '../engine/rng';
import type { RelicRarity } from './relics/types';
import { rollPackRarity, type PackQuality } from './packs';

const METRICS: readonly ChallengeMetric[] = ['rounds', 'earnings', 'pairs', 'straights', 'flushes', 'wins'];
const RARITIES = ['Common', 'Uncommon', 'Rare'] as const;
const TITLES: Record<ChallengeMetric, string> = {
    rounds: 'Encore', earnings: 'Payday', pairs: 'Pair Collector', straights: 'Straight Shooter', flushes: 'Flush Rush', wins: 'Winning Ways',
};
export interface ChallengeCard {
    readonly id: string;
    readonly name: string;
    readonly rarity: RelicRarity;
    readonly challenge: Challenge;
}

/** The complete offer is encoded in its ID, so an unopened choice survives save/resume. */
export function getChallengeCard(id: string): ChallengeCard | undefined {
    const match = /^challenge_v1_(rounds|earnings|pairs|straights|flushes|wins)_([012])_(\d+)_(\d+)$/.exec(id);
    if (!match) return undefined;
    const metric = match[1] as ChallengeMetric;
    const rarity = RARITIES[Number(match[2])];
    const stage = Number(match[3]);
    if (!Number.isSafeInteger(stage) || stage < 0 || !Number.isSafeInteger(Number(match[4]))) return undefined;
    const base = { rounds: 3, earnings: 150 + stage * 100, ...PATTERN_CHALLENGE_TARGETS, wins: 5 }[metric];
    // Uncommon goals are easier; Rare goals pay a major reward for a longer task.
    // Reduce pattern goals by one at Uncommon so adjacent base targets stay distinct.
    const target = rarity === 'Uncommon' && metric in PATTERN_CHALLENGE_TARGETS
        ? base - 1
        : Math.max(1, Math.ceil(base * (rarity === 'Uncommon' ? .65 : rarity === 'Rare' ? 1.25 : 1)));
    const description = metric === 'earnings' ? `Earn $${target.toLocaleString()}`
        : metric === 'rounds' ? `Complete ${target} rounds`
        : metric === 'wins' ? `Win ${target} hands`
        : `Score ${target} ${{ pairs: 'pair', straights: 'straight', flushes: 'flush' }[metric]} hands`;
    return { id, name: TITLES[metric], rarity, challenge: {
        id, title: TITLES[metric], description, metric, target, main: false, source: 'pack',
        rewardTier: rarity === 'Rare' ? 'major' : 'minor', progress: 0, completed: false,
    } };
}

export function generateChallengeCardChoices(rng: SeededRNG, count: number, stage: number, quality: PackQuality = 'average'): ChallengeCard[] {
    const metrics = rng.shuffle(METRICS);
    const nonce = rng.roll(0x100000000);
    return Array.from({ length: count }, (_, index) => {
        const rarity = rollPackRarity(rng.next(), quality);
        return getChallengeCard(`challenge_v1_${metrics[index % metrics.length]}_${RARITIES.indexOf(rarity)}_${stage}_${nonce + index}`)!;
    });
}
