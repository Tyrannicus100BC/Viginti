import React from 'react';
import styles from './RelicTooltip.module.css';
import { TransparentImage } from './TransparentImage';
import type { Relic } from '../logic/relics/types';
import { formatHandChips, formatHandMult, formatHandScore } from '../logic/formatters';

interface RelicTooltipProps {
    relic: Relic;
    displayValues?: Record<string, any>;
    style?: React.CSSProperties;
    className?: string;
    hideIcon?: boolean;
}

export const RelicTooltip: React.FC<RelicTooltipProps> = ({ relic, displayValues, style, className, hideIcon }) => {
    const formatDescription = (text: string, values?: Record<string, any>) => {
        const hand = relic.handType;
        const context: any = {
            ...values,
            hand: hand ? {
                ...hand,
                chips: hand.chips !== undefined ? formatHandChips(hand.chips, hand.chipCards) : undefined,
                mult: hand.mult !== undefined ? formatHandMult(hand.mult) : undefined,
                score: hand.chips !== undefined && hand.mult !== undefined 
                    ? formatHandScore(hand.chips, hand.mult, hand.chipCards) 
                    : undefined
            } : undefined
        };

        return text.replace(/\$\{([\w.]+)\}|\{([\w.]+)\}/g, (_, key1, key2) => {
            const key = key1 || key2;
            const keys = key.split('.');
            let value = context;
            for (const k of keys) {
                if (value === undefined || value === null) break;
                value = value[k];
            }
            return value !== undefined ? String(value) : (key1 ? `\${${key1}}` : `{${key2}}`);
        });
    };

    const renderDescription = (rawText: string) => {
        const text = formatDescription(rawText, displayValues);
        // Regex to match:
        // 1. <...> (bracketed text for chips/green highlighting)
        // 2. [...] (bracketed text for hand highlighting)
        // 3. x followed by digits (multipliers)
        // 4. Cards (optionally followed by + and $amount)
        // 5. $ or + followed by digits, or digits followed by "chips" (chips values)
        const parts = text.split(/(<[^>]+>|\[.*?\]|x\d+(?:\.\d+)?|Cards(?:\s*\+\s*[\$\+]{0,2}\d+)?|[\$\+]{1,2}\d+(?:\s*chips?)?|\d+\s*chips?)/gi);
        
        return parts.map((part, i) => {
            if (part.startsWith('<') && part.endsWith('>')) {
                return <span key={i} className={styles.chipsValue}>{part.slice(1, -1)}</span>;
            }
            if (part.startsWith('[') && part.endsWith(']')) {
                return <span key={i} className={styles.handHighlight}>{part.slice(1, -1)}</span>;
            }
            if (/^x\d/i.test(part)) {
                return <span key={i} className={styles.multValue}>{part}</span>;
            }
            if (
                (/^[\$\+\d]/i.test(part) && (part.startsWith('$') || part.startsWith('+') || part.toLowerCase().includes('chips'))) ||
                part.toLowerCase().startsWith('cards')
            ) {
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
