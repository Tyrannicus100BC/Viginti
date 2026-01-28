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
    
    // Combine all cards with status
    const allCards = React.useMemo(() => {
        const remaining = remainingDeck.map(c => ({ ...c, isDealt: false }));
        const active = activeCards.map(c => ({ ...c, isDealt: true }));
        return [...remaining, ...active];
    }, [remainingDeck, activeCards]);

    const getSuitCards = (suit: Suit) => {
        return allCards
            .filter(c => c.suit === suit)
            .sort((a, b) => {
                 const rankA = RANK_ORDER.indexOf(a.rank);
                 const rankB = RANK_ORDER.indexOf(b.rank);
                 return rankB - rankA; // Ascending index -> Descending sort (A=12, 2=0)
            });
    };

    const renderCard = (card: CardType & { isDealt: boolean }, index: number) => {
        const isDealt = card.isDealt;
        // Heart/Diamond red, others black/dark-gray
        const color = (card.suit === 'hearts' || card.suit === 'diamonds') ? '#e74c3c' : '#2c3e50';
        
        return (
            <div 
                key={`${card.id}-${index}`}
                className={`${styles.miniCard} ${isDealt ? styles.dealt : ''} ${onSelectCard && !isDealt ? styles.selectable : ''}`}
                style={{ color }}
                onClick={() => {
                    if (onSelectCard && !isDealt) {
                        onSelectCard(card.suit, card.rank);
                        onClose();
                    }
                }}
            >
                <div className={styles.miniCardContent}>
                    <span>{card.rank}{SUITS_MAP[card.suit]}</span>
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
                        {SUIT_ORDER.map(suit => {
                            const suitCards = getSuitCards(suit);
                            if (suitCards.length === 0) return null; // Optional: hide empty suits? Or keep for consistency. Keeping consistent layout is usually better, but "uniquely visualized" might imply only what exists. I'll render the row but it might be empty.
                            // Actually, let's always render the row so the structure is visible.
                            
                            return (
                                <div key={suit} className={styles.suitRow}>
                                    <div className={styles.suitLabel}>{SUITS_MAP[suit]}</div>
                                    <div className={styles.cardList}>
                                        {suitCards.map((card, i) => renderCard(card, i))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <button className="close-x-btn" onClick={onClose}>×</button>
            </div>
        </div>
    );
};
