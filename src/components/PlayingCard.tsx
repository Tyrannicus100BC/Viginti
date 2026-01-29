import React, { useState } from 'react';
import type { Card as CardType, CardOrigin } from '../types';
import styles from './Card.module.css';
import '../styles/animations.css';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  className?: string; // For additional styles if needed
  isDrawn?: boolean;
  origin?: CardOrigin | 'discard' | 'none';
  delay?: number; // seconds
  style?: React.CSSProperties;
  suppressSpecialVisuals?: boolean;
  suppressEnterAnimation?: boolean;
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
  style = {},
  suppressSpecialVisuals = false,
  suppressEnterAnimation = false
}) => {
  // Determine animation class directly from props to handle dynamic changes (e.g. origin changing to 'discard')
  const getAnimClass = () => {
    if (suppressEnterAnimation) return '';
    if (origin === 'deck') {
      return card.isFaceUp ? styles.animDealAndFlip : styles.animDealFaceDown;
    } else if (origin === 'draw_pile') {
      return styles.animEnterDraw;
    } else if (origin === 'double_down') {
      return styles.animDoubleDownAndFlip;
    } else if (origin === 'discard') {
      return styles.animReset;
    }
    return '';
  };

  const animClass = getAnimClass();

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
            ${origin === 'discard' ? styles.discarding : ''}
        `}
        style={{ animationDelay: `${delay}s` }}
      >
        {/* Front */}
        <div className={`${styles.face} ${styles.front} ${isRed ? styles.red : styles.black}`}
          style={
            card.type === 'chip' ? { color: '#4ade80', WebkitTextStroke: '2px #166534', paintOrder: 'stroke fill' } as React.CSSProperties :
              card.type === 'mult' ? { color: '#facc15', WebkitTextStroke: '2px #854d0e', paintOrder: 'stroke fill' } as React.CSSProperties :
                card.type === 'score' ? { color: '#c084fc', WebkitTextStroke: '2px #6b21a8', paintOrder: 'stroke fill' } as React.CSSProperties :
                  undefined
          }
        >
          <div className={styles.cornerTop}>
            <div className={styles.rank}>
              {card.type === 'chip' ? `$${card.chips}` :
                card.type === 'mult' ? `x${card.mult}` :
                  card.type === 'score' ? `${card.chips}` :
                    card.rank}
            </div>
            {!card.type || card.type === 'standard' ? (
              <div className={styles.smallSuit}>{SUIT_ICONS[card.suit]}</div>
            ) : null}
          </div>
          <div className={styles.cornerBottom}>
            <div className={styles.rank}>
              {card.type === 'chip' ? `$${card.chips}` :
                card.type === 'mult' ? `x${card.mult}` :
                  card.type === 'score' ? `${card.chips}` :
                    card.rank}
            </div>
            {!card.type || card.type === 'standard' ? (
              <div className={styles.smallSuit}>{SUIT_ICONS[card.suit]}</div>
            ) : null}
          </div>

          {/* Special Effect Indicators */}
          {card.specialEffect && !suppressSpecialVisuals && (
            <>
              {/* Bottom Left */}
              <div className={styles.specialEffect}>
                <div className={styles.specialSymbol}
                  style={{
                    color: card.specialEffect.type === 'chip' ? '#166534' : card.specialEffect.type === 'mult' ? '#854d0e' : '#6b21a8',
                    WebkitTextStroke: card.specialEffect.type === 'chip' ? '1px #6ee7b7' : card.specialEffect.type === 'mult' ? '1px #fde047' : '1px #d8b4fe',
                    fontSize: card.specialEffect.type === 'chip' ? '1.0rem' : undefined
                  }}
                >
                  {card.specialEffect.type === 'chip' ? '$' : card.specialEffect.type === 'mult' ? 'x' : '–'}
                </div>
                <div className={styles.specialValue}
                  style={{
                    color: card.specialEffect.type === 'chip' ? '#166534' : card.specialEffect.type === 'mult' ? '#854d0e' : '#6b21a8',
                    WebkitTextStroke: card.specialEffect.type === 'chip' ? '1px #6ee7b7' : card.specialEffect.type === 'mult' ? '1px #fde047' : '1px #d8b4fe',
                    paintOrder: 'stroke fill'
                  }}
                >
                  {card.specialEffect.value}
                </div>
              </div>

              {/* Top Right (Upside Down) */}
              <div className={styles.specialEffectTopRight}>
                <div className={styles.specialSymbol}
                  style={{
                    color: card.specialEffect.type === 'chip' ? '#166534' : card.specialEffect.type === 'mult' ? '#854d0e' : '#6b21a8',
                    WebkitTextStroke: card.specialEffect.type === 'chip' ? '1px #6ee7b7' : card.specialEffect.type === 'mult' ? '1px #fde047' : '1px #d8b4fe',
                    fontSize: card.specialEffect.type === 'chip' ? '1.0rem' : undefined
                  }}
                >
                  {card.specialEffect.type === 'chip' ? '$' : card.specialEffect.type === 'mult' ? 'x' : '–'}
                </div>
                <div className={styles.specialValue}
                  style={{
                    color: card.specialEffect.type === 'chip' ? '#166534' : card.specialEffect.type === 'mult' ? '#854d0e' : '#6b21a8',
                    WebkitTextStroke: card.specialEffect.type === 'chip' ? '1px #6ee7b7' : card.specialEffect.type === 'mult' ? '1px #fde047' : '1px #d8b4fe',
                    paintOrder: 'stroke fill'
                  }}
                >
                  {card.specialEffect.value}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Back */}
        <div className={`${styles.face} ${styles.back}`}>
          <div className={styles.pattern}></div>
        </div>
      </div>
    </div>
  );
};
