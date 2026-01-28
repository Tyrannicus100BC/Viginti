import React from 'react';
import type { Card as CardType, Suit, Rank } from '../types';
import styles from './DeckView.module.css';

interface DeckViewProps {
  remainingDeck: CardType[];
  activeCards: CardType[];
  onClose: () => void;
  onSelectCard?: (cardId: string) => void;
  mode?: 'view' | 'remove';
  onRemoveCard?: (cardId: string) => void;
}

const SUITS_MAP: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
};

const SUIT_ORDER: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANK_ORDER: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const DeckView: React.FC<DeckViewProps> = ({ remainingDeck, activeCards, onClose, onSelectCard, mode = 'view', onRemoveCard }) => {
    
    // Combine all cards with status
    const allCards = React.useMemo(() => {
        const remaining = remainingDeck.map(c => ({ ...c, isDealt: false }));
        const active = activeCards.map(c => ({ ...c, isDealt: true }));
        return [...remaining, ...active];
    }, [remainingDeck, activeCards]);

    const getSuitCards = (suit: Suit) => {
        return allCards
            .filter(c => c.suit === suit && !['chip', 'mult', 'score'].includes(c.type))
            .sort((a, b) => {
                 const rankA = RANK_ORDER.indexOf(a.rank);
                 const rankB = RANK_ORDER.indexOf(b.rank);
                 return rankB - rankA; 
            });
    };

    const getSpecialCards = () => {
        return allCards
            .filter(c => c.type === 'chip' || c.type === 'mult' || c.type === 'score')
            .sort((a, b) => {
                // Sort Order: Chip -> Mult -> Score
                const typeOrder = { chip: 1, mult: 2, score: 3 };
                const tA = typeOrder[a.type as keyof typeof typeOrder] || 99;
                const tB = typeOrder[b.type as keyof typeof typeOrder] || 99;
                if (tA !== tB) return tA - tB;
                
                // Then by value descending
                const vA = (a.chips || a.mult || 0);
                const vB = (b.chips || b.mult || 0);
                return vB - vA;
            });
    };

    const renderCard = (card: CardType & { isDealt: boolean }, index: number) => {
        const isDealt = card.isDealt;
        let style: React.CSSProperties = { color: '#2c3e50' };
        let content = `${card.rank}${SUITS_MAP[card.suit]}`;

        if (card.type === 'chip') {
            style = { color: '#4ade80', WebkitTextStroke: '2px #166534', paintOrder: 'stroke fill' } as React.CSSProperties;
            content = `$${card.chips}`;
        } else if (card.type === 'mult') {
            style = { color: '#facc15', WebkitTextStroke: '2px #854d0e', paintOrder: 'stroke fill' } as React.CSSProperties;
            content = `x${card.mult}`;
        } else if (card.type === 'score') {
            style = { color: '#c084fc', WebkitTextStroke: '2px #6b21a8', paintOrder: 'stroke fill' } as React.CSSProperties;
            content = `-${card.chips}`;
        } else if (card.suit === 'hearts' || card.suit === 'diamonds') {
            style = { color: '#e74c3c' };
        }

        const isSelectable = (onSelectCard && !isDealt) || (mode === 'remove' && !isDealt);

        return (
            <div 
                key={`${card.id}-${index}`}
                className={`${styles.miniCard} ${isDealt ? styles.dealt : ''} ${isSelectable ? styles.selectable : ''} ${mode === 'remove' && !isDealt ? styles.removable : ''}`}
                style={{ ...style, position: 'relative' }}
                onClick={() => {
                    if (mode === 'remove' && !isDealt) {
                        onRemoveCard?.(card.id);
                    } else if (onSelectCard && !isDealt) {
                        onSelectCard(card.id);
                        onClose();
                    }
                }}
            >
                <div className={styles.miniCardContent}>
                    <span>{content}</span>
                </div>
                {mode === 'remove' && !isDealt && (
                    <div className={styles.removeOverlay}>
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                           <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2 className={styles.title}>{mode === 'remove' ? 'Remove Cards' : (onSelectCard ? 'Select a Card' : 'Deck Details')}</h2>
                
                <div className={styles.scrollContent}>
                    <div className={styles.unifiedGrid}>
                        {SUIT_ORDER.map(suit => {
                            const suitCards = getSuitCards(suit);
                            if (suitCards.length === 0) return null; 
                            
                            return (
                                <div key={suit} className={styles.suitRow}>
                                    <div className={styles.suitLabel}>{SUITS_MAP[suit]}</div>
                                    <div className={styles.cardList}>
                                        {suitCards.map((card, i) => renderCard(card, i))}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Special Cards Row */}
                        {(() => {
                           const specialCards = getSpecialCards();
                           if (specialCards.length > 0) {
                               return (
                                   <div key="special" className={styles.suitRow}>
                                       <div className={styles.suitLabel}>★</div>
                                       <div className={styles.cardList}>
                                           {specialCards.map((card, i) => renderCard(card, i))}
                                       </div>
                                   </div>
                               );
                           }
                           return null;
                        })()}
                    </div>
                </div>
                <button className="close-x-btn" onClick={onClose}>×</button>
            </div>
        </div>
    );
};
