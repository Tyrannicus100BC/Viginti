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
    isRightAligned?: boolean;
    layout?: 'vertical' | 'horizontal';
    direction?: 'ltr' | 'rtl';
}

export const RelicTooltip: React.FC<RelicTooltipProps> = ({ 
    relic, 
    displayValues, 
    style, 
    className, 
    hideIcon, 
    isRightAligned,
    layout = 'vertical',
    direction = 'ltr' 
}) => {
    const formatDescription = (text: string, values?: Record<string, any>) => {
        const hand = relic.handType;
        const context: any = {
            ...values,
            hand: hand ? {
                ...hand,
                chips: hand.chips !== undefined ? formatHandChips(hand.chips, hand.chipCards, true) : undefined,
                mult: hand.mult !== undefined ? formatHandMult(hand.mult) : undefined,
                score: hand.chips !== undefined && hand.mult !== undefined 
                    ? formatHandScore(hand.chips, hand.mult, hand.chipCards, undefined, true) 
                    : undefined
            } : undefined
        };

        if (relic.extraHandTypes) {
            Object.entries(relic.extraHandTypes).forEach(([key, ht]) => {
                context[key] = {
                    ...ht,
                    chips: ht.chips !== undefined ? formatHandChips(ht.chips, ht.chipCards, true) : undefined,
                    mult: ht.mult !== undefined ? formatHandMult(ht.mult) : undefined,
                    score: ht.chips !== undefined && ht.mult !== undefined 
                        ? formatHandScore(ht.chips, ht.mult, ht.chipCards, undefined, true) 
                        : undefined
                };
            });
        }

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
        // 2. {...} (curly braced text for mult/yellow highlighting)
        // 3. [...] (bracketed text for hand highlighting)
        // 4. x followed by digits (multipliers)
        // 5. $ or + followed by digits, or digits followed by "chips" (chips values)
        const parts = text.split(/(<[^>]+>|\{[^}]+\}|\[.*?\]|x\d+(?:\.\d+)?|[\$\+]{1,2}\d+(?:\s*chips?)?|\d+\s*chips?)/gi);
        
        return parts.map((part, i) => {
            if (part.startsWith('<') && part.endsWith('>')) {
                return <span key={i} className={styles.chipsValue}>{part.slice(1, -1)}</span>;
            }
            if (part.startsWith('{') && part.endsWith('}')) {
                return <span key={i} className={styles.multValue}>{part.slice(1, -1)}</span>;
            }
            if (part.startsWith('[') && part.endsWith(']')) {
                return <span key={i} className={styles.handHighlight}>{part.slice(1, -1)}</span>;
            }
            if (/^x\d/i.test(part)) {
                return <span key={i} className={styles.multValue}>{part}</span>;
            }
            if (
                /^[\$\+\d]/i.test(part.trim()) && (part.trim().startsWith('$') || part.trim().startsWith('+') || part.toLowerCase().includes('chips'))
            ) {
                return <span key={i} className={styles.chipsValue}>{part}</span>;
            }
            if (part.includes('\n')) {
                return (
                    <React.Fragment key={i}>
                        {part.split('\n').map((line, j, lines) => (
                            <React.Fragment key={j}>
                                {line}
                                {j < lines.length - 1 && <br />}
                            </React.Fragment>
                        ))}
                    </React.Fragment>
                );
            }
            return part;
        });
    };

    const isHorizontal = layout === 'horizontal';
    const isRtl = direction === 'rtl';

    return (
        <div 
            className={`${styles.container} ${isHorizontal ? styles.containerHorizontal : ''} ${className || ''}`} 
            style={{
                ...style,
                flexDirection: isHorizontal ? (isRtl ? 'row-reverse' : 'row') : 'column',
                gap: isHorizontal ? 0 : 8
            }}
        >
            {/* Header: Icon and Title */}
            <div 
                className={`${styles.header} ${isHorizontal ? styles.headerHorizontal : ''}`}
                style={{
                    flexDirection: isRightAligned ? 'row-reverse' : 'row',
                    textAlign: (isRightAligned && !isHorizontal) ? 'right' : 'left',
                }}
            >
                <div 
                    className={styles.iconContainer}
                    style={{
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
                <div className={styles.title} style={{ textAlign: (isRightAligned && !isHorizontal) ? 'right' : 'left' }}>
                    {relic.handType?.name || relic.name}
                </div>
            </div>

            {/* Vertical Divider (Horizontal Mode Only) */}
            {isHorizontal && <div className={styles.divider} />}

            {/* Content: Description */}
            <div className={`${styles.content} ${isHorizontal ? styles.contentHorizontal : ''}`}>
                <div 
                    className={styles.description}
                    style={{ 
                        textAlign: isHorizontal ? (isRtl ? 'right' : 'left') : ((isRightAligned) ? 'right' : 'left'),
                        paddingTop: isHorizontal ? 0 : 4
                    }}
                >
                    {renderDescription(relic.description)}
                </div>
            </div>
        </div>
    );
};
