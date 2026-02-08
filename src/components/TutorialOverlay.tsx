
import React, { useEffect, useRef, useState } from 'react';
import { TutorialManager, type TutorialStep } from '../logic/tutorials/tutorials';
import { useLayout } from './ResponsiveLayout';
import styles from './TutorialOverlay.module.css';

export const TutorialOverlay: React.FC = () => {
    const [activeStep, setActiveStep] = useState<TutorialStep | null>(null);
    const [isExiting, setIsExiting] = useState(false);
    const [isOverlayFading, setIsOverlayFading] = useState(false);
    const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
    const [renderedHighlightRect, setRenderedHighlightRect] = useState<DOMRect | null>(null);
    const [highlightVisible, setHighlightVisible] = useState(false);
    // Removed secondary highlight around drawn card
    const [dealerRect, setDealerRect] = useState<DOMRect | null>(null);
    const [dealerActionRect, setDealerActionRect] = useState<DOMRect | null>(null);
    const [playerHandsRect, setPlayerHandsRect] = useState<DOMRect | null>(null);
    const [standButtonRect, setStandButtonRect] = useState<DOMRect | null>(null);
    const [indicatorRect, setIndicatorRect] = useState<DOMRect | null>(null);
    const [messageBoxSize, setMessageBoxSize] = useState({ width: 0, height: 0 });
    const manager = TutorialManager.getInstance();
    const { scale, viewportWidth, viewportHeight, idealWidth } = useLayout();
    const stepRef = useRef<TutorialStep | null>(null);
    const messageBoxRef = useRef<HTMLDivElement>(null);
    const allowClickRef = useRef(false);
    const exitingRef = useRef(false);
    const highlightFadeTimeoutRef = useRef<number | null>(null);
    const exitTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        return manager.subscribe(step => {
            if (step === null && exitingRef.current && stepRef.current) {
                return;
            }

            if (step === null && !exitingRef.current) {
                manager.releaseInputLock();
            }

            if (exitTimeoutRef.current !== null) {
                window.clearTimeout(exitTimeoutRef.current);
                exitTimeoutRef.current = null;
            }

            stepRef.current = step;
            setActiveStep(step);
            setIsExiting(false);
            setIsOverlayFading(false);
            exitingRef.current = false;
            allowClickRef.current = false;
        });
    }, []);

    useEffect(() => {
        if (!activeStep || activeStep.completionType !== 'click') return;
        const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (prefersReducedMotion?.matches) {
            allowClickRef.current = true;
        }
    }, [activeStep]);

    useEffect(() => {
        if (!activeStep || activeStep.completionType !== 'click') return;
        const timeoutId = window.setTimeout(() => {
            allowClickRef.current = true;
        }, 500);
        return () => window.clearTimeout(timeoutId);
    }, [activeStep]);

    useEffect(() => {
        if (!messageBoxRef.current) return;

        const updateSize = () => {
            if (!messageBoxRef.current) return;
            const rect = messageBoxRef.current.getBoundingClientRect();
            setMessageBoxSize({
                width: rect.width / scale,
                height: rect.height / scale
            });
        };

        updateSize();
        window.addEventListener('resize', updateSize);

        return () => {
            window.removeEventListener('resize', updateSize);
        };
    }, [activeStep, scale, viewportWidth, viewportHeight]);

    // Track active step highlight element
    useEffect(() => {
        if (!activeStep?.highlight) {
            setHighlightRect(null);
            return;
        }

        const updateRect = () => {
            const el = document.getElementById(activeStep.highlight!.elementId);
            const wrapper = document.getElementById('game-scale-wrapper');
            if (!el || !wrapper) return;

            const rect = el.getBoundingClientRect();
            const wrapperRect = wrapper.getBoundingClientRect();

            const left = (rect.left - wrapperRect.left) / scale;
            const top = (rect.top - wrapperRect.top) / scale;
            const width = rect.width / scale;
            const height = rect.height / scale;

            setHighlightRect(new DOMRect(left, top, width, height));
        };

        // Initial update and subsequent polling or ResizeObserver
        updateRect();
        
        // Poll every frame or interval to track moving elements
        const interval = setInterval(updateRect, 100);
        window.addEventListener('resize', updateRect);
        
        return () => {
            clearInterval(interval);
            window.removeEventListener('resize', updateRect);
        };
    }, [activeStep, scale]);

    useEffect(() => {
        if (highlightFadeTimeoutRef.current !== null) {
            window.clearTimeout(highlightFadeTimeoutRef.current);
            highlightFadeTimeoutRef.current = null;
        }

        if (highlightRect) {
            setRenderedHighlightRect(highlightRect);
            requestAnimationFrame(() => {
                setHighlightVisible(true);
            });
            return;
        }

        setHighlightVisible(false);
        if (renderedHighlightRect) {
            highlightFadeTimeoutRef.current = window.setTimeout(() => {
                setRenderedHighlightRect(null);
            }, 220);
        } else {
            setRenderedHighlightRect(null);
        }
    }, [highlightRect, renderedHighlightRect]);

    useEffect(() => {
        return () => {
            if (highlightFadeTimeoutRef.current !== null) {
                window.clearTimeout(highlightFadeTimeoutRef.current);
            }
            if (exitTimeoutRef.current !== null) {
                window.clearTimeout(exitTimeoutRef.current);
            }
        };
    }, []);

    // Track draw indicator zone for draw + placement messaging
    useEffect(() => {
        if (!activeStep || (activeStep.id !== 'draw_indicator' && activeStep.id !== 'place_card' && activeStep.id !== 'get_close')) {
            setIndicatorRect(null);
            return;
        }

        const updateRect = () => {
            const hitSpot = document.getElementById('draw-hit-spot-anchor');
            const zone = document.getElementById('draw-indicator-zone');
            const target = hitSpot ?? zone;
            const wrapper = document.getElementById('game-scale-wrapper');
            if (!target || !wrapper) return;

            const rect = target.getBoundingClientRect();
            const wrapperRect = wrapper.getBoundingClientRect();

            const left = (rect.left - wrapperRect.left) / scale;
            const top = (rect.top - wrapperRect.top) / scale;
            const width = rect.width / scale;
            const height = rect.height / scale;

            setIndicatorRect(new DOMRect(left, top, width, height));
        };

        updateRect();
        const interval = setInterval(updateRect, 100);
        window.addEventListener('resize', updateRect);

        return () => {
            clearInterval(interval);
            window.removeEventListener('resize', updateRect);
        };
    }, [activeStep, scale]);

    useEffect(() => {
        if (!activeStep || activeStep.id !== 'dealer_turn') {
            setDealerRect(null);
            setDealerActionRect(null);
            return;
        }

        const updateRect = () => {
            const wrapper = document.getElementById('game-scale-wrapper');
            if (!wrapper) return;

            const wrapperRect = wrapper.getBoundingClientRect();
            const dealerEl = document.getElementById('dealer-hand-zone');
            const actionEl = document.getElementById('dealer-action-anchor');

            if (dealerEl) {
                const rect = dealerEl.getBoundingClientRect();
                const left = (rect.left - wrapperRect.left) / scale;
                const top = (rect.top - wrapperRect.top) / scale;
                const width = rect.width / scale;
                const height = rect.height / scale;
                setDealerRect(new DOMRect(left, top, width, height));
            } else {
                setDealerRect(null);
            }

            if (actionEl) {
                const rect = actionEl.getBoundingClientRect();
                const left = (rect.left - wrapperRect.left) / scale;
                const top = (rect.top - wrapperRect.top) / scale;
                const width = rect.width / scale;
                const height = rect.height / scale;
                setDealerActionRect(new DOMRect(left, top, width, height));
            } else {
                setDealerActionRect(null);
            }
        };

        updateRect();
        const interval = setInterval(updateRect, 100);
        window.addEventListener('resize', updateRect);

        return () => {
            clearInterval(interval);
            window.removeEventListener('resize', updateRect);
        };
    }, [activeStep, scale]);

    const defaultPositionSteps = new Set(['welcome', 'win_money_first', 'hud_debt']);
    const shouldAnchorAbovePlayerHands = Boolean(
        activeStep &&
        !defaultPositionSteps.has(activeStep.id) &&
        activeStep.id !== 'draw_indicator' &&
        activeStep.id !== 'place_card' &&
        activeStep.id !== 'get_close'
    );

    useEffect(() => {
        if (!shouldAnchorAbovePlayerHands) {
            setPlayerHandsRect(null);
            setStandButtonRect(null);
            return;
        }

        const updateRect = () => {
            const el = document.getElementById('player-hands-zone');
            const standEl = document.getElementById('stand-button');
            const wrapper = document.getElementById('game-scale-wrapper');
            if (!el || !wrapper) return;

            const rect = el.getBoundingClientRect();
            const wrapperRect = wrapper.getBoundingClientRect();

            const left = (rect.left - wrapperRect.left) / scale;
            const top = (rect.top - wrapperRect.top) / scale;
            const width = rect.width / scale;
            const height = rect.height / scale;

            setPlayerHandsRect(new DOMRect(left, top, width, height));

            if (standEl) {
                const standRect = standEl.getBoundingClientRect();
                const standLeft = (standRect.left - wrapperRect.left) / scale;
                const standTop = (standRect.top - wrapperRect.top) / scale;
                const standWidth = standRect.width / scale;
                const standHeight = standRect.height / scale;
                setStandButtonRect(new DOMRect(standLeft, standTop, standWidth, standHeight));
            } else {
                setStandButtonRect(null);
            }
        };

        updateRect();
        const interval = setInterval(updateRect, 100);
        window.addEventListener('resize', updateRect);

        return () => {
            clearInterval(interval);
            window.removeEventListener('resize', updateRect);
        };
    }, [shouldAnchorAbovePlayerHands, scale]);

    if (!activeStep) return null;

    const isClickToContinue = activeStep.completionType === 'click';
    const scrimMode = activeStep.scrim ?? 'auto';
    const shouldDim = scrimMode === 'dim' || (scrimMode === 'auto' && !activeStep.highlight);
    const hideHighlightScrim = scrimMode === 'none' || !activeStep.highlight;
    const isDrawIndicator = (activeStep.id === 'draw_indicator' || activeStep.id === 'get_close') && indicatorRect;
    const isPlaceCardStep = activeStep.id === 'place_card';
    const isDealerTurnStep = activeStep.id === 'dealer_turn';
    const isDealerCardsStep = activeStep.id === 'dealer_cards';
    const isWinMoneyStep = activeStep.id === 'win_money_first';
    
    // Calculate highlight style
    const highlightStyle: React.CSSProperties = renderedHighlightRect ? {
        top: renderedHighlightRect.top - (activeStep.highlight?.padding || 0),
        left: renderedHighlightRect.left - (activeStep.highlight?.padding || 0),
        width: renderedHighlightRect.width + (activeStep.highlight?.padding || 0) * 2,
        height: renderedHighlightRect.height + (activeStep.highlight?.padding || 0) * 2,
        borderRadius: activeStep.highlight?.type === 'circle' ? '50%' : '8px'
    } : {};

    const messageBoxStyle: React.CSSProperties | undefined = isDrawIndicator ? (() => {
        const safeWidth = idealWidth;
        const safeLeft = (viewportWidth - safeWidth) / 2;
        const padding = 2;
        const paddedLeft = indicatorRect!.left - padding;
        const paddedTop = indicatorRect!.top - padding;
        const paddedHeight = indicatorRect!.height + padding * 2;
        const drawCenterY = paddedTop + paddedHeight / 2;

        const gapLeft = safeLeft;
        const gapRight = paddedLeft;
        const available = Math.max(0, gapRight - gapLeft);
        const maxWidth = Math.min(360, Math.max(0, available - 16));
        const effectiveWidth = maxWidth > 0 ? Math.min(messageBoxSize.width, maxWidth) : messageBoxSize.width;
        const halfWidth = effectiveWidth / 2;
        const targetCenterX = gapLeft + available / 2;
        const minCenterX = gapLeft + halfWidth + 8;
        const maxCenterX = gapRight - halfWidth - 8;
        const centerX = minCenterX <= maxCenterX ? Math.min(Math.max(targetCenterX, minCenterX), maxCenterX) : targetCenterX;

        return {
            position: 'absolute',
            left: `${centerX}px`,
            top: `${drawCenterY}px`,
            transform: 'translate(-50%, -50%)',
            maxWidth: maxWidth > 0 ? `${maxWidth}px` : undefined
        };
    })() : isPlaceCardStep && indicatorRect ? (() => {
        const safeWidth = idealWidth;
        const safeLeft = (viewportWidth - safeWidth) / 2;
        const padding = 2;
        const paddedLeft = indicatorRect.left - padding;
        const paddedTop = indicatorRect.top - padding;
        const paddedHeight = indicatorRect.height + padding * 2;
        const drawCenterY = paddedTop + paddedHeight / 2;

        const gapLeft = safeLeft;
        const gapRight = paddedLeft;
        const available = Math.max(0, gapRight - gapLeft);
        const maxWidth = Math.min(360, Math.max(0, available - 16));
        const effectiveWidth = maxWidth > 0 ? Math.min(messageBoxSize.width, maxWidth) : messageBoxSize.width;
        const halfWidth = effectiveWidth / 2;
        const targetCenterX = gapLeft + available / 2;
        const minCenterX = gapLeft + halfWidth + 8;
        const maxCenterX = gapRight - halfWidth - 8;
        const centerX = minCenterX <= maxCenterX ? Math.min(Math.max(targetCenterX, minCenterX), maxCenterX) : targetCenterX;

        return {
            position: 'absolute',
            left: `${centerX}px`,
            top: `${drawCenterY}px`,
            transform: 'translate(-50%, -50%)',
            maxWidth: maxWidth > 0 ? `${maxWidth}px` : undefined
        };
    })() : isDealerTurnStep ? (() => {
        if (!dealerRect) return undefined;

        const gap = 16;
        const safeMargin = 18;
        const halfWidth = messageBoxSize.width / 2;
        const halfHeight = messageBoxSize.height / 2;
        const targetCenterX = dealerRect.left - gap - halfWidth;
        const actionCenterY = dealerActionRect
            ? dealerActionRect.top + dealerActionRect.height / 2
            : dealerRect.top + dealerRect.height / 2;
        const targetCenterY = actionCenterY - halfHeight;

        const minCenterX = safeMargin + halfWidth;
        const maxCenterX = viewportWidth - safeMargin - halfWidth;
        const centerX = Math.min(Math.max(targetCenterX, minCenterX), maxCenterX);

        const minCenterY = safeMargin + halfHeight;
        const maxCenterY = viewportHeight - safeMargin - halfHeight;
        const centerY = Math.min(Math.max(targetCenterY, minCenterY), maxCenterY);

        const available = Math.max(0, dealerRect.left - safeMargin - gap);
        const maxWidth = Math.min(360, Math.max(0, available - 16));

        return {
            position: 'absolute',
            left: `${centerX}px`,
            top: `${centerY}px`,
            transform: 'translate(-50%, -50%)',
            maxWidth: maxWidth > 0 ? `${maxWidth}px` : undefined
        };
    })() : isDealerCardsStep ? (() => {
        const safeMargin = 18;
        const halfHeight = messageBoxSize.height / 2;
        const baseCenterY = viewportHeight / 2;
        const targetCenterY = baseCenterY - halfHeight;
        const minCenterY = safeMargin + halfHeight;
        const maxCenterY = viewportHeight - safeMargin - halfHeight;
        const centerY = Math.min(Math.max(targetCenterY, minCenterY), maxCenterY);

        return {
            position: 'absolute',
            left: `${viewportWidth / 2}px`,
            top: `${centerY}px`,
            transform: 'translate(-50%, -50%)'
        };
    })() : isWinMoneyStep ? (() => {
        return {
            position: 'absolute',
            left: `${viewportWidth / 2}px`,
            top: `${viewportHeight / 2}px`,
            transform: 'translate(-50%, -50%)'
        };
    })() : shouldAnchorAbovePlayerHands ? (() => {
        if (!playerHandsRect) return undefined;

        const gapAboveHands = 64;
        const targetY = playerHandsRect.top - gapAboveHands - messageBoxSize.height / 2;

        const safeMargin = 18;
        const halfHeight = messageBoxSize.height / 2;
        const minY = safeMargin + halfHeight;
        let maxY = viewportHeight - safeMargin - halfHeight;
        if (standButtonRect) {
            const standLimit = standButtonRect.top - 12 - halfHeight;
            maxY = Math.min(maxY, standLimit);
        }
        const centerY = Math.min(Math.max(targetY, minY), maxY);

        return {
            position: 'absolute',
            left: `${viewportWidth / 2}px`,
            top: `${centerY}px`,
            transform: 'translate(-50%, -50%)'
        };
    })() : undefined;
    const shouldPositionMessageBox = Boolean(messageBoxStyle);

    return (
        <div 
            className={`${styles.container} ${isClickToContinue ? styles.blockingMode : styles.interactiveMode} ${shouldDim ? styles.dimmed : styles.noDim} ${isExiting ? styles.exiting : ''} ${isOverlayFading ? styles.fading : ''}`}
            onClick={(event) => {
                event.stopPropagation();
                if (!isClickToContinue || isExiting || !allowClickRef.current) return;
                if (!manager.canDismissActiveStep()) return;
                exitingRef.current = true;
                setIsExiting(true);
                setIsOverlayFading(false);
                void manager.handleOverlayClick();
            }}
            style={{
                width: `${viewportWidth}px`,
                height: `${viewportHeight}px`,
                ...(highlightRect && shouldDim ? { background: 'transparent' } : {})
            }}
        >
            {/* Highlight Hole */}
            {renderedHighlightRect && (
                <div 
                    className={`${styles.highlightHole} ${highlightVisible ? styles.highlightVisible : ''} ${hideHighlightScrim ? styles.highlightNoScrim : ''} ${activeStep.id === 'draw_indicator' ? styles.highlightTight : ''}`}
                    style={highlightStyle}
                />
            )}

            {/* Message Box */}
            {shouldPositionMessageBox ? (
                <div
                    className={styles.messageBoxWrapper}
                    style={messageBoxStyle}
                >
                    <div 
                        key={activeStep.id}
                        className={`${styles.messageBox} ${styles.messageBoxPositioned} tutorial-popup`}
                        ref={messageBoxRef}
                        onAnimationEnd={(e) => {
                            if (e.currentTarget !== e.target) return;

                            if (isExiting) {
                                setIsOverlayFading(true);
                                exitTimeoutRef.current = window.setTimeout(() => {
                                    setActiveStep(null);
                                    setIsExiting(false);
                                    setIsOverlayFading(false);
                                    exitingRef.current = false;
                                    allowClickRef.current = false;
                                    exitTimeoutRef.current = null;
                                }, 220);
                                return;
                            }

                            allowClickRef.current = true;
                        }}
                    >
                        <div className={`${styles.messageText} tutorial-popup-text`}>
                            {activeStep.text}
                        </div>
                    </div>
                </div>
            ) : (
                <div 
                    key={activeStep.id}
                    className={`${styles.messageBox} tutorial-popup`}
                    ref={messageBoxRef}
                    onAnimationEnd={(e) => {
                        if (e.currentTarget !== e.target) return;

                        if (isExiting) {
                            setIsOverlayFading(true);
                            exitTimeoutRef.current = window.setTimeout(() => {
                                setActiveStep(null);
                                setIsExiting(false);
                                setIsOverlayFading(false);
                                exitingRef.current = false;
                                allowClickRef.current = false;
                                exitTimeoutRef.current = null;
                            }, 220);
                            return;
                        }

                        allowClickRef.current = true;
                    }}
                >
                    <div className={`${styles.messageText} tutorial-popup-text`}>
                        {activeStep.text}
                    </div>
                </div>
            )}
        </div>
    );
};
