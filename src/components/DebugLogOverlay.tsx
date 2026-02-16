import React, { useEffect, useRef } from 'react';
import { useGameBridge, type DebugLedgerEntry } from '../store/gameBridge';
import styles from './DebugOverlays.module.css';

interface DebugLogOverlayProps {
    onClose: () => void;
}

const CollapsibleSection = ({ 
    title, 
    children, 
    copyContent,
    defaultOpen = false 
}: { 
    title: React.ReactNode; 
    children: React.ReactNode; 
    copyContent?: string;
    defaultOpen?: boolean;
}) => {
    const handleCopy = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (copyContent) {
            navigator.clipboard.writeText(copyContent);
        }
    };

    return (
        <details className={styles.details} open={defaultOpen}>
            <summary className={styles.summary}>
                {title}
                {copyContent && (
                    <button className={styles.copyBtn} onClick={handleCopy}>
                        Copy
                    </button>
                )}
            </summary>
            {children}
        </details>
    );
};

export function DebugLogOverlay({ onClose }: DebugLogOverlayProps) {
    // We use useGameBridge directly for consistency with DebugLedgerEntry source
    const debugLedger = useGameBridge(s => s.debugLedger);
    const contentRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on open and when entries change
    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [debugLedger.length]);

    const formatEntry = (entry: DebugLedgerEntry, index: number) => {
        const stateJson = JSON.stringify(entry.stateAfter, null, 2);
        const actionJson = JSON.stringify(entry.action);
        const actionSummary = typeof entry.action === 'string' ? entry.action : entry.action.type;
        
        const actionsJson = JSON.stringify(entry.availableActions, null, 2);
        const availableActionsDisplay = (
            <CollapsibleSection title={`Available Actions (${entry.availableActions.length})`} defaultOpen={false}>
                <div className={styles.logStateBlock} style={{ color: '#aaa' }}>
                    {actionsJson}
                </div>
            </CollapsibleSection>
        );

        return (
            <div key={index} className={styles.logEntry}>
                <div className={styles.logEntryHeader}>
                    <span>State #{index + 1}</span>
                    <span style={{ fontSize: '0.7em', color: '#666' }}>
                        {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                </div>

                <div className={styles.logActionLabel}>
                    ▸ Action: <span style={{ color: '#fff' }}>{actionSummary}</span>
                    <span style={{ fontSize: '0.8em', color: '#888', marginLeft: 8 }}>{actionJson}</span>
                </div>

                <CollapsibleSection title={`Action Results (${entry.events.length} events)`} defaultOpen={false}>
                    <div className={styles.logStateBlock} style={{ color: '#aaa' }}>
                        {JSON.stringify(entry.events, null, 2)}
                    </div>
                </CollapsibleSection>

                <CollapsibleSection 
                    title="Resulting State JSON" 
                    copyContent={stateJson}
                    defaultOpen={false}
                >
                    <div className={styles.logStateBlock}>
                        {stateJson}
                    </div>
                </CollapsibleSection>

                {availableActionsDisplay}
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
