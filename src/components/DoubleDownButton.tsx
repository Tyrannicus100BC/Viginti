import React from 'react';
import styles from './DoubleDownButton.module.css';

interface DoubleDownButtonProps {
    charges: number;
    maxCharges?: number;
    isActive: boolean; // Can we click it? (e.g. Phase correct, not busted)
    isSelectionMode: boolean; // Are we selecting hands?
    hasSelectedHands?: boolean;
    onClick: () => void;
    onCancel?: () => void; // Kept in interface for potential future use or consistency, but optional
}

export const DoubleDownButton: React.FC<DoubleDownButtonProps> = ({
    charges,
    maxCharges = 3,
    isActive,
    isSelectionMode,
    hasSelectedHands,
    onClick
}) => {
    // Calculate SVG Segments
    // Circle definitions
    const size = 120;
    const strokeWidth = 6;
    const radius = size / 2 - strokeWidth;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;

    // We want 3 segments with small gaps
    const gapPercent = 0.05; // 5% gap
    const segmentLength = (circumference * (1 - gapPercent * 3)) / 3;

    // Determine segments state
    const segments = [0, 1, 2].map(i => {
        const isFilled = charges > i;
        // Rotation: 0 starts at -90deg (top) handled by CSS rotate
        // Each segment takes up 1/3 of the circle
        const rotation = i * 120;

        // Dash Array: [Draw, Gap, Remainder(hidden)]
        // Actually for multi-segment, we can use dasharray/dashoffset trick per path
        // OR simply draw 3 paths rotated.
        return { isFilled, rotation };
    });

    const isFull = charges >= maxCharges;
    // Allow click if active (passed from App, which checks > 0) or already in selection mode
    const canClick = isActive || isSelectionMode;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (canClick) {
            onClick();
        }
    };

    return (
        <div className={styles.container}>
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
                        strokeDashoffset={0} // We rotate the whole circle element instead
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
                `}
                onClick={handleClick}
            >
                {isSelectionMode && <div className={styles.fireOverlay} />}

                <span className={`${styles.text} ${isSelectionMode ? styles.confirmText : ''}`}>
                    {isSelectionMode ? (
                        hasSelectedHands ? "CONFIRM" : "SELECT"
                    ) : (
                        <>DOUBLE<br />DOWN</>
                    )}
                </span>
            </div>
        </div>
    );
};
