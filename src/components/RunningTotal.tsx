import React from 'react';
import { useGameStore } from '../store/gameStore';
import styles from './RunningTotal.module.css';

export const RunningTotal: React.FC = () => {
    const { runningSummary } = useGameStore();

    if (!runningSummary) return null;

    return (
        <div className={styles.container}>
            <div className={styles.item}>
                <span className={styles.label}>Chips</span>
                <span className={`${styles.value} ${styles.chips}`}>{runningSummary.chips}</span>
            </div>
            <div className={styles.x}>X</div>
            <div className={styles.item}>
                <span className={styles.label}>Mult</span>
                <span className={`${styles.value} ${styles.mult}`}>{runningSummary.mult.toFixed(1)}</span>
            </div>
        </div>
    );
};
