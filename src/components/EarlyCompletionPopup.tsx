import React from 'react';
import styles from './EarlyCompletionPopup.module.css';

interface EarlyCompletionPopupProps {
    handsRemaining: number;
    onComplete: () => void;
    onContinue: () => void;
}

export const EarlyCompletionPopup: React.FC<EarlyCompletionPopupProps> = ({
    handsRemaining,
    onComplete,
    onContinue
}) => {
    const bonusComps = handsRemaining * 5;

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <h2 className={styles.title}>Target Reached!</h2>
                <p className={styles.message}>
                    You have enough points to beat this floor.
                    What would you like to do?
                </p>

                <div className={styles.buttonGroup}>
                    <button className={styles.completeButton} onClick={onComplete}>
                        Complete Round
                        <span className={styles.bonusText}>+{bonusComps} Comps Bonus!</span>
                    </button>

                    <button className={styles.continueButton} onClick={onContinue}>
                        Continue Playing ({handsRemaining} Deals Left)
                    </button>
                </div>
            </div>
        </div>
    );
};
