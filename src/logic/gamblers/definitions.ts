
import type { GamblerDefinition } from './types';
import { createStandardDeck, createCard, SUITS, RANKS } from '../deck';
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
        id: 'mathematician',
        name: 'The Mathematician',
        description: 'Calculated and precise. Removes all face cards for a number-heavy deck, starting with powerful Flush synergies.',
        getInitialDeck: () => {
            const deck = createStandardDeck();
            // Remove Face Cards (J, Q, K)
            return deck.filter(c => !['J', 'Q', 'K'].includes(c.rank));
        },
        getInitialRelics: () => {
            // "Two random Flush scoring relics"
            const allRelics = RelicManager.getAllRelics();
            // Filter for relics that are BOTH 'Scoring' (add rule) and 'Flush' (related)
            const flushScoring = allRelics
                .filter(r => r.categories.includes('Scoring') && r.categories.includes('Flush'))
                .map(r => r.id);
            
            // Pick 2 unique
            const shuffled = [...flushScoring].sort(() => Math.random() - 0.5);
            const selected = shuffled.slice(0, 2);
            
            return selected.map(id => getRelicInstance(id));
        }
    },
    {
        id: 'default',
        name: 'The Tourist',
        description: 'Just here for a good time. Starts with a standard 52-card deck and a balanced set of scoring relics.',
        getInitialDeck: () => createStandardDeck(),
        getInitialRelics: () => [
            getRelicInstance('win'),
            getRelicInstance('viginti'),
            getRelicInstance('pair_sc'),
            getRelicInstance('straight_sc'),
            getRelicInstance('flush_sc')
        ]
    },
    {
        id: 'wild',
        name: 'The Wildcard',
        description: 'Chaos incarnate. A distorted deck heavy on high cards in black suits, and low cards in red suits.',
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

            return deck;
        },
        getInitialRelics: () => {
            // Win, Viginti, and one other random scoring relic
            const fixed = [getRelicInstance('win'), getRelicInstance('viginti')];
            
            // Find "Scoring" category relics, exclude Win/Viginti
            const allRelics = RelicManager.getAllRelics();
            const scoringPool = allRelics
                .filter(r => r.categories.includes('Scoring') && !['win', 'viginti'].includes(r.id))
                .map(r => r.id);
            
            const randomId = getRandomItem(scoringPool);
            
            if (randomId) {
                fixed.push(getRelicInstance(randomId));
            }
            
            return fixed;
        }
    }
];
