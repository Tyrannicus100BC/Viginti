import { formatMultPercent } from '../logic/formatters';
import React, { useEffect, useRef } from 'react';
import styles from './FinalScoreOverlay.module.css';
import { fireConfetti } from '../utils/confetti';

interface FinalScoreOverlayProps {
    chips: number;
    mult: number;
    totalScore: number;
    onContinue: () => void;
}

export const FinalScoreOverlay: React.FC<FinalScoreOverlayProps> = ({ chips, mult, totalScore, onContinue }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        // Fire confetti when mounted
        if (canvasRef.current) {
            canvasRef.current.width = window.innerWidth;
            canvasRef.current.height = window.innerHeight;

            // Fire confetti from center
            fireConfetti(canvasRef.current, {
                elementCount: 150,
                spread: 120,
                startVelocity: 60,
                decay: 0.96
            });
        }

        // Auto-continue logic handled by parent store (or can be added here)
    }, []);

    return (
        <div className={styles.overlayContainer}>
            <canvas ref={canvasRef} className={styles.confettiCanvas} />

            <div className={styles.scoreBox} onClick={onContinue}>
                <div className={styles.statGroup}>
                    <span className={styles.label}>Chips</span>
                    <span className={`${styles.value} ${styles.chips}`} style={chips < 0 ? { color: '#ff4444' } : undefined}>{Math.abs(chips)}</span>
                </div>

                <div className={styles.operator}>X</div>

                <div className={styles.statGroup}>
                    <span className={styles.label}>Mult</span>
                    <span className={`${styles.value} ${styles.mult}`} style={mult < 0 ? { color: '#ff4444' } : undefined}>{formatMultPercent(mult)}</span>
                </div>

                <div className={styles.operator}>=</div>

                <div className={styles.statGroup}>
                    <span className={styles.label}>Total</span>
                    <span className={`${styles.value} ${styles.total}`} style={totalScore < 0 ? { color: '#ff4444' } : undefined}>{Math.abs(totalScore)}</span>
                </div>
            </div>
        </div>
    );
};
