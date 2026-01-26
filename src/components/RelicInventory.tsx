
import React, { useState } from 'react';
import styles from '../App.module.css';
import { useGameStore } from '../store/gameStore';
import { RelicManager } from '../logic/relics/manager';
import { RelicTooltip } from './RelicTooltip';
import { TransparentImage } from './TransparentImage';
import { formatHandChips, formatHandMult, formatHandScore } from '../logic/formatters';

interface RelicInventoryProps {
    onManage?: () => void;
    enabledCategories?: string[];
    viewMode?: 'icons' | 'table';
}

export const RelicInventory: React.FC<RelicInventoryProps> = ({ onManage, enabledCategories, viewMode = 'icons' }) => {
    const { inventory, activeRelicId, debugEnabled } = useGameStore();

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

        const renderScore = (chips: number, mult: number, chipCards?: boolean) => {
            const text = formatHandScore(chips, mult, chipCards, '\u00A0\u00A0\u00A0');
            const parts = text.split(/(x\d+(?:\.\d+)?|Cards(?:\s*\+\s*[\$\+]{0,2}\d+)?|[\$\+]{1,2}\d+(?:\s*chips?)?|\d+\s*chips?)/gi);
            
            return parts.map((part, i) => {
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
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', color: '#ecf0f1', fontSize: '0.8rem', pointerEvents: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0px 8px 0px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <div className={styles.zoneLabel}>Angles</div>
                    <div className={styles.zoneLabel}>Value</div>
                </div>
                {sortedInventory.map((instance, index) => {
                    const config = RelicManager.getRelicConfig(instance.id);
                    if (!config) return null;
                    
                    // Allow state to override base definitions if present (e.g. upgrades)
                    const chips = instance.state?.chips ?? config.handType?.chips ?? 0;
                    const mult = instance.state?.mult ?? config.handType?.mult ?? 0;

                    return (
                        <div key={`${instance.id}-${index}`} style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between',
                            padding: '6px 8px', 
                            borderBottom: '1px solid rgba(255,255,255,0.05)', 
                            backgroundColor: hoveredIndex === index ? 'rgba(255,255,255,0.05)' : 'transparent',
                            cursor: 'default',
                            alignItems: 'center',
                            pointerEvents: 'auto'
                        }}
                        onMouseEnter={() => setHoveredIndex(index)}
                        onMouseLeave={() => setHoveredIndex(null)}
                        >
                            <div 
                                className={instance.id === 'viginti' ? styles.vigintiHighlight : styles.handHighlight}
                                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '500' }}
                            >
                                {config.handType?.name || config.name}
                            </div>
                            <div style={{ fontWeight: 'bold' }}>
                                {renderScore(chips, mult, config.handType?.chipCards)}
                            </div>
                        </div>
                    );
                })}
                 {debugEnabled && (
                    <button onClick={onManage} className={styles.manageDebugBtn} style={{ marginTop: 10, alignSelf: 'center', pointerEvents: 'auto' }}>
                        Manage
                    </button>
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
            alignItems: 'center', // Center relics and button
            position: 'relative', // Enable absolute positioning for children (tooltips)
            pointerEvents: 'none'
        }}>
            {visibleInventory.map((instance, index) => {
                const config = RelicManager.getRelicConfig(instance.id);
                if (!config) return null;

                const isActive = activeRelicId === instance.id;
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
                            width: 56,
                            height: 56,
                            borderRadius: '50%',
                            background: isActive ? '#f1c40f' : '#2c3e50',
                            border: isActive ? '4px solid #f39c12' : '4px solid rgba(255, 215, 0, 0.6)',
                            boxShadow: isActive ? '0 0 20px #f39c12' : '0 4px 15px rgba(0, 0, 0, 0.4), inset 0 0 10px rgba(0,0,0,0.5)',
                            transform: isActive ? 'scale(1.2)' : 'scale(1)',
                            // Specify transitions explicitly, avoiding 'all'
                            transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), border 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            cursor: 'help',
                            // Normalize Z-index: Hovered (100) > Tooltip (50) > Items (1)
                            zIndex: isHovered ? 100 : (isActive ? 10 : 1),
                            pointerEvents: 'auto',
                            willChange: 'z-index'
                        }}
                    >
                        <div style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            borderRadius: '50%'
                        }}>
                             {config.icon ? (
                                 <TransparentImage 
                                    src={config.icon} 
                                    alt={config.name} 
                                    threshold={250}
                                    style={{ 
                                        width: '85%', 
                                        height: '85%', 
                                        objectFit: 'contain',
                                        filter: isActive ? 'brightness(1.2) drop-shadow(0 0 5px rgba(255,255,255,0.5))' : 'none',
                                        transition: 'none'
                                    }} 
                                 />
                             ) : (
                                 <div style={{
                                     fontSize: '0.6rem',
                                     fontWeight: 'bold',
                                     textAlign: 'center',
                                     color: isActive ? '#fff' : '#ecf0f1',
                                     padding: 4
                                 }}>
                                     {config.name.substring(0, 2).toUpperCase()}
                                 </div>
                             )}
                        </div>
                    </div>
                );
            })}

            {/* Manage Debug Button */}
            {debugEnabled && (
                <button
                    onClick={onManage}
                    className={styles.manageDebugBtn}
                    style={{ marginTop: 20, pointerEvents: 'auto' }}
                >
                    Manage
                </button>
            )}

            {hoveredIndex !== null && visibleInventory[hoveredIndex] && RelicManager.getRelicConfig(visibleInventory[hoveredIndex].id) && (
                <RelicTooltip 
                    relic={RelicManager.getRelicConfig(visibleInventory[hoveredIndex].id)!}
                    displayValues={visibleInventory[hoveredIndex].state}
                    hideIcon={true}
                    style={{
                        position: 'absolute',
                        top: tooltipPos.top - 13, // Offset by tooltip padding (12px) + border (1px)
                        left: tooltipPos.left - 13, // Offset by tooltip padding (12px) + border (1px)
                        pointerEvents: 'none',
                        zIndex: 50 // Between items (1) and hovered-top (100)
                    }}
                />
            )}
        </div>
    );
};


