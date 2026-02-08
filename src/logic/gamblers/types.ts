
import type { Card } from '../../types';
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
    getInitialDeck: () => Card[];
    getInitialRelics: () => RelicInstance[];
    unlockCondition: UnlockCondition;
}
