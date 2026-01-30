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
        casinoTargets: [75, 125, 200, 300],
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
        casinoTargets: [600, 2000, 4500, 8000, 15000],
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
        casinoTargets: [800, 2500, 6000, 15000, 35000, 75000, 150000, 300000, 600000, 1000000],
        getRewards: (index) => {
            return [
                { type: 'Card', count: 1, forceSpecialCard: true, cost: 2 },
                { type: 'Charm', count: 2, cost: 5 },
                { type: 'Angle', count: 1, cost: 8 }
            ];
        }
    }
];
