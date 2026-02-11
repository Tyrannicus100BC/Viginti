import React from 'react';
import styles from './TableActionButton.module.css';
import type { Card } from '../types';
import { PlayingCard } from './PlayingCard';

interface TableActionButtonProps {
    label: string;
    charges: number;
    maxCharges: number;
    cost: number;
    accentColor: string;
    isActive: boolean;
    isSelectionMode: boolean;
    onClick: () => void;
    style?: React.CSSProperties;
    heldCard?: Card | null;
    tableActionId?: string;
    heldCardAnchorId?: string;
}

const hexToRgb = (hex: string) => {
    const cleaned = hex.replace('#', '').trim();
    if (![3, 6].includes(cleaned.length)) return null;
    const full = cleaned.length === 3
        ? cleaned.split('').map((c) => c + c).join('')
        : cleaned;
    const num = parseInt(full, 16);
    if (Number.isNaN(num)) return null;
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
};

export const TableActionButton: React.FC<TableActionButtonProps> = ({
    label,
    charges,
    maxCharges,
    cost,
    accentColor,
    isActive,
    isSelectionMode,
    onClick,
    style,
    heldCard,
    tableActionId,
    heldCardAnchorId
}) => {
    const size = 120;
    const strokeWidth = 6;
    const radius = size / 2 - strokeWidth;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;

    const gapPercent = 0.03;
    const segmentLength = (circumference * (1 - gapPercent * maxCharges)) / maxCharges;

    const segments = Array.from({ length: maxCharges }).map((_, i) => {
        const isFilled = charges > i;
        const rotation = i * (360 / maxCharges);
        return { isFilled, rotation };
    });

    const isFull = charges >= maxCharges;
    const canClick = isActive || isSelectionMode;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (canClick) {
            onClick();
        }
    };

    const rgb = hexToRgb(accentColor);
    const colorVars = {
        '--action-color': accentColor,
        '--action-color-rgb': rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : '255, 255, 255'
    } as React.CSSProperties;

    const labelLines = label.split('\n');

    return (
        <div id={`table-action-${tableActionId}`} className={styles.container} style={{ ...style, ...colorVars }} data-table-action-id={tableActionId}>
            <svg className={styles.chargeSvg} viewBox={`0 0 ${size} ${size}`}>
                <defs>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>
                {segments.map((seg, i) => (
                    <circle
                        key={i}
                        cx={center}
                        cy={center}
                        r={radius}
                        className={`${styles.chargeSegment} ${seg.isFilled ? styles.filled : ''} ${isFull ? styles.fullCharge : ''}`}
                        strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                        strokeDashoffset={0}
                        transform={`rotate(${seg.rotation} ${center} ${center})`}
                        strokeLinecap="round"
                    />
                ))}
            </svg>

            <div
                className={`${styles.button} ${isSelectionMode ? styles.smoldering : ''} ${(!isSelectionMode && isActive) ? styles.active : ''}`}
                onClick={handleClick}
            >
                {isSelectionMode && <div className={styles.fireOverlay} />}
                <span className={`${styles.text} ${isSelectionMode ? styles.confirmText : ''}`}>
                    {isSelectionMode ? (
                        'SELECT'
                    ) : (
                        labelLines.map((line, idx) => (
                            <React.Fragment key={`${line}-${idx}`}>
                                {line}
                                {idx < labelLines.length - 1 && <br />}
                            </React.Fragment>
                        ))
                    )}
                </span>
                {cost > 1 && (
                    <div className={styles.costTag}>-{cost}</div>
                )}
            </div>

            <div id={heldCardAnchorId} className={styles.heldCardAnchor} />

            {heldCard && (
                <div className={styles.heldCard}>
                    <PlayingCard
                        card={heldCard}
                        origin="none"
                        suppressEnterAnimation
                    />
                </div>
            )}
        </div>
    );
};
