import type { HandTypeId } from '../logic/handScoring';
import type { Card } from '../types';

export type Experiment = 'raises' | 'relics' | 'deck';
export type BuildPreset = 'fresh' | 'chips' | 'mult' | 'balanced' | 'pairs';
export type Bot = 'score' | 'simple';

export interface LabConfig {
    experiment: Experiment;
    trials: number;
    seed: number;
    preset: BuildPreset;
    bot: Bot;
    horizon: number;
    relicIds: string[];
    target: string;
}

export const DEFAULT_CONFIG: LabConfig = {
    experiment: 'raises', trials: 1000, seed: 42, preset: 'fresh', bot: 'score',
    horizon: 5, relicIds: [], target: 'all',
};

export const BUILD_PRESETS: { id: BuildPreset; name: string; description: string }[] = [
    { id: 'fresh', name: 'Fresh table', description: 'Base hand payouts. No Raises.' },
    { id: 'chips', name: 'Chip-heavy', description: '+$15 on each of the five scoring categories.' },
    { id: 'mult', name: 'Multiplier-heavy', description: '+15 percentage points on each scoring category.' },
    { id: 'balanced', name: 'Balanced', description: '+$5 and +5 percentage points on each scoring category.' },
    { id: 'pairs', name: 'Pair specialist', description: '+$15 and +15 percentage points on Pair.' },
];

export interface Distribution {
    count: number;
    mean: number;
    median: number;
    p10: number;
    p90: number;
    min: number;
    max: number;
    ci95: number;
    histogram: { low: number; high: number; count: number }[];
}

export interface RoundView {
    seed: number;
    round: number;
    dealer: Card[];
    hands: {
        cards: Card[];
        value: number;
        outcome: string;
        criteria: { name: string; chips: number; mult: number }[];
    }[];
    chips: number;
    mult: number;
    payout: number;
    decisions: string[];
}

export interface Example {
    trial: number;
    delta: number;
    baseline: RoundView[];
    treatment: RoundView[];
}

export interface Comparison {
    id: string;
    name: string;
    description: string;
    category?: HandTypeId;
    stat?: 'cash' | 'mult';
    payout: Distribution;
    delta: Distribution;
    triggerRate: number | null;
    perTrigger: number | null;
    betterRate: number;
    examples: { first: Example; best: Example; worst: Example };
}

export interface LabReport {
    version: 1;
    createdAt: string;
    config: LabConfig;
    elapsedMs: number;
    roundsPlayed: number;
    baseline: Distribution;
    meanChips: number;
    meanMult: number;
    bustRate: number;
    comparisons: Comparison[];
}

export interface LabProgress { completed: number; total: number }
export type WorkerReply = { type: 'progress'; progress: LabProgress }
    | { type: 'complete'; report: LabReport }
    | { type: 'error'; message: string };
