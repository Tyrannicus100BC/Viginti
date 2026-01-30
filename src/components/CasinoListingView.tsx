import React from 'react';
import styles from './CasinoListingView.module.css';
import { useGameStore } from '../store/gameStore';
import { CITY_DEFINITIONS } from '../logic/cities/definitions';

interface CasinoListingViewProps {
  currentRound: number;
  onClose: () => void;
}

export const CasinoListingView: React.FC<CasinoListingViewProps> = ({ currentRound, onClose }) => {
    const selectedCityId = useGameStore(state => state.selectedCityId);
    const cityId = selectedCityId || 'las_vegas';
    const city = CITY_DEFINITIONS.find(c => c.id === cityId) || CITY_DEFINITIONS[0];

    const casinos = Array.from({ length: city.casinoTargets.length }, (_, i) => i + 1);

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.cityNameLabel}>{city.name.toUpperCase()}</div>
                <h2>Casino Details</h2>
                
                <div className={styles.scrollContainer}>
                    {casinos.map(round => (
                        <div 
                            key={round} 
                            className={`${styles.row} ${round === currentRound ? styles.active : ''}`}
                        >
                            <span className={styles.casinoName}>
                                Casino {round}
                            </span>
                            <span className={styles.targetScore}>
                                {"$" + city.casinoTargets[round - 1].toLocaleString()}
                            </span>
                        </div>
                    ))}
                </div>
                <button className="close-x-btn" onClick={onClose}>×</button>
            </div>
        </div>
    );
};
