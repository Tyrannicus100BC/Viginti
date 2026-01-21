import React from 'react';
import type { Card as CardType } from '../types';
import styles from './DeckView.module.css';

interface DeckViewProps {
  remainingDeck: CardType[];
  activeCards: CardType[];
  onClose: () => void;
}

const SUITS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
};

export const DeckView: React.FC<DeckViewProps> = ({ remainingDeck, activeCards, onClose }) => {
    
    // Helper to format
    const renderCard = (c: CardType) => (
        <span style={{ color: (c.suit === 'hearts' || c.suit === 'diamonds') ? '#c0392b' : 'black' }}>
            {c.rank}{SUITS[c.suit]}
        </span>
    );

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2 style={{marginTop:0}}>Deck Overview</h2>
                
                <div className={styles.section}>
                    <h3>Remaining in Deck ({remainingDeck.length})</h3>
                    <div className={styles.grid}>
                        {remainingDeck.map(c => (
                            <div key={c.id} className={styles.miniCard}>
                                {renderCard(c)}
                            </div>
                        ))}
                    </div>
                </div>
                
                <div className={styles.section}>
                    <h3>In Play / Dealt ({activeCards.length})</h3>
                    <div className={styles.grid}>
                        {activeCards.map(c => (
                            <div key={c.id} className={`${styles.miniCard} ${styles.inactive}`}>
                                {renderCard(c)}
                            </div>
                        ))}
                    </div>
                </div>
                
                <button className={styles.closeBtn} onClick={onClose}>Close</button>
                <div style={{clear:'both'}}></div>
            </div>
        </div>
    );
};
