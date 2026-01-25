
import React from 'react';
import styles from './GamblerSelect.module.css';
import { GAMBLER_DEFINITIONS } from '../logic/gamblers/definitions';

interface GamblerSelectProps {
    selectedId: string;
    onSelect: (id: string) => void;
}

export const GamblerSelect: React.FC<GamblerSelectProps> = ({ selectedId, onSelect }) => {
    return (
        <div className={styles.container} onClick={(e) => e.stopPropagation()}>
            <div className={styles.label}>Choose Gambler</div>
            <div className={styles.cardsContainer}>
                {GAMBLER_DEFINITIONS.map(def => (
                    <div 
                        key={def.id}
                        className={`${styles.card} ${selectedId === def.id ? styles.selected : ''}`}
                        onClick={() => onSelect(def.id)}
                        data-physics="gambler-card"
                    >
                        <div className={styles.name}>{def.name}</div>
                        <div className={styles.description}>{def.description}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};
