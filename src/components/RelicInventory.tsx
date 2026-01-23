
import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { RELIC_REGISTRY } from '../logic/relics/registry';
import { RelicTooltip } from './RelicTooltip';
import { TransparentImage } from './TransparentImage';

export const RelicInventory: React.FC = () => {
    const { inventory, activeRelicId } = useGameStore();
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

    if (inventory.length === 0) return null;

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
            pointerEvents: 'none'
        }}>
            {inventory.map((id, index) => {
                const config = RELIC_REGISTRY[id];
                if (!config) return null;

                const isActive = activeRelicId === id;
                const isHovered = hoveredId === id;

                return (
                    <div 
                        key={`${id}-${index}`} 
                        onMouseEnter={(e) => {
                            setHoveredId(id);
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltipPos({ 
                                top: rect.top + rect.height / 2, 
                                left: rect.left - 12
                            });
                        }}
                        onMouseLeave={() => setHoveredId(null)}
                        style={{
                            width: 80,
                            height: 80,
                            borderRadius: '50%',
                            background: isActive ? '#f1c40f' : '#2c3e50',
                            border: isActive ? '4px solid #f39c12' : '2px solid #34495e',
                            boxShadow: isActive ? '0 0 20px #f39c12' : '0 4px 6px rgba(0,0,0,0.3)',
                            transform: isActive ? 'scale(1.2)' : 'scale(1)',
                            transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            cursor: 'help',
                            // Give hovered item an extreme Z-index to ensure it is above the tooltip
                            zIndex: isHovered ? 9999 : (isActive ? 100 : 90),
                            pointerEvents: 'auto'
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
                                        // Ensure the image itself doesn't have any transition that causes dimming
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

            {hoveredId && RELIC_REGISTRY[hoveredId] && (
                <RelicTooltip 
                    relic={RELIC_REGISTRY[hoveredId]}
                    hideIcon={true}
                    style={{
                        position: 'fixed',
                        top: tooltipPos.top,
                        left: tooltipPos.left,
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                        zIndex: 5000 // Lower than hovered relic (9999) but higher than base (90)
                    }}
                />
            )}
        </div>
    );
};

