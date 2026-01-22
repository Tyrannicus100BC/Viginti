

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
  const [visibleChips, setVisibleChips] = useState<number[]>([]);
  const [visibleMults, setVisibleMults] = useState<number[]>([]);
  const [activeCriteriaIdx, setActiveCriteriaIdx] = useState<number | null>(null);
  const [showMultContainer, setShowMultContainer] = useState(false);
  const [pulseScore, setPulseScore] = useState(false);
  const [pulseMult, setPulseMult] = useState(false);
  const [isSlidingMult, setIsSlidingMult] = useState(false);
  const [isQuickFading, setIsQuickFading] = useState(false);
  
  // New State for sequential updates
  const [rowValues, setRowValues] = useState<Record<number, { chips: number, mult: number, count: number }>>({});
  const [activeHighlightIds, setActiveHighlightIds] = useState<string[] | null>(null);

  const animationRef = useRef<boolean>(false);

  // Reset state when hand ID changes or resets
  // Reset state when hand ID changes (new hand slot content)
  useEffect(() => {
    setDisplayScore(hand.blackjackValue);
    setDisplayMult(0);
    setVisibleItems([]);
    setVisibleChips([]);
    setVisibleMults([]);
    setActiveCriteriaIdx(null);
    setShowMultContainer(false);
    animationRef.current = false;
    setRowValues({});
    setActiveHighlightIds(null);
    setPulseScore(false);
    setPulseMult(false);
    setIsSlidingMult(false);
    setIsQuickFading(false);
  }, [hand.id]);

  // Ensure displayScore updates immediately when hand value changes (card added)
  useEffect(() => {
    if (!isWin && !hand.resultRevealed) {
      setDisplayScore(hand.blackjackValue);
    }
  }, [hand.blackjackValue, isWin, hand.resultRevealed]);

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

        // Track totals locally to avoid stale state in async function
        let runningChips = 0;
        let runningMult = 0;
        let multVisible = false;

        // PHASE 1: Show +Chips
        for (let i = 0; i < criteria.length; i++) {
          if (canceled) return;
          const crit = criteria[i];
          
          // Reveal Row Frame and Label
          setVisibleItems(prev => [...prev, i]);
          setActiveCriteriaIdx(i);

          // Default start values
          setRowValues(prev => ({
            ...prev,
            [i]: { chips: 0, mult: 0, count: 0 } // Start at 0, logic updates it
          }));

          // Wait "a beat" before processing
          await wait(400);

          // Check if we have granular matches
          if (crit.matches && crit.matches.length > 0) {
            // SEQUENTIAL MATCH ANIMATION
            let currentRowChips = 0;
            let currentRowMult = 0;
            
            for (let m = 0; m < crit.matches.length; m++) {
                if (canceled) return;
                const match = crit.matches[m];
                
                // 1. Highlight specific cards
                setActiveHighlightIds(match.cardIds);
                
                // 2. Update Row Values
                currentRowChips += match.chips;
                currentRowMult += match.multiplier;
                
                setRowValues(prev => ({
                    ...prev,
                    [i]: { 
                        chips: currentRowChips, 
                        mult: currentRowMult, 
                        count: m + 1
                    }
                }));
                
                // Reveal Chips/Mult text if first match
                if (m === 0) {
                     setVisibleChips(prev => [...prev, i]);
                     setVisibleMults(prev => [...prev, i]);
                }
                
                // 3. Add to Main Score
                if (match.chips > 0) {
                    runningChips += match.chips;
                    
                    // Don't update display score for Win/Viginti (already shown) - though they won't have matches usually
                    const isOutcome = crit.id === 'win' || crit.id === 'viginti';
                    if (!isOutcome) {
                        setDisplayScore(runningChips);
                        setPulseScore(true);
                        setTimeout(() => setPulseScore(false), 300);
                    }
                }
                
                // 4. Wait for user to see
                await wait(600);
            }
          } else {
             // STANDARD ANIMATION (Win, Viginti, or legacy)
             // Highlight all involved cards
             setActiveHighlightIds(crit.cardIds || []);
             
             // Update Row Values to full immediately
             setRowValues(prev => ({
                    ...prev,
                    [i]: { 
                        chips: crit.chips, 
                        mult: crit.multiplier, 
                        count: crit.count
                    }
             }));

             // Reveal Chips
             setVisibleChips(prev => [...prev, i]);
             setVisibleMults(prev => [...prev, i]);

             // Add chips to running score
              if (crit.chips > 0) {
                runningChips += crit.chips;
                const isOutcome = crit.id === 'win' || crit.id === 'viginti';
                if (!isOutcome) {
                  setDisplayScore(runningChips);
                  setPulseScore(true);
                  setTimeout(() => setPulseScore(false), 400);
                }
              }
              
              await wait(500);
          }
          
          await wait(200); // Transition beat
        }

        // All +Chips shown, clear active highlight before mults
        setActiveCriteriaIdx(null);
        setActiveHighlightIds(null);

        // Chips done. Preparing for Mults.
        await wait(200);
        if (canceled) return;

        // PHASE 2: Show Multipliers (Aggregation)
        // We already showed individual mults in the rows, now we create the Summed Pill
        for (let i = 0; i < criteria.length; i++) {
          if (canceled) return;
          const crit = criteria[i];

          // Add to total mult
          if (crit.multiplier > 0) {
            // Show container if not already visible
            if (!multVisible) {
              multVisible = true;
              setShowMultContainer(true);
            }

            runningMult += crit.multiplier;
            setDisplayMult(runningMult);
            setPulseMult(true);
            setTimeout(() => setPulseMult(false), 400);
            
            await wait(400);
          }
        }
      };

      runAnimation();

      return () => { canceled = true; setIsSlidingMult(false); setIsQuickFading(false); setShowMultContainer(false); setActiveCriteriaIdx(null); setActiveHighlightIds(null); };
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
              <div className={`${styles.itemName} ${item.id === 'viginti' ? styles.isViginti : ''}`}>
                {item.name}
                {/* Use rowValues for dynamic count if available, else static item.count */}
                {(rowValues[idx]?.count ?? item.count) > 1 && <span className={styles.itemCount}>x{rowValues[idx]?.count ?? item.count}</span>}
              </div>
              <div className={`${styles.itemChips} ${visibleChips.includes(idx) ? styles.visible : ''} ${item.id === 'viginti' ? styles.isViginti : ''}`}>
                {`+${rowValues[idx]?.chips ?? item.chips}`}
              </div>
              <div className={`${styles.itemMult} ${visibleMults.includes(idx) ? styles.visible : ''}`}>
                {`x${(rowValues[idx]?.mult ?? item.multiplier).toFixed(1)}`}
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

              const currentCrit = activeCriteriaIdx !== null ? hand.finalScore?.criteria[activeCriteriaIdx] : null;
              
              // New Highlight Logic: Use activeHighlightIds if present, otherwise fall back to criteria
              let isHighlighted = false;
              if (activeHighlightIds) {
                isHighlighted = activeHighlightIds.includes(card.id);
              } else if (currentCrit && currentCrit.cardIds) {
                isHighlighted = currentCrit.cardIds.includes(card.id);
              }
              // Exclude highlighting for basic Win/Viginti as requested
              const shouldHighlight = isHighlighted && currentCrit?.id !== 'win' && currentCrit?.id !== 'viginti';

              return (
                <div
                  key={card.id}
                  className={`${styles.cardWrapper} ${shouldHighlight ? styles.highlighted : ''}`}
                  style={{
                    transform: `rotate(${rotate}deg) translateY(${translateY}px)`,
                    transformOrigin: '50% 250%',
                    '--rotate': `${rotate}deg`,
                    '--translateY': `${translateY}px`
                  } as any}
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
            <div className={`${styles.overlayText} ${(activeCriteriaIdx !== null &&
                hand.finalScore?.criteria[activeCriteriaIdx].id !== 'win' &&
                hand.finalScore?.criteria[activeCriteriaIdx].id !== 'viginti') ? styles.faded : ''
              }`}>
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
                  <div className={`${styles.winOverlay} ${styles.slamEnter}`}>WIN</div>
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
                className={`${styles.scoreValue} ${pulseScore ? styles.pulse : ''} ${hand.isBust ? styles.isBust :
                    isViginti && !hand.isBust ? styles.isViginti :
                      isWin ? styles.isWin :
                        (!isWin && hand.resultRevealed && !hand.isBust && !isViginti) ? styles.isLoss : ''
                  }`}>
                {displayScore}
              </div>

              {/* Mult on Right Positioned Absolutely */}
              <div className={`${styles.multContainer} ${showMultContainer ? styles.visible : ''} ${isSlidingMult ? styles.sliding : ''} ${isQuickFading ? styles.quickFade : ''}`}>
                <span className={`${styles.multValue} ${pulseMult ? styles.pulse : ''}`}>
                  x{displayMult.toFixed(1)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
