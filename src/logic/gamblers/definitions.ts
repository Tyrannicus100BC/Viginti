
import type { Card } from '../../types';
import type { GamblerDefinition } from './types';
import { createCard } from '../deck';
import type { DeckProbabilities } from '../engine/GameState';
import { RelicManager } from '../relics/manager'; // We need this to get default properties
import type { RelicInstance } from '../relics/types';

// Helper to get default properties for a relic ID
const getRelicInstance = (id: string, properties: Record<string, any> = {}): RelicInstance => {
    const config = RelicManager.getRelicConfig(id);
    const defaultProps = config?.properties || {};
    return {
        id,
        state: { ...defaultProps, ...properties }
    };
};

const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const BASE_PROBS: DeckProbabilities = {
    suits: { hearts: 25, diamonds: 25, clubs: 25, spades: 25 },
    ranks: { ace: 10, face: 30, upper: 30, lower: 30 },
    specialChance: 0,
    specialWeights: []
};

export const GAMBLER_DEFINITIONS: GamblerDefinition[] = [
    {
        id: 'newbie',
        name: 'The Newbie',
        description: 'Fresh off the bus. Starts with standard distribution and only the Viginti angle.',
        unlockCondition: { type: 'always' },
        getInitialProbabilities: () => ({ ...BASE_PROBS }),
        getInitialRelics: () => [
            getRelicInstance('viginti')
        ]
    },
    {
        id: 'default',
        name: 'The Tourist',
        description: 'Just here for a good time. Starts with standard distribution and the Standard scoring angle.',
        unlockCondition: { type: 'beat_city', cityId: 'atlantic_city' },
        getInitialProbabilities: () => ({ ...BASE_PROBS }),
        getInitialRelics: () => [
            getRelicInstance('viginti'),
            getRelicInstance('standard')
        ]
    },
    {
        id: 'mathematician',
        name: 'The Mathematician',
        description: 'Calculated and precise. Removes all face cards for a number-heavy deck, starting with powerful Straight synergies.',
        unlockCondition: { type: 'beat_city', cityId: 'las_vegas' },
        getInitialProbabilities: () => ({
            ...BASE_PROBS,
            ranks: { ace: 15, face: 5, upper: 40, lower: 40 } // Reduced face, boosted others
        }),
        getInitialRelics: () => [
            getRelicInstance('straight_pair_chips'),
            getRelicInstance('straight_pair_mult'),
            getRelicInstance('straight_triple_chips'),
            getRelicInstance('straight_triple_mult'),
        ]
    },
    {
        id: 'wild',
        name: 'The Wildcard',
        description: 'Chaos incarnate. A distorted deck heavy on high cards. Starts with a small chance for Special Cards.',
        unlockCondition: { type: 'beat_city', cityId: 'las_vegas' },
        getInitialProbabilities: () => ({
            suits: { hearts: 20, diamonds: 20, clubs: 30, spades: 30 },
            ranks: { ace: 20, face: 40, upper: 20, lower: 20 },
            specialChance: 0,
            specialWeights: [
                { type: 'chip', value: 5, chance: 0.04 },
                { type: 'mult', value: 1, chance: 0.03 },
                { type: 'score', value: 5, chance: 0.03 }
            ]
        }),
        getInitialRelics: () => {
            const allRelics = RelicManager.getAllRelics();
            const flushFilter = allRelics
                .filter(r => r.categories.includes('Angle') && r.categories.includes('Flush'))
                .map(r => r.id);

            // Pick 3 unique
            const shuffled = [...flushFilter].sort(() => Math.random() - 0.5);
            const selected = shuffled.slice(0, 3);

            return selected.map(id => getRelicInstance(id));
        }
    },
    {
        id: 'maniac',
        name: 'The Maniac',
        description: 'Driven by high stakes and royalty. Starts with action-oriented charms and high Face Card probability.',
        unlockCondition: { type: 'beat_city', cityId: 'atlantic_city' },
        getInitialProbabilities: () => ({
            ...BASE_PROBS,
            ranks: { ace: 10, face: 50, upper: 20, lower: 20 }
        }),
        getInitialRelics: () => {
            const fixed = [
                getRelicInstance('double_down'),
                getRelicInstance('royalty'),

                getRelicInstance('viginti')
            ];

            const allRelics = RelicManager.getAllRelics();

            const getRandomAngle = (category: string) => {
                const pool = allRelics
                    .filter(r => r.categories.includes('Angle') && r.categories.includes(category))
                    .map(r => r.id);
                return getRandomItem(pool);
            };

            const rankAngle = getRandomAngle('Rank');
            const flushAngle = getRandomAngle('Flush');
            const straightAngle = getRandomAngle('Straight');

            if (rankAngle) fixed.push(getRelicInstance(rankAngle));
            if (flushAngle) fixed.push(getRelicInstance(flushAngle));
            if (straightAngle) fixed.push(getRelicInstance(straightAngle));

            return fixed;
        }
    }
];
