import React from 'react';
import styles from './RelicTooltip.module.css';
import { PackCardDetails } from './PackCardDetails';

import type { Relic } from '../logic/relics/types';
import { formatChipMultiplier, formatHandChips, formatHandMult, formatHandScore } from '../logic/formatters';
import { getRelicRarityFrameColor, getRelicRarityTextColor } from '../logic/relics/rarity';

interface RelicTooltipProps {
    relic: Relic;
    displayValues?: Record<string, any>;
    style?: React.CSSProperties;
    className?: string;
    hideIcon?: boolean;
    isRightAligned?: boolean;
    layout?: 'vertical' | 'horizontal' | 'card';
    direction?: 'ltr' | 'rtl';
    isFlexible?: boolean;
    sellPrice?: number;
    subtitle?: string;
}

export const RelicTooltip: React.FC<RelicTooltipProps> = ({ 
    relic, 
    displayValues, 
    style, 
    className, 
    hideIcon, 
    isRightAligned,
    layout = 'vertical',
    direction = 'ltr',
    isFlexible,
    sellPrice,
    subtitle
}) => {
    const formatDescription = (text: string, values?: Record<string, any>) => {
        const hand = relic.handType;
        const context: any = {
            ...values,
            hand: hand ? {
                ...hand,
                chips: hand.chips !== undefined ? formatHandChips(hand.chips, hand.chipCards, true, hand.chipRun) : undefined,
                mult: hand.mult !== undefined ? formatHandMult(hand.mult, hand.multRun, false) : undefined,
                score: hand.chips !== undefined && hand.mult !== undefined 
                    ? formatHandScore(hand.chips, hand.mult, hand.chipCards, undefined, true, hand.chipRun, hand.multRun) 
                    : undefined
            } : undefined
        };

        return text.replace(/(x)?\$\{([\w.]+)\}|\{([\w.]+)\}/g, (_, multiplierPrefix, key1, key2) => {
            const key = key1 || key2;
            const keys = key.split('.');
            let value = context;
            for (const k of keys) {
                if (value === undefined || value === null) break;
                value = value[k];
            }
            if (multiplierPrefix && typeof value === 'number') return formatChipMultiplier(value, true);
            return value !== undefined ? `${multiplierPrefix || ''}${value}` : (key1 ? `${multiplierPrefix || ''}\${${key1}}` : `{${key2}}`);
        });
    };

    const renderDescription = (rawText: string) => {
        const text = formatDescription(rawText, displayValues);
        // Regex to match:
        // 1. <...> (bracketed text for chips/green highlighting)
        // 2. {...} (curly braced text for mult/yellow highlighting)
        // 3. [...] (bracketed text for hand highlighting)
        // 4. Percentage multipliers, including their decrease sign
        // 5. $ or + followed by digits, or digits followed by "chips" (chips values)
        const parts = text.split(/(<[^>]+>|\{[^}]+\}|\[.*?\]|[−-]?x\d+(?:\.\d+)?%|[−-]?\$[−-]?\d[\d,]*(?:\s*chips?)?|[₵\$\+]{1,2}\d+(?:\s*chips?)?|[−-]?\d+\s*chips?)/gi);
        const renderValue = (value: string, positiveClass: string, key: number) => {
            const isNegative = /^(?:[−-]|\$[−-])/.test(value.trim());
            const visibleValue = isNegative ? value.replace(/^\s*[−-]|^(\s*\$)[−-]/, '$1') : value;
            return <span key={key} className={isNegative ? styles.negativeValue : positiveClass}
                aria-label={isNegative ? value : undefined}>{visibleValue}</span>;
        };
        
        return parts.map((part, i) => {
            if (part.startsWith('<') && part.endsWith('>')) {
                const value = part.slice(1, -1);
                return renderValue(value, styles.chipsValue, i);
            }
            if (part.startsWith('{') && part.endsWith('}')) {
                return renderValue(part.slice(1, -1), styles.multValue, i);
            }
            if (part.startsWith('[') && part.endsWith(']')) {
                return <span key={i} className={styles.handHighlight}>{part.slice(1, -1)}</span>;
            }
            if (/^[−-]?x\d/i.test(part)) {
                return renderValue(part, styles.multValue, i);
            }
            if (
                /^[−-]?[₵\$\+\d]/i.test(part.trim()) && (part.includes('₵') || part.includes('$') || part.trim().startsWith('+') || part.toLowerCase().includes('chips'))
            ) {
                return renderValue(part, styles.chipsValue, i);
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
    const rarityFrameColor = getRelicRarityFrameColor(relic.rarity);
    const rarityTextColor = getRelicRarityTextColor(relic.rarity);

    if (layout === 'card') return <PackCardDetails name={relic.handType?.name || relic.name}
        icon={<span className={`${styles.iconContainer} ${styles.cardIcon}`} data-relic-icon="true" style={{ borderColor: rarityFrameColor }}>
            {relic.icon && (relic.icon.includes('.') || relic.icon.includes('/'))
                ? <img src={relic.icon} alt="" className={styles.icon} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span className={styles.placeholderIcon}>{relic.icon || relic.name.substring(0, 2).toUpperCase()}</span>}
        </span>}>
        <span className={styles.cardDescription} data-relic-description="true">{renderDescription(relic.description)}</span>
    </PackCardDetails>;

    return (
        <div 
            className={`${styles.container} ${isHorizontal ? styles.containerHorizontal : ''} ${isFlexible ? styles.flexible : ''} ${className || ''}`}
            style={{
                ...style,
                flexDirection: isHorizontal ? (isRtl ? 'row-reverse' : 'row') : 'column',
                gap: isHorizontal ? 0 : 8
            }}
        >
            {/* Header: Icon and Title */}
            <div 
                className={`${styles.header} ${isHorizontal ? styles.headerHorizontal : ''}`}
                data-relic-header="true"
                style={{
                    flexDirection: isRightAligned ? 'row-reverse' : 'row',
                    textAlign: (isRightAligned && !isHorizontal) ? 'right' : 'left',
                }}
            >
                <div 
                    className={styles.iconContainer}
                    data-relic-icon="true"
                    style={{
                        opacity: hideIcon ? 0 : 1,
                        visibility: hideIcon ? 'hidden' : 'visible',
                        borderColor: rarityFrameColor
                    }}
                >
                    {relic.icon && (relic.icon.includes('.') || relic.icon.includes('/')) ? (
                        <img src={relic.icon} alt={relic.name} className={styles.icon} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : relic.icon ? (
                         <div className={styles.icon} style={{ fontSize: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {relic.icon}
                        </div>
                    ) : (
                        <div className={styles.placeholderIcon}>
                            {relic.name.substring(0, 2).toUpperCase()}
                        </div>
                    )}
                </div>
                <div className={styles.titleBlock} style={{ textAlign: isRightAligned ? 'right' : 'left' }}>
                    {sellPrice !== undefined && (
                        <div 
                            className={styles.sellPriceTag}
                            style={{
                                left: isRightAligned ? 'auto' : 0,
                                right: isRightAligned ? 0 : 'auto',
                            }}
                        >
                            Sell ${sellPrice}
                        </div>
                    )}
                    <div className={styles.title} data-relic-title="true">
                        {relic.handType?.name || relic.name}
                    </div>
                    <div 
                        className={styles.rarity}
                        style={{
                            color: rarityTextColor,
                            left: isRightAligned && !isHorizontal ? 'auto' : 0,
                            right: isRightAligned && !isHorizontal ? 0 : 'auto',
                            textAlign: isRightAligned && !isHorizontal ? 'right' : 'left'
                        }}
                    >
                        {subtitle ?? relic.rarity}
                    </div>
                </div>
            </div>

            {/* Vertical Divider (Horizontal Mode Only) */}
            {isHorizontal && <div className={styles.divider} />}

            {/* Content: Description */}
            <div className={`${styles.content} ${isHorizontal ? styles.contentHorizontal : ''}`}>
                <div 
                    data-relic-description="true"
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
