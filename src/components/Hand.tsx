

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
  isSelected?: boolean;
  id?: string;
  onDealAnimationComplete?: () => void;
  onCardDealSound?: (cardId: string) => void;
  onCardFlipSound?: (cardId: string) => void;
  onCardDiscardSound?: (cardId: string) => void;
  selectableCardIds?: string[];
  onCardSelect?: (cardId: string) => void;
  tableActionColor?: string;
  hiddenCardIds?: string[];
  entryAnimationOverrides?: Record<string, { xOffset: number; yOffset: number; scale: number }>;
}

import { useGameStore } from '../store/gameStore';

export const Hand: React.FC<HandProps> = ({ hand, onSelect, canSelect, baseDelay = 0, stagger = true, isScoringFocus = false, isEnlarged = false, isSelected = false, id, onDealAnimationComplete, onCardDealSound, onCardFlipSound, onCardDiscardSound, selectableCardIds, onCardSelect, tableActionColor, hiddenCardIds, entryAnimationOverrides }) => {
  const triggerScoringRow = useGameStore(state => state.triggerScoringRow);
  const triggerVigintiSound = useGameStore(state => state.triggerVigintiSound);
  const playScoreRowSfx = useGameStore(state => state.playScoreRowSfx);
  // Determine if we should show overlay (bust or result revealed)
  const isViginti = hand.blackjackValue === 21;
  const isDealerHand = hand.id === -1;

  // Is this a winning hand that needs scoring animation?
  const isWin = hand.outcome === 'win';

  // Animation state driven by store
  const visibleScoringRowIndices = useGameStore(state => state.visibleScoringRowIndices[hand.id] || []);
  const scoringRowValues = useGameStore(state => state.scoringRowValues[hand.id] || {});
  const scoringCriteria = useGameStore(state => state.scoringCriteria[hand.id] || []);
  const activeHighlightIds = useGameStore(state => state.activeHighlightIds);
  const scoringHandIndex = useGameStore(state => state.scoringHandIndex);
  
  // Derived local animation flags
  const [displayScore, setDisplayScore] = useState(hand.blackjackValue);
  const [isScoreVisible, setIsScoreVisible] = useState(hand.id !== -1);

  const containerRef = useRef<HTMLDivElement>(null);
  const [transformOrigin, setTransformOrigin] = useState('center center');

  const animationRef = useRef<boolean>(false);

  // Reset state when hand ID changes or resets
  // Reset state when hand ID changes (new hand slot content)
  // Visual State for Cards (syncs with hand.cards but handles exit animations)
  // Store posIndex to lock position during discard
  const [visualCards, setVisualCards] = useState<Array<{ card: any, isDiscarding: boolean, posIndex: number, hasEntered: boolean }>>([]);
  const prevHandId = useRef(hand.id);
  const dealCompleteSentRef = useRef(false);
  const dealAnimationDoneRef = useRef<Set<string>>(new Set());
  const vigintiPlayedRef = useRef(false);
  const discardSoundPlayedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (hand.id === -1) return;
    if (hand.cards.length === 0) {
      vigintiPlayedRef.current = false;
      return;
    }
    if (!isViginti || hand.isBust) {
      vigintiPlayedRef.current = false;
      return;
    }
    if (!vigintiPlayedRef.current) {
      vigintiPlayedRef.current = true;
      triggerVigintiSound();
    }
  }, [hand.id, hand.cards.length, hand.isBust, isViginti, triggerVigintiSound]);

  // Sync hand.cards to visualCards
  useEffect(() => {
    // If hand ID changed, hard reset (new hand slot content)
    if (hand.id !== prevHandId.current) {
        setVisualCards(hand.cards.map((c, i) => ({ card: c, isDiscarding: false, posIndex: i, hasEntered: false })));
        prevHandId.current = hand.id;
        discardSoundPlayedRef.current.clear();
        return;
    }

    const newlyDiscarded: string[] = [];

    setVisualCards(prev => {
        const nextVisuals = [...prev];
        const currentIds = new Set(hand.cards.map(c => c.id));
        
        let maxPosIndex = -1;
        prev.forEach(vc => {
             if (vc.posIndex > maxPosIndex) maxPosIndex = vc.posIndex;
        });

        // 1. Mark removed cards as discarding
        nextVisuals.forEach((vc, idx) => {
            if (!currentIds.has(vc.card.id) && !vc.isDiscarding) {
                // Was present, now removed. Mark discarding.
                // Keep existing posIndex!
                nextVisuals[idx] = { ...vc, isDiscarding: true };
                if (!discardSoundPlayedRef.current.has(vc.card.id)) {
                    discardSoundPlayedRef.current.add(vc.card.id);
                    newlyDiscarded.push(vc.card.id);
                }
            }
        });

        // 2. Add new cards
        hand.cards.forEach((c, i) => {
            const existingIdx = nextVisuals.findIndex(vc => vc.card.id === c.id);
            if (existingIdx === -1) {
                // New card: append
                // Determine posIndex. It should be the index in the NEW hand provided by props?
                // Or sequential? 
                // Using 'i' from hand.cards provides the target slot.
                nextVisuals.push({ card: c, isDiscarding: false, posIndex: i, hasEntered: false });
            } else {
                // Ensure it's not marked discarding if it came back
                if (nextVisuals[existingIdx].isDiscarding) {
                     nextVisuals[existingIdx] = { ...nextVisuals[existingIdx], isDiscarding: false };
                }
                nextVisuals[existingIdx].card = c;
                // Update posIndex to match current hand state (shift if needed)
                nextVisuals[existingIdx].posIndex = i;
                // Preserve existing hasEntered state (or default to true if undefined safety)
                // We do NOT force true here, to allow animation to complete if rapid updates occur.
                // The useEffect will handle setting it to true.
                if (nextVisuals[existingIdx].hasEntered === undefined) {
                     nextVisuals[existingIdx].hasEntered = true;
                }
            }
        });
        
        return nextVisuals;
    });

    if (onCardDiscardSound && newlyDiscarded.length > 0) {
        newlyDiscarded.forEach(cardId => onCardDiscardSound(cardId));
    }
  }, [hand.cards, hand.id, onCardDiscardSound]);

  // Cleanup discarding cards
  useEffect(() => {
      const discardingIndices = visualCards.map((vc, i) => vc.isDiscarding ? i : -1).filter(i => i !== -1);
      
      if (discardingIndices.length > 0) {
          // Calculate max delay based on position in visual list (matching render logic)
          // We use simple index-based staggering: idx * 0.1s
          const maxIndex = Math.max(...discardingIndices);
          const maxDelay = maxIndex * 100; // ms

          const timer = setTimeout(() => {
              setVisualCards(prev => prev.filter(vc => !vc.isDiscarding));
          }, 550 + maxDelay); // Animation duration (0.42s) + buffer + stagger
          return () => clearTimeout(timer);
      }
  }, [visualCards]);

  // Cleanup entering cards (Z-index layering fix)
  // Automatically mark cards as "entered" after animation duration to drop their Z-index
  useEffect(() => {
     const enteringIds = visualCards
        .filter(vc => !vc.hasEntered && !vc.isDiscarding)
        .map(vc => vc.card.id);

      if (enteringIds.length > 0) {
          // Calculate max required delay
          let maxDelayInSeconds = 0;
          visualCards.forEach((vc, idx) => {
             if (enteringIds.includes(vc.card.id)) {
                 // Match logic in render: delay + stagger
                 const cardDelay = (vc.card.origin === 'deck' ? baseDelay + (stagger ? idx * 0.5 : 0) : 0);
                 if (cardDelay > maxDelayInSeconds) maxDelayInSeconds = cardDelay;
             }
          });

          // Convert to ms and add animation duration buffer (600ms)
          const timeoutDuration = (maxDelayInSeconds * 1000) + 600;

          const timer = setTimeout(() => {
              setVisualCards(prev => prev.map(vc => {
                  if (enteringIds.includes(vc.card.id)) {
                      return { ...vc, hasEntered: true };
                  }
                  return vc;
              }));
          }, timeoutDuration); 
          return () => clearTimeout(timer);
      }
  }, [visualCards, baseDelay, stagger]);

  const maybeNotifyDealComplete = () => {
      if (!onDealAnimationComplete) return;
      if (dealCompleteSentRef.current) return;

      const expectedIds = hand.cards
          .filter(c => c.origin === 'deck')
          .map(c => c.id);

      if (expectedIds.length === 0) return;

      const allDone = expectedIds.every(id => dealAnimationDoneRef.current.has(id));
      if (allDone) {
          dealCompleteSentRef.current = true;
          onDealAnimationComplete();
      }
  };

  const handleDealAnimationEnd = (cardId: string) => {
      dealAnimationDoneRef.current.add(cardId);
      setVisualCards(prev => prev.map(vc => (
        vc.card.id === cardId ? { ...vc, hasEntered: true } : vc
      )));
      maybeNotifyDealComplete();
  };

  useEffect(() => {
      if (hand.cards.length === 0) {
          dealAnimationDoneRef.current.clear();
          dealCompleteSentRef.current = false;
      }
      maybeNotifyDealComplete();
  }, [hand.cards.length]);

  useEffect(() => {
      dealAnimationDoneRef.current.clear();
      dealCompleteSentRef.current = false;
      discardSoundPlayedRef.current.clear();
  }, [hand.id]);

  // Reset state when hand ID changes (new hand slot content)
  useEffect(() => {
    setDisplayScore(hand.blackjackValue);
    setIsScoreVisible(hand.id !== -1);
  }, [hand.id]);

  // Reset animation state when hand score is cleared (new round with same hand ID)
  useEffect(() => {
    if (!hand.finalScore) {
      animationRef.current = false;
    }
  }, [hand.finalScore]);

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

  // Ensure displayScore updates only when cards have entered (prevents premature score reveal)
  useEffect(() => {
    const hasEnteringCards = visualCards.some(vc => !vc.isDiscarding && !vc.hasEntered);
    if (!hasEnteringCards) {
      setDisplayScore(hand.blackjackValue);
    }
  }, [hand.blackjackValue, visualCards]);

  const animationSpeed = useGameStore(state => state.animationSpeed);

// Local scoring animation removed - logic moved to EventPlayer.ts



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

  // Check if any card is currently animating from draw pile
  const hasAnimatingCard = hand.cards.some(c => c.origin === 'draw_pile');
  const hasPendingDealerDealAnimation = isDealerHand && visualCards.some(vc =>
    !vc.isDiscarding &&
    !vc.hasEntered &&
    (vc.card.origin === 'deck' || vc.card.origin === 'double_down')
  );
  const showBustOverlay = hand.isBust && !hasPendingDealerDealAnimation;
  const showVigintiOverlay = isViginti && !hand.isBust && !hasPendingDealerDealAnimation;
  const showOverlay =
    (showBustOverlay || showVigintiOverlay || hand.isDoubled || hand.resultRevealed) &&
    hand.cards.length > 0;
  const overlayFanDepthPx = Math.max(0, visualCards.length - 1);
  const useOverlayScrim = isDealerHand && showOverlay;

  return (
    <div
      ref={containerRef}
      className={`${styles.handContainer} ${canSelect ? styles.clickable : ''} ${(isScoringFocus || isEnlarged) ? styles.scoringFocus : ''}`}
      onClick={canSelect ? (e) => {
        e.stopPropagation();
        onSelect?.();
      } : undefined}
      style={{ 
        transformOrigin,
        zIndex: hasAnimatingCard ? 100 : undefined // Boost z-index when animating
      }}
      id={id}
    >
      {/* Scoring List */}
      {hand.outcome === 'win' && (
        <div
          id={isScoringFocus ? 'score-rows-zone' : undefined}
          className={styles.scoringList}
        >
          {scoringCriteria.map((item: any, idx: number) => (
            <div
              key={`${item.id}-${idx}`}
              className={`${styles.scoringItem} ${visibleScoringRowIndices.includes(idx) ? styles.visible : ''}`}
            >
              <div className={`${styles.itemName} ${item.id === 'viginti' ? styles.isViginti : ''}`}>
                {item.name}
                {(scoringRowValues[idx]?.count ?? 0) > 1 && <span className={styles.itemCount}>x{scoringRowValues[idx].count}</span>}
              </div>
              <div className={`${styles.itemChips} ${item.id === 'viginti' ? styles.isViginti : ''}`}>
                <span className={(scoringRowValues[idx]?.chips !== undefined && visibleScoringRowIndices.length > idx) ? styles.visible : ''}>
                  {(scoringRowValues[idx]?.chips ?? 0) === 0 ? '-' : `$${scoringRowValues[idx]?.chips}`}
                </span>
              </div>
              <div className={styles.itemMult}>
                <span className={(scoringRowValues[idx]?.mult !== undefined && visibleScoringRowIndices.length > idx) ? styles.visible : ''}>
                  {(scoringRowValues[idx]?.mult ?? 0) === 0 ? '-' : `x${(scoringRowValues[idx]?.mult ?? 0).toFixed(1)}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className={`${styles.hand} ${canSelect ? styles.activeTarget : ''} ${isSelected ? styles.selected : ''}`}
      >
        <div className={`${styles.cardsContainer} ${showOverlay && !useOverlayScrim ? styles.tinted : ''}`}>
          <div className={styles.cards}>
            {visualCards.map(({ card, isDiscarding, posIndex, hasEntered }, idx) => {
              // const styles = require('./Hand.module.css').default; 
              
              // Use index relative to the FULL set for positioning continuity
              const startTxBase = (1 - hand.id) * 270;
              
              const total = hand.cards.length > 0 ? hand.cards.length : visualCards.length; 
              // If emptying hand (safety net), hand.cards is 0. 
              // We want to use the OLD total (visualCards.length) or the max posIndex?
              // Ideally fan shape should be preserved.
              // If hand.cards.length > 0, we use that for center? No, because duplicates exist in visual.
              // We should use the maximum potential index to define the fan center, or 
              // just use the visual set length if it's a discard event?
              
              // Correct Logic: 
              // If discarding, we want to maintain the fan shape as if the cards were still there.
              // 'total' should be the number of cards BEFORE deletion?
              // The 'posIndex' tells us where it WAS.
              // We can estimate 'total' effectively by visualCards.length which includes both kept and discarding.
              
              const activeTotal = visualCards.length;
              const center = (activeTotal - 1) / 2;
              
              // Use posIndex for position calculation to lock it!
              // But wait, if new cards are added, they get new posIndex.
              // Does posIndex need to be recomputed for remaining cards?
              // Yes, in effect 2 above, we update posIndex for kept cards.
              
              const rotate = (posIndex - center) * 5;
              const translateY = Math.abs(posIndex - center) * 2;

              const isDoubleCard = card.origin === 'double_down';

              // Determine highlighting first to use in placement
              const isHighlighted = !!(activeHighlightIds && activeHighlightIds.includes(card.id));
              const shouldHighlight = isHighlighted && isScoringFocus;
              const isTableActionSelectable = !!(selectableCardIds && selectableCardIds.includes(card.id));
              const isHidden = !!(hiddenCardIds && hiddenCardIds.includes(card.id));
              const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
                event.stopPropagation();
                if (isTableActionSelectable) {
                  onCardSelect?.(card.id);
                }
              };

              // Placement Logic
              let wrapperRotate = rotate;
              let wrapperTranslateY = translateY;

              if (isDoubleCard && posIndex > 0 && !shouldHighlight) {
                // Match previous card slot to overlap ONLY IF NOT HIGHLIGHTED
                wrapperRotate = ((posIndex - 1) - center) * 5;
                wrapperTranslateY = Math.abs((posIndex - 1) - center) * 2;
              }

              const entryOverride =
                card.origin === 'draw_pile' && !isDiscarding
                  ? entryAnimationOverrides?.[card.id]
                  : undefined;
              const sourceOffsetX = entryOverride?.xOffset ?? (card.animationOffset || 0);
              const sourceOffsetY = entryOverride?.yOffset ?? -200;
              const sourceScale = entryOverride?.scale ?? 1.1;

              // Animation Coordinates (Screen Space)
              const screenDx = isDoubleCard ? (startTxBase + 120) : (startTxBase + sourceOffsetX);
              const screenDy = isDoubleCard ? -400 : sourceOffsetY;

              // Discard Stagger Calculation
              const discardDelay = isDiscarding ? (idx * 0.1) : 0;
              const cardDelay = isDiscarding
                ? discardDelay
                : (card.origin === 'deck' ? baseDelay + (stagger ? idx * 0.5 : 0) : 0);
              
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
                  className={`${styles.cardWrapper} ${shouldHighlight ? styles.highlighted : ''} ${isTableActionSelectable ? styles.tableActionTarget : ''} ${isHidden ? styles.cardHidden : ''}`}
                  style={{
                    transform: `translateX(${xOffset}px) rotate(${wrapperRotate}deg) translateY(${wrapperTranslateY}px)`,
                    transformOrigin: '50% 250%',
                    '--rotate': `${wrapperRotate}deg`,
                    '--translateY': `${wrapperTranslateY}px`,
                    zIndex: (isDiscarding || (!hasEntered && (card.origin === 'draw_pile' || card.origin === 'double_down'))) ? 100 : idx,
                    ...(isTableActionSelectable && tableActionColor ? { '--table-action-color': tableActionColor } : {})
                  } as any}
                >
                  <div className={isDiscarding ? styles.discardingCard : ''} style={{ width: '100%', height: '100%', animationDelay: `${discardDelay}s` }}>
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
                        origin={isDiscarding ? 'discard' : card.origin}
                         delay={cardDelay}
                      style={{
                        '--start-tx': `${animTx}px`,
                        '--start-ty': `${animTy}px`,
                        '--start-scale': `${sourceScale}`
                      } as React.CSSProperties}
                        suppressSpecialVisuals={hand.id === -1}
                        suppressEnterAnimation={hasEntered}
                        onEnterAnimationEnd={handleDealAnimationEnd}
                        onDealSound={onCardDealSound}
                        onFlipSound={onCardFlipSound}
                        onClick={isTableActionSelectable ? handleCardClick : undefined}
                      />
                    </div>
                  ) : (
                    <PlayingCard
                      origin={isDiscarding ? 'discard' : card.origin}
                      delay={cardDelay}
                      style={{
                        '--start-tx': `${screenDx}px`,
                        '--start-ty': `${screenDy}px`,
                        '--start-scale': `${sourceScale}`
                      } as React.CSSProperties}
                      suppressSpecialVisuals={hand.id === -1}
                      suppressEnterAnimation={hasEntered}
                      onEnterAnimationEnd={handleDealAnimationEnd}
                      onDealSound={onCardDealSound}
                      onFlipSound={onCardFlipSound}
                      onClick={isTableActionSelectable ? handleCardClick : undefined}
                      card={card} // Ensure card reference is correct
                    />
                  )}
                  </div>
                </div>
              );
            })}
          </div>

          {useOverlayScrim && (
            <div
              className={styles.overlayScrim}
              style={{ '--overlay-fan-depth': `${overlayFanDepthPx}px` } as React.CSSProperties}
            />
          )}

          {/* Overlay text on cards */}
          {showOverlay && (
            <div className={`${styles.overlayText} ${isScoringFocus ? styles.faded : ''}`}>

              {showBustOverlay && (
                <div className={styles.overlayItem}>
                  <div className={`${styles.bustOverlay} ${styles.slamEnter}`}>BUST</div>
                </div>
              )}
              {/* Only show VIGINTI if it's actually 21, regardless of win status logic, but usually implied win */}
              {showVigintiOverlay && (
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
          {hand.cards.length > 0 && isScoreVisible && displayScore > 0 && (
            <div className={`${styles.scoreContainer} ${hand.id === -1 ? styles.scoreFadeIn : ''}`}>
              <div
                id={`hand-score-${hand.id}`}
                className={`${styles.scoreValue} ${hand.isBust ? styles.isBust :
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
