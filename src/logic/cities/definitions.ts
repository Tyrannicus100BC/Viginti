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
        casinoTargets: [20, 50, 80, 200],
        getRewards: (index) => {
            if (index == 0) {// 1st Reward (after Casino 1)
                return [
                    { type: 'Charm', count: 3, categories: ['Suite', 'Global', 'Cards'] }
                ];
            }
            if (index === 1) { // 2nd Reward (after Casino 2)
                return [
                    { type: 'TableAction', count: 1, specificIds: ['redraw'] }
                ];
            }
            if (index === 2) { // 3rd Reward (after Casino 3)
                return [
                    { type: 'Angle', count: 1, specificIds: ['flush_pair_mult'] }
                ];
            }
            return [];
        },
        getShopPriceOverrides: (index): ShopPriceOverrides => {
            if (index === 1) {
                return {
                    'redraw': 0
                };
            }
            if (index === 2) {
                return {
                    'flush_pair_mult': 0
                };
            }
            return {};
        },
        getGiftShopDisabledButtons: (_) => {
            return ['sell', 'enhance', 'destroy', 'restock'];
        }
    },
    {
        id: 'las_vegas',
        name: 'Las Vegas', // Complex City
        description: 'The Neon Oasis. A moderate challenge with varied options.',
        unlockCondition: { type: 'beat_city', cityId: 'atlantic_city' },
        casinoTargets: [450, 700, 1100, 1500, 2000, 3000, 3750, 4500],
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
