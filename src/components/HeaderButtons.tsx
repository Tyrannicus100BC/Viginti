import React from 'react';
import styles from '../App.module.css';

interface HeaderButtonProps {
    onClick: () => void;
    title?: string;
    className?: string;
}

export const CasinosButton: React.FC<HeaderButtonProps> = ({ onClick, title }) => {
    return (
        <button 
            className={styles.headerIconButton} 
            onClick={onClick}
            title={title || "Casinos"}
            aria-label="Casinos"
        >
            {/* Paper folding street map silhouette */}
            <svg viewBox="0 0 24 24" className={styles.headerIconSvg}>
                <path d="M20.5 3l-6 2-6-2-5.5 1.83v14.34l6 2 6-2 5.5-1.83V3zM6.5 17.5l-2-.66v-11l2 .66v11zm6 1.67l-4-1.33V6.83l4 1.33v11.01zm5.5-2.01l-2 .66v-11l2-.66v11z" fill="currentColor"/>
            </svg>
        </button>
    );
};

export const DeckButton: React.FC<HeaderButtonProps> = ({ onClick, title, className }) => {
    return (
        <button 
            className={`${styles.headerIconButton} ${className || ''}`} 
            onClick={onClick}
            title={title || "Deck"}
            aria-label="Deck"
        >
            {/* 3/4 view stack of cards */}
            <svg viewBox="0 0 24 24" className={styles.headerIconSvg}>
                <path d="M12 3L20 7L12 11L4 7Z" fill="currentColor"/>
                <path d="M4 8L11.5 11.8V20L4 16.2Z" fill="currentColor"/>
                <path d="M12.5 11.8L20 8V16.2L12.5 20Z" fill="currentColor"/>
            </svg>
        </button>
    );
};
export const TrashButton: React.FC<HeaderButtonProps> = ({ onClick, title }) => {
    return (
        <button 
            className={`${styles.headerIconButton} ${styles.trashBtn}`} 
            onClick={onClick}
            title={title || "Remove Cards"}
            aria-label="Remove Cards"
        >
            <svg viewBox="0 0 24 24" className={styles.headerIconSvg}>
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
            </svg>
        </button>
    );
};
