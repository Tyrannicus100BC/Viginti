import React from 'react';
import styles from './SurrenderButton.module.css'; // Reusing styles assuming they are generic enough or will be shared

interface SurrenderButtonProps {
    surrenders: number;
    maxSurrenders?: number;
    isActive: boolean; // Can we click it?
    isSelectionMode: boolean; // Are we selecting hands?
    hasSelectedHands?: boolean;
    onClick: () => void;
    onCancel?: () => void;
    style?: React.CSSProperties;
}

export const SurrenderButton: React.FC<SurrenderButtonProps> = ({
    surrenders,
    maxSurrenders = 3,
    isActive,
    isSelectionMode,
    hasSelectedHands,
    onClick,
    style
}) => {
    // Circle definitions
    const size = 120;
    const strokeWidth = 6;
    const radius = size / 2 - strokeWidth;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;

    // Dynamic segments
    const gapPercent = 0.03;
    const segmentLength = (circumference * (1 - gapPercent * maxSurrenders)) / maxSurrenders;

    // Determine segments state
    const segments = Array.from({ length: maxSurrenders }).map((_, i) => {
        const isFilled = surrenders > i;
        const rotation = i * (360 / maxSurrenders);

        return { isFilled, rotation };
    });

    const isFull = surrenders >= maxSurrenders;
    const canClick = isActive || isSelectionMode;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (canClick) {
            onClick();
        }
    };

    return (
        <div className={styles.container} style={style}>
            {/* Charge Circle SVG */}
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
                className={`
                    ${styles.button} 
                    ${isSelectionMode ? styles.smoldering : ''}
                    ${(!isSelectionMode && isFull && isActive) ? styles.active : ''}
                    ${(!isSelectionMode && !isFull && isActive) ? styles.active : '' /* Active even if not full, unlike Double Down which needed charge? No, DoubleDown needs charge. Surrender needs charge too. */}
                    ${/* For Double Down, active meant "Can I Use It?". Same here. */ ''}
                `}
                onClick={handleClick}
                style={isSelectionMode ? { borderColor: '#ff4444' } : {}}
            >
                {isSelectionMode && <div className={styles.fireOverlay} style={{ filter: 'hue-rotate(180deg)' }} />}

                <span className={`${styles.text} ${isSelectionMode ? styles.confirmText : ''}`}>
                    {isSelectionMode ? (
                        hasSelectedHands ? "CONFIRM" : "SELECT"
                    ) : (
                        <span style={{ fontSize: '0.8rem' }}>SURRENDER</span>
                    )}
                </span>
            </div>
        </div>
    );
};
