
import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { RelicManager } from '../logic/relics/manager';
import { RelicTooltip } from './RelicTooltip';
import { TransparentImage } from './TransparentImage';

export const RelicInventory: React.FC = () => {
    const { inventory, activeRelicId } = useGameStore();
    const visibleInventory = inventory.filter(instance => instance.id !== 'win' && instance.id !== 'viginti');
    // Track index because we might have duplicate relic types
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

    if (visibleInventory.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            left: 20,
            top: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 12,
            zIndex: 2000,
            pointerEvents: 'none',
            isolation: 'isolate' // Force a new stacking context root
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
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltipPos({ 
                                top: rect.top + rect.height / 2, 
                                left: rect.left - 20 - 12 
                            });
                        }}
                        onMouseLeave={() => setHoveredIndex(null)}
                        style={{
                            width: 80,
                            height: 80,
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
                                     fontSize: '0.8rem',
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

            {hoveredIndex !== null && visibleInventory[hoveredIndex] && RelicManager.getRelicConfig(visibleInventory[hoveredIndex].id) && (
                <RelicTooltip 
                    relic={RelicManager.getRelicConfig(visibleInventory[hoveredIndex].id)!}
                    displayValues={visibleInventory[hoveredIndex].state}
                    hideIcon={true}
                    style={{
                        position: 'absolute',
                        top: tooltipPos.top,
                        left: tooltipPos.left,
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                        zIndex: 50 // Between items (1) and hovered-top (100)
                    }}
                />
            )}
        </div>
    );
};

