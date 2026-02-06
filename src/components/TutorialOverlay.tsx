
import React, { useEffect, useState, useRef } from 'react';
import { TutorialManager, type TutorialStep } from '../logic/tutorials/tutorials';
import styles from './TutorialOverlay.module.css';

export const TutorialOverlay: React.FC = () => {
    const [activeStep, setActiveStep] = useState<TutorialStep | null>(null);
    const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
    const manager = TutorialManager.getInstance();

    useEffect(() => {
        return manager.subscribe(step => {
            setActiveStep(step);
        });
    }, []);

    // Track active step highlight element
    useEffect(() => {
        if (!activeStep?.highlight) {
            setHighlightRect(null);
            return;
        }

        const updateRect = () => {
            const el = document.getElementById(activeStep.highlight!.elementId);
            if (el) {
                const rect = el.getBoundingClientRect();
                setHighlightRect(rect);
            }
        };

        // Initial update and subsequent polling or ResizeObserver
        updateRect();
        
        // Poll every frame or interval to track moving elements
        const interval = setInterval(updateRect, 100);
        window.addEventListener('resize', updateRect);
        
        return () => {
            clearInterval(interval);
            window.removeEventListener('resize', updateRect);
        };
    }, [activeStep]);

    if (!activeStep) return null;

    const isClickToContinue = activeStep.completionType === 'click';
    
    // Calculate highlight style
    const highlightStyle: React.CSSProperties = highlightRect ? {
        top: highlightRect.top - (activeStep.highlight?.padding || 0),
        left: highlightRect.left - (activeStep.highlight?.padding || 0),
        width: highlightRect.width + (activeStep.highlight?.padding || 0) * 2,
        height: highlightRect.height + (activeStep.highlight?.padding || 0) * 2,
        borderRadius: activeStep.highlight?.type === 'circle' ? '50%' : '8px'
    } : {};

    return (
        <div 
            className={`${styles.container} ${isClickToContinue ? styles.blockingMode : styles.interactiveMode}`}
            onClick={() => isClickToContinue && manager.handleOverlayClick()}
            style={highlightRect && isClickToContinue ? { background: 'transparent' } : {}}
        >
            {/* Highlight Hole */}
            {highlightRect && (
                <div 
                    className={styles.highlightHole}
                    style={highlightStyle}
                />
            )}

            {/* Message Box */}
            <div 
                className={styles.messageBox}
                style={highlightRect ? { 
                    // Position relative to highlight if possible, or just center/default
                    // For now, center is fine, or maybe offset? 
                    // Let's keep it centered but ensure z-index is higher
                } : {}}
            >
                <div className={styles.messageText}>
                    {activeStep.text}
                </div>
                {isClickToContinue && (
                    <div className={styles.continueHint}>
                        Click anywhere to continue
                    </div>
                )}
            </div>
        </div>
    );
};
