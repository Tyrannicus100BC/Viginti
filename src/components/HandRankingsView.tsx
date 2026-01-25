import React from 'react';
import styles from './HandRankingsView.module.css';
import { formatHandChips, formatHandMult } from '../logic/formatters';

interface HandRankingsViewProps {

    onClose: () => void;
}

import { useGameStore } from '../store/gameStore';
import { RelicManager } from '../logic/relics/manager';


export const HandRankingsView: React.FC<HandRankingsViewProps> = ({ onClose }) => {
    const inventory = useGameStore(state => state.inventory);

    // Filter inventory for Scoring Relics and sort them
    const scoringRelics = inventory
        .map(inst => ({ config: RelicManager.getRelicConfig(inst.id), state: inst.state }))
        .filter((item): item is { config: NonNullable<typeof item.config>; state: any } => !!item.config && !!item.config.handType)
        .sort((a, b) => (a.config.handType!.order ?? 99) - (b.config.handType!.order ?? 99));

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

                    {scoringRelics.map((item, index) => {
                        const { config } = item;
                        if (!config.handType) return null;
                        const { name, chips, mult, chipCards } = config.handType;
                        const isLast = index === scoringRelics.length - 1;

                        const scoreText = formatHandChips(chips, chipCards);
                        const multText = formatHandMult(mult);
                        
                        if (chips === 0 && mult === 0) {
                             // E.g. purely card based?
                        }

                        // Special styling for Viginti
                        const isViginti = config.id === 'viginti';

                        return (
                            <div key={config.id} className={`${styles.row} ${isLast ? styles.lastInTier : ''}`}>
                                <span className={`${styles.handName} ${isViginti ? styles.isViginti : ''}`}>{name}</span>
                                <span className={`${styles.chips} ${styles.dynamicText}`}>
                                    {scoreText}
                                </span>
                                <span className={styles.multiplier}>
                                    {mult === 0 ? '-' : multText}
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
