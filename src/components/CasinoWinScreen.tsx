import React from 'react';
import { useGameStore } from '../store/gameStore';
import { BonusPhysics } from './BonusPhysics';
import styles from './CasinoWinScreen.module.css';
import appStyles from '../App.module.css';

const INTRO_DELAY_MS = 1500;
const ROW_REVEAL_MS = 500;
const SLAM_MS = 220;
const BETWEEN_ROW_MS = 700;
const END_HOLD_MS = 1400;
const FAST_FORWARD_SPEED = 3;

export const CasinoWinScreen: React.FC = () => {
    const {
        shopRewardSummary,
        inventory,
        animationSpeed,
        setAnimationSpeed,
        addComps,
        resetScoreRowPitch,
        playScoreRowSfx,
        enterGiftShop
    } = useGameStore();
    const hasDoubleDownRelic = inventory.some(r => r.id === 'double_down');
    const hasSurrenderRelic = inventory.some(r => r.id === 'surrender');
    const [showIntro, setShowIntro] = React.useState(false);
    const [showDeals, setShowDeals] = React.useState(false);
    const [showSurrender, setShowSurrender] = React.useState(false);
    const [showDoubleDown, setShowDoubleDown] = React.useState(false);
    const [showWin, setShowWin] = React.useState(false);
    const [sequenceComplete, setSequenceComplete] = React.useState(false);
    const [usedFastForward, setUsedFastForward] = React.useState(false);
    const transitionedRef = React.useRef(false);
    const creditedRowsRef = React.useRef<Set<string>>(new Set());
    const speedRef = React.useRef(animationSpeed);

    const transitionToShop = React.useCallback(() => {
        if (transitionedRef.current) return;
        transitionedRef.current = true;
        setAnimationSpeed(1);
        enterGiftShop();
    }, [enterGiftShop, setAnimationSpeed]);

    React.useEffect(() => {
        speedRef.current = animationSpeed;
    }, [animationSpeed]);

    React.useEffect(() => {
        let cancelled = false;
        setAnimationSpeed(1);
        setShowIntro(false);
        setShowDeals(false);
        setShowSurrender(false);
        setShowDoubleDown(false);
        setShowWin(false);
        setSequenceComplete(false);
        setUsedFastForward(false);
        creditedRowsRef.current.clear();
        resetScoreRowPitch();

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

        const creditBonus = (key: string, amount: number) => {
            if (cancelled || amount <= 0) return;
            if (creditedRowsRef.current.has(key)) return;
            creditedRowsRef.current.add(key);
            addComps(amount);
        };

        const seq = async () => {
            setShowIntro(true);
            await waitScaled(INTRO_DELAY_MS);
            if (cancelled) return;

            setShowDeals(true);
            await waitScaled(ROW_REVEAL_MS);
            if (cancelled) return;
            playScoreRowSfx();
            await waitScaled(SLAM_MS);
            if (cancelled) return;
            creditBonus('deals', shopRewardSummary.dealsBonus);
            await waitScaled(BETWEEN_ROW_MS);
            if (cancelled) return;

            if (hasSurrenderRelic) {
                setShowSurrender(true);
                await waitScaled(ROW_REVEAL_MS);
                if (cancelled) return;
                playScoreRowSfx();
                await waitScaled(SLAM_MS);
                if (cancelled) return;
                creditBonus('surrender', shopRewardSummary.surrenderBonus);
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
                creditBonus('doubleDown', shopRewardSummary.doubleDownBonus);
                await waitScaled(BETWEEN_ROW_MS);
                if (cancelled) return;
            }

            setShowWin(true);
            await waitScaled(ROW_REVEAL_MS);
            if (cancelled) return;
            playScoreRowSfx();
            await waitScaled(SLAM_MS);
            if (cancelled) return;
            creditBonus('win', shopRewardSummary.winBonus);
            await waitScaled(END_HOLD_MS);
            if (cancelled) return;

            setSequenceComplete(true);
        };

        if (!shopRewardSummary) {
            transitionToShop();
        } else {
            void seq();
        }

        return () => {
            cancelled = true;
        };
    }, [addComps, hasDoubleDownRelic, hasSurrenderRelic, playScoreRowSfx, resetScoreRowPitch, setAnimationSpeed, shopRewardSummary, transitionToShop]);

    if (!shopRewardSummary) {
        return null;
    }

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();

        if (sequenceComplete) return;

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

                {showWin && (
                    <div className={styles.bonusLine}>
                        <span className={styles.bonusLabel}>Win Bonus</span>
                        <span className={styles.bonusValue}>₵{shopRewardSummary.winBonus}</span>
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
    );
};
