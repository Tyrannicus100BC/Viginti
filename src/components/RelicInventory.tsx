
import React, { useState } from 'react';

import { useGameStore } from '../store/gameStore';
import { RelicManager } from '../logic/relics/manager';
import { RelicTooltip } from './RelicTooltip';



interface RelicInventoryProps {
    enabledCategories?: string[];
    viewMode?: 'icons' | 'table';
}

export const RelicInventory: React.FC<RelicInventoryProps> = ({ enabledCategories, viewMode = 'icons' }) => {
    const { inventory, activeRelicId } = useGameStore();

    const visibleInventory = inventory.filter(instance => {
        // 'win' and 'viginti' are now handled by categories (they are 'Angle's)
        
        if (enabledCategories && enabledCategories.length > 0) {
            const config = RelicManager.getRelicConfig(instance.id);
            if (!config) return false;
            
            // Check if relic has at least one of the enabled categories
            // 'Angle' relics are those with handType. 'Charm' relics are the rest.
            // Definitions have been updated to include these tags explicitly.
            return config.categories.some(cat => enabledCategories.includes(cat));
        }
        
        return true;
    });
    // Track index because we might have duplicate relic types
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

    // if (visibleInventory.length === 0) return null; // Remove this to always show Manage button if needed, or keep it if it should only show if you have relics. 
    // Wait, the user said "at the end of the relic list". If list is empty, should it show? 
    // Usually debug buttons are always there.

    if (viewMode === 'table') {
        const sortedInventory = [...visibleInventory].sort((a, b) => {
             const configA = RelicManager.getRelicConfig(a.id);
             const configB = RelicManager.getRelicConfig(b.id);
             // Sort by order if available, else name
             const orderA = configA?.handType?.order ?? 999;
             const orderB = configB?.handType?.order ?? 999;
             return orderA - orderB; 
        });

        // Use the same container style as Charms view but with 100% width default for the list
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                gap: 10,
                zIndex: 2000,
                isolation: 'isolate',
                width: '100%',
                alignItems: 'flex-end', // Align items to the right side
                position: 'relative',
                pointerEvents: 'none'
            }}>
                {sortedInventory.map((instance, index) => {
                    const config = RelicManager.getRelicConfig(instance.id);
                    if (!config) return null;
                    
                    const isActive = activeRelicId === instance.id || instance.state?.armed;
                    const isHovered = hoveredIndex === index;

                    return (
                        <div key={`${instance.id}-${index}`} 
                            onMouseEnter={(e) => {
                                setHoveredIndex(index);
                                const target = e.currentTarget;
                                setTooltipPos({ 
                                    top: target.offsetTop, 
                                    left: target.offsetLeft - 320 // Offset tooltip to the left for right-aligned items
                                });
                            }}
                            onMouseLeave={() => setHoveredIndex(null)}
                            style={{ 
                                minWidth: 40,
                                height: 40,
                                // Removed frame
                                background: 'transparent',
                                border: 'none',
                                transform: isActive ? 'scale(1.05)' : 'scale(1)',
                                transition: 'transform 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end', // Icon on right, content aligned to end
                                position: 'relative',
                                cursor: 'help',
                                zIndex: isHovered ? 100 : (isActive ? 10 : 1),
                                pointerEvents: 'auto',
                                paddingLeft: 8, // Reduced space
                                paddingRight: 0 
                            }}
                        >
                            {/* Name Label (Left of Icon) */}
                            <div style={{
                                marginRight: 10,
                                color: isActive ? '#f1c40f' : (instance.state?.used_this_round ? '#4a5568' : '#ecf0f1'),
                                fontWeight: 'bold',
                                fontSize: '0.9rem',
                                whiteSpace: 'nowrap',
                                textShadow: instance.state?.used_this_round ? 'none' : '0 1px 2px rgba(0,0,0,0.8)',
                                textAlign: 'left' 
                            }}>
                                {config.handType?.name || config.name}
                            </div>

                            {/* Icon Circle */}
                            <div style={{
                                width: 40,
                                height: 40,
                                borderRadius: '50%',
                                background: isActive ? '#f1c40f' : (instance.state?.used_this_round ? '#151e26' : '#2c3e50'),
                                border: isActive ? '3px solid #f39c12' : (instance.state?.used_this_round ? '3px solid #2c3e50' : '3px solid rgba(255, 215, 0, 0.6)'), 
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                                marginRight: 0,
                                overflow: 'hidden'
                            }}>
                                {config.icon && (config.icon.includes('.') || config.icon.includes('/')) ? (
                                    <img 
                                        src={config.icon} 
                                        alt={config.name} 
                                        style={{ 
                                            width: '100%', 
                                            height: '100%', 
                                            objectFit: 'cover',
                                            filter: isActive ? 'brightness(1.2) drop-shadow(0 0 5px rgba(255,255,255,0.5))' : (instance.state?.used_this_round ? 'brightness(0.5) grayscale(0.8)' : 'none')
                                        }} 
                                    />
                                ) : config.icon ? (
                                    <div style={{
                                        fontSize: '1.5rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '100%',
                                        height: '100%',
                                        filter: instance.state?.used_this_round ? 'grayscale(0.8) opacity(0.5)' : 'none'
                                    }}>
                                        {config.icon}
                                    </div>
                                ) : (
                                    <div style={{
                                        fontSize: '0.6rem',
                                        fontWeight: 'bold',
                                        textAlign: 'center',
                                        color: isActive ? '#fff' : '#ecf0f1',
                                        padding: 2
                                    }}>
                                        {config.name.substring(0, 2).toUpperCase()}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}


                {hoveredIndex !== null && sortedInventory[hoveredIndex] && RelicManager.getRelicConfig(sortedInventory[hoveredIndex].id) && (
                    <RelicTooltip 
                        relic={RelicManager.getRelicConfig(sortedInventory[hoveredIndex].id)!}
                        displayValues={sortedInventory[hoveredIndex].state}
                        hideIcon={true}
                        isRightAligned={true}
                        layout="horizontal"
                        direction="rtl"
                        style={{
                            position: 'absolute',
                            top: tooltipPos.top - 11, // Offset: 10px padding + 1px border
                            left: 'auto',
                            right: -21, // Offset: 20px padding + 1px border
                            pointerEvents: 'none',
                            zIndex: 50
                        }}
                    />
                )}
            </div>
        );
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start', // Align to top
            gap: 10,
            zIndex: 2000,
            isolation: 'isolate', // Force a new stacking context root
            width: '100%',
            alignItems: 'flex-start', // Left align
            position: 'relative', // Enable absolute positioning for children (tooltips)
            pointerEvents: 'none'
        }}>
            {visibleInventory.map((instance, index) => {
                const config = RelicManager.getRelicConfig(instance.id);
                if (!config) return null;

                const isActive = activeRelicId === instance.id || instance.state?.armed;
                const isHovered = hoveredIndex === index;

                return (
                    <div 
                        key={`${instance.id}-${index}`} 
                        onMouseEnter={(e) => {
                            setHoveredIndex(index);
                            const target = e.currentTarget;
                            setTooltipPos({ 
                                top: target.offsetTop, 
                                left: target.offsetLeft
                            });
                        }}
                        onMouseLeave={() => setHoveredIndex(null)}
                        style={{
                            minWidth: 40, // Allow expansion
                            height: 40,
                            borderRadius: '20px', // Adjusted for 40px height
                            background: 'transparent',
                            border: 'none',
                            transform: isActive ? 'scale(1.05)' : 'scale(1)',
                            transition: 'transform 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start', // Icon on left
                            position: 'relative',
                            cursor: 'help',
                            zIndex: isHovered ? 100 : (isActive ? 10 : 1),
                            pointerEvents: 'auto',
                            willChange: 'z-index',
                            paddingRight: 8 // Reduced space
                        }}
                    >
                        <div style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            background: isActive ? '#f1c40f' : (instance.state?.used_this_round ? '#151e26' : '#2c3e50'),
                            border: isActive ? '3px solid #f39c12' : (instance.state?.used_this_round ? '3px solid #2c3e50' : '3px solid rgba(255, 215, 0, 0.6)'), 
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                            marginLeft: 0,
                            overflow: 'hidden'
                        }}>
                             {config.icon && (config.icon.includes('.') || config.icon.includes('/')) ? (
                                 <img 
                                    src={config.icon} 
                                    alt={config.name} 
                                    style={{ 
                                        width: '100%', 
                                        height: '100%', 
                                        objectFit: 'cover',
                                        filter: isActive ? 'brightness(1.2) drop-shadow(0 0 5px rgba(255,255,255,0.5))' : (instance.state?.used_this_round ? 'brightness(0.5) grayscale(0.8)' : 'none')
                                    }} 
                                 />
                             ) : config.icon ? (
                                <div style={{
                                    fontSize: '1.5rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '100%',
                                    height: '100%',
                                    filter: instance.state?.used_this_round ? 'grayscale(0.8) opacity(0.5)' : 'none'
                                }}>
                                    {config.icon}
                                </div>
                             ) : (
                                 <div style={{
                                     fontSize: '0.6rem',
                                     fontWeight: 'bold',
                                     textAlign: 'center',
                                     color: isActive ? '#fff' : '#ecf0f1',
                                     padding: 2
                                 }}>
                                     {config.name.substring(0, 2).toUpperCase()}
                                 </div>
                             )}
                        </div>
                        
                        {/* Name Label */}
                        <div style={{
                            marginLeft: 10,
                            color: isActive ? '#f1c40f' : (instance.state?.used_this_round ? '#4a5568' : '#ecf0f1'),
                            fontWeight: 'bold',
                            fontSize: '0.9rem',
                            whiteSpace: 'nowrap',
                            textShadow: instance.state?.used_this_round ? 'none' : '0 1px 2px rgba(0,0,0,0.8)'
                        }}>
                            {config.name}
                        </div>
                    </div>
                );
            })}



            {hoveredIndex !== null && visibleInventory[hoveredIndex] && RelicManager.getRelicConfig(visibleInventory[hoveredIndex].id) && (
                <RelicTooltip 
                    relic={RelicManager.getRelicConfig(visibleInventory[hoveredIndex].id)!}
                    displayValues={visibleInventory[hoveredIndex].state}
                    hideIcon={true}
                    layout="horizontal"
                    direction="ltr"
                    style={{
                        position: 'absolute',
                        top: tooltipPos.top - 11, // Offset: 10px padding + 1px border
                        left: tooltipPos.left - 21, // Offset: 20px padding + 1px border
                        pointerEvents: 'none',
                        zIndex: 50 // Between items (1) and hovered-top (100)
                    }}
                />
            )}
        </div>
    );
};


