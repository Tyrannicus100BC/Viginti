import { useEffect, useState } from 'react';
import styles from './AnteIncreasePopup.module.css';

const COUNT_START_MS = 650;
const COUNT_DURATION_MS = 800;

type Props = {
    previousAnte: number;
    ante: number;
    onContinue: () => void;
};

export function AnteIncreasePopup({ previousAnte, ante, onContinue }: Props) {
    const [amount, setAmount] = useState(previousAnte);
    const [settled, setSettled] = useState(false);
    const [reducedMotion, setReducedMotion] = useState(() =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    useEffect(() => {
        const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
        const onChange = () => setReducedMotion(preference.matches);
        preference.addEventListener('change', onChange);
        return () => preference.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
        if (reducedMotion) return;
        const start = performance.now();
        let frame: number;
        const tick = (now: number) => {
            const progress = Math.min(1, Math.max(0, (now - start - COUNT_START_MS) / COUNT_DURATION_MS));
            // Accelerate through the middle, then ease into the new ante.
            const eased = progress < 0.5
                ? 4 * progress ** 3
                : 1 - (-2 * progress + 2) ** 3 / 2;
            setAmount(Math.round(previousAnte + (ante - previousAnte) * eased));
            setSettled(progress === 1);
            if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [previousAnte, ante, reducedMotion]);

    const isSettled = settled || reducedMotion;
    return (
        <div className={styles.overlay} role="dialog" aria-modal="true"
            aria-labelledby="ante-increase-title" aria-describedby="ante-increase-description"
            onClick={event => { event.stopPropagation(); onContinue(); }}
            onKeyDown={event => { event.stopPropagation(); if (event.key === 'Tab') event.preventDefault(); }}>
            <button type="button" autoFocus className={styles.popup} aria-label="Continue after ante increase">
                <span id="ante-increase-title" className={styles.title}>Ante Increase</span>
                <span id="ante-increase-description" className={styles.srOnly}>
                    Ante increases from ${previousAnte} to ${ante}.
                </span>
                <span className={styles.amounts} aria-hidden="true">
                    <span className={styles.previous}>${previousAnte}</span>
                    <span className={styles.arrow}>→</span>
                    <span className={`${styles.next} ${isSettled ? styles.settled : ''}`}>
                        ${reducedMotion ? ante : amount}
                    </span>
                </span>
                <span className={`${styles.increase} ${isSettled ? styles.increaseVisible : ''}`} aria-hidden="true">
                    +${ante - previousAnte}
                </span>
                <span className={styles.hint}>Click to continue</span>
            </button>
        </div>
    );
}
