import React from 'react';
import styles from './HandRankingsView.module.css';
import { SCORING_RULES } from '../logic/scoring';
import type { ScoringCriterionId } from '../types';

interface HandRankingsViewProps {
    onClose: () => void;
}


const TIERS = [
    { name: 'Outcome', ids: ['win', 'viginti'] },
    { name: 'Rank', ids: ['one_pair', 'two_pair', 'three_of_a_kind'] },
    { name: 'Suite', ids: ['mini_flush', 'partial_flush'] },
    { name: 'Order', ids: ['sequential', 'short_straight'] }
];

export const HandRankingsView: React.FC<HandRankingsViewProps> = ({ onClose }) => {
    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2>Score Details</h2>

                {TIERS.map((tier, index) => (
                    <React.Fragment key={tier.name}>
                        {/* Tier Header */}
                        <div className={`${styles.headerRow} ${styles.tierHeaderRow}`}>
                            <span className={styles.tierNameHeader}>{tier.name}</span>
                            {index === 0 && (
                                <>
                                    <span className={styles.chipsHeader}>Score</span>
                                    <span className={styles.multHeader}>Mult</span>
                                </>
                            )}
                        </div>

                        {/* Tier Items */}
                        {tier.ids.map((id, itemIndex) => {
                            const rule = SCORING_RULES[id as ScoringCriterionId];
                            if (!rule) return null;
                            const isLastInTier = itemIndex === tier.ids.length - 1;

                            // Dynamic text mapping
                            let scoreText = `+${rule.chips}`;
                            if (rule.chips === 0 && rule.id !== 'win') {
                                if (tier.name === 'Rank') scoreText = 'Sum of Pairs Card Values';
                                else if (tier.name === 'Suite') scoreText = 'Sum of Suited Card Values';
                                else if (tier.name === 'Order') scoreText = 'Sum of Order Card Values';
                                else scoreText = 'Sum';
                            }

                            return (
                                <div key={rule.id} className={`${styles.row} ${isLastInTier ? styles.lastInTier : ''}`}>
                                    <span className={styles.handName}>{rule.name}</span>
                                    <span className={`${styles.chips} ${styles.dynamicText}`}>
                                        {scoreText}
                                    </span>
                                    <span className={styles.multiplier}>{`x${rule.mult.toFixed(1)}`}</span>
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}

                <button className={styles.closeBtn} onClick={onClose}>Close</button>
            </div>
        </div>
    );
};
