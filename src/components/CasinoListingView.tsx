import React from 'react';
import styles from './CasinoListingView.module.css';
import { calculateTargetScore } from '../logic/casinoConfig';

interface CasinoListingViewProps {
  currentRound: number;
  onClose: () => void;
}

export const CasinoListingView: React.FC<CasinoListingViewProps> = ({ currentRound, onClose }) => {
    // Generate list for Casinos 1-8 always, or up to current round + 3?
    // Let's show 1-8 as a standard "track".
    const casinos = Array.from({ length: 8 }, (_, i) => i + 1);

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2>Casino Details</h2>
                
                <div className={styles.scrollContainer}>
                    {casinos.map(round => (
                        <div 
                            key={round} 
                            className={`${styles.row} ${round === currentRound ? styles.active : ''}`}
                        >
                            <span className={styles.casinoName}>
                                {round === currentRound && '➤ '}
                                Casino {round}
                            </span>
                            <span className={styles.targetScore}>{calculateTargetScore(round)}</span>
                        </div>
                    ))}
                    <div className={styles.row}>
                        <span className={styles.casinoName}>...</span>
                    </div>
                </div>
                
                <button className={styles.closeBtn} onClick={onClose}>Close</button>
            </div>
        </div>
    );
};
