import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';

// Ideal resolution for the game logic to fit "perfectly"
// This is the coordinate system the components will "think" they are in, before extra space is added.
const IDEAL_WIDTH = 800;
const IDEAL_HEIGHT = 1050;

interface LayoutContextType {
    scale: number;
    viewportWidth: number; // The virtual width (IDEAL + extra)
    viewportHeight: number; // The virtual height (IDEAL + extra)
    extraWidth: number; // Horizontal space to distribute
    extraHeight: number; // Vertical space to distribute
    idealWidth: number;
    idealHeight: number;
}

const LayoutContext = createContext<LayoutContextType>({
    scale: 1,
    viewportWidth: IDEAL_WIDTH,
    viewportHeight: IDEAL_HEIGHT,
    extraWidth: 0,
    extraHeight: 0,
    idealWidth: IDEAL_WIDTH,
    idealHeight: IDEAL_HEIGHT,
});

export const useLayout = () => useContext(LayoutContext);

interface ResponsiveLayoutProps {
    children: React.ReactNode;
}

const calculateLayout = () => {
    // Only access window if available (SSR safety, though this is likely client-side only)
    if (typeof window === 'undefined') {
        return {
            scale: 1,
            viewportWidth: IDEAL_WIDTH,
            viewportHeight: IDEAL_HEIGHT,
            extraWidth: 0,
            extraHeight: 0
        };
    }

    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const winAspect = winW / winH;
    const idealAspect = IDEAL_WIDTH / IDEAL_HEIGHT;

    let scale, extraW, extraH;

    // Strategy:
    // If window is narrower than ideal (Portrait-ish) -> Scale to fit Width. Add Height.
    // If window is wider than ideal (Landscape-ish) -> Scale to fit Height. Add Width.

    if (winAspect < idealAspect) {
        // Width Constrained (Narrow)
        scale = winW / IDEAL_WIDTH;
        // Height = WindowHeight / Scale
        // Extra = TotalHeight - IdealHeight
        const totalVirtualHeight = winH / scale;
        extraH = totalVirtualHeight - IDEAL_HEIGHT;
        extraW = 0;
    } else {
        // Height Constrained (Wide)
        scale = winH / IDEAL_HEIGHT;
        const totalVirtualWidth = winW / scale;
        extraW = totalVirtualWidth - IDEAL_WIDTH;
        extraH = 0;
    }

    return {
        scale,
        viewportWidth: IDEAL_WIDTH + extraW,
        viewportHeight: IDEAL_HEIGHT + extraH,
        extraWidth: extraW,
        extraHeight: extraH
    };
};

export const ResponsiveLayout: React.FC<ResponsiveLayoutProps> = ({ children }) => {
    // Initialize state synchronously with the real window dimensions
    const [layout, setLayout] = useState(calculateLayout);

    useEffect(() => {
        const updateLayout = () => {
            setLayout(calculateLayout());
        };

        window.addEventListener('resize', updateLayout);
        
        // No need to call updateLayout() here as we already initialized with it,
        // unless you suspect a change between render and mount. 
        // Calling it anyway safeguards against weird edge cases (like maximized window changes on load).
        updateLayout(); 

        return () => window.removeEventListener('resize', updateLayout);
    }, []);

    const style: React.CSSProperties = {
        width: `${layout.viewportWidth}px`,
        height: `${layout.viewportHeight}px`,
        transform: `scale(${layout.scale})`,
        transformOrigin: 'top left',
        // Ensure absolute positioning context
        position: 'absolute',
        top: 0,
        left: 0,
        overflow: 'hidden', // Clip anything outside the calculated viewport
    };

    const contextValue = useMemo(() => ({
        ...layout,
        idealWidth: IDEAL_WIDTH,
        idealHeight: IDEAL_HEIGHT
    }), [layout]);

    return (
        <LayoutContext.Provider value={contextValue}>
            <div id="game-scale-wrapper" style={style}>
                {children}
            </div>
        </LayoutContext.Provider>
    );
};
