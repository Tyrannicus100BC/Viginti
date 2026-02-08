
import React, { useEffect, useRef, useState } from 'react';
import { TutorialManager, type TutorialStep } from '../logic/tutorials/tutorials';
import { NEXT_CASINO_TUTORIAL_ID } from '../logic/tutorials/definitions';
import { useLayout } from './ResponsiveLayout';
import { sfxEngine } from '../utils/sfxEngine';
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
    const [outcomeHandRect, setOutcomeHandRect] = useState<DOMRect | null>(null);
    const [hudRect, setHudRect] = useState<DOMRect | null>(null);
    const [totalWinningsRect, setTotalWinningsRect] = useState<DOMRect | null>(null);
    const [hudDrawsRect, setHudDrawsRect] = useState<DOMRect | null>(null);
    const [messageBoxSize, setMessageBoxSize] = useState({ width: 0, height: 0 });
    const manager = TutorialManager.getInstance();
    const { scale, viewportWidth, viewportHeight, idealWidth } = useLayout();
    const stepRef = useRef<TutorialStep | null>(null);
    const messageBoxRef = useRef<HTMLDivElement>(null);
    const allowClickRef = useRef(false);
    const exitingRef = useRef(false);
    const highlightFadeTimeoutRef = useRef<number | null>(null);
    const exitTimeoutRef = useRef<number | null>(null);
    const lastSoundStepIdRef = useRef<string | null>(null);
    const liftedTargetRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        return manager.subscribe(step => {
            if (step === null && exitingRef.current && stepRef.current) {
                return;
            }

            if (step === null && !exitingRef.current) {
                if (stepRef.current) {
                    exitingRef.current = true;
                    setIsExiting(true);
                    setIsOverlayFading(true);
                    allowClickRef.current = false;
                    if (exitTimeoutRef.current !== null) {
                        window.clearTimeout(exitTimeoutRef.current);
                    }
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
        if (!activeStep) {
            lastSoundStepIdRef.current = null;
            return;
        }
        if (lastSoundStepIdRef.current === activeStep.id) return;
        lastSoundStepIdRef.current = activeStep.id;
        sfxEngine.play('tutorial');
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

    const isOutcomeStep = activeStep?.id === 'viginti_first' || activeStep?.id === 'bust_first';

    const getOutcomeHandIndex = (context: any, stepId: string) => {
        const hands = Array.isArray(context?.playerHands) ? context.playerHands : [];
        if (stepId === 'viginti_first') {
            return hands.findIndex((hand: any) => hand && hand.blackjackValue === 21 && !hand.isBust);
        }
        if (stepId === 'bust_first') {
            return hands.findIndex((hand: any) => hand && hand.isBust);
        }
        return -1;
    };

    useEffect(() => {
        if (!activeStep || !isOutcomeStep) {
            setOutcomeHandRect(null);
            return;
        }

        const updateRect = () => {
            const context = manager.getContext();
            const index = getOutcomeHandIndex(context, activeStep.id);
            const wrapper = document.getElementById('game-scale-wrapper');
            if (index < 0 || !wrapper) {
                setOutcomeHandRect(null);
                return;
            }

            const el = document.getElementById(`player-hand-${index}`);
            if (!el) {
                setOutcomeHandRect(null);
                return;
            }

            const rect = el.getBoundingClientRect();
            const wrapperRect = wrapper.getBoundingClientRect();

            const left = (rect.left - wrapperRect.left) / scale;
            const top = (rect.top - wrapperRect.top) / scale;
            const width = rect.width / scale;
            const height = rect.height / scale;

            setOutcomeHandRect(new DOMRect(left, top, width, height));
        };

        updateRect();
        const interval = setInterval(updateRect, 100);
        window.addEventListener('resize', updateRect);

        return () => {
            clearInterval(interval);
            window.removeEventListener('resize', updateRect);
        };
    }, [activeStep, isOutcomeStep, scale]);

    // Track active step highlight element
    useEffect(() => {
        if (isOutcomeStep) {
            setHighlightRect(outcomeHandRect);
            return;
        }

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
    }, [activeStep, scale, isOutcomeStep, outcomeHandRect]);

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

    useEffect(() => {
        const clearLiftedTarget = () => {
            if (!liftedTargetRef.current) return;
            liftedTargetRef.current.classList.remove(styles.highlightTarget);
            liftedTargetRef.current = null;
        };

        if (!activeStep) {
            clearLiftedTarget();
            return;
        }

        const scrimMode = activeStep.scrim ?? 'auto';
        const shouldLift = scrimMode !== 'none' && (Boolean(activeStep.highlight) || isOutcomeStep);

        const updateTarget = () => {
            if (!shouldLift) {
                clearLiftedTarget();
                return;
            }

            let target: HTMLElement | null = null;
            if (isOutcomeStep) {
                const context = manager.getContext();
                const index = getOutcomeHandIndex(context, activeStep.id);
                if (index >= 0) {
                    target = document.getElementById(`player-hand-${index}`) as HTMLElement | null;
                }
            } else if (activeStep.highlight) {
                target = document.getElementById(activeStep.highlight.elementId) as HTMLElement | null;
            }

            if (target === liftedTargetRef.current) return;
            clearLiftedTarget();
            if (target) {
                target.classList.add(styles.highlightTarget);
                liftedTargetRef.current = target;
            }
        };

        updateTarget();
        const intervalId = shouldLift ? window.setInterval(updateTarget, 100) : null;
        window.addEventListener('resize', updateTarget);

        return () => {
            if (intervalId !== null) {
                window.clearInterval(intervalId);
            }
            window.removeEventListener('resize', updateTarget);
            clearLiftedTarget();
        };
    }, [activeStep, isOutcomeStep, manager]);

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
        if (!activeStep || activeStep.id !== 'hud_debt') {
            setHudRect(null);
            setTotalWinningsRect(null);
            return;
        }

        const updateRect = () => {
            const hud = document.getElementById('hud-bar');
            const winnings = document.getElementById('total-winnings');
            const wrapper = document.getElementById('game-scale-wrapper');
            if (!hud || !winnings || !wrapper) return;

            const wrapperRect = wrapper.getBoundingClientRect();
            const hudRect = hud.getBoundingClientRect();
            const winningsRect = winnings.getBoundingClientRect();

            const hudLeft = (hudRect.left - wrapperRect.left) / scale;
            const hudTop = (hudRect.top - wrapperRect.top) / scale;
            const hudWidth = hudRect.width / scale;
            const hudHeight = hudRect.height / scale;
            setHudRect(new DOMRect(hudLeft, hudTop, hudWidth, hudHeight));

            const winningsLeft = (winningsRect.left - wrapperRect.left) / scale;
            const winningsTop = (winningsRect.top - wrapperRect.top) / scale;
            const winningsWidth = winningsRect.width / scale;
            const winningsHeight = winningsRect.height / scale;
            setTotalWinningsRect(new DOMRect(winningsLeft, winningsTop, winningsWidth, winningsHeight));
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
        if (!activeStep || activeStep.id !== 'hud_draws') {
            setHudDrawsRect(null);
            return;
        }

        const updateRect = () => {
            const draws = document.getElementById('hud-draws');
            const wrapper = document.getElementById('game-scale-wrapper');
            if (!draws || !wrapper) return;

            const wrapperRect = wrapper.getBoundingClientRect();
            const drawsRect = draws.getBoundingClientRect();

            const left = (drawsRect.left - wrapperRect.left) / scale;
            const top = (drawsRect.top - wrapperRect.top) / scale;
            const width = drawsRect.width / scale;
            const height = drawsRect.height / scale;

            setHudDrawsRect(new DOMRect(left, top, width, height));
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

    const defaultPositionSteps = new Set(['welcome', 'win_money_first', 'hud_debt', 'hud_draws', NEXT_CASINO_TUTORIAL_ID]);
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
    const isHudDebtStep = activeStep.id === 'hud_debt';
    const isHudDrawsStep = activeStep.id === 'hud_draws';
    const safeLeft = (viewportWidth - idealWidth) / 2;
    
    // Calculate highlight style
    const highlightStyle: React.CSSProperties = renderedHighlightRect ? {
        top: renderedHighlightRect.top - (activeStep.highlight?.padding || 0),
        left: renderedHighlightRect.left - (activeStep.highlight?.padding || 0),
        width: renderedHighlightRect.width + (activeStep.highlight?.padding || 0) * 2,
        height: renderedHighlightRect.height + (activeStep.highlight?.padding || 0) * 2,
        borderRadius: activeStep.highlight?.type === 'circle' ? '50%' : '8px'
    } : {};

    const messageBoxStyle: React.CSSProperties | undefined = isDrawIndicator ? (() => {
        const padding = 2;
        const paddedLeft = indicatorRect!.left - padding;
        const paddedTop = indicatorRect!.top - padding;
        const paddedHeight = indicatorRect!.height + padding * 2;
        const drawCenterY = paddedTop + paddedHeight / 2;

        const gapLeft = safeLeft;
        const gapRight = paddedLeft;
        const available = Math.max(0, gapRight - gapLeft);
        const maxWidth = Math.min(360, Math.max(0, available - 16));

        return {
            position: 'absolute',
            left: `${safeLeft}px`,
            top: `${drawCenterY}px`,
            transform: 'translate(0, -50%)',
            maxWidth: maxWidth > 0 ? `${maxWidth}px` : undefined
        };
    })() : isPlaceCardStep && indicatorRect ? (() => {
        const padding = 2;
        const paddedLeft = indicatorRect.left - padding;
        const paddedTop = indicatorRect.top - padding;
        const paddedHeight = indicatorRect.height + padding * 2;
        const drawCenterY = paddedTop + paddedHeight / 2;

        const gapLeft = safeLeft;
        const gapRight = paddedLeft;
        const available = Math.max(0, gapRight - gapLeft);
        const maxWidth = Math.min(360, Math.max(0, available - 16));

        return {
            position: 'absolute',
            left: `${safeLeft}px`,
            top: `${drawCenterY}px`,
            transform: 'translate(0, -50%)',
            maxWidth: maxWidth > 0 ? `${maxWidth}px` : undefined
        };
    })() : isDealerTurnStep ? (() => {
        if (!dealerRect) return undefined;

        const safeMargin = 18;
        const halfHeight = messageBoxSize.height / 2;
        const actionCenterY = dealerActionRect
            ? dealerActionRect.top + dealerActionRect.height / 2
            : dealerRect.top + dealerRect.height / 2;
        const targetCenterY = actionCenterY - halfHeight;

        const minCenterY = safeMargin + halfHeight;
        const maxCenterY = viewportHeight - safeMargin - halfHeight;
        const centerY = Math.min(Math.max(targetCenterY, minCenterY), maxCenterY);

        const availableWidth = Math.max(0, idealWidth - safeMargin * 2);
        const maxWidth = Math.min(360, availableWidth);

        return {
            position: 'absolute',
            left: `${safeLeft}px`,
            top: `${centerY}px`,
            transform: 'translate(0, -50%)',
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
    })() : isHudDebtStep && hudRect && totalWinningsRect ? (() => {
        const halfHeight = messageBoxSize.height / 2;
        const safeMargin = 18;
        const topPadding = 24;
        const bottomPadding = 12;
        const hudBottom = hudRect.top + hudRect.height;
        const winningsTop = totalWinningsRect.top;
        const gapTop = hudBottom + topPadding;
        const gapBottom = winningsTop - bottomPadding;
        const gapSize = gapBottom - gapTop;
        const evenMargin = (gapSize - messageBoxSize.height) / 2;
        const desiredCenterY = gapTop + evenMargin + halfHeight;

        let minY = gapTop + halfHeight;
        let maxY = gapBottom - halfHeight;
        if (minY > maxY) {
            minY = safeMargin + halfHeight;
            maxY = viewportHeight - safeMargin - halfHeight;
        }
        const centerY = Math.min(Math.max(desiredCenterY, minY), maxY);
        const maxHudWidth = Math.min(idealWidth - 32, viewportWidth - 32);

        return {
            position: 'absolute',
            left: `${viewportWidth / 2}px`,
            top: `${centerY}px`,
            transform: 'translate(-50%, -50%)',
            maxWidth: `${maxHudWidth}px`
        };
    })() : isHudDrawsStep && hudDrawsRect ? (() => {
        const safeMargin = 18;
        const gapBelow = 22;
        const halfWidth = messageBoxSize.width / 2;

        const targetTop = hudDrawsRect.top + hudDrawsRect.height + gapBelow;
        const minTop = safeMargin;
        const maxTop = viewportHeight - safeMargin - messageBoxSize.height;
        const top = Math.min(Math.max(targetTop, minTop), maxTop);

        const targetCenterX = hudDrawsRect.left + hudDrawsRect.width / 2;
        const minX = safeMargin + halfWidth;
        const maxX = viewportWidth - safeMargin - halfWidth;
        const centerX = Math.min(Math.max(targetCenterX, minX), maxX);
        const maxHudWidth = Math.min(idealWidth - 32, viewportWidth - 32);

        return {
            position: 'absolute',
            left: `${centerX}px`,
            top: `${top}px`,
            transform: 'translateX(-50%)',
            maxWidth: `${maxHudWidth}px`
        };
    })() : isOutcomeStep && outcomeHandRect && playerHandsRect ? (() => {
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

        const handCenterX = outcomeHandRect.left + outcomeHandRect.width / 2;
        const halfWidth = messageBoxSize.width / 2;
        const minX = safeMargin + halfWidth;
        const maxX = viewportWidth - safeMargin - halfWidth;
        const centerX = Math.min(Math.max(handCenterX, minX), maxX);

        return {
            position: 'absolute',
            left: `${centerX}px`,
            top: `${centerY}px`,
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
                setIsOverlayFading(true);
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
                        <div className={`${styles.messageText} ${isHudDebtStep ? styles.noWrap : ''} tutorial-popup-text`}>
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
                    <div className={`${styles.messageText} ${isHudDebtStep ? styles.noWrap : ''} tutorial-popup-text`}>
                        {activeStep.text}
                    </div>
                </div>
            )}
        </div>
    );
};
