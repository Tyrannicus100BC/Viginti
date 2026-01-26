import React from 'react';
import type { Card as CardType, Suit, Rank } from '../types';
import styles from './DeckView.module.css';

interface DeckViewProps {
  remainingDeck: CardType[];
  activeCards: CardType[];
  onClose: () => void;
  onSelectCard?: (suit: Suit, rank: Rank) => void;
}

const SUITS_MAP: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
};

const SUIT_ORDER: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANK_ORDER: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const DeckView: React.FC<DeckViewProps> = ({ remainingDeck, activeCards, onClose, onSelectCard }) => {
    
    // Calculate counts for all cards
    const cardCounts = React.useMemo(() => {
        const counts = new Map<string, { total: number, dealt: number }>();
        const getKey = (s: Suit, r: Rank) => `${s}-${r}`;

        // Count dealt cards from activeCards
        activeCards.forEach(c => {
            const key = getKey(c.suit, c.rank);
            const current = counts.get(key) || { total: 0, dealt: 0 };
            counts.set(key, { total: current.total + 1, dealt: current.dealt + 1 });
        });

        // Add remaining cards from deck (including hidden ones passed in)
        remainingDeck.forEach(c => {
            const key = getKey(c.suit, c.rank);
            const current = counts.get(key) || { total: 0, dealt: 0 };
            counts.set(key, { ...current, total: current.total + 1 });
        });
        
        return counts;
    }, [activeCards, remainingDeck]);

    const renderCard = (suit: Suit, rank: Rank) => {
        const key = `${suit}-${rank}`;
        const data = cardCounts.get(key);
        
        // If card doesn't exist in the universe at all, show empty slot
        if (!data || data.total === 0) {
            return <div key={key} className={styles.emptySlot} />;
        }

        const { total, dealt } = data;
        const remaining = total - dealt;
        const isFullyDealt = remaining === 0;
        const color = (suit === 'hearts' || suit === 'diamonds') ? '#e74c3c' : '#2c3e50';
        
        // Render pips: Remaining (solid) first, then Dealt (hollow)
        const pips = [];
        for (let i = 0; i < remaining; i++) {
            pips.push(<div key={`r-${i}`} className={`${styles.pip} ${styles.pipRemaining}`} />);
        }
        for (let i = 0; i < dealt; i++) {
            pips.push(<div key={`d-${i}`} className={`${styles.pip} ${styles.pipDealt}`} />);
        }

        return (
            <div 
                key={key} 
                className={`${styles.miniCard} ${isFullyDealt ? styles.inactive : ''} ${onSelectCard && !isFullyDealt ? styles.selectable : ''}`}
                style={{ color: isFullyDealt ? undefined : color }}
                onClick={() => {
                    if (onSelectCard && !isFullyDealt) {
                        onSelectCard(suit, rank);
                        onClose();
                    }
                }}
            >
                <div className={styles.miniCardContent}>
                    <span>{rank}{SUITS_MAP[suit]}</span>
                    <div className={styles.pipsContainer}>
                        {pips}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2 className={styles.title}>{onSelectCard ? 'Select a Card' : 'Deck Details'}</h2>
                
                <div className={styles.scrollContent}>
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
                </div>
                <button className="close-x-btn" onClick={onClose}>×</button>
            </div>
        </div>
    );
};
