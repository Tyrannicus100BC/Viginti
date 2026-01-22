import React from 'react';
import styles from './CompsWindow.module.css';

interface CompsWindowProps {
    onClose: () => void;
}

export const CompsWindow: React.FC<CompsWindowProps> = ({ onClose }) => {
    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.window} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2 className={styles.title}>Comps</h2>
                    <button className={styles.closeButton} onClick={onClose}>×</button>
                </div>
                <div className={styles.content}>
                    <p>Comps functionality coming soon!</p>
                </div>
            </div>
        </div>
    );
};
