import React from 'react';
import styles from './HandRankingsView.module.css';
import { SCORING_RULES } from '../logic/scoring';

interface HandRankingsViewProps {
  onClose: () => void;
}


export const HandRankingsView: React.FC<HandRankingsViewProps> = ({ onClose }) => {
    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2>Poker Hand Rankings</h2>
                
                <div className={styles.headerRow}>
                    <span className={styles.handNameHeader}>Hand Type</span>
                    <span className={styles.chipsHeader}>Chips</span>
                    <span className={styles.multHeader}>Mult</span>
                </div>
                {Object.values(SCORING_RULES).map(rule => (
                    <div key={rule.id} className={styles.row}>
                        <span className={styles.handName}>{rule.name}</span>
                        <span className={styles.chips}>{rule.chips !== 0 ? `+${rule.chips}` : ''}</span>
                        <span className={styles.multiplier}>{rule.mult !== 0 ? `x${rule.mult}` : ''}</span>
                    </div>
                ))}
                
                <button className={styles.closeBtn} onClick={onClose}>Close</button>
            </div>
        </div>
    );
};
