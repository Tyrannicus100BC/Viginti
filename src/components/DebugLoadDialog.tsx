import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import styles from './DebugOverlays.module.css';

interface DebugLoadDialogProps {
    onClose: () => void;
    /** Called after a state is successfully loaded */
    onLoaded?: () => void;
}

export function DebugLoadDialog({ onClose, onLoaded }: DebugLoadDialogProps) {
    const [text, setText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const loadGameState = useGameStore(s => s.loadGameState);

    const handleLoad = () => {
        if (!text.trim()) {
            setError('Please paste a game state JSON');
            return;
        }
        const success = loadGameState(text.trim());
        if (success) {
            setError(null);
            onClose();
            onLoaded?.();
        } else {
            setError('Invalid game state JSON. Ensure it has at least a "phase" field.');
        }
    };

    return (
        <div className={styles.loadBackdrop} onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <div className={styles.loadCard} onClick={(e) => e.stopPropagation()}>
                <div className={styles.loadTitle}>Load Game State</div>
                <textarea
                    className={styles.loadTextarea}
                    value={text}
                    onChange={(e) => { setText(e.target.value); setError(null); }}
                    placeholder='Paste game state JSON here...'
                    autoFocus
                />
                {error && <div className={styles.loadError}>{error}</div>}
                <div className={styles.loadButtons}>
                    <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
                    <button className={styles.loadBtn} onClick={handleLoad}>Load</button>
                </div>
            </div>
        </div>
    );
}
