import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './GamblerSelect.module.css';
import { GAMBLER_DEFINITIONS } from '../logic/gamblers/definitions';

interface GamblerSelectProps {
    selectedId: string;
    onSelect: (id: string) => void;
}

export const GamblerSelect: React.FC<GamblerSelectProps> = ({ selectedId, onSelect }) => {
    const [isOverlayOpen, setIsOverlayOpen] = useState(false);
    const selectedGambler = GAMBLER_DEFINITIONS.find(g => g.id === selectedId) || GAMBLER_DEFINITIONS[0];

    const handleSelect = (id: string) => {
        onSelect(id);
        setIsOverlayOpen(false);
    };

    return (
        <div className={styles.container} onClick={(e) => e.stopPropagation()}>
            <div className={styles.selectionWrapper}>
                <div className={styles.changeLabel} onClick={() => setIsOverlayOpen(true)}>GAMBLER CHOICE</div>
                <button 
                    className={styles.selectedButton}
                    onClick={() => setIsOverlayOpen(true)}
                    data-physics="gambler-card"
                >
                    <div className={styles.selectedName}>{selectedGambler.name}</div>
                </button>
            </div>

            {isOverlayOpen && createPortal(
                <div className={styles.overlay} onClick={() => setIsOverlayOpen(false)}>
                    <div className={styles.overlayContent} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.overlayHeader}>
                            <div className={styles.overlayTitle}>Select Gambler</div>
                            <button className={styles.closeButton} onClick={() => setIsOverlayOpen(false)}>×</button>
                        </div>
                        <div className={styles.scrollList}>
                            {GAMBLER_DEFINITIONS.map(def => (
                                <div 
                                    key={def.id}
                                    className={`${styles.overlayCard} ${selectedId === def.id ? styles.overlaySelected : ''}`}
                                    onClick={() => handleSelect(def.id)}
                                >
                                    <div className={styles.overlayCardName}>{def.name}</div>
                                    <div className={styles.overlayCardDescription}>{def.description}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            , document.body)}
        </div>
    );
};
