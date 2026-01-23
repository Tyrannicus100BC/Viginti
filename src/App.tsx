import React, { useState, useRef, useEffect } from 'react';
import styles from './App.module.css';
import { useGameStore } from './store/gameStore';
import { fireConfetti } from './utils/confetti';
import { PlayingCard } from './components/PlayingCard';
import { Hand } from './components/Hand';
import { DeckView } from './components/DeckView';
import { HandRankingsView } from './components/HandRankingsView';
import { PhysicsPot } from './components/PhysicsPot';
import { TitlePhysics } from './components/TitlePhysics';
import titleStyles from './components/TitlePhysics.module.css';
import { CasinoListingView } from './components/CasinoListingView';
import { EarlyCompletionPopup } from './components/EarlyCompletionPopup';

import { CompsWindow } from './components/CompsWindow';
import { RelicInventory } from './components/RelicInventory';
import { RelicStore } from './components/RelicStore';
import type { PlayerHand } from './types';

// Constants for layout
const CENTER_OFFSET = 270; // Distance of pots from center
const POT_VERTICAL_OFFSET = 120; // Move pots up from center

export default function App() {
    const {
        dealer,
        playerHands,
        deck,
        phase,
        round,
        nextRound,
        scoringHandIndex,
        isInitialDeal,
        isCollectingChips,
        runningSummary,

        totalScore,
        targetScore,
        comps,
        handsRemaining,

        isShaking,

        dealerMessage,
        dealerMessageExiting,
        drawnCard,
        discardPile,

        startGame,
        dealFirstHand,
        drawCard,
        assignCard,
        holdReturns,

        chipCollectionComplete,
        setAnimationSpeed,
        incrementScore,
        triggerDebugChips,
        completeRoundEarly,
        roundSummary,
        // showFinalScore removed
        // continueFromFinalScore removed

        // Double Down Actions
        startDoubleDown,
        cancelDoubleDown,
        confirmDoubleDown,
        interactionMode,
        debugWin,
        debugUndo,
        drawSpecificCard
    } = useGameStore();

    const [showDeck, setShowDeck] = useState(false);
    const [isSelectingDebugCard, setIsSelectingDebugCard] = useState(false);
    const [showHandRankings, setShowHandRankings] = useState(false);
    const [showCasinoListing, setShowCasinoListing] = useState(false);
    const [showCompsWindow, setShowCompsWindow] = useState(false);
    const [showRelicStore, setShowRelicStore] = useState(false);
    const [overlayComplete, setOverlayComplete] = useState(false);
    const [scoreAnimate, setScoreAnimate] = useState(false);

    const drawAreaRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
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
    const [displayComps, setDisplayComps] = useState(comps);

    const [handsAnimate, setHandsAnimate] = useState(false);
    const prevHandsRemaining = React.useRef(handsRemaining);
    const prevTotalScore = React.useRef(totalScore);

    const [roundAnimate, setRoundAnimate] = useState(false);
    const [targetAnimate, setTargetAnimate] = useState(false);
    const [compsAnimate, setCompsAnimate] = useState(false);
    const runInitializedRef = useRef(false);
    const confettiFiredRef = useRef(false);

    // Watch for Total Winnings appearance to fire confetti
    useEffect(() => {
        if (phase === 'playing') {
            confettiFiredRef.current = false;
        }

        if ((phase === 'round_over' || roundSummary) && runningSummary && runningSummary.chips > 0 && !confettiFiredRef.current) {
            if (canvasRef.current) {
                confettiFiredRef.current = true;
                canvasRef.current.width = window.innerWidth;
                canvasRef.current.height = window.innerHeight;

                fireConfetti(canvasRef.current, {
                    elementCount: 150,
                    spread: 130,
                    startVelocity: 55,
                    decay: 0.96,
                    originX: drawAreaCenter.x,
                    originY: drawAreaCenter.y - 60
                });
            }
        }
    }, [isCollectingChips, phase, !!runningSummary, !!roundSummary]);

    React.useEffect(() => {
        if (totalScore > prevTotalScore.current) {
            setScoreAnimate(true);
            const timer = setTimeout(() => setScoreAnimate(false), 500);
            prevTotalScore.current = totalScore;
            return () => clearTimeout(timer);
        }
        prevTotalScore.current = totalScore;
    }, [totalScore]);

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
                if (comps !== displayComps) {
                    setDisplayComps(comps);
                    setCompsAnimate(true);
                    setTimeout(() => setCompsAnimate(false), 500);
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
            setDisplayComps(comps);
        }
    }, [phase, round, targetScore, comps]);

    // Synchronize display values immediately when starting a new run (Round 1) 
    // to avoid showing old run values or starting from the top of the screen.
    if (phase === 'entering_casino' && round === 1) {
        if (!runInitializedRef.current) {
            setOverlayComplete(false);
            setDisplayRound(1);
            setDisplayTarget(targetScore);
            setDisplayComps(5);
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
        if (interactionMode === 'double_down_select') {
            confirmDoubleDown(index);
        } else if (drawnCard) {
            assignCard(index);
        }
    };

    const canDraw = phase === 'playing' && !drawnCard && !dealer.isRevealed && !isInitialDeal && interactionMode === 'default';
    const canDoubleDown = phase === 'playing' && !drawnCard && !dealer.isRevealed && !isInitialDeal; // Can start flow
    const canHold = phase === 'playing' && !drawnCard && !dealer.isRevealed && !isInitialDeal && interactionMode === 'default';
    const isDrawAreaVisible = phase === 'playing' && !dealer.isRevealed && !isInitialDeal;

    const activeCards = [
        ...dealer.cards.filter((_, idx) => idx !== 0 || dealer.isRevealed),
        ...playerHands.flatMap(h => h.cards),
        ...(drawnCard ? [drawnCard] : []),
        ...discardPile
    ];


    if (phase === 'init') {
        return (
            <div className={styles.container} style={{ justifyContent: 'center', cursor: 'pointer' }} onClick={startGame}>
                <TitlePhysics />
                <div className={styles.titleContainer}>
                    <h1 className={titleStyles.titleText}>
                        {"VIGINTI".split('').map((char, i) => (
                            <span key={i} className={titleStyles.letter} data-index={i}>{char}</span>
                        ))}
                    </h1>
                    <button className={`${styles.button} ${styles.startRunButton}`} style={{ zIndex: 1 }}>Start Run</button>
                </div>
            </div>
        );
    }

    if (phase === 'game_over') {
        return (
            <div className={styles.container} style={{ justifyContent: 'center' }}>
                <h1 style={{ fontSize: '3rem', color: '#ff4444', marginBottom: 20 }}>GAME OVER</h1>
                <p style={{ fontSize: '1.5rem', color: '#fff', marginBottom: 10 }}>
                    Failed to beat Casino {round}
                </p>
                <p style={{ fontSize: '1.2rem', color: '#aaa', marginBottom: 40 }}>
                    Final Winnings: ${totalScore.toLocaleString()} / ${targetScore.toLocaleString()}
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
        if (showDeck || showHandRankings || showCasinoListing || showCompsWindow || showRelicStore) return;

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
            // Only auto-advance if we don't have the early completion choice
            const canCompleteEarly = totalScore >= targetScore && handsRemaining > 0;
            if (!canCompleteEarly) {
                nextRound();
            }
        } else if (phase === 'entering_casino') {
            // Allow global click to start dealing 
            dealFirstHand();
        }
    };

    return (
        <div
            className={`${styles.container} ${isShaking ? 'shake-screen red-tint' : ''}`}
            onClick={handleGlobalClick}
        >
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
                    <span key={displayTarget} className={`${styles.statValue} ${targetAnimate ? styles.statValueAnimate : ''}`}>
                        {"$" + displayTarget.toLocaleString()}
                    </span>
                </div>
                <div className={`${styles.stat} ${isOverlayMode ? styles.statHidden : ''}`}>
                    <span className={styles.statLabel}>Winnings</span>
                    <span
                        id="total-score-display"
                        key={totalScore}
                        className={`${styles.statValue} ${scoreAnimate ? styles.statValueAnimate : ''}`}
                    >
                        {"$" + totalScore.toLocaleString()}
                    </span>
                </div>
                <div className={`${styles.stat} ${isOverlayMode ? styles.statHidden : ''}`}>
                    <span className={styles.statLabel}>Deals</span>
                    <span key={handsRemaining} className={`${styles.statValue} ${handsAnimate ? styles.statValueAnimate : ''}`}>{handsRemaining}</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statLabel}>Comps</span>
                    <span key={displayComps} className={`${styles.statValue} ${compsAnimate ? styles.statValueAnimate : ''}`}>{displayComps}</span>
                </div>
            </header>

            <div className={styles.headerSpacer} />

            {/* Remove CasinoIntroOverlay usage */}
            {/* Remove CasinoIntroOverlay usage */}

            <PhysicsPot
                key={`chips-${round}-${handsRemaining}`}
                totalValue={runningSummary?.chips ?? 0}
                variant="chips"
                isCollecting={isCollectingChips}
                targetId="total-score-display"
                center={{ x: drawAreaCenter.x - CENTER_OFFSET, y: drawAreaCenter.y - POT_VERTICAL_OFFSET }}
                onCollectionComplete={() => {}}
                onItemArrived={() => {}}
                labelPrefix="$"
            />
            
            <RelicInventory />

            <PhysicsPot
                key={`mult-${round}-${handsRemaining}`}
                totalValue={runningSummary?.mult ?? 0}
                variant="multiplier"
                isCollecting={isCollectingChips}
                targetId="total-score-display"
                center={{ x: drawAreaCenter.x + CENTER_OFFSET, y: drawAreaCenter.y - POT_VERTICAL_OFFSET }}
                onCollectionComplete={() => {}}
                onItemArrived={() => {}}
                labelPrefix="x"
            />

            {/* Total Winnings Label (Center) - Only visible when we have a full summary */}
            {((phase === 'scoring' && (isCollectingChips || roundSummary)) || phase === 'round_over') && runningSummary && runningSummary.chips > 0 && (
                 <div 
                    className={styles.totalWinningsLabel}
                    style={{ 
                        left: drawAreaCenter.x, 
                        top: drawAreaCenter.y - 80
                    }}
                 >
                    <div className={styles.winningsValue}>
                        ${Math.floor(runningSummary.chips * runningSummary.mult).toLocaleString()}
                    </div>
                    <div className={styles.winningsTitle}>TOTAL</div>
                 </div>
            )}

            <canvas ref={canvasRef} className={styles.confettiCanvas} />

            <div className={styles.board}>
                <div className={styles.dealerZone}>
                    <div className={styles.zoneLabel}>Dealer</div>
                    <div style={{ pointerEvents: 'none', position: 'relative' }}>
                        <Hand
                            key={`dealer-${handsRemaining}`}
                            hand={dealerHandProps}
                            baseDelay={dealer.isRevealed ? 0 : 0.6}
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div
                                className={`${styles.drawnCardSpot} ${!drawnCard && canDraw ? styles.hitSpot : ''} ${!isDrawAreaVisible ? styles.hiddenSpot : ''}`}
                                onClick={() => {
                                    if (canDraw) handleDraw();
                                }}
                            >
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
                        </div>

                        <div className={styles.infoTextContainer}>
                            {drawnCard ? (
                                <div className={styles.instructions}>Select a hand for this card</div>
                            ) : interactionMode === 'double_down_select' ? (
                                <div className={styles.instructions} style={{ color: '#ffd700' }}>Select hand to Double Down</div>
                            ) : (
                                canDraw && <div className={styles.clickAnywhere}>Click Anywhere</div>
                            )}
                        </div>
                    </div>
                </div>

                <div className={styles.playerZone}>
                    <div className={styles.playerHandsContainer}>
                        {playerHands.map((hand, idx) => (
                            <Hand
                                key={`${hand.id}-${handsRemaining}`}
                                hand={hand}
                                canSelect={(!!drawnCard || interactionMode === 'double_down_select') && !hand.isBust && !hand.isHeld && hand.blackjackValue !== 21}
                                onSelect={() => handleHandClick(idx)}
                                baseDelay={idx === 1 ? 0 : 0.6}
                                isScoringFocus={idx === scoringHandIndex}
                            />
                        ))}

                        {/* Double Down Button - Positioned relative to hands container */}
                        {isDrawAreaVisible && (
                            <div
                                className={`${styles.doubleDownSpot} ${canDoubleDown ? styles.doubleDownActive : ''} ${interactionMode === 'double_down_select' ? styles.doubleDownSelected : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (interactionMode === 'double_down_select') cancelDoubleDown();
                                    else if (canDoubleDown) startDoubleDown();
                                }}
                            >
                                <span className={styles.doubleDownText}>DOUBLE<br />DOWN</span>
                            </div>
                        )}
                    </div>
                </div>

                {phase === 'playing' && (
                    <button
                        className={styles.standButton}
                        onClick={() => holdReturns(false)}
                        disabled={!canHold}
                    >
                        Stand
                    </button>
                )}
                {(phase === 'round_over' || phase === 'entering_casino') && (
                    <button
                        className={styles.nextRoundButton}
                        onClick={phase === 'entering_casino' ? dealFirstHand : () => nextRound()}
                    >
                        {phase === 'entering_casino' ? 'Deal' : (totalScore >= targetScore ? 'Next Casino' : 'Deal')}
                    </button>
                )}

                {phase === 'round_over' && totalScore >= targetScore && handsRemaining > 0 && (
                    <EarlyCompletionPopup
                        handsRemaining={handsRemaining}
                        onComplete={completeRoundEarly}
                        onContinue={() => nextRound(true)}
                    />
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

            <button 
                className={styles.casinosBtn} 
                style={{ top: 94, background: '#e67e22' }} 
                onClick={() => setShowRelicStore(true)}
            >
                Store
            </button>

            {(phase === 'round_over' || phase === 'entering_casino') && (
                <button className={styles.debugBtn} onClick={triggerDebugChips}>
                    +Chips
                </button>
            )}

            {phase === 'playing' && !drawnCard && (
                <>
                    <button className={styles.debugBtn} onClick={debugWin}>
                        Win
                    </button>
                    <button 
                        className={styles.debugBtn} 
                        style={{ top: 94 }} // Positioned below Win (top 20 + 64 height + 10 margin)
                        onClick={() => {
                            setShowDeck(true);
                            setIsSelectingDebugCard(true);
                        }}
                    >
                        Draw
                    </button>
                </>
            )}

            {phase === 'playing' && drawnCard && (
                <button className={styles.debugBtn} onClick={debugUndo}>
                    Undo
                </button>
            )}

            {showDeck && (
                <DeckView
                    remainingDeck={deck}
                    activeCards={activeCards}
                    onClose={() => {
                        setShowDeck(false);
                        setIsSelectingDebugCard(false);
                    }}
                    onSelectCard={isSelectingDebugCard ? (suit, rank) => {
                        drawSpecificCard(suit, rank);
                        setIsSelectingDebugCard(false);
                    } : undefined}
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

            {showCompsWindow && (
                <CompsWindow
                    onClose={() => setShowCompsWindow(false)}
                />
            )}

            {showRelicStore && (
                <RelicStore onClose={() => setShowRelicStore(false)} />
            )}

            {/* FinalScoreOverlay removed */}

        </div>
    );
}
