import React from 'react';
import type { Suit, Rank } from '../types';
import styles from './DeckView.module.css'; // Reusing DeckView styles for consistency

interface ChooseCardViewProps {
    onClose: () => void;
    onSelectCard: (cardId: string) => void;
}

const SUITS_MAP: Record<string, string> = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
};

const SUIT_ORDER: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANK_ORDER: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

export const ChooseCardView: React.FC<ChooseCardViewProps> = ({
    onClose,
    onSelectCard
}) => {

    const renderCard = (suit: Suit, rank: Rank) => {
        let style: React.CSSProperties = { color: '#2c3e50' };
        if (suit === 'hearts' || suit === 'diamonds') {
            style = { color: '#e74c3c' };
        }

        const content = `${rank}${SUITS_MAP[suit] || ''}`;

        return (
            <div
                key={`${suit}-${rank}`}
                className={`${styles.miniCard} ${styles.selectable}`}
                style={{ ...style, position: 'relative' }}
                onClick={() => {
                    onSelectCard(`debug_${suit}_${rank}`);
                }}
            >
                <div className={styles.miniCardContent}>
                    <span>{content}</span>
                </div>
            </div>
        );
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2 className={styles.title}>
                    <div className={styles.titleSpacer} />
                    <span className={styles.titleText}>
                        Select a Draw Card
                    </span>
                    <div className={styles.titleSide} />
                </h2>

                <div className={styles.scrollContent}>
                    <div className={styles.unifiedGrid}>
                        <div className={styles.probSection}>
                            <h3 className={styles.sectionHeader}>Choose from 52 Cards</h3>
                            {SUIT_ORDER.map(suit => (
                                <div key={suit} style={{ marginBottom: '16px' }}>
                                    <div style={{ textTransform: 'capitalize', color: (suit === 'hearts' || suit === 'diamonds') ? '#e74c3c' : '#fff', fontWeight: 'bold', marginBottom: '8px' }}>
                                        {suit} {SUITS_MAP[suit]}
                                    </div>
                                    <div className={styles.cardList}>
                                        {RANK_ORDER.map(rank => renderCard(suit, rank))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <button className="close-x-btn" onClick={onClose}>×</button>
            </div>
        </div>
    );
};
