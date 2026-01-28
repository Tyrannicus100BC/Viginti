import React, { useState, useRef, useEffect } from 'react';
import styles from './App.module.css';
import { useGameStore } from './store/gameStore';
import { fireConfetti } from './utils/confetti';
import { PlayingCard } from './components/PlayingCard';
import { Hand } from './components/Hand';
import { DeckView } from './components/DeckView';
import { PhysicsPot } from './components/PhysicsPot';
import { TitlePhysics } from './components/TitlePhysics';
import titleStyles from './components/TitlePhysics.module.css';
import { CasinoListingView } from './components/CasinoListingView';
import { GamblerSelect } from './components/GamblerSelect';

import { CompsWindow } from './components/CompsWindow';
import { RelicInventory } from './components/RelicInventory';

import { RelicStore } from './components/RelicStore';
import { GiftShop } from './components/GiftShop';
import { DoubleDownButton } from './components/DoubleDownButton';
import type { PlayerHand } from './types';
import { useLayout } from './components/ResponsiveLayout';
import { CasinosButton, DeckButton } from './components/HeaderButtons';

// Constants for layout
const POT_TOP_Y = 380; // Anchor pots to this Y value

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
        drawnCards,
        selectedDrawIndex,
        selectDrawnCard,
        discardPile,

        startGame,
        dealFirstHand,
        drawCard,
        assignCard,
        holdReturns,

        setAnimationSpeed,
        triggerDebugChips,
        modifiers,
        inventory,
        roundSummary,
        getProjectedDrawCount,
        // showFinalScore removed
        // continueFromFinalScore removed

        // Double Down Actions
        startDoubleDown,
        cancelDoubleDown,
        interactionMode,
        debugWin,
        debugUndo,
        drawSpecificCard,
        allWinnersEnlarged,
        dealerVisible,
        debugEnabled,
        toggleDebug,
        removeCard,
        enhanceCard,
        leaveShop,

        // New Double Down Props
        doubleDownCharges,
        selectedDoubleDownHands,
        toggleDoubleDownHand,
        executeDoubleDown
    } = useGameStore();

    const { viewportWidth, viewportHeight } = useLayout();

    const hasDoubleDownRelic = inventory.some(r => r.id === 'double_down');

    const [showDeck, setShowDeck] = useState(false);
    const [isRemovingCards, setIsRemovingCards] = useState(false);
    const [isEnhancingCards, setIsEnhancingCards] = useState(false);
    const [isSelectingDebugCard, setIsSelectingDebugCard] = useState(false);
    // showHandRankings removed
    const [showCasinoListing, setShowCasinoListing] = useState(false);
    const [showCompsWindow, setShowCompsWindow] = useState(false);
    const [showRelicStore, setShowRelicStore] = useState(false);
    const [relicStoreFilter, setRelicStoreFilter] = useState<string | undefined>(undefined);
    const [overlayComplete, setOverlayComplete] = useState(false);
    const [scoreAnimate, setScoreAnimate] = useState(false);

    const [hasClickedWin, setHasClickedWin] = useState(false);

    const drawAreaRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [selectedGamblerId, setSelectedGamblerId] = useState(() => localStorage.getItem('viginti_gambler') || 'default');

    useEffect(() => {
        localStorage.setItem('viginti_gambler', selectedGamblerId);
    }, [selectedGamblerId]);



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

    const [showSelectionUI, setShowSelectionUI] = useState(false);
    const [hasSettledFirstOverlay, setHasSettledFirstOverlay] = useState(false);

    // Watch for phase change to handle initial overlay transition
    useEffect(() => {
        if (phase === 'entering_casino' && round === 1) {
            if (debugEnabled) {
                setHasSettledFirstOverlay(true);
                return;
            }
            const timer = setTimeout(() => setHasSettledFirstOverlay(true), 100);
            return () => clearTimeout(timer);
        } else if (phase === 'init') {
            setHasSettledFirstOverlay(false);
        }
    }, [phase, round, debugEnabled]);

    // Watch for drawn card to delay selection UI
    useEffect(() => {
        if (drawnCards.some(c => c !== null)) {
            setShowSelectionUI(true);
        } else {
            setShowSelectionUI(false);
        }
    }, [drawnCards]);

    // Track discarded cards for animation
    const [discardingCards, setDiscardingCards] = useState<{ card: any, offset: number, index: number }[]>([]);
    const prevDrawnCards = useRef<any[]>([]);
    const prevSelectedDrawIndex = useRef<number | null>(null);

    useEffect(() => {
        // If cards were cleared (length 0) and we had cards before (length > 0)
        if (drawnCards.length === 0 && prevDrawnCards.current.length > 0) {
            // Determine which cards were NOT placed
            // Logic: The card at selectedDrawIndex was placed (or 0 if single). Rest are discards.
            const selectedIdx = prevSelectedDrawIndex.current ?? 0;

            // Filter out the selected card, keep others for animation
            // prevDrawnCards might contain nulls if sequential placement happened
            const discards = prevDrawnCards.current
                .map((card, idx) => ({ card, idx }))
                .filter(({ card, idx }) => card !== null && idx !== selectedIdx);

            if (discards.length > 0) {
                // Calculate offsets for these cards based on original count
                const count = prevDrawnCards.current.length; // Use previous count
                const spacing = 120;
                // Need to re-calculate offset logic matching the render loop
                const cardsToAnimate = discards.map(({ card, idx }) => {
                    const offset = (idx - (count - 1) / 2) * spacing;
                    return { card, offset, index: idx };
                });

                setDiscardingCards(cardsToAnimate);

                // Clear after animation
                setTimeout(() => {
                    setDiscardingCards([]);
                }, 500);
            }
        }

        prevDrawnCards.current = drawnCards;
        prevSelectedDrawIndex.current = selectedDrawIndex;
    }, [drawnCards, selectedDrawIndex]);

    // Visual Draw Count Logic
    const [visualDrawCount, setVisualDrawCount] = useState(1);

    // Update projected count when drawnCards is empty
    useEffect(() => {
        if (drawnCards.length === 0) {
            const count = getProjectedDrawCount();
            setVisualDrawCount(prev => prev !== count ? count : prev);
        }
    }, [drawnCards.length, getProjectedDrawCount, JSON.stringify(modifiers), inventory.map(i => i.id).join(',')]);

    // Watch for Total Winnings appearance to fire confetti
    useEffect(() => {
        if (phase === 'playing') {
            confettiFiredRef.current = false;
        }

        if ((phase === 'round_over' || roundSummary || isCollectingChips) && runningSummary && runningSummary.chips > 0 && !confettiFiredRef.current) {
            if (canvasRef.current) {
                confettiFiredRef.current = true;
                canvasRef.current.width = viewportWidth;
                canvasRef.current.height = viewportHeight;

                fireConfetti(canvasRef.current, {
                    elementCount: 150,
                    spread: 130,
                    startVelocity: 55,
                    decay: 0.96,
                    originX: viewportWidth / 2,
                    originY: POT_TOP_Y - 50
                });
            }
        }
    }, [isCollectingChips, phase, !!runningSummary, roundSummary]);

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
        if (handsRemaining !== prevHandsRemaining.current) {
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
            if (debugEnabled) {
                setOverlayComplete(true);
                setDisplayRound(round);
                setDisplayTarget(targetScore);
                setDisplayComps(comps);
                return;
            }

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
    }, [phase, round, targetScore, comps, debugEnabled]);

    // Synchronize display values immediately when starting a new run (Round 1) 
    // to avoid showing old run values or starting from the top of the screen.
    if (phase === 'entering_casino' && round === 1) {
        if (!runInitializedRef.current) {
            setOverlayComplete(debugEnabled);
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
            toggleDoubleDownHand(index);
        } else if (drawnCards.length > 0) {
            assignCard(index);
        }
    };

    const areAllHandsUnplayable = playerHands.every(h => h.isBust || h.isHeld || h.blackjackValue === 21);
    const isDrawAreaClear = drawnCards.length === 0 || drawnCards.every(c => c === null);

    const canDraw = phase === 'playing' && isDrawAreaClear && !dealer.isRevealed && !isInitialDeal && interactionMode === 'default' && !areAllHandsUnplayable;
    const canDoubleDown = phase === 'playing' && isDrawAreaClear && !dealer.isRevealed && !isInitialDeal && !areAllHandsUnplayable; // Can start flow
    const canHold = phase === 'playing' && isDrawAreaClear && !dealer.isRevealed && !isInitialDeal && interactionMode === 'default' && !areAllHandsUnplayable;
    const isDrawAreaVisible = phase === 'playing' && !dealer.isRevealed && !isInitialDeal && interactionMode !== 'double_down_select';

    const areHandsVisible = phase !== 'gift_shop';

    // Reset debug button state when draw area reappears
    React.useEffect(() => {
        if (isDrawAreaVisible) {
            setHasClickedWin(false);
        }
    }, [isDrawAreaVisible]);

    const activeCards = [
        ...dealer.cards.filter((_, idx) => idx !== 0 || dealer.isRevealed),
        ...playerHands.flatMap(h => h.cards),
        ...drawnCards.filter((c): c is import('./types').Card => c !== null),
        ...discardPile
    ];


    if (phase === 'init') {
        return (
            <div className={styles.container} style={{ justifyContent: 'center', cursor: 'default' }}>
                <TitlePhysics />
                <div className={styles.titleContainer} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 }}>
                    <h1 className={titleStyles.titleText}>
                        {"VIGINTI".split('').map((char, i) => (
                            <span key={i} className={titleStyles.letter} data-index={i}>{char}</span>
                        ))}
                    </h1>
                    <button
                        className={`${styles.button} ${styles.startRunButton}`}
                        style={{ zIndex: 1, marginBottom: 40 }}
                        onClick={() => startGame(selectedGamblerId)}
                    >
                        Start Run
                    </button>
                </div>

                <GamblerSelect
                    selectedId={selectedGamblerId}
                    onSelect={setSelectedGamblerId}
                />
                <button
                    className={styles.debugToggle}
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleDebug();
                    }}
                    title="Toggle Debug Mode"
                />
                {debugEnabled && (
                    <svg className={styles.bugIcon} viewBox="0 0 24 24">
                        <path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5c-.49 0-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z" />
                    </svg>
                )}
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
                <button className={styles.button} onClick={() => startGame(selectedGamblerId)}>Try Again</button>
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
        if (showDeck || showCasinoListing || showCompsWindow || showRelicStore) return;

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

    const isTotalWinningsVisible = ((phase === 'scoring' && (isCollectingChips || roundSummary || allWinnersEnlarged)) || phase === 'round_over') && runningSummary && runningSummary.chips > 0;

    // Logic for pot placement relative to the game board (800px max)
    // The user's "1/3 and 1/4 across the screen" refers to the literal coordinates of the play board.
    const boardWidth = 800; // The canonical 800px coordinate system

    // "1/3 across" means the pot is at 1/3 (266px) and 2/3 (533px) of the width.
    // Offset from center (400px) = 400 - 266 = 133.
    const defaultOffset = boardWidth / 6;

    // "1/4 across" means the pot is at 1/4 (200px) and 3/4 (600px) of the width.
    // Offset from center (400px) = 400 - 200 = 200.
    const scoringOffset = boardWidth / 4;

    // Apply the offset based on whether total winnings are displayed
    const currentPotOffset = isTotalWinningsVisible ? scoringOffset : defaultOffset;

    // Calculate stable center X
    const centerX = viewportWidth / 2;

    return (
        <div
            className={`${styles.container} ${isShaking ? 'shake-screen red-tint' : ''}`}
            onClick={handleGlobalClick}
        >
            <div className={styles.topNavContainer}>
                <CasinosButton onClick={() => setShowCasinoListing(true)} />

                <div className={styles.headerPlaceholder} />

                <header
                    className={`${styles.header} ${isOverlayMode ? styles.headerCentered : ''} ${(isOverlayMode && round === 1 && !hasSettledFirstOverlay) ? styles.noTransition : ''}`}
                    style={isOverlayMode ? { top: 460 } : {}}
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
                            className={`${styles.statValue} ${scoreAnimate ? styles.statValueAnimate : ''} ${(debugEnabled && (phase === 'round_over' || phase === 'entering_casino')) ? styles.statValueClickable : ''}`}
                            onClick={(e) => {
                                if (debugEnabled && (phase === 'round_over' || phase === 'entering_casino')) {
                                    e.stopPropagation();
                                    triggerDebugChips();
                                }
                            }}
                            title={(debugEnabled && (phase === 'round_over' || phase === 'entering_casino')) ? "Add Debug Chips" : undefined}
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

                <div className={styles.rightButtons}>
                    <DeckButton onClick={() => {
                        setIsRemovingCards(false);
                        setShowDeck(true);
                    }} />
                </div>
            </div>

            <div className={styles.headerSpacer} />

            {/* Remove CasinoIntroOverlay usage */}
            {/* Remove CasinoIntroOverlay usage */}

            <PhysicsPot
                key={`chips-${round}-${handsRemaining}`}
                totalValue={runningSummary?.chips ?? 0}
                variant="chips"
                isCollecting={isCollectingChips}
                center={{ x: centerX - currentPotOffset, y: POT_TOP_Y }}
                onCollectionComplete={() => { }}
                onItemArrived={() => { }}
                labelPrefix="$"
            />

            {/* RelicInventory moved to sidebar */}

            <PhysicsPot
                key={`mult-${round}-${handsRemaining}`}
                totalValue={runningSummary?.mult ?? 0}
                variant="multiplier"
                isCollecting={isCollectingChips}
                center={{ x: centerX + currentPotOffset, y: POT_TOP_Y }}
                onCollectionComplete={() => { }}
                onItemArrived={() => { }}
                labelPrefix="x"
            />

            {/* Total Winnings Label (Center) - Only visible when we have a full summary */}
            {isTotalWinningsVisible && runningSummary && runningSummary.chips > 0 && (
                <div
                    className={styles.totalWinningsLabel}
                    style={{
                        left: centerX,
                        top: POT_TOP_Y - 135
                    }}
                >
                    <div className={styles.winningsWrapper}>
                        <span className={styles.currency}>$</span>
                        <div className={styles.valueAndTitle}>
                            <div className={styles.winningsValue}>
                                {Math.floor(runningSummary.chips * runningSummary.mult).toLocaleString()}
                            </div>
                            <div className={styles.winningsTitle}>TOTAL</div>
                        </div>
                    </div>
                </div>
            )}

            <canvas ref={canvasRef} className={styles.confettiCanvas} />

            <div className={styles.gameWrapper}>
                <div className={styles.sidebarsContainer}>
                    <div className={styles.leftSidebar}>
                        <div
                            className={`${styles.zoneLabel} ${debugEnabled ? styles.manageDebugBtn : ''}`}
                            style={{
                                alignSelf: 'flex-start',
                                width: 'auto',
                                marginBottom: 10,
                                opacity: debugEnabled ? 1 : 0.5,
                                padding: debugEnabled ? '4px 12px' : 0,
                                cursor: debugEnabled ? 'pointer' : 'default',
                                pointerEvents: 'auto'
                            }}
                            onClick={debugEnabled ? () => {
                                setRelicStoreFilter('Charm');
                                setShowRelicStore(true);
                            } : undefined}
                        >
                            Charms
                        </div>
                        <RelicInventory
                            enabledCategories={['Charm']}
                        />
                    </div>
                    <div className={styles.sidebar}>
                        <div
                            className={`${styles.zoneLabel} ${debugEnabled ? styles.manageDebugBtn : ''}`}
                            style={{
                                alignSelf: 'flex-end',
                                width: 'auto',
                                marginBottom: 10,
                                opacity: debugEnabled ? 1 : 0.5,
                                padding: debugEnabled ? '4px 12px' : 0,
                                cursor: debugEnabled ? 'pointer' : 'default',
                                pointerEvents: 'auto'
                            }}
                            onClick={debugEnabled ? () => {
                                setRelicStoreFilter('Angle');
                                setShowRelicStore(true);
                            } : undefined}
                        >
                            Angles
                        </div>
                        <RelicInventory
                            enabledCategories={['Angle']}
                            viewMode="table"
                        />
                    </div>
                </div>

                <div className={styles.board}>
                    <div className={styles.topContent}>
                        <div className={`${styles.dealerZone} ${!dealerVisible ? styles.dealerZoneHidden : ''}`}>
                            <div className={styles.zoneLabel}>Dealer</div>
                            <div style={{ pointerEvents: 'none', position: 'relative' }}>
                                <Hand
                                    key={`dealer-${handsRemaining}`}
                                    hand={dealerHandProps}
                                    baseDelay={dealer.isRevealed ? 0 : 0.6}
                                    stagger={!dealer.isRevealed}
                                />
                            </div>
                            {/* Win Button */}
                            {debugEnabled && (
                                <button
                                    className={`${styles.subtleDebugBtn} ${styles.debugFade} ${phase === 'playing' && isDrawAreaVisible && !hasClickedWin
                                        ? styles.debugVisible
                                        : styles.debugHidden
                                        }`}
                                    onClick={() => {
                                        setHasClickedWin(true);
                                        debugWin();
                                    }}
                                    style={{
                                        width: 100,
                                        position: 'absolute',
                                        bottom: -40,
                                        left: '50%',
                                        transform: 'translateX(-50%)'
                                    }}
                                >
                                    Win
                                </button>
                            )}
                        </div>

                        {dealerMessage && (
                            <div
                                className={`${styles.dealerMessage} ${dealerMessageExiting ? styles.dealerMessageExiting : ''}`}
                                style={{ top: POT_TOP_Y }}
                            >
                                {dealerMessage}
                            </div>
                        )}
                    </div>

                    <div className={styles.bottomContent}>
                        <div className={styles.middleZone} style={{ position: 'relative' }}>
                            <div className={styles.drawAreaContainer} ref={drawAreaRef}>
                                {debugEnabled && (
                                    <div
                                        className={`${styles.debugFade} ${isDrawAreaVisible ? styles.debugVisible : styles.debugHidden}`}
                                        style={{
                                            width: 100,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            position: 'absolute',
                                            top: -40,
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            zIndex: 10
                                        }}>
                                        {drawnCards.some(c => c !== null) && (
                                            <button className={styles.subtleDebugBtn} onClick={debugUndo}>
                                                Undo
                                            </button>
                                        )}
                                        {drawnCards.every(c => c === null) && (
                                            <button
                                                className={styles.subtleDebugBtn}
                                                onClick={() => {
                                                    setShowDeck(true);
                                                    setIsSelectingDebugCard(true);
                                                }}
                                            >
                                                CHOOSE
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%', height: '140px' }}>
                                    {/* Render dynamic draw spots */}
                                    {Array.from({ length: Math.max(drawnCards.length, visualDrawCount) }).map((_, idx) => {
                                        // Calculate Offset
                                        const count = Math.max(drawnCards.length, visualDrawCount);
                                        const spacing = 120;
                                        const offset = (idx - (count - 1) / 2) * spacing;

                                        const card = drawnCards[idx];
                                        const isSelected = idx === selectedDrawIndex;
                                        const showHitText = !card && canDraw;
                                        const isMultiple = drawnCards.length > 1;

                                        return (
                                            <div
                                                key={`draw-spot-${idx}`}
                                                className={`
                                                ${styles.drawnCardSpot} 
                                                ${showHitText ? styles.hitSpot : ''} 
                                                ${!isDrawAreaVisible ? styles.hiddenSpot : ''}
                                                ${isSelected && isMultiple ? styles.selectedSpot : ''}
                                            `}
                                                style={{
                                                    position: 'absolute',
                                                    left: '50%',
                                                    top: '50%',
                                                    transform: `translate(calc(-50% + ${offset}px), -50%)`,
                                                    zIndex: isSelected ? 20 : 10 + idx,
                                                    opacity: !isDrawAreaVisible ? 0 : 1
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (card) {
                                                        selectDrawnCard(idx);
                                                    } else if (canDraw) {
                                                        handleDraw();
                                                    }
                                                }}
                                            >
                                                {card ? (
                                                    <PlayingCard
                                                        card={card}
                                                        isDrawn
                                                        origin={card.origin}
                                                    />
                                                ) : (
                                                    showHitText && <span className={styles.hitText} style={{ opacity: 1, position: 'relative', transform: 'none', left: 'auto', top: 'auto' }}>HIT</span>
                                                )}

                                                {isSelected && drawnCards.length > 1 && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: -25,
                                                        left: '50%',
                                                        transform: 'translateX(-50%)',
                                                        background: '#ffd700',
                                                        color: '#000',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 'bold',
                                                        whiteSpace: 'nowrap',
                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                                        pointerEvents: 'none',
                                                        opacity: 0 // Hide "SELECT" badge since the glow is enough
                                                    }}>
                                                        SELECT
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Render discarding cards */}
                                    {discardingCards.map(({ card, offset, index }) => (
                                        <div
                                            key={`discard-${index}`}
                                            className={`${styles.drawnCardSpot} ${styles.discardingCard}`}
                                            style={{
                                                position: 'absolute',
                                                left: '50%',
                                                top: '50%',
                                                transform: `translate(calc(-50% + ${offset}px), -50%)`,
                                                zIndex: 5
                                            }}
                                        >
                                            <PlayingCard
                                                card={card}
                                                isDrawn
                                                origin="discard"
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className={styles.infoTextContainer}>
                                    <div className={`${styles.instructions} ${showSelectionUI && drawnCards.some(c => c !== null) ? styles.textVisible : ''}`}>
                                        PLACE CARD
                                    </div>
                                    <div
                                        className={`${styles.instructions} ${interactionMode === 'double_down_select' ? styles.textVisible : ''}`}
                                        style={{ color: '#ffd700' }}
                                    >
                                        Select hand to Double Down
                                    </div>
                                    <div className={`${styles.clickAnywhere} ${canDraw ? styles.textVisible : ''}`}>
                                        Click Anywhere
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={styles.playerZone} style={{ opacity: areHandsVisible ? 1 : 0, transition: 'opacity 0.5s', pointerEvents: areHandsVisible ? 'auto' : 'none' }}>
                            <div className={styles.playerHandsContainer}>
                                {playerHands.map((hand, idx) => {
                                    const canSelectHand = (showSelectionUI && drawnCards.length > 0) || interactionMode === 'double_down_select';
                                    return (
                                        <Hand
                                            key={`${hand.id}-${handsRemaining}`}
                                            hand={hand}
                                            canSelect={canSelectHand && !hand.isBust && !hand.isHeld && hand.blackjackValue !== 21}
                                            isSelected={selectedDoubleDownHands.includes(idx)}
                                            onSelect={() => handleHandClick(idx)}
                                            baseDelay={idx === 1 ? 0 : 0.6}
                                            isScoringFocus={idx === scoringHandIndex}
                                            isEnlarged={allWinnersEnlarged && hand.outcome === 'win'}
                                        />
                                    );
                                })}

                                {/* Double Down Button - Positioned relative to hands container */}
                                {(phase === 'playing' && !dealer.isRevealed && !isInitialDeal && hasDoubleDownRelic) && (
                                    <DoubleDownButton
                                        charges={doubleDownCharges}
                                        isActive={canDoubleDown}
                                        isSelectionMode={interactionMode === 'double_down_select'}
                                        hasSelectedHands={selectedDoubleDownHands.length > 0}
                                        onClick={() => {
                                            if (interactionMode === 'double_down_select') {
                                                executeDoubleDown();
                                            } else {
                                                startDoubleDown();
                                            }
                                        }}
                                        onCancel={cancelDoubleDown}
                                    />
                                )}
                            </div>
                        </div>

                        <div className={styles.actionButtonContainer}>
                            {((phase === 'playing' && !isInitialDeal) || phase === 'scoring') ? (
                                <button
                                    className={styles.standButton}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        holdReturns(false);
                                    }}
                                    disabled={!canHold}
                                >
                                    Stand
                                </button>
                            ) : (phase === 'round_over' || phase === 'entering_casino' || (phase === 'playing' && isInitialDeal)) ? (
                                <button
                                    className={styles.nextRoundButton}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        phase === 'entering_casino' ? dealFirstHand() : nextRound();
                                    }}
                                    disabled={phase === 'playing' && isInitialDeal}
                                    style={phase === 'round_over' && totalScore < targetScore && handsRemaining <= 0 ? { color: '#ff4444', borderColor: '#ff4444' } : {}}
                                >
                                    {phase === 'entering_casino' || (phase === 'playing' && isInitialDeal) ? 'Deal' : (
                                        totalScore >= targetScore ? 'Gift Shop' :
                                            (handsRemaining <= 0 ? 'Game Over' : 'Deal')
                                    )}
                                </button>
                            ) : (phase === 'gift_shop') ? (
                                <button
                                    className={styles.nextRoundButton}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        leaveShop();
                                    }}
                                >
                                    Next Casino
                                </button>
                            ) : (
                                <div className={styles.actionPlaceholder} />
                            )}
                        </div>

                    </div>
                </div>


            </div>

            {showDeck && (
                <DeckView
                    remainingDeck={[...deck, ...((!dealer.isRevealed && dealer.cards.length > 0) ? [dealer.cards[0]] : [])]}
                    activeCards={activeCards}

                    onClose={() => {
                        setShowDeck(false);
                        setIsRemovingCards(false);
                        setIsSelectingDebugCard(false);
                        setIsEnhancingCards(false);
                    }}
                    mode={isRemovingCards ? 'remove' : isEnhancingCards ? 'enhance' : 'view'}
                    onRemoveCard={isRemovingCards ? (id) => removeCard(id) : undefined}
                    onEnhanceCard={isEnhancingCards ? (id, effect) => enhanceCard(id, effect) : undefined}
                    onSelectCard={isSelectingDebugCard ? (cardId) => {
                        drawSpecificCard(cardId);
                        setIsSelectingDebugCard(false);
                    } : undefined}
                />
            )}

            {/* showHandRankings block removed */}

            {showCasinoListing && (
                <CasinoListingView
                    currentRound={round}
                    onClose={() => setShowCasinoListing(false)}
                />
            )}

            {phase === 'gift_shop' && <GiftShop
                onOpenDeckRemoval={() => {
                    setIsRemovingCards(true);
                    setShowDeck(true);
                }}
                onOpenEnhanceCards={() => {
                    setIsEnhancingCards(true);
                    setShowDeck(true);
                }}
            />}

            {showCompsWindow && (
                <CompsWindow
                    onClose={() => setShowCompsWindow(false)}
                />
            )}

            {showRelicStore && (
                <RelicStore
                    onClose={() => setShowRelicStore(false)}
                    filterCategory={relicStoreFilter}
                />
            )}

            {/* FinalScoreOverlay removed */}

        </div>
    );
}
