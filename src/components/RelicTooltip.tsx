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
    const renderDescription = (text: string) => {
        // Regex to match:
        // 1. x followed by digits (multipliers)
        // 2. $ or + followed by digits, or digits followed by "chips" (chips values)
        const parts = text.split(/(x\d+(?:\.\d+)?|(?:\$|\+)?\d+\s*chips?|(?:\$|\+)\d+)/gi);
        
        return parts.map((part, i) => {
            if (/^x\d/i.test(part)) {
                return <span key={i} className={styles.multValue}>{part}</span>;
            }
            if (/^[\$\+\d]/i.test(part) && (part.startsWith('$') || part.startsWith('+') || part.toLowerCase().includes('chips'))) {
                return <span key={i} className={styles.chipsValue}>{part}</span>;
            }
            return part;
        });
    };

    return (
        <div className={`${styles.container} ${className || ''}`} style={style}>
            <div 
                className={styles.iconContainer}
                style={{
                    // If hiding icon, make it invisible but keep layout space
                    opacity: hideIcon ? 0 : 1,
                    visibility: hideIcon ? 'hidden' : 'visible'
                }}
            >
                {relic.icon && !hideIcon ? (
                    <TransparentImage src={relic.icon} alt={relic.name} className={styles.icon} threshold={250} />
                ) : relic.icon ? null : (
                    <div className={styles.placeholderIcon}>
                        {relic.name.substring(0, 2).toUpperCase()}
                    </div>
                )}
            </div>
            <div className={styles.content}>
                <div className={styles.title}>{relic.name}</div>
                <div className={styles.description}>{renderDescription(relic.description)}</div>
            </div>
        </div>
    );
};
