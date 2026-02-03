import type { CityDefinition, RewardConfig } from './types';

// Helper to generate standard rewards
const STANDARD_REWARD_CONFIG: RewardConfig[] = [
    { type: 'Card', count: 1, cost: 1 }, // Standard Card
    { type: 'Card', count: 1, cost: 2, forceSpecialCard: true }, // Special Card
    { type: 'Angle', count: 1, cost: 8 },
    { type: 'Charm', count: 1, cost: 5 }
];

export const CITY_DEFINITIONS: CityDefinition[] = [
    {
        id: 'atlantic_city',
        name: 'Atlantic City', // Tutorial City
        description: 'The Boardwalk Empire. A short trip to get your feet wet.',
        casinoTargets: [75, 110, 165, 240],
        getRewards: (index) => {
            if (index === 1) { // 2nd Reward (after Casino 2)
                return [
                    { type: 'Action', count: 2, specificIds: ['double_down', 'surrender'], cost: 5 }
                ];
            }
            return [
                { type: 'Charm', count: 4, categories: ['Suite', 'Global', 'Cards'], cost: 5 }
            ];
        }
    },
    {
        id: 'las_vegas',
        name: 'Las Vegas', // Complex City
        description: 'The Neon Oasis. A moderate challenge with varied options.',
        casinoTargets: [450, 700, 1100, 1700, 2600, 4000, 6200, 10000],
        getRewards: (index) => {
             return [
                 { 
                     type: 'Charm', 
                     count: 3, 
                     categories: ['Suite', 'Global', 'Cards', 'Rank', 'Flush', 'Straight', 'Dealer', 'Hands'],
                     cost: 5 
                 },
                 {
                     type: 'Angle',
                     count: 1,
                     excludeCategories: ['Triple'],
                     cost: 8
                 }
             ];
        }
    },
    {
        id: 'monte_carlo',
        name: 'Monte Carlo', // Regular City
        description: 'The Royal Casino. The standard by which all others are measured.',
        casinoTargets: [
            600, 1000, 1800, 3200, 5800, 10500, 19000, 35000, 
            65000, 120000, 220000, 400000, 750000, 1400000, 2500000, 5000000
        ],
        getRewards: (index) => {
            return [
                { type: 'Card', count: 1, forceSpecialCard: true, cost: 2 },
                { type: 'Charm', count: 2, cost: 5 },
                { type: 'Angle', count: 1, cost: 8 }
            ];
        }
    }
];
