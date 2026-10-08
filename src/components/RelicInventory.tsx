import React, { useState } from 'react';
import { useGameBridge } from '../store/gameBridge';
import { useGameStore } from '../store/gameStore';
import { RelicManager } from '../logic/relics/manager';
import { RelicTooltip } from './RelicTooltip';
import { getRelicRarityFrameColor } from '../logic/relics/rarity';
import { getRelicSellCashValue } from '../logic/rewards/generator';
import { getRelicSide, getSideSlotCount, type RelicSide } from '../logic/relics/inventory';
import type { RelicInstance } from '../logic/relics/types';

interface RelicInventoryProps {
    inventoryKind: RelicSide;
    hiddenEntry?: { id: string; index: number } | null;
    pendingHiddenRelicId?: string | null;
}

export const RelicInventory: React.FC<RelicInventoryProps> = ({
    inventoryKind, hiddenEntry = null, pendingHiddenRelicId = null
}) => {
    const { inventory, relicSlots, activeRelicId, isSellingMode, sellRelic, rewardRelicSell } = useGameStore();
    const entries = (inventory as RelicInstance[]).filter((_, index) => getRelicSide(index) === inventoryKind);
    const slotCount = Math.max(entries.length, getSideSlotCount(inventoryKind, relicSlots));
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [sellingId, setSellingId] = useState<string | null>(null);
    const right = inventoryKind === 'right';
    const hovered = hoveredIndex === null ? null : entries[hoveredIndex];
    const hoveredConfig = hovered ? RelicManager.getRelicConfig(hovered.id) : null;

    return <div aria-label={right ? 'Right relic slots' : 'Left relic slots'} style={{
        display: 'flex', flexDirection: 'column', gap: 10, width: '100%',
        alignItems: right ? 'flex-end' : 'flex-start', position: 'relative',
        pointerEvents: 'none', isolation: 'isolate', zIndex: 2000
    }}>
        {Array.from({ length: slotCount }, (_, index) => {
            const instance = entries[index];
            const config = instance && RelicManager.getRelicConfig(instance.id);
            if (!instance || !config) return <div key={'empty_' + index}
                aria-label={'Empty relic slot ' + (index * 2 + (right ? 2 : 1))}
                data-empty-relic-slot="true"
                style={{ width: 40, height: 40, boxSizing: 'border-box', borderRadius: '50%',
                    border: '2px solid rgba(192, 192, 192, 0.35)', background: 'rgba(0, 0, 0, 0.12)' }} />;
            const active = activeRelicId === instance.id || instance.state?.armed;
            const hidden = (hiddenEntry?.id === instance.id && hiddenEntry.index === index) || pendingHiddenRelicId === instance.id;
            const selling = sellingId === instance.id;
            return <div key={instance.id}
                data-inventory-row="true" data-inventory-kind={inventoryKind}
                data-relic-id={instance.id} data-inventory-index={index}
                onMouseEnter={() => setHoveredIndex(index)} onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => {
                    if (!isSellingMode || sellingId) return;
                    rewardRelicSell(instance.id);
                    setSellingId(instance.id);
                    setTimeout(() => {
                        // Locate by ID at completion so another sale cannot shift this index.
                        const absoluteIndex = (useGameBridge.getState().gameState.inventory as RelicInstance[]).findIndex(entry => entry.id === instance.id);
                        if (absoluteIndex !== -1) sellRelic(instance.id, absoluteIndex);
                        setSellingId(null);
                        setHoveredIndex(null);
                    }, 300);
                }}
                style={{
                    height: 40, display: 'flex', flexDirection: right ? 'row-reverse' : 'row',
                    alignItems: 'center', position: 'relative', gap: 10,
                    cursor: isSellingMode ? 'pointer' : 'help', pointerEvents: 'auto',
                    zIndex: hoveredIndex === index ? 100 : active ? 10 : 1,
                    transform: active ? 'scale(1.05)' : 'scale(1)',
                    transition: 'transform 0.3s, opacity 0.3s',
                    opacity: hidden || selling ? 0 : 1, visibility: hidden ? 'hidden' : 'visible'
                }}>
                <div data-inventory-icon="true" style={{
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                    background: active ? '#f1c40f' : instance.state?.used_this_round ? '#151e26' : '#2c3e50',
                    border: '3px solid ' + getRelicRarityFrameColor(config.rarity),
                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
                }}>
                    {config.icon && (config.icon.includes('.') || config.icon.includes('/'))
                        ? <img src={config.icon} alt={config.name} style={{ width: '100%', height: '100%', objectFit: 'cover',
                            filter: instance.state?.used_this_round ? 'brightness(0.5) grayscale(0.8)' : 'none' }} />
                        : <span style={{ fontSize: config.icon ? '1.5rem' : '0.6rem' }}>{config.icon || config.name.slice(0, 2).toUpperCase()}</span>}
                </div>
                <div data-inventory-label="true" style={{
                    color: active ? '#f1c40f' : instance.state?.used_this_round ? '#4a5568' : '#ecf0f1',
                    fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.8)'
                }}>{config.name}</div>
            </div>;
        })}
        {hovered && hoveredConfig && <RelicTooltip relic={hoveredConfig} displayValues={hovered.state}
            isRightAligned={right} layout="horizontal" direction={right ? 'rtl' : 'ltr'}
            sellPrice={isSellingMode ? getRelicSellCashValue(hovered.id) : undefined}
            style={{ position: 'absolute', top: hoveredIndex! * 50 - 11,
                ...(right ? { right: -21 } : { left: -21 }), pointerEvents: 'none', zIndex: 50,
                opacity: sellingId === hovered.id ? 0 : 1 }} />}
    </div>;
};
