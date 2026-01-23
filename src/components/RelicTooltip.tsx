import React from 'react';
import styles from './RelicTooltip.module.css';
import { TransparentImage } from './TransparentImage';
import type { Relic } from '../logic/relics/types';

interface RelicTooltipProps {
    relic: Relic;
    style?: React.CSSProperties;
    className?: string;
    hideIcon?: boolean;
}

export const RelicTooltip: React.FC<RelicTooltipProps> = ({ relic, style, className, hideIcon }) => {
    return (
        <div className={`${styles.container} ${className || ''}`} style={style}>
            <div 
                className={styles.iconContainer}
                style={{
                    // If hiding icon, make it invisible but keep layout space
                    // We remove border/background so the underlying inventory icon shows through cleanly if needed,
                    // or just opacity 0 to be safe.
                    opacity: hideIcon ? 0 : 1,
                    visibility: hideIcon ? 'hidden' : 'visible'
                }}
            >
                {relic.icon ? (
                    <TransparentImage src={relic.icon} alt={relic.name} className={styles.icon} threshold={250} />
                ) : (
                    <div className={styles.placeholderIcon}>
                        {relic.name.substring(0, 2).toUpperCase()}
                    </div>
                )}
            </div>
            <div className={styles.content}>
                <div className={styles.title}>{relic.name}</div>
                <div className={styles.description}>{relic.description}</div>
            </div>
        </div>
    );
};
