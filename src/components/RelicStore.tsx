
import React from 'react';
import { useGameStore } from '../store/gameStore';
import { RelicManager } from '../logic/relics/manager';
import { RelicTooltip } from './RelicTooltip';

interface RelicStoreProps {
    onClose: () => void;
    filterCategory?: string;
}

export const RelicStore: React.FC<RelicStoreProps> = ({ onClose, filterCategory }) => {
    const { inventory, addRelic, removeRelic } = useGameStore();

    const allRelics = RelicManager.getAllRelics();
    
    const displayRelics = filterCategory 
        ? allRelics.filter(r => r.categories.includes(filterCategory))
        : allRelics;

    // Group relics by category
    const groupedRelics = displayRelics.reduce((acc, relic) => {
        let category = 'Uncategorized';
        
        if (relic.categories[0] === 'Angle' && relic.categories[1]) {
            category = relic.categories[1];
        } else {
            const specificCategories = relic.categories.filter(c => c.toLowerCase() !== 'charm');
            category = specificCategories.length > 0 ? specificCategories[0] : (relic.categories[0] || 'Uncategorized');
        }

        if (!acc[category]) acc[category] = [];
        acc[category].push(relic);
        return acc;
    }, {} as Record<string, typeof allRelics>);

    // Sort categories
    const categoryOrder = ['Win', 'Rank', 'Flush', 'Straight'];
    const categories = Object.keys(groupedRelics).sort((a, b) => {
        const indexA = categoryOrder.indexOf(a);
        const indexB = categoryOrder.indexOf(b);
        
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        
        return a.localeCompare(b);
    });

    return (
        <div 
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 2000,
                backdropFilter: 'blur(8px)',
                padding: '40px' // Added padding for breathing room
            }}
        >
            <div style={{ position: 'relative', width: '85%', maxWidth: 940, maxHeight: '82%', display: 'flex', flexDirection: 'column' }}>
                <div 
                    onClick={e => e.stopPropagation()}
                    style={{
                        background: '#1c2833',
                        borderRadius: 16,
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                        border: '1px solid #34495e',
                        position: 'relative',
                        overflow: 'hidden'
                    }}
                >
                    <div style={{ padding: '24px 24px 10px 24px' }}>
                        <h2 style={{ marginTop: 0, marginBottom: 10, color: '#ffd700', textTransform: 'uppercase', fontSize: '1.5rem' }}>
                            {filterCategory === 'Angle' ? 'Angles Manage (Debug)' : 'Charms Manage (Debug)'}
                        </h2>
                    </div>
                    
                    <div style={{ 
                        padding: '0 24px 24px 24px',
                        overflowY: 'auto',
                        flex: 1,
                        borderRadius: '0 0 16px 16px'
                    }}>
                        {categories.map(category => (
                            <div key={category} style={{ marginBottom: 30 }}>
                                <div style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    marginBottom: 15,
                                    color: '#aaa',
                                    fontSize: '0.9rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px'
                                }}>
                                    <span style={{ marginRight: 15 }}>{category}</span>
                                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
                                </div>

                                <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: 'repeat(2, 1fr)', 
                                    gap: 20,
                                    justifyItems: 'center'
                                }}>
                                    {groupedRelics[category].map(relic => {
                                        const isOwned = inventory.some(i => i.id === relic.id);
                                        return (
                                            <div 
                                                key={relic.id}
                                                onClick={() => {
                                                    if (isOwned) removeRelic(relic.id);
                                                    else addRelic(relic.id);
                                                }}
                                                style={{
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    opacity: isOwned ? 0.3 : 1,
                                                    filter: isOwned ? 'grayscale(1) brightness(0.5)' : 'none',
                                                    transform: isOwned ? 'scale(0.95)' : 'scale(1)',
                                                    width: '100%',
                                                    display: 'flex',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                <RelicTooltip 
                                                    relic={relic} 
                                                    displayValues={relic.properties}
                                                    style={{
                                                        background: 'rgba(255, 255, 255, 0.03)',
                                                        border: isOwned ? '2px solid #27ae60' : '2px solid #444',
                                                        boxShadow: isOwned ? 'none' : '0 4px 20px rgba(0,0,0,0.4)',
                                                        pointerEvents: 'none',
                                                        animation: 'none' // Disable fade-in animation in the store
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <button className="close-x-btn" onClick={onClose}>×</button>
            </div>
        </div>
    );
};
