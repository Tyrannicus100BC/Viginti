import React from 'react';
import { useGameBridge } from '../store/gameBridge';
import { BonusPhysics } from './BonusPhysics';
import styles from './CasinoWinScreen.module.css';
import appStyles from '../App.module.css';
import { sfxEngine } from '../utils/sfxEngine';

const INTRO_DELAY_MS = 1500;
const ROW_REVEAL_MS = 500;
const SLAM_MS = 220;
const BETWEEN_ROW_MS = 700;
const TOTAL_HUD_CREDIT_DELAY_MS = 500;
const END_HOLD_MS = 1400;
const FAST_FORWARD_SPEED = 4;
const FAST_FORWARD_AUTOTRANSITION_DELAY_MS = 500;
const EXIT_FADE_MS = 200;

export const CasinoWinScreen: React.FC = () => {
    const {
        gameState,
        dispatch,
        animationSpeed,
        setAnimationSpeed,
        resetScoreRowPitch,
        playScoreRowSfx,
        shopRewardSummary,
        inventory
    } = useGameBridge();

    const hasDoubleDownRelic = inventory.some((r: any) => r.id === 'double_down');
    const hasSurrenderRelic = inventory.some((r: any) => r.id === 'surrender');
    
    // Tutorial state from engine
    const isCompTicketsCompleted = gameState.tutorial.completedStepIds.includes('comp_tickets');

    const [showIntro, setShowIntro] = React.useState(false);
    const [showDeals, setShowDeals] = React.useState(false);
    const [showSurrender, setShowSurrender] = React.useState(false);
    const [showDoubleDown, setShowDoubleDown] = React.useState(false);
    const [showInterested, setShowInterested] = React.useState(false);
    const [showWin, setShowWin] = React.useState(false);
    const [showTotal, setShowTotal] = React.useState(false);
    const [sequenceComplete, setSequenceComplete] = React.useState(false);
    const [usedFastForward, setUsedFastForward] = React.useState(false);
    const [isExiting, setIsExiting] = React.useState(false);
    const transitionedRef = React.useRef(false);
    const creditedTotalRef = React.useRef(false);
    const speedRef = React.useRef(animationSpeed);
    const autoTransitionTimeoutRef = React.useRef<number | null>(null);
    const exitTimeoutRef = React.useRef<number | null>(null);

    const finalizeTransitionToShop = React.useCallback(() => {
        if (transitionedRef.current) return;
        transitionedRef.current = true;
        setAnimationSpeed(1);
        dispatch({ type: 'enter_gift_shop' });
    }, [dispatch, setAnimationSpeed]);

    const transitionToShop = React.useCallback(() => {
        if (transitionedRef.current || exitTimeoutRef.current !== null) return;
        setIsExiting(true);
        exitTimeoutRef.current = window.setTimeout(() => {
            exitTimeoutRef.current = null;
            finalizeTransitionToShop();
        }, EXIT_FADE_MS);
    }, [finalizeTransitionToShop]);

    React.useEffect(() => {
        speedRef.current = animationSpeed;
    }, [animationSpeed]);

    React.useEffect(() => {
        if (!sequenceComplete || !usedFastForward) return;
        
        // Suppress auto-transition if the comp_tickets tutorial is about to show
        // Note: engine checks triggers independently, so checking completed status is a heuristic
        if (!isCompTicketsCompleted) return;

        if (autoTransitionTimeoutRef.current !== null) {
            window.clearTimeout(autoTransitionTimeoutRef.current);
        }
        autoTransitionTimeoutRef.current = window.setTimeout(() => {
            autoTransitionTimeoutRef.current = null;
            transitionToShop();
        }, FAST_FORWARD_AUTOTRANSITION_DELAY_MS);

        return () => {
            if (autoTransitionTimeoutRef.current !== null) {
                window.clearTimeout(autoTransitionTimeoutRef.current);
                autoTransitionTimeoutRef.current = null;
            }
        };
    }, [sequenceComplete, transitionToShop, usedFastForward, isCompTicketsCompleted]);

    React.useEffect(() => {
        let cancelled = false;
        transitionedRef.current = false;
        setAnimationSpeed(1);
        setShowIntro(false);
        setShowDeals(false);
        setShowSurrender(false);
        setShowDoubleDown(false);
        setShowInterested(false);
        setShowWin(false);
        setShowTotal(false);
        setSequenceComplete(false);
        setUsedFastForward(false);
        setIsExiting(false);
        creditedTotalRef.current = false;
        resetScoreRowPitch();

        // No need to register 'proceed_to_gift_shop' action manually; 
        // tutorial UI flow should handle standard interactions.

        const rewardSummary = shopRewardSummary;

        const wait = (ms: number) => new Promise<void>(resolve => {
            if (cancelled || ms <= 0) {
                resolve();
                return;
            }
            window.setTimeout(resolve, ms);
        });

        const waitScaled = async (durationMs: number) => {
            let remainingScaledMs = durationMs;
            while (!cancelled && remainingScaledMs > 0) {
                const speed = Math.max(0.1, speedRef.current);
                const realMs = Math.min(50, remainingScaledMs / speed);
                await wait(realMs);
                remainingScaledMs -= realMs * speed;
            }
        };

        const creditTotal = () => {
            if (cancelled || creditedTotalRef.current) return;
            creditedTotalRef.current = true;
            if (rewardSummary && rewardSummary.total > 0) {
                // Engine handles actual crediting on shop entry.
                // We just play the sound for effect.
                sfxEngine.play('totalWinnings');
            }
        };

        const seq = async () => {
            if (!rewardSummary) return;
            setShowIntro(true);
            await waitScaled(INTRO_DELAY_MS);
            if (cancelled) return;

            setShowDeals(true);
            await waitScaled(ROW_REVEAL_MS);
            if (cancelled) return;
            playScoreRowSfx();
            await waitScaled(SLAM_MS);
            if (cancelled) return;
            await waitScaled(BETWEEN_ROW_MS);
            if (cancelled) return;

            if (hasSurrenderRelic) {
                setShowSurrender(true);
                await waitScaled(ROW_REVEAL_MS);
                if (cancelled) return;
                playScoreRowSfx();
                await waitScaled(SLAM_MS);
                if (cancelled) return;
                await waitScaled(BETWEEN_ROW_MS);
                if (cancelled) return;
            }

            if (hasDoubleDownRelic) {
                setShowDoubleDown(true);
                await waitScaled(ROW_REVEAL_MS);
                if (cancelled) return;
                playScoreRowSfx();
                await waitScaled(SLAM_MS);
                if (cancelled) return;
                await waitScaled(BETWEEN_ROW_MS);
                if (cancelled) return;
            }

            setShowInterested(true);
            await waitScaled(ROW_REVEAL_MS);
            if (cancelled) return;
            playScoreRowSfx();
            await waitScaled(SLAM_MS);
            if (cancelled) return;
            await waitScaled(BETWEEN_ROW_MS);
            if (cancelled) return;

            setShowWin(true);
            await waitScaled(ROW_REVEAL_MS);
            if (cancelled) return;
            playScoreRowSfx();
            await waitScaled(SLAM_MS);
            if (cancelled) return;

            await waitScaled(BETWEEN_ROW_MS);
            if (cancelled) return;

            setShowTotal(true);
            await waitScaled(ROW_REVEAL_MS);
            if (cancelled) return;
            playScoreRowSfx();
            await waitScaled(SLAM_MS);
            if (cancelled) return;
            await wait(TOTAL_HUD_CREDIT_DELAY_MS);
            if (cancelled) return;
            creditTotal();
            
            // Signal engine for tutorial trigger
            dispatch({ type: 'signal_animation_complete', animationId: 'total_comps_calculated' });

            await waitScaled(END_HOLD_MS);
            if (cancelled) return;

            setSequenceComplete(true);
        };

        if (!shopRewardSummary) {
            return;
        }
        void seq();

        return () => {
            cancelled = true;
            if (autoTransitionTimeoutRef.current !== null) {
                window.clearTimeout(autoTransitionTimeoutRef.current);
                autoTransitionTimeoutRef.current = null;
            }
            if (exitTimeoutRef.current !== null) {
                window.clearTimeout(exitTimeoutRef.current);
                exitTimeoutRef.current = null;
            }
        };
    }, [dispatch, finalizeTransitionToShop, hasDoubleDownRelic, hasSurrenderRelic, playScoreRowSfx, resetScoreRowPitch, setAnimationSpeed, shopRewardSummary, inventory]);

    if (!shopRewardSummary) {
        return null;
    }

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();

        if (sequenceComplete) {
            transitionToShop();
            return;
        }

        if (!sequenceComplete) {
            if (usedFastForward) return;
            setUsedFastForward(true);
            setAnimationSpeed(FAST_FORWARD_SPEED);
            return;
        }
    };

    return (
        <div
            className={styles.container}
            onClick={handleClick}
            style={{
                '--win-intro-duration': `${500 / Math.max(0.1, animationSpeed)}ms`,
                '--win-row-duration': `${ROW_REVEAL_MS / Math.max(0.1, animationSpeed)}ms`,
                '--win-slam-duration': `${SLAM_MS / Math.max(0.1, animationSpeed)}ms`
            } as React.CSSProperties}
        >
            <div className={`${styles.fadeLayer} ${isExiting ? styles.exiting : ''}`}>
                <BonusPhysics />
                <div className={styles.content}>
                    {showIntro && (
                        <div className={styles.introTextMain}>CASINO PAYOUT</div>
                    )}

                    {showDeals && (
                        <div className={styles.bonusLine}>
                            <span className={styles.bonusLabel}>Deals Bonus</span>
                            <span className={styles.bonusValue}>₵{shopRewardSummary.dealsBonus}</span>
                        </div>
                    )}

                    {showSurrender && hasSurrenderRelic && (
                        <div className={styles.bonusLine}>
                            <span className={styles.bonusLabel}>Surrenders Bonus</span>
                            <span className={styles.bonusValue}>₵{shopRewardSummary.surrenderBonus}</span>
                        </div>
                    )}

                    {showDoubleDown && hasDoubleDownRelic && (
                        <div className={styles.bonusLine}>
                            <span className={styles.bonusLabel}>Double Down Bonus</span>
                            <span className={styles.bonusValue}>₵{shopRewardSummary.doubleDownBonus}</span>
                        </div>
                    )}

                    {showInterested && (
                        <div className={styles.bonusLine}>
                            <span className={styles.bonusLabel}>Interested Bonus</span>
                            <span className={styles.bonusValue}>₵{shopRewardSummary.interestedBonus}</span>
                        </div>
                    )}

                    {showWin && (
                        <div className={styles.bonusLine}>
                            <span className={styles.bonusLabel}>Win Bonus</span>
                            <span className={styles.bonusValue}>₵{shopRewardSummary.winBonus}</span>
                        </div>
                    )}

                    {showTotal && (
                        <div className={styles.totalSection}>
                            <div className={styles.totalDivider} />
                            <div className={styles.bonusLine}>
                                <span className={styles.totalLabel}>Total</span>
                                <span className={`${styles.bonusValue} ${styles.totalValue}`}>₵{shopRewardSummary.total}</span>
                            </div>
                        </div>
                    )}
                </div>
                {sequenceComplete && (
                    <div className={styles.actionButtonDock}>
                        <button className={appStyles.nextRoundButton} onClick={transitionToShop}>
                            VISIT GIFT SHOP
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
