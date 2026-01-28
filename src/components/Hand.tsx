

import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
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
  isEnlarged?: boolean;
}

import { useGameStore } from '../store/gameStore';

export const Hand: React.FC<HandProps> = ({ hand, onSelect, canSelect, baseDelay = 0, stagger = true, isScoringFocus = false, isEnlarged = false }) => {
  const triggerScoringRow = useGameStore(state => state.triggerScoringRow);
  // Determine if we should show overlay (bust or result revealed)
  const isViginti = hand.blackjackValue === 21;
  const showOverlay = (hand.isBust || isViginti || hand.isDoubled || (hand.finalScore !== undefined && hand.resultRevealed)) && hand.cards.length > 0;

  // Is this a winning hand that needs scoring animation?
  const isWin = !!(hand.finalScore && hand.resultRevealed);

  // Animation State
  const [displayScore, setDisplayScore] = useState(hand.blackjackValue);
  const [visibleItems, setVisibleItems] = useState<number[]>([]);
  const [visibleChips, setVisibleChips] = useState<number[]>([]);
  const [visibleMults, setVisibleMults] = useState<number[]>([]);
  const [activeCriteriaIdx, setActiveCriteriaIdx] = useState<number | null>(null);
  const [pulseScore, setPulseScore] = useState(false);
  const [isScoreVisible, setIsScoreVisible] = useState(hand.id !== -1);

  // New State for sequential updates
  const [rowValues, setRowValues] = useState<Record<number, { chips: number, mult: number, count: number }>>({});
  const [activeHighlightIds, setActiveHighlightIds] = useState<string[] | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [transformOrigin, setTransformOrigin] = useState('center center');

  const animationRef = useRef<boolean>(false);

  // Reset state when hand ID changes or resets
  // Reset state when hand ID changes (new hand slot content)
  useEffect(() => {
    setDisplayScore(hand.blackjackValue);
    setVisibleItems([]);
    setVisibleChips([]);
    setVisibleMults([]);
    setActiveCriteriaIdx(null);
    animationRef.current = false;
    setRowValues({});
    setActiveHighlightIds(null);
    setPulseScore(false);
    setIsScoreVisible(hand.id !== -1);
  }, [hand.id]);

  // Handle dealer score visibility delay
  useEffect(() => {
    if (hand.id === -1) {
      if (stagger) {
        // Delay matches baseDelay + wait for second card to flip (roughly 0.8s)
        const delay = (baseDelay + 0.8) * 1000;
        const timer = setTimeout(() => setIsScoreVisible(true), delay);
        return () => clearTimeout(timer);
      } else {
        setIsScoreVisible(true);
      }
    }
  }, [hand.id, baseDelay, stagger]);

  // Ensure displayScore updates immediately when hand value changes (card added)
  useEffect(() => {
    if (!isWin && !hand.resultRevealed) {
      setDisplayScore(hand.blackjackValue);
    }
  }, [hand.blackjackValue, isWin, hand.resultRevealed]);

  // Scoring Animation Sequence
  useEffect(() => {
    if (isWin && hand.finalScore && !animationRef.current && (isScoringFocus || isEnlarged)) {
      animationRef.current = true;

      let canceled = false;
      const criteria = hand.finalScore.criteria;

      const runAnimation = async () => {
        const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        // Initial delay
        await wait(0);

        // Track totals locally to avoid stale state in async function

        // PHASE 1: Show +Chips
        for (let i = 0; i < criteria.length; i++) {
          if (canceled) return;
          const crit = criteria[i];
          setActiveHighlightIds(null); 

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

              // Reveal Chips
              if (m === 0) {
                setVisibleChips(prev => [...prev, i]);
              }

              // 3. Add to Chips Pot
              if (match.chips > 0) {
                triggerScoringRow(match.chips, 0);
              }

              // Wait for stagger
              await wait(200);

              // Reveal Mult if first match
              if (m === 0) {
                setVisibleMults(prev => [...prev, i]);
              }

              // Add to Mult Pot
              if (match.multiplier > 0) {
                triggerScoringRow(0, match.multiplier);
              }

              // 4. Wait for user to see (total wait approx 600ms)
              await wait(400);
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

            // Reveal Chips & Mult staggered
            setVisibleChips(prev => [...prev, i]);
            if (crit.chips > 0) {
              triggerScoringRow(crit.chips, 0);
            }

            await wait(200);

            setVisibleMults(prev => [...prev, i]);
            if (crit.multiplier > 0) {
              triggerScoringRow(0, crit.multiplier);
            }

            await wait(500);
          }

          await wait(200); // Transition beat
        }
      };

      runAnimation();

      return () => { canceled = true; setActiveCriteriaIdx(null); setActiveHighlightIds(null); };
    }

    // If not winning or not revealed, ensure score matches state
    if (!isWin && !hand.resultRevealed) {
      setDisplayScore(hand.blackjackValue);
    }
  }, [isWin, hand.finalScore, isScoringFocus]);


  // Effect to determine transform origin
  useLayoutEffect(() => {
    if ((isScoringFocus || isEnlarged) && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        
        // We scale by 1.5
        const scaledWidth = rect.width * 1.5;
        const widthDiff = scaledWidth - rect.width;
        
        // Default center assumes expansion goes half left, half right
        const expansionPerSide = widthDiff / 2;
        
        const wouldGoOffLeft = (rect.left - expansionPerSide) < 20; // 20px padding
        const wouldGoOffRight = (rect.right + expansionPerSide) > (viewportWidth - 20);
        
        if (wouldGoOffLeft) {
            setTransformOrigin('left center');
        } else if (wouldGoOffRight) {
            setTransformOrigin('right center');
        } else {
            setTransformOrigin('center center');
        }
    }
    // Note: We do NOT reset to center on exit. 
    // This effectively preserves the origin during the shrink animation (scale 1.5 -> 1.0).
    // Switching origin while scaled > 1.0 would cause a visual jump.
    // When checks run again on next focus (at scale 1.0), it will seamlessly update.
  }, [isScoringFocus, isEnlarged]); // Re-eval when focus changes

  return (
    <div
      ref={containerRef}
      className={`${styles.handContainer} ${canSelect ? styles.clickable : ''} ${(isScoringFocus || isEnlarged) ? styles.scoringFocus : ''}`}
      onClick={canSelect ? (e) => {
        e.stopPropagation();
        onSelect?.();
      } : undefined}
      style={{ transformOrigin }}
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
              <div className={`${styles.itemChips} ${item.id === 'viginti' ? styles.isViginti : ''}`}>
                <span className={visibleChips.includes(idx) ? styles.visible : ''}>
                  {(rowValues[idx]?.chips ?? item.chips) === 0 ? '-' : `$${rowValues[idx]?.chips ?? item.chips}`}
                </span>
              </div>
              <div className={styles.itemMult}>
                <span className={visibleMults.includes(idx) ? styles.visible : ''}>
                  {(rowValues[idx]?.mult ?? item.multiplier) === 0 ? '-' : `x${(rowValues[idx]?.mult ?? item.multiplier).toFixed(1)}`}
                </span>
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
              const startTxBase = (1 - hand.id) * 270;


              const total = hand.cards.length;
              const center = (total - 1) / 2;
              const rotate = (idx - center) * 5;
              const translateY = Math.abs(idx - center) * 2;

              const isDoubleCard = hand.isDoubled && idx === total - 1;

              // Determine highlighting first to use in placement
              const currentCrit = activeCriteriaIdx !== null ? hand.finalScore?.criteria[activeCriteriaIdx] : null;
              let isHighlighted = false;
              if (activeHighlightIds) {
                isHighlighted = activeHighlightIds.includes(card.id);
              } else if (currentCrit && currentCrit.cardIds) {
                isHighlighted = currentCrit.cardIds.includes(card.id);
              }
              const shouldHighlight = !!(isHighlighted && activeCriteriaIdx !== null && currentCrit?.id !== 'win' && currentCrit?.id !== 'viginti');

              // Placement Logic
              let wrapperRotate = rotate;
              let wrapperTranslateY = translateY;

              if (isDoubleCard && idx > 0 && !shouldHighlight) {
                // Match previous card slot to overlap ONLY IF NOT HIGHLIGHTED
                wrapperRotate = ((idx - 1) - center) * 5;
                wrapperTranslateY = Math.abs((idx - 1) - center) * 2;
              }

              // Animation Coordinates (Screen Space)
              const screenDx = isDoubleCard ? (startTxBase + 120) : startTxBase;
              const screenDy = isDoubleCard ? -400 : -200;

              // Local Animation Coordinates (Correcting for Inner Rotation)
              // If Doubled, inner div is rotated 90deg clockwise.
              // Local X = Screen Y
              // Local Y = -Screen X
              const animTx = isDoubleCard ? screenDy : screenDx;
              // Note: screenDx is pos (right). -ScreenX = Left (Local Y Up?).
              // Wait, rotate 90 deg clockwise: X becomes Y, Y becomes -X.
              // Start -> End vector.
              // Screen Vector: (Dx, Dy).
              // Local Vector: (Dy, -Dx).
              const animTy = isDoubleCard ? -screenDx : screenDy;
              const xOffset = 0;


              return (
                <div
                  key={card.id}
                  className={`${styles.cardWrapper} ${shouldHighlight ? styles.highlighted : ''}`}
                  style={{
                    transform: `translateX(${xOffset}px) rotate(${wrapperRotate}deg) translateY(${wrapperTranslateY}px)`,
                    transformOrigin: '50% 250%',
                    '--rotate': `${wrapperRotate}deg`,
                    '--translateY': `${wrapperTranslateY}px`,
                    zIndex: idx
                  } as any}
                >
                  {isDoubleCard ? (
                    <div style={{
                      transform: shouldHighlight ? 'rotate(0deg)' : 'translateY(28px) rotate(90deg)',
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                    }}>
                      <PlayingCard
                        card={card}
                        origin={card.origin}
                        delay={card.origin === 'deck' ? baseDelay + (stagger ? idx * 0.5 : 0) : 0}
                        style={{
                          '--start-tx': `${animTx}px`,
                          '--start-ty': `${animTy}px`
                        } as React.CSSProperties}
                        suppressSpecialVisuals={hand.id === -1}
                      />
                    </div>
                  ) : (
                    <PlayingCard
                      card={card}
                      origin={card.origin}
                      delay={card.origin === 'deck' ? baseDelay + (stagger ? idx * 0.5 : 0) : 0}
                      style={{
                        '--start-tx': `${screenDx}px`,
                        '--start-ty': `${screenDy}px`
                      } as React.CSSProperties}
                      suppressSpecialVisuals={hand.id === -1}
                    />
                  )}
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

        <div className={styles.status}>
          {hand.cards.length > 0 && isScoreVisible && (
            <div className={`${styles.scoreContainer} ${hand.id === -1 ? styles.scoreFadeIn : ''}`}>
              <div
                id={`hand-score-${hand.id}`}
                className={`${styles.scoreValue} ${pulseScore ? styles.pulse : ''} ${hand.isBust ? styles.isBust :
                  isViginti && !hand.isBust ? styles.isViginti :
                    isWin ? styles.isWin :
                      (!isWin && hand.resultRevealed && !hand.isBust && !isViginti) ? styles.isLoss : ''
                }`}>
                {displayScore}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
