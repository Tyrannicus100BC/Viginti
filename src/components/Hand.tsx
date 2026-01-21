import React from 'react';
import type { PlayerHand } from '../types';
import { PlayingCard } from './PlayingCard';
import styles from './Hand.module.css';

interface HandProps {
  hand: PlayerHand;
  onSelect?: () => void;
  canSelect?: boolean;
  baseDelay?: number;
  stagger?: boolean;
  isScoringFocus?: boolean;
}

export const Hand: React.FC<HandProps> = ({ hand, onSelect, canSelect, baseDelay = 0, stagger = true, isScoringFocus = false }) => {
  // Determine if we should show overlay (bust or result revealed)
  const isViginti = hand.blackjackValue === 21;
  const showOverlay = hand.isBust || isViginti || (hand.finalScore !== undefined && hand.resultRevealed);
  const isWin = hand.finalScore !== undefined && hand.resultRevealed && hand.finalScore;
  
  return (
    <div 
        className={`${styles.handContainer} ${canSelect ? styles.clickable : ''} ${isScoringFocus ? styles.scoringFocus : ''}`}
        onClick={canSelect ? onSelect : undefined}
    >
      {/* Win info above the hand box */}
      {isWin && (
        <div className={styles.winInfoAbove}>
          <div 
             className={`${styles.pokerHand} ${styles.slamEnter}`} 
             style={{animationDelay: '0.2s'}}
          >
             {hand.finalScore!.pokerHand.replace(/_/g, ' ')}
          </div>
          <div 
             id={`hand-score-${hand.id}`}
             className={`${styles.winScore} ${styles.slamEnter}`} 
             style={{animationDelay: '0.4s'}}
          >
             +{hand.finalScore!.totalScore}
             <span style={{fontSize: '0.7em', marginLeft: 6}}>({hand.finalScore!.multiplier}x)</span>
          </div>
        </div>
      )}
      
      <div 
        className={`${styles.hand} ${canSelect ? styles.activeTarget : ''}`}
      >
        <div className={`${styles.cardsContainer} ${showOverlay ? styles.tinted : ''}`}>
          <div className={styles.cards}>
            {/* Removed empty hand placeholder */}
              {hand.cards.map((card, idx) => {
                 // Calculate start position relative to this hand's final position
                 // Hand 0 (Left): Needs to start from Right (+250)
                 // Hand 1 (Center): Needs to start from Center (0)
                 // Hand 2 (Right): Needs to start from Left (-250)
                 // Formula: (1 - hand.id) * 250px
                 const startTx = (1 - hand.id) * 270;
                 const startTy = -200; // Start from above

                 // Calculate fan rotation
                 const total = hand.cards.length;
                 const center = (total - 1) / 2;
                 const rotate = (idx - center) * 5; // 5 degree spread
                 const translateY = Math.abs(idx - center) * 2; // Subtle arc

                 return (
                   <div 
                      key={card.id} 
                      className={styles.cardWrapper}
                      style={{
                          transform: `rotate(${rotate}deg) translateY(${translateY}px)`,
                          transformOrigin: '50% 250%'
                      }}
                   >
                     <PlayingCard 
                        card={card} 
                        origin={card.origin}
                        delay={card.origin === 'deck' ? baseDelay + (stagger ? idx * 0.5 : 0) : 0}
                        style={{ 
                            '--start-tx': `${startTx}px`,
                            '--start-ty': `${startTy}px`
                        } as React.CSSProperties}
                     />
                   </div>
                 );
              })}
          </div>
          
          {/* Overlay text on cards */}
          {showOverlay && (
            <div className={styles.overlayText}>
              {hand.isBust && (
                <div className={styles.overlayItem}>
                  <div className={`${styles.bustOverlay} ${styles.slamEnter}`}>BUST</div>
                </div>
              )}
              {isViginti && !hand.isBust && (
                <div className={styles.overlayItem}>
                   <div className={`${styles.vigintiOverlay} ${styles.slamEnter}`}>VIGINTI</div>
                </div>
              )}
              {hand.finalScore !== undefined && hand.resultRevealed && !isViginti && !hand.isBust && (
                <div className={styles.overlayItem}>
                  {hand.finalScore ? (
                    <div className={`${styles.winOverlay} ${styles.slamEnter}`}>WIN!</div>
                  ) : (
                    <div className={`${styles.lossOverlay} ${styles.slamEnter}`}>LOSS</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className={styles.status}>
          {hand.cards.length > 0 && (
            <div className={`${styles.score} ${
              hand.isBust ? styles.busted : 
              isViginti ? styles.vigintiScore :
              (hand.resultRevealed && hand.finalScore) ? styles.win : 
              (hand.resultRevealed && hand.finalScore === null) ? styles.loss : ''
            } ${styles.scoreFadeIn}`}
            style={{ animationDelay: `${hand.id === -1 ? baseDelay + 0.5 : baseDelay + 0.15}s` }}
            >
                 {hand.blackjackValue}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
