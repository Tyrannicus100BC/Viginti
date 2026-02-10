import type { CityDefinition, RewardConfig, ShopPriceOverrides } from './types';

// Helper to generate standard rewards
const STANDARD_REWARD_CONFIG: RewardConfig[] = [
    { type: 'TableAction', count: 1 },
    { type: 'Angle', count: 1 },
    { type: 'Charm', count: 3 }
];

export const CITY_DEFINITIONS: CityDefinition[] = [
    {
        id: 'atlantic_city',
        name: 'Atlantic City', // Tutorial City
        description: 'The Boardwalk Empire. A short trip to get your feet wet.',
        unlockCondition: { type: 'always' },
        casinoTargets: [20, 50, 80, 125],
        getRewards: (index) => {
            if (index === 1) { // 2nd Reward (after Casino 2)
                return [
                    { type: 'Charm', count: 3, categories: ['Suite', 'Global', 'Cards'] },
                    { type: 'Angle', count: 1 },
                    { type: 'TableAction', count: 1, specificIds: ['redraw', 'switch'] }
                ];
            }
            return STANDARD_REWARD_CONFIG;
        },
        getShopPriceOverrides: (index): ShopPriceOverrides => {
            if (index === 1) {
                return {
                    redraw: 0,
                    switch: 0
                };
            }
            return {};
        }
    },
    {
        id: 'las_vegas',
        name: 'Las Vegas', // Complex City
        description: 'The Neon Oasis. A moderate challenge with varied options.',
        unlockCondition: { type: 'beat_city', cityId: 'atlantic_city' },
        casinoTargets: [450, 700, 1100, 1700, 2600, 4000, 6200, 10000],
        getRewards: (index) => {
            return [
                { 
                    type: 'Charm', 
                    count: 3, 
                    categories: ['Suite', 'Global', 'Cards', 'Rank', 'Flush', 'Straight', 'Dealer', 'Hands']
                },
                {
                    type: 'Angle',
                    count: 1,
                    excludeCategories: ['Triple']
                },
                {
                    type: 'TableAction',
                    count: 1
                }
            ];
        }
    },
    {
        id: 'monte_carlo',
        name: 'Monte Carlo', // Regular City
        description: 'The Royal Casino. The standard by which all others are measured.',
        unlockCondition: { type: 'beat_city', cityId: 'las_vegas' },
        casinoTargets: [
            600, 1000, 1800, 3200, 5800, 10500, 19000, 35000, 
            65000, 120000, 220000, 400000, 750000, 1400000, 2500000, 5000000
        ],
        getRewards: (index) => {
            return [
                { type: 'Charm', count: 3 },
                { type: 'Angle', count: 1 },
                { type: 'TableAction', count: 1 }
            ];
        }
    }
];
