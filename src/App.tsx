import React, { useState } from 'react';
import styles from './App.module.css';
import { useGameStore } from './store/gameStore';
import { PlayingCard } from './components/PlayingCard';
import { Hand } from './components/Hand';
import { DeckView } from './components/DeckView';
import { HandRankingsView } from './components/HandRankingsView';
import { PhysicsPot } from './components/PhysicsPot';
import { TitlePhysics } from './components/TitlePhysics';
import titleStyles from './components/TitlePhysics.module.css';
import { CasinoListingView } from './components/CasinoListingView';
import type { PlayerHand } from './types';

export default function App() {
  const { 
    deck,
    dealer, 
    discardPile,
    playerHands, 
    drawnCard, 
    dealerMessage,
    dealerMessageExiting,
    phase, 
    round, 
    totalScore, 
    targetScore,
    handsRemaining,
    startGame, 
    dealFirstHand,
    drawCard, 
    assignCard, 
    holdReturns,
    nextRound,
    scoringHandIndex,
    isInitialDeal,
    scoringDetails,
    isCollectingChips,
    chipCollectionComplete,
    setAnimationSpeed,
    incrementScore,
    triggerDebugChips
  } = useGameStore();

  const [showDeck, setShowDeck] = useState(false);
  const [showHandRankings, setShowHandRankings] = useState(false);
  const [showCasinoListing, setShowCasinoListing] = useState(false);
  const [overlayComplete, setOverlayComplete] = useState(false);
  const [scoreAnimate, setScoreAnimate] = useState(false);

  const drawAreaRef = React.useRef<HTMLDivElement>(null);
  const [drawAreaCenter, setDrawAreaCenter] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  React.useEffect(() => {
    const updateCenter = () => {
      if (drawAreaRef.current) {
        const rect = drawAreaRef.current.getBoundingClientRect();
        setDrawAreaCenter({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        });
      }
    };
    updateCenter();
    window.addEventListener('resize', updateCenter);
    // Also update when phase changes as layout might shift
    const timer = setTimeout(updateCenter, 100); 
    return () => {
        window.removeEventListener('resize', updateCenter);
        clearTimeout(timer);
    };
  }, [phase, playerHands.length]);

  const [displayRound, setDisplayRound] = useState(round);
  const [displayTarget, setDisplayTarget] = useState(targetScore);

  const [handsAnimate, setHandsAnimate] = useState(false);
  const prevHandsRemaining = React.useRef(handsRemaining);

  const [roundAnimate, setRoundAnimate] = useState(false);
  const [targetAnimate, setTargetAnimate] = useState(false);
  const runInitializedRef = React.useRef(false);

  React.useEffect(() => {
    if (handsRemaining < prevHandsRemaining.current) {
        setHandsAnimate(true);
        const timer = setTimeout(() => setHandsAnimate(false), 500);
        prevHandsRemaining.current = handsRemaining;
        return () => clearTimeout(timer);
    } else {
        prevHandsRemaining.current = handsRemaining;
    }
  }, [handsRemaining]);

  // Handle value updates for Casino and Target
  React.useEffect(() => {
    if (phase === 'entering_casino') {
        setOverlayComplete(false);
        
        // Wait for HUD to arrive at center (0.8s transition)
        const transitionTimer = setTimeout(() => {
            // Update values and trigger pulse animations
            if (round !== displayRound) {
                setDisplayRound(round);
                setRoundAnimate(true);
                setTimeout(() => setRoundAnimate(false), 500);
            }
            if (targetScore !== displayTarget) {
                setDisplayTarget(targetScore);
                setTargetAnimate(true);
                setTimeout(() => setTargetAnimate(false), 500);
            }
        }, 800);

        // Calculate exit delay
        const delay = round === 1 ? 1080 : 1800;
        const exitTimer = setTimeout(() => {
            setOverlayComplete(true);
        }, delay);

        return () => {
            clearTimeout(transitionTimer);
            clearTimeout(exitTimer);
        };
    } else {
        // Sync values if they change while already in HUD mode (optional safety)
        setDisplayRound(round);
        setDisplayTarget(targetScore);
    }
  }, [phase, round, targetScore]);

  // Synchronize display values immediately when starting a new run (Round 1) 
  // to avoid showing old run values or starting from the top of the screen.
  if (phase === 'entering_casino' && round === 1) {
    if (!runInitializedRef.current) {
        setOverlayComplete(false);
        setDisplayRound(1);
        setDisplayTarget(targetScore);
        runInitializedRef.current = true;
    }
  } else {
    runInitializedRef.current = false;
  }

  const isOverlayMode = phase === 'entering_casino' && !overlayComplete;

  const handleDraw = () => {
    drawCard();
  };

  const handleHandClick = (index: number) => {
    if (drawnCard) {
        assignCard(index);
    }
  };
  
  const canDraw = phase === 'playing' && !drawnCard && !dealer.isRevealed && !isInitialDeal;
  const canHold = phase === 'playing' && !drawnCard && !dealer.isRevealed && !isInitialDeal; 
  const isDrawAreaVisible = phase === 'playing' && !dealer.isRevealed && !isInitialDeal; 

  const activeCards = [
      ...dealer.cards.filter((_, idx) => idx !== 0 || dealer.isRevealed),
      ...playerHands.flatMap(h => h.cards),
      ...(drawnCard ? [drawnCard] : []),
      ...discardPile
  ];


  if (phase === 'init') {
      return (
          <div className={styles.container} style={{justifyContent:'center', cursor: 'pointer'}} onClick={startGame}>
              <TitlePhysics />
              <div className={styles.titleContainer}>
                  <h1 className={titleStyles.titleText}>
                      {"VIGINTI".split('').map((char, i) => (
                          <span key={i} className={titleStyles.letter} data-index={i}>{char}</span>
                      ))}
                  </h1>
                  <button className={`${styles.button} ${styles.startRunButton}`} style={{zIndex: 1}}>Start Run</button>
              </div>
          </div>
      );
  }

  if (phase === 'game_over') {
      return (
          <div className={styles.container} style={{justifyContent:'center'}}>
              <h1 style={{fontSize:'3rem', color: '#ff4444', marginBottom: 20}}>GAME OVER</h1>
              <p style={{fontSize:'1.5rem', color: '#fff', marginBottom: 10}}>
                  Failed to beat Casino {round}
              </p>
              <p style={{fontSize:'1.2rem', color: '#aaa', marginBottom: 40}}>
                  Final Score: {totalScore} / {targetScore}
              </p>
              <button className={styles.button} onClick={startGame}>Try Again</button>
          </div>
      );
  }


  // Construct Dealer Props
  const dealerHandProps: PlayerHand = {
      id: -1,
      cards: dealer.cards,
      isHeld: true,
      isBust: dealer.blackjackValue > 21,
      blackjackValue: dealer.blackjackValue
  };

  // Click anywhere to hit (draw) or advance to next round
  const handleGlobalClick = (e: React.MouseEvent) => {
    if (showDeck || showHandRankings || showCasinoListing) return;
    
    // Ignore clicks on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    
    // Speed up animations if dealer is revealed (Dealer Turn OR Scoring Phase)
    // and the round is not yet over.
    const canSpeedUp = dealer.isRevealed && phase !== 'round_over';
    
    if (canSpeedUp) {
        setAnimationSpeed(3);
    }

    if (canDraw) {
        handleDraw();
    } else if (phase === 'round_over') {
        nextRound();
    } else if (phase === 'entering_casino') {
        // Allow global click to start dealing 
        dealFirstHand();
    }
  };

  return (
    <div className={styles.container} onClick={handleGlobalClick}>
      <header 
        className={`${styles.header} ${isOverlayMode ? styles.headerCentered : ''}`}
        style={isOverlayMode ? { top: drawAreaCenter.y - 20 } : {}}
      >
        <div className={styles.stat}>
            <span className={styles.statLabel}>Casino</span>
            <span key={displayRound} className={`${styles.statValue} ${roundAnimate ? styles.statValueAnimate : ''}`}>{displayRound}</span>
        </div>
        <div className={styles.stat}>
            <span className={styles.statLabel}>Target</span>
            <span key={displayTarget} className={`${styles.statValue} ${targetAnimate ? styles.statValueAnimate : ''}`}>{displayTarget}</span>
        </div>
        <div className={`${styles.stat} ${isOverlayMode ? styles.statHidden : ''}`}>
            <span className={styles.statLabel}>Score</span>
            <span 
                id="total-score-display" 
                key={totalScore}
                className={`${styles.statValue} ${scoreAnimate ? styles.statValueAnimate : ''}`}
            >
                {totalScore}
            </span>
        </div>
        <div className={`${styles.stat} ${isOverlayMode ? styles.statHidden : ''}`}>
            <span className={styles.statLabel}>Deals</span>
            <span key={handsRemaining} className={`${styles.statValue} ${handsAnimate ? styles.statValueAnimate : ''}`}>{handsRemaining}</span>
        </div>
      </header>
      
      <div className={styles.headerSpacer} />
      
      {/* Remove CasinoIntroOverlay usage */}
      
      <PhysicsPot 
         scoreDetails={scoringDetails}
         isCollecting={isCollectingChips}
         targetId="total-score-display"
         center={drawAreaCenter}
         onCollectionComplete={chipCollectionComplete}
         onChipArrived={(val) => {
             incrementScore(val);
             setScoreAnimate(true);
             setTimeout(() => setScoreAnimate(false), 200);
         }}
      />
      
      <div className={styles.board}>
          <div className={styles.dealerZone}>
             <div className={styles.zoneLabel}>Dealer</div>
             <div style={{ pointerEvents: 'none', position: 'relative' }}>
               <Hand 
                 key={`dealer-${handsRemaining}`}
                 hand={dealerHandProps} 
                 baseDelay={dealer.isRevealed ? 0 : (playerHands.length * 0.5)}
                 stagger={!dealer.isRevealed} 
               />

             </div>
          </div>
          
          <div className={styles.middleZone} style={{ position: 'relative' }}>
              {dealerMessage && (
                 <div 
                    className={`${styles.dealerMessage} ${dealerMessageExiting ? styles.dealerMessageExiting : ''}`}
                 >
                    {dealerMessage}
                 </div>
              )}
              <div className={styles.drawAreaContainer} ref={drawAreaRef}>
                  <div className={`${styles.drawnCardSpot} ${!drawnCard && canDraw ? styles.hitSpot : ''} ${!isDrawAreaVisible ? styles.hiddenSpot : ''}`}>
                      {drawnCard ? (
                          <PlayingCard 
                              card={drawnCard} 
                              isDrawn 
                              origin={drawnCard.origin}
                          />
                      ) : (
                          canDraw ? <span className={styles.hitText}>HIT</span> : null
                      )}
                  </div>
                  
                  <div className={styles.infoTextContainer}>
                      {drawnCard ? (
                          <div className={styles.instructions}>Select a hand for this card</div>
                      ) : (
                          canDraw && <div className={styles.clickAnywhere}>Click Anywhere</div>
                      )}
                  </div>
              </div>
          </div>
          
          <div className={styles.playerZone}>
              {playerHands.map((hand, idx) => (
                  <Hand 
                    key={`${hand.id}-${handsRemaining}`} 
                    hand={hand} 
                    canSelect={!!drawnCard && !hand.isBust && hand.blackjackValue !== 21}
                    onSelect={() => handleHandClick(idx)}
                    baseDelay={idx * 0.5}
                    isScoringFocus={idx === scoringHandIndex}
                  />
              ))}
          </div>

          {phase === 'playing' && (
             <button 
                className={styles.standButton} 
                onClick={holdReturns} 
                disabled={!canHold}
             >
                Stand
             </button>
          )}
      {(phase === 'round_over' || phase === 'entering_casino') && (
             <button 
                className={styles.nextRoundButton} 
                onClick={phase === 'entering_casino' ? dealFirstHand : nextRound}
             >
                 {phase === 'entering_casino' ? 'Deal' : (totalScore >= targetScore ? 'Next Casino' : 'Deal')}
             </button>
          )}
      </div>

      <button className={styles.deckBtn} onClick={() => setShowDeck(true)}>
          Deck
      </button>

      <button className={styles.handsBtn} onClick={() => setShowHandRankings(true)}>
          Scores
      </button>

      <button className={styles.casinosBtn} onClick={() => setShowCasinoListing(true)}>
          Casinos
      </button>

      {(phase === 'round_over' || phase === 'entering_casino') && (
        <button className={styles.debugBtn} onClick={triggerDebugChips}>
            +Chips
        </button>
      )}

      {showDeck && (
          <DeckView 
            remainingDeck={deck} 
            activeCards={activeCards} 
            onClose={() => setShowDeck(false)} 
          />
      )}

      {showHandRankings && (
          <HandRankingsView 
            onClose={() => setShowHandRankings(false)} 
          />
      )}

      {showCasinoListing && (
          <CasinoListingView
            currentRound={round}
            onClose={() => setShowCasinoListing(false)}
          />
      )}
    </div>
  );
}
