import React, { useState } from 'react';
import type { Card as CardType } from '../types';
import styles from './Card.module.css';
import '../styles/animations.css';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  className?: string; // For additional styles if needed
  isDrawn?: boolean;
  origin?: 'deck' | 'draw_pile' | 'none';
  delay?: number; // seconds
  style?: React.CSSProperties;
}

const SUIT_ICONS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
};

export const PlayingCard: React.FC<CardProps> = ({ 
  card, 
  onClick, 
  className = '', 
  isDrawn,
  origin = 'none',
  delay = 0,
  style = {}
}) => {
  const [animClass, setAnimClass] = useState(() => {
    // Determine initial animation class synchronously to prevent flicker/paint before animation
    if (origin === 'deck') {
        return card.isFaceUp ? styles.animDealAndFlip : styles.animDealFaceDown;
    } else if (origin === 'draw_pile') {
        return styles.animEnterDraw;
    }
    return '';
  });

  const handleAnimationEnd = () => {
      setAnimClass(''); // Clear animation class to allow standard transitions to take over
  };

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';

  // If card is face down, we rotate it 180deg.
  // Unless we are currently animating the "DealAndFlip" which handles rotation internally.
  // But CSS transforms override each other. 
  // The 'dealAndFlip' keyframe ends at 0deg (face up).
  // The 'dealFaceDown' keyframe ends at 180deg.
  // The static state `!card.isFaceUp` applies `transform: rotateY(180deg)`.
  
  // Logic: 
  // If `animClass` is active, it controls transform.
  // If `animClass` is empty, `isFlipped` class controls transform.
  
  return (
    <div 
      className={`${styles.scene} ${className} ${isDrawn ? styles.drawn : ''}`}
      onClick={onClick}
      style={{ ...style, animationDelay: `${delay}s` }} // Apply delay to container if needed, or pass directly to card
    >
      <div 
        className={`
            ${styles.card} 
            ${!card.isFaceUp ? styles.isFlipped : ''} 
            ${animClass}
        `}
        style={{ animationDelay: `${delay}s` }}
        onAnimationEnd={handleAnimationEnd}
      >
        {/* Front */}
        <div className={`${styles.face} ${styles.front} ${isRed ? styles.red : styles.black}`}>
          <div className={styles.cornerTop}>
            <div className={styles.rank}>{card.rank}</div>
            <div className={styles.smallSuit}>{SUIT_ICONS[card.suit]}</div>
          </div>
          <div className={styles.cornerBottom}>
            <div className={styles.rank}>{card.rank}</div>
            <div className={styles.smallSuit}>{SUIT_ICONS[card.suit]}</div>
          </div>
        </div>
        
        {/* Back */}
        <div className={`${styles.face} ${styles.back}`}>
            <div className={styles.pattern}></div>
        </div>
      </div>
    </div>
  );
};
