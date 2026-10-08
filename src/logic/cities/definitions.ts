import type { CityDefinition, RewardConfig, ShopPriceOverrides } from './types';

// Helper to generate standard rewards
const STANDARD_REWARD_CONFIG: RewardConfig[] = [
    { type: 'TableAction', count: 1 },
    { type: 'Raise', count: 1 },
    { type: 'Relic', count: 2 }
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
                    { type: 'Relic', count: 2, categories: ['Suite', 'Global', 'Cards'] }
                ];
            }
            if (index === 1) { // 2nd Reward (after Casino 2)
                return [
                    { type: 'TableAction', count: 1, specificIds: ['redraw'] }
                ];
            }
            if (index === 2) { // 3rd Reward (after Casino 3)
                return [
                    { type: 'Raise', count: 1, specificIds: ['raise_flush_mult'] }
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
                    'raise_flush_mult': 0
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
        casinoTargets: [150, 200, 300, 450, 600, 800, 1200, 1500],
        getRewards: (index) => {
            return [
                { 
                    type: 'Relic',
                    count: 3, 
                    categories: ['New']
                },
                {
                    type: 'Raise',
                    count: 0,
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
                { type: 'Relic', count: 2 },
                { type: 'Raise', count: 1 },
                { type: 'TableAction', count: 1 }
            ];
        }
    }
];
