import React from 'react';
import styles from './RelicTooltip.module.css';
import { TransparentImage } from './TransparentImage';
import type { Relic } from '../logic/relics/types';

interface RelicTooltipProps {
    relic: Relic;
    displayValues?: Record<string, any>;
    style?: React.CSSProperties;
    className?: string;
    hideIcon?: boolean;
}

export const RelicTooltip: React.FC<RelicTooltipProps> = ({ relic, displayValues, style, className, hideIcon }) => {
    const formatDescription = (text: string, values?: Record<string, any>) => {
        if (!values) return text;
        return text.replace(/\$\{(\w+)\}/g, (_, key) => {
            return values[key] !== undefined ? String(values[key]) : `\${${key}}`;
        });
    };

    const renderDescription = (rawText: string) => {
        const text = formatDescription(rawText, displayValues);
        // Regex to match:
        // 1. [...] (bracketed text for highlighting)
        // 2. x followed by digits (multipliers)
        // 3. $ or + followed by digits, or digits followed by "chips" (chips values)
        const parts = text.split(/(\[.*?\]|x\d+(?:\.\d+)?|(?:\$|\+)?\d+\s*chips?|(?:\$|\+)\d+)/gi);
        
        return parts.map((part, i) => {
            if (part.startsWith('[') && part.endsWith(']')) {
                return <span key={i} className={styles.handHighlight}>{part.slice(1, -1)}</span>;
            }
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
