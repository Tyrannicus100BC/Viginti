
import React, { useState } from 'react';

import { useGameStore } from '../store/gameStore';
import { RelicManager } from '../logic/relics/manager';
import { RelicTooltip } from './RelicTooltip';
import { getRelicRarityFrameColor } from '../logic/relics/rarity';
import { getRelicCompCost } from '../logic/rewards/generator';




interface RelicInventoryProps {
    enabledCategories?: string[];
    viewMode?: 'icons' | 'table';
    inventoryKind?: 'charm' | 'angle';
    hiddenEntry?: { id: string; index: number } | null;
    pendingHiddenRelicId?: string | null;
}

export const RelicInventory: React.FC<RelicInventoryProps> = ({
    enabledCategories,
    viewMode = 'icons',
    inventoryKind,
    hiddenEntry = null,
    pendingHiddenRelicId = null
}) => {
    const { inventory, activeRelicId, isSellingMode, sellRelic, rewardRelicSell } = useGameStore();

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
    const [sellingIndex, setSellingIndex] = useState<number | null>(null);

    // if (visibleInventory.length === 0) return null; // Remove this to always show Manage button if needed, or keep it if it should only show if you have relics. 
    // Wait, the user said "at the end of the relic list". If list is empty, should it show? 
    // Usually debug buttons are always there.

    if (viewMode === 'table') {
        const tableInventory = visibleInventory;
        const pendingHiddenIndex = pendingHiddenRelicId
            ? tableInventory.reduce<number>((lastIndex, instance, index) => (
                instance.id === pendingHiddenRelicId ? index : lastIndex
            ), -1)
            : -1;

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
                {tableInventory.map((instance, index) => {
                    const config = RelicManager.getRelicConfig(instance.id);
                    if (!config) return null;
                    const rarityFrameColor = getRelicRarityFrameColor(config.rarity);
                    
                    const isActive = activeRelicId === instance.id || instance.state?.armed;
                    const isHovered = hoveredIndex === index;
                    const isTemporarilyHidden =
                        (hiddenEntry?.id === instance.id && hiddenEntry.index === index) ||
                        (pendingHiddenRelicId === instance.id && index === pendingHiddenIndex);

                    return (
                        <div key={`${instance.id}-${index}`} 
                            data-inventory-row="true"
                            data-inventory-kind={inventoryKind}
                            data-relic-id={instance.id}
                            data-inventory-index={index}
                            onMouseEnter={(e) => {
                                setHoveredIndex(index);
                                const target = e.currentTarget;
                                setTooltipPos({ 
                                    top: target.offsetTop, 
                                    left: target.offsetLeft - 320 // Offset tooltip to the left for right-aligned items
                                });
                            }}
                            onMouseLeave={() => setHoveredIndex(null)}
                            onClick={() => {
                                if (!isSellingMode) return;
                                if (sellingIndex !== null) return;
                                
                                rewardRelicSell(instance.id);
                                setSellingIndex(index);
                                setTimeout(() => {
                                    // Find absolute index in main inventory
                                    const absoluteIndex = inventory.findIndex((inst, i) => inst === instance);
                                    if (absoluteIndex !== -1) {
                                        sellRelic(instance.id, absoluteIndex);
                                    }
                                    setSellingIndex(null);
                                }, 300);
                            }}
                            style={{ 
                                width: 40, // Changed from minWidth
                                height: 40,
                                // Removed frame
                                background: 'transparent',
                                border: 'none',
                                transform: isActive ? 'scale(1.2)' : 'scale(1)',
                                transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), filter 0.3s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1)' + (sellingIndex === index ? ', opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : ''),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                position: 'relative',
                                cursor: isSellingMode ? 'pointer' : 'help',
                                zIndex: isHovered ? 100 : (isActive ? 10 : 1),
                                pointerEvents: 'auto',
                                paddingLeft: 8,
                                paddingRight: 0,
                                opacity: (isTemporarilyHidden || sellingIndex === index) ? 0 : 1,
                                visibility: isTemporarilyHidden ? 'hidden' : 'visible'
                            }}
                        >
                            {/* Name Label (Left of Icon) */}
                            <div
                                data-inventory-label="true"
                                style={{
                                marginRight: 10,
                                color: isActive ? '#f1c40f' : (instance.state?.used_this_round ? '#4a5568' : '#ecf0f1'),
                                fontWeight: 'bold',
                                fontSize: '0.9rem',
                                whiteSpace: 'nowrap',
                                textShadow: instance.state?.used_this_round ? 'none' : '0 1px 2px rgba(0,0,0,0.8)',
                                textAlign: 'left' 
                                }}
                            >
                                {config.handType?.name || config.name}
                            </div>

                            {/* Icon Circle */}
                            <div
                                data-inventory-icon="true"
                                style={{
                                width: 40,
                                height: 40,
                                borderRadius: '50%',
                                background: isActive ? '#f1c40f' : (instance.state?.used_this_round ? '#151e26' : '#2c3e50'),
                                border: `3px solid ${rarityFrameColor}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                                marginRight: 0,
                                overflow: 'hidden'
                                }}
                            >
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


                {hoveredIndex !== null && tableInventory[hoveredIndex] && RelicManager.getRelicConfig(tableInventory[hoveredIndex].id) && (
                    <RelicTooltip 
                        relic={RelicManager.getRelicConfig(tableInventory[hoveredIndex].id)!}
                        displayValues={tableInventory[hoveredIndex].state}
                        hideIcon={true}
                        isRightAligned={inventoryKind === 'angle'}
                        layout="horizontal"
                        direction={inventoryKind === 'angle' ? "rtl" : "ltr"}
                        sellPrice={isSellingMode ? Math.ceil(getRelicCompCost(tableInventory[hoveredIndex].id) / 3) : undefined}
                        style={{
                            position: 'absolute',
                            top: tooltipPos.top - 11, // Offset: 10px padding + 1px border
                            left: 'auto',
                            right: -21, // Offset: 20px padding + 1px border
                            pointerEvents: 'none',
                            zIndex: 50,
                            opacity: sellingIndex === hoveredIndex ? 0 : 1,
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            animation: sellingIndex === hoveredIndex ? 'none' : undefined
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
            {(() => {
                const pendingHiddenIndex = pendingHiddenRelicId
                    ? visibleInventory.reduce<number>((lastIndex, instance, index) => (
                        instance.id === pendingHiddenRelicId ? index : lastIndex
                    ), -1)
                    : -1;
                return visibleInventory.map((instance, index) => {
                    const config = RelicManager.getRelicConfig(instance.id);
                    if (!config) return null;
                    const rarityFrameColor = getRelicRarityFrameColor(config.rarity);

                    const isActive = activeRelicId === instance.id || instance.state?.armed;
                    const isHovered = hoveredIndex === index;
                    const isTemporarilyHidden =
                        (hiddenEntry?.id === instance.id && hiddenEntry.index === index) ||
                        (pendingHiddenRelicId === instance.id && index === pendingHiddenIndex);

                    return (
                        <div 
                            key={`${instance.id}-${index}`} 
                            data-inventory-row="true"
                            data-inventory-kind={inventoryKind}
                            data-relic-id={instance.id}
                            data-inventory-index={index}
                            onMouseEnter={(e) => {
                                setHoveredIndex(index);
                                const target = e.currentTarget;
                                setTooltipPos({ 
                                    top: target.offsetTop, 
                                    left: target.offsetLeft
                                });
                            }}
                            onMouseLeave={() => setHoveredIndex(null)}
                            onClick={() => {
                                if (!isSellingMode) return;
                                if (sellingIndex !== null) return;

                                rewardRelicSell(instance.id);
                                setSellingIndex(index);
                                setTimeout(() => {
                                    // Find absolute index in main inventory
                                    const absoluteIndex = inventory.findIndex((inst, i) => inst === instance);
                                    if (absoluteIndex !== -1) {
                                        sellRelic(instance.id, absoluteIndex);
                                    }
                                    setSellingIndex(null);
                                }, 300);
                            }}
                            style={{
                                minWidth: 40, // Allow expansion
                                height: 40,
                                borderRadius: '20px', // Adjusted for 40px height
                                background: 'transparent',
                                border: 'none',
                                transform: isActive ? 'scale(1.05)' : 'scale(1)',
                                transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), filter 0.3s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1)' + (sellingIndex === index ? ', opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : ''),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-start', // Icon on left
                                position: 'relative',
                                cursor: isSellingMode ? 'pointer' : 'help',
                                zIndex: isHovered ? 100 : (isActive ? 10 : 1),
                                pointerEvents: 'auto',
                                willChange: 'z-index, transform, opacity',
                                paddingRight: 8, // Reduced space
                                opacity: (isTemporarilyHidden || sellingIndex === index) ? 0 : 1,
                                visibility: isTemporarilyHidden ? 'hidden' : 'visible'
                            }}
                        >
                            <div
                                data-inventory-icon="true"
                                style={{
                                width: 40,
                                height: 40,
                                borderRadius: '50%',
                                background: isActive ? '#f1c40f' : (instance.state?.used_this_round ? '#151e26' : '#2c3e50'),
                                border: `3px solid ${rarityFrameColor}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                                marginLeft: 0,
                                overflow: 'hidden'
                                }}
                            >
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
                            <div
                                data-inventory-label="true"
                                style={{
                                marginLeft: 10,
                                color: isActive ? '#f1c40f' : (instance.state?.used_this_round ? '#4a5568' : '#ecf0f1'),
                                fontWeight: 'bold',
                                fontSize: '0.9rem',
                                whiteSpace: 'nowrap',
                                textShadow: instance.state?.used_this_round ? 'none' : '0 1px 2px rgba(0,0,0,0.8)'
                                }}
                            >
                                {config.name}
                            </div>
                        </div>
                    );
                });
            })()}



            {hoveredIndex !== null && visibleInventory[hoveredIndex] && RelicManager.getRelicConfig(visibleInventory[hoveredIndex].id) && (
                <RelicTooltip 
                    relic={RelicManager.getRelicConfig(visibleInventory[hoveredIndex].id)!}
                    displayValues={visibleInventory[hoveredIndex].state}
                    isRightAligned={inventoryKind === 'angle'}
                    layout="horizontal"
                    direction={inventoryKind === 'angle' ? "rtl" : "ltr"}
                    sellPrice={isSellingMode ? Math.ceil(getRelicCompCost(visibleInventory[hoveredIndex].id) / 3) : undefined}
                    style={{
                        position: 'absolute',
                        top: tooltipPos.top - 11, // Offset: 10px padding + 1px border
                        left: tooltipPos.left - 21, // Offset: 20px padding + 1px border
                        pointerEvents: 'none',
                        zIndex: 50, // Between items (1) and hovered-top (100)
                        opacity: sellingIndex === hoveredIndex ? 0 : 1,
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        animation: sellingIndex === hoveredIndex ? 'none' : undefined
                    }}
                />
            )}
        </div>
    );
};
