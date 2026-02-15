import React, { useEffect, useRef } from 'react';
import { useGameStore, type DebugLedgerEntry } from '../store/gameStore';
import styles from './DebugOverlays.module.css';

interface DebugLogOverlayProps {
    onClose: () => void;
}

export function DebugLogOverlay({ onClose }: DebugLogOverlayProps) {
    const debugLedger = useGameStore(s => s.debugLedger);
    const contentRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on open and when entries change
    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [debugLedger.length]);

    const formatEntry = (entry: DebugLedgerEntry, index: number) => {
        const stateJson = JSON.stringify(entry.state, null, 2);
        return (
            <div key={index} className={styles.logEntry}>
                <div className={styles.logEntryHeader}>
                    ═══ State #{index + 1} ═══
                </div>
                <div className={styles.logStateBlock}>
                    {stateJson}
                </div>
                <div className={styles.logActionLabel}>
                    ▸ Action: {entry.action}
                </div>
            </div>
        );
    };

    return (
        <div className={styles.logOverlay} onClick={(e) => e.stopPropagation()}>
            <div className={styles.logHeader}>
                <div className={styles.logTitle}>Debug Log ({debugLedger.length} entries)</div>
                <button className={styles.closeBtn} onClick={onClose}>✕</button>
            </div>
            <div className={styles.logContent} ref={contentRef}>
                {debugLedger.length === 0 ? (
                    <div style={{ color: '#666', textAlign: 'center', marginTop: 40 }}>
                        No actions recorded yet. Play the game to see state changes.
                    </div>
                ) : (
                    debugLedger.map((entry, i) => formatEntry(entry, i))
                )}
            </div>
        </div>
    );
}
