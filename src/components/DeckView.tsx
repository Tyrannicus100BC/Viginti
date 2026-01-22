import React from 'react';
import type { Card as CardType, Suit, Rank } from '../types';
import styles from './DeckView.module.css';

interface DeckViewProps {
  remainingDeck: CardType[];
  activeCards: CardType[];
  onClose: () => void;
}

const SUITS_MAP: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
};

const SUIT_ORDER: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANK_ORDER: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const DeckView: React.FC<DeckViewProps> = ({ activeCards, onClose }) => {
    
    const isDealt = (suit: Suit, rank: Rank) => {
        return activeCards.some(c => c.suit === suit && c.rank === rank);
    };

    const renderCard = (suit: Suit, rank: Rank) => {
        const dealt = isDealt(suit, rank);
        const color = (suit === 'hearts' || suit === 'diamonds') ? '#e74c3c' : '#2c3e50';
        
        return (
            <div 
                key={`${suit}-${rank}`} 
                className={`${styles.miniCard} ${dealt ? styles.inactive : ''}`}
                style={{ color: dealt ? undefined : color }}
            >
                {rank}{SUITS_MAP[suit]}
            </div>
        );
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2 className={styles.title}>Deck Details</h2>
                
                <div className={styles.unifiedGrid}>
                    {SUIT_ORDER.map(suit => (
                        <div key={suit} className={styles.suitRow}>
                            <div className={styles.suitLabel}>{SUITS_MAP[suit]}</div>
                            <div className={styles.rankList}>
                                {RANK_ORDER.map(rank => renderCard(suit, rank))}
                            </div>
                        </div>
                    ))}
                </div>
                
                <button className={styles.closeBtn} onClick={onClose}>Close</button>
            </div>
        </div>
    );
};
