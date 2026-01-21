

import React, { useEffect, useState, useRef } from 'react';
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
  
  // Is this a winning hand that needs scoring animation?
  const isWin = !!(hand.finalScore && hand.resultRevealed);

  // Animation State
  const [displayScore, setDisplayScore] = useState(hand.blackjackValue);
  const [displayMult, setDisplayMult] = useState(0);
  const [visibleItems, setVisibleItems] = useState<number[]>([]);
  const [visibleMults, setVisibleMults] = useState<number[]>([]);
  const [showMultContainer, setShowMultContainer] = useState(false);
  const [pulseScore, setPulseScore] = useState(false);

  const animationRef = useRef<boolean>(false);

  // Reset state when hand ID changes or resets
  useEffect(() => {
      setDisplayScore(hand.blackjackValue);
      setDisplayMult(0);
      setVisibleItems([]);
      setVisibleMults([]);
      setShowMultContainer(false);
      animationRef.current = false;
  }, [hand.id, hand.blackjackValue]);

  // Scoring Animation Sequence
  useEffect(() => {
      if (isWin && hand.finalScore && !animationRef.current && isScoringFocus) {
          animationRef.current = true;
          
          let canceled = false;
          const criteria = hand.finalScore.criteria;

          const runAnimation = async () => {
             const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

             // Initial delay
             await wait(300);

             // PHASE 1: Show +Chips
             for (let i = 0; i < criteria.length; i++) {
                 if (canceled) return;
                 // Reveal Item
                 setVisibleItems(prev => [...prev, i]);
                 
                 // Small pause before adding value?
                 await wait(100);
                 
                 // Add chips to running score
                 if (criteria[i].chips > 0) {
                     setDisplayScore(prev => prev + criteria[i].chips);
                     setPulseScore(true);
                     setTimeout(() => setPulseScore(false), 200);
                 }
                 
                 await wait(400); // Wait for next item
             }

             // Chips done. Preparing for Mults.
             await wait(200);
             if (canceled) return;
             
             // PHASE 2: Show Multipliers
             // Show Mult Container
             setShowMultContainer(true);
             await wait(300);

             for (let i = 0; i < criteria.length; i++) {
                 if (canceled) return;
                 
                 // Reveal Mult in list
                 setVisibleMults(prev => [...prev, i]);
                 await wait(100);

                 // Add to total mult
                 if (criteria[i].multiplier > 0) {
                     setDisplayMult(prev => prev + criteria[i].multiplier);
                 }
                 
                 await wait(400);
             }
             
             // PHASE 3: Apply Multiplier
             await wait(400);
             if (canceled) return;
             
             // Process final multiplication
             const totalMult = Math.max(1, displayMult);
             const finalVal = Math.floor(displayScore * totalMult);
             
             // Only animate if there was actually a multiplier change
             if (totalMult > 1) {
                 setDisplayScore(finalVal);
                 setPulseScore(true);
                 setTimeout(() => setPulseScore(false), 200);
                 
                 // Wait for pulse to be seen
                 await wait(500);
             }
             
             // Always hide mult container at the end of scoring
             setShowMultContainer(false);
             
             // Sync to final exact value just in case
             if (hand.finalScore) {
                setDisplayScore(hand.finalScore.finalScore);
             }
          };

          runAnimation();

          return () => { canceled = true; };
      }
      
      // If not winning or not revealed, ensure score matches state
      if (!isWin && !hand.resultRevealed) {
          setDisplayScore(hand.blackjackValue);
      }
  }, [isWin, hand.finalScore, isScoringFocus]);


  return (
    <div 
        className={`${styles.handContainer} ${canSelect ? styles.clickable : ''} ${isScoringFocus ? styles.scoringFocus : ''}`}
        onClick={canSelect ? onSelect : undefined}
    >
      {/* Scoring List */}
      {isWin && hand.finalScore && (
        <div className={styles.scoringList}>
           {hand.finalScore.criteria.map((item, idx) => (
               <div 
                 key={`${item.id}-${idx}`} 
                 className={`${styles.scoringItem} ${visibleItems.includes(idx) ? styles.visible : ''}`}
               >
                 <div className={styles.itemName}>
                     {item.name}
                     {item.count > 1 && <span className={styles.itemCount}>x{item.count}</span>}
                 </div>
                 <div className={styles.itemChips}>
                     {item.chips !== 0 && `+${item.chips}`}
                 </div>
                 <div className={`${styles.itemMult} ${visibleMults.includes(idx) ? styles.visible : ''}`}>
                     {item.multiplier !== 0 && `x${item.multiplier}`}
                 </div>
               </div>
           ))}
        </div>
      )}
      
      <div 
        className={`${styles.hand} ${canSelect ? styles.activeTarget : ''}`}
      >
        <div className={`${styles.cardsContainer} ${showOverlay ? styles.tinted : ''}`}>
          <div className={styles.cards}>
              {hand.cards.map((card, idx) => {
                 const startTx = (1 - hand.id) * 270;
                 const startTy = -200;
                 const total = hand.cards.length;
                 const center = (total - 1) / 2;
                 const rotate = (idx - center) * 5;
                 const translateY = Math.abs(idx - center) * 2;

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
              {/* Only show VIGINTI if it's actually 21, regardless of win status logic, but usually implied win */}
              {isViginti && !hand.isBust && (
                <div className={styles.overlayItem}>
                   <div className={`${styles.vigintiOverlay} ${styles.slamEnter}`}>VIGINTI</div>
                </div>
              )}
              {isWin && !isViginti && !hand.isBust && (
                <div className={styles.overlayItem}>
                    <div className={`${styles.winOverlay} ${styles.slamEnter}`}>WIN!</div>
                </div>
              )}
              {!isWin && hand.resultRevealed && !hand.isBust && !isViginti && (
                 <div className={styles.overlayItem}>
                    <div className={`${styles.lossOverlay} ${styles.slamEnter}`}>LOSS</div>
                 </div>
              )}
            </div>
          )}
        </div>
        
        {/* Status / Score Bar */}
        <div className={styles.status}>
          {hand.cards.length > 0 && (
            <div className={styles.scoreContainer}>
                <div 
                    id={`hand-score-${hand.id}`}
                    className={`${styles.scoreValue} ${pulseScore ? styles.pulse : ''} ${
                    hand.isBust ? styles.busted : 
                    isViginti ? styles.vigintiScore :
                    (hand.resultRevealed && isWin) ? styles.win : 
                    (hand.resultRevealed && !isWin) ? styles.loss : ''
                }`}>
                     {displayScore}
                </div>
                
                {/* Mult on Right Positioned Absolutely */}
                <div className={`${styles.multContainer} ${showMultContainer ? styles.visible : ''}`}>
                    <span>x</span>
                    <span className={styles.multValue}>
                        {displayMult.toFixed(1).replace(/\.0$/, '')}
                    </span>
                </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
