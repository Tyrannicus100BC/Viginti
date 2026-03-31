
import type { Card } from '../../types';
import type { DeckProbabilities } from '../engine/GameState';
import type { RelicInstance } from '../relics/types';
import type { UnlockCondition } from '../progression';

export interface GamblerDefinition {
    id: string;
    name: string;
    description: string;
    metrics?: {
        difficulty: number; // 1-3 maybe?
        complexity: number;
    };
    getInitialProbabilities: () => DeckProbabilities;
    getInitialRelics: () => RelicInstance[];
    unlockCondition: UnlockCondition;
}
