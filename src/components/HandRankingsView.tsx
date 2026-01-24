import React from 'react';
import styles from './HandRankingsView.module.css';
import { SCORING_RULES } from '../logic/scoring';
import type { ScoringCriterionId } from '../types';

interface HandRankingsViewProps {
    onClose: () => void;
}


const ORDERED_IDS = [
    'viginti',
    'win',
    'double_down',
    'pair',
    'straight',
    'flush'
];

export const HandRankingsView: React.FC<HandRankingsViewProps> = ({ onClose }) => {
    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2>Score Details</h2>
                
                <div className={styles.scrollContent}>
                    {/* Main Header */}
                    <div className={`${styles.headerRow} ${styles.tierHeaderRow}`}>
                        <span className={styles.tierNameHeader}>Hand Type</span>
                        <span className={styles.chipsHeader}>Value</span>
                        <span className={styles.multHeader}>Mult</span>
                    </div>

                    {ORDERED_IDS.map((id, index) => {
                        const rule = SCORING_RULES[id as ScoringCriterionId];
                        if (!rule) return null;
                        const isLast = index === ORDERED_IDS.length - 1;

                        // Dynamic text mapping
                        let scoreText = `$${rule.chips}`;
                        if (id === 'double_down') {
                            scoreText = '-'; // No chips
                        } else if (rule.chips === 0) {
                            scoreText = 'Cards';
                        }

                        return (
                            <div key={rule.id} className={`${styles.row} ${isLast ? styles.lastInTier : ''}`}>
                                <span className={`${styles.handName} ${id === 'viginti' ? styles.isViginti : ''}`}>{rule.name}</span>
                                <span className={`${styles.chips} ${styles.dynamicText}`}>
                                    {scoreText}
                                </span>
                                <span className={styles.multiplier}>
                                    {rule.mult === 0 ? '-' : `x${rule.mult.toFixed(1)}`}
                                </span>
                            </div>
                        );
                    })}
                </div>
                <button className="close-x-btn" onClick={onClose}>×</button>
            </div>
        </div>
    );
};
