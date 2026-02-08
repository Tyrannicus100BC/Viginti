
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './GamblerSelect.module.css';
import { CITY_DEFINITIONS } from '../logic/cities/definitions';
import { getUnlockHint } from '../logic/progression';
import { isCityUnlocked } from '../store/persistence';

interface CitySelectProps {
    selectedId: string;
    onSelect: (id: string) => void;
    onClickSound?: () => void;
}

export const CitySelect: React.FC<CitySelectProps> = ({ selectedId, onSelect, onClickSound }) => {
    const [isOverlayOpen, setIsOverlayOpen] = useState(false);
    const selectedCity = CITY_DEFINITIONS.find(c => c.id === selectedId) || CITY_DEFINITIONS[0];

    const handleSelect = (id: string) => {
        if (!isCityUnlocked(id)) return;
        onClickSound?.();
        onSelect(id);
        setIsOverlayOpen(false);
    };

    return (
        <div className={styles.container} onClick={(e) => e.stopPropagation()}>
            {/* Shift this one up so they stack. GamblerSelect is at bottom: 60px */}
                <div className={styles.selectionWrapper}>
                <div className={styles.changeLabel} onClick={() => {
                    onClickSound?.();
                    setIsOverlayOpen(true);
                }}>DESTINATION</div>
                <button 
                    className={styles.selectedButton}
                    onClick={() => {
                        onClickSound?.();
                        setIsOverlayOpen(true);
                    }}
                >
                    <div className={styles.selectedName}>{selectedCity.name}</div>
                </button>
            </div>

            {isOverlayOpen && createPortal(
                <div className={styles.overlay} onClick={() => setIsOverlayOpen(false)}>
                    <div className={styles.overlayContent} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.overlayHeader}>
                            <div className={styles.overlayTitle}>Select Destination</div>
                            <button className={styles.closeButton} onClick={() => setIsOverlayOpen(false)}>×</button>
                        </div>
                        <div className={styles.scrollList}>
                            {CITY_DEFINITIONS.map(def => {
                                const unlocked = isCityUnlocked(def.id);
                                return (
                                    <div 
                                        key={def.id}
                                        className={`${styles.overlayCard} ${selectedId === def.id ? styles.overlaySelected : ''} ${!unlocked ? styles.overlayCardLocked : ''}`}
                                        onClick={() => handleSelect(def.id)}
                                    >
                                        <div className={styles.overlayCardName}>
                                            {def.name} <span style={{fontSize: '0.8em', opacity: 0.7}}>({def.casinoTargets.length} Casinos)</span>
                                        </div>
                                        <div className={styles.overlayCardDescription}>{def.description}</div>
                                        {!unlocked && (
                                            <div className={styles.lockTag}>{getUnlockHint(def.unlockCondition)}</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            , document.body)}
        </div>
    );
};
