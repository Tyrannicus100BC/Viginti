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
                </div>
                <div className={styles.content}>
                    <p>Comps functionality coming soon!</p>
                </div>
                <button className="close-x-btn" onClick={onClose}>×</button>
            </div>
        </div>
    );
};
