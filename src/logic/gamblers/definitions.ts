
import type { GamblerDefinition } from './types';
import { createStandardDeck, createCard, SUITS, RANKS, createChipCard, createMultCard, createScoreCard } from '../deck';
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

export const GAMBLER_DEFINITIONS: GamblerDefinition[] = [
    {
        id: 'default',
        name: 'The Tourist',
        description: 'Just here for a good time. Starts with a standard 52-card deck and a balanced set of scoring relics.',
        getInitialDeck: () => createStandardDeck(),
        getInitialRelics: () => [

            getRelicInstance('viginti'),
            getRelicInstance('rank_run_mult'),
            getRelicInstance('straight_run_mult'),
            getRelicInstance('flush_run_chips')
        ]
    },
    {
        id: 'mathematician',
        name: 'The Mathematician',
        description: 'Calculated and precise. Removes all face cards for a number-heavy deck, starting with powerful Straight synergies.',
        getInitialDeck: () => {
            const deck = createStandardDeck();
            // Remove Face Cards (J, Q, K)
            return deck.filter(c => !['J', 'Q', 'K'].includes(c.rank));
        },
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
        description: 'Chaos incarnate. A distorted deck heavy on high cards in black suits and low red cards. Starts with 8 random Special Cards.',
        getInitialDeck: () => {
            const deck = [];
            
            // Spades & Clubs: 3x A, K, Q, J. No numbered (2-10).
            (['spades', 'clubs'] as const).forEach(suit => {
                const targets = ['A', 'K', 'Q', 'J'] as const;
                targets.forEach(rank => {
                    for (let i = 0; i < 3; i++) {
                        deck.push(createCard(suit, rank));
                    }
                });
            });

            // Hearts & Diamonds: No face cards (keep A, 2-10).
            (['hearts', 'diamonds'] as const).forEach(suit => {
                const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;
                ranks.forEach(rank => {
                    deck.push(createCard(suit, rank));
                });
            });

            // Start with 8 random Special Cards (Chip, Mult, Score) with values 1-5
            const specialTypes = ['chip', 'mult', 'score'];
            for (let i = 0; i < 8; i++) {
                const type = getRandomItem(specialTypes);
                const value = Math.floor(Math.random() * 5) + 1;
                
                if (type === 'chip') {
                    deck.push(createChipCard(value));
                } else if (type === 'mult') {
                    deck.push(createMultCard(value));
                } else {
                    deck.push(createScoreCard(value));
                }
            }

            return deck;
        },
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
        description: 'Driven by high stakes and royalty. Starts with action-oriented charms and a broad range of scoring potential.',
        getInitialDeck: () => createStandardDeck(),
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
