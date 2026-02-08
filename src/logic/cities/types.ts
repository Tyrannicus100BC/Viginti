
export interface RewardConfig {
    type: 'Charm' | 'Angle' | 'Card' | 'Action';
    count: number;
    categories?: string[];
    excludeCategories?: string[];
    specificIds?: string[];
    cost?: number;
    forceSpecialCard?: boolean;
}

import type { UnlockCondition } from '../progression';

export interface CityDefinition {
    id: string;
    name: string;
    description: string;
    casinoTargets: number[]; // Scores required to clear each consecutive casino
    getRewards: (casinoIndex: number) => RewardConfig[];
    unlockCondition: UnlockCondition;
}
