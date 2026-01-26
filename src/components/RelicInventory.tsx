
import React, { useState } from 'react';
import styles from '../App.module.css';
import { useGameStore } from '../store/gameStore';
import { RelicManager } from '../logic/relics/manager';
import { RelicTooltip } from './RelicTooltip';
import { TransparentImage } from './TransparentImage';

interface RelicInventoryProps {
    onManage?: () => void;
}

export const RelicInventory: React.FC<RelicInventoryProps> = ({ onManage }) => {
    const { inventory, activeRelicId } = useGameStore();
    const visibleInventory = inventory.filter(instance => instance.id !== 'win' && instance.id !== 'viginti');
    // Track index because we might have duplicate relic types
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

    // if (visibleInventory.length === 0) return null; // Remove this to always show Manage button if needed, or keep it if it should only show if you have relics. 
    // Wait, the user said "at the end of the relic list". If list is empty, should it show? 
    // Usually debug buttons are always there.

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
            position: 'relative' // Enable absolute positioning for children (tooltips)
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
            <button
                onClick={onManage}
                className={styles.manageDebugBtn}
                style={{ marginTop: 20 }}
            >
                Manage
            </button>

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


