import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { RelicManager } from '../logic/relics/manager';
import { PlayingCard } from './PlayingCard';
import { RelicTooltip } from './RelicTooltip';
import { BonusPhysics } from './BonusPhysics';
import { useLayout } from './ResponsiveLayout';
import { createPortal } from 'react-dom';
import styles from './GiftShop.module.css';

export const GiftShop: React.FC = () => {
    const { comps, inventory, shopItems, buyShopItem, leaveShop, shopRewardSummary } = useGameStore();
    const hasDoubleDownRelic = inventory.some(r => r.id === 'double_down');
    const hasSurrenderRelic = inventory.some(r => r.id === 'surrender');
    const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
    const [hoveredCardPos, setHoveredCardPos] = useState<{ x: number, y: number, width: number } | null>(null);
    const [introStep, setIntroStep] = useState(0);

    React.useEffect(() => {
        // Start sequence
        const seq = async () => {
            // Step 1: Text
            setIntroStep(1);
            await new Promise(r => setTimeout(r, 1500)); // Slower
            // Step 2: Deals
            setIntroStep(2);
            await new Promise(r => setTimeout(r, 1200)); // Slower
            // Step 3: Surrender (If owned)
            if (hasSurrenderRelic) {
                setIntroStep(3);
                await new Promise(r => setTimeout(r, 1200));
            }
            // Step 3.5: Double Down (If owned)
            if (hasDoubleDownRelic) {
                setIntroStep(3.5);
                await new Promise(r => setTimeout(r, 1200));
            }
            // Step 4: Win
            setIntroStep(4);
            await new Promise(r => setTimeout(r, 2000)); // Hold full result
            // Step 5: Fade Out
            setIntroStep(5);
            await new Promise(r => setTimeout(r, 1000)); // Fade duration
            // Step 6: Shop
            setIntroStep(6);
        };

        // If we don't have a summary (e.g. debug enter), skip
        if (!shopRewardSummary) {
            setIntroStep(6);
        } else {
            seq();
        }
    }, [shopRewardSummary]);

    const { viewportWidth, scale } = useLayout();

    // Helper to get tooltip content for an item
    const renderTooltip = (item: typeof shopItems[0]) => {
        if (item.type === 'Card' && item.card) {
            if (item.card.specialEffect) {
                const { type, value } = item.card.specialEffect;
                const desc = `Special Card:\n${type === 'chip' ? `+${value} Chips` : type === 'mult' ? `x${value} Mult` : `-${value} Debt`}`;
                return (
                    <div className={styles.tooltipContainer}>
                        <div className={styles.tooltipTitle}>Enhanced Card</div>
                        <div className={styles.tooltipDesc}>{desc}</div>
                    </div>
                );
            }
            return null; // Return null for standard cards - portal will check this
        } else {
            // Relic
            const config = RelicManager.getRelicConfig(item.id);
            if (!config) return null;

            return (
                <div className={styles.tooltipWrapper}>
                    <RelicTooltip
                        relic={config}
                        displayValues={config.properties}
                        hideIcon={false}
                        isFlexible={true}
                        className={styles.shopTooltip}
                    />
                </div>
            );
        }
    };

    const renderTooltipPortal = (item: typeof shopItems[0]) => {
        if (!hoveredCardPos) return null;

        const portalRoot = document.getElementById('tooltip-portal-root');
        if (!portalRoot) return null;

        const content = renderTooltip(item);
        if (!content) return null; // Suppress empty tooltips

        // Calculate shiftX to keep on screen
        const cardCenterX = hoveredCardPos.x + (hoveredCardPos.width / 2);
        
        // Tooltip max-width is 380px
        const maxTooltipWidth = 380;
        const halfTooltip = maxTooltipWidth / 2;
        
        let shiftX = 0;
        if (cardCenterX - halfTooltip < 10) {
            shiftX = 10 - (cardCenterX - halfTooltip);
        } else if (cardCenterX + halfTooltip > viewportWidth - 10) {
            shiftX = (viewportWidth - 10) - (cardCenterX + halfTooltip);
        }

        return createPortal(
            <div 
                className={styles.hoverOverlay}
                style={{ 
                    position: 'absolute',
                    left: cardCenterX,
                    top: hoveredCardPos.y - 25, // Increased offset to float higher above the card
                    bottom: 'auto',
                    pointerEvents: 'none',
                    // @ts-ignore
                    '--shift-x': `${shiftX}px` 
                }}
            >
                {content}
            </div>,
            portalRoot
        );
    };

    return (
        <div className={styles.container}>
            {/* Intro Overlay */}
            {introStep < 6 && (
                <div
                    className={`${styles.introOverlay} ${introStep === 5 ? styles.fadeOut : ''}`}
                    style={introStep === 5 ? { opacity: 0, transition: 'opacity 1s ease-out' } : {}}
                >
                    <BonusPhysics />
                    <div style={{ zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {introStep >= 1 && (
                            <div className={styles.introTextMain}>CASINO CLEARED</div>
                        )}

                        {introStep >= 1 && (
                            <div className={styles.compBonusHeader} style={{ fontSize: '1.5rem', color: '#ffd700', marginTop: 20, marginBottom: 10, opacity: introStep >= 2 ? 1 : 0, transition: 'opacity 0.5s' }}>
                                COMP BONUS
                            </div>
                        )}

                        {introStep >= 2 && shopRewardSummary && (
                            <div className={styles.bonusLine}>
                                <span className={styles.bonusLabel}>Deals Bonus</span>
                                <span className={styles.bonusValue}>+₵{shopRewardSummary.dealsBonus}</span>
                            </div>
                        )}

                        {introStep >= 3 && shopRewardSummary && hasSurrenderRelic && (
                            <div className={styles.bonusLine}>
                                <span className={styles.bonusLabel}>Surrenders Bonus</span>
                                <span className={styles.bonusValue}>+₵{shopRewardSummary.surrenderBonus}</span>
                            </div>
                        )}

                        {introStep >= 3.5 && shopRewardSummary && hasDoubleDownRelic && (
                            <div className={styles.bonusLine}>
                                <span className={styles.bonusLabel}>Double Down Bonus</span>
                                <span className={styles.bonusValue}>+₵{shopRewardSummary.doubleDownBonus}</span>
                            </div>
                        )}

                        {introStep >= 4 && shopRewardSummary && (
                            <div className={styles.bonusLine}>
                                <span className={styles.bonusLabel}>Win Bonus</span>
                                <span className={styles.bonusValue}>+₵{shopRewardSummary.winBonus}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}


            <h1 className={styles.title}>CHOOSE YOUR REWARD</h1>

            <div className={styles.choicesContainer} style={{ maxWidth: '90vw' }}>
                {shopItems.map((item) => {
                    const cost = item.cost || 0;
                    const canAfford = comps >= cost && !item.purchased;

                    // Determine content based on type
                    let content = null;
                    let title = '';
                    let styleClass = '';

                    if (item.type === 'Card' && item.card) {
                        styleClass = styles.cardTypeCard;
                        title = 'New Card';
                        content = (
                            <div style={{ transform: 'scale(0.8)', pointerEvents: 'none' }}>
                                <PlayingCard card={item.card} isDrawn={true} suppressSpecialVisuals={false} />
                            </div>
                        );
                    } else {
                        // Relic (Angle/Charm)
                        const config = RelicManager.getRelicConfig(item.id);
                        if (config) {
                            title = item.nameOverride || config.name;
                            styleClass = item.type === 'Angle' ? styles.cardTypeAngle : styles.cardTypeCharm;

                            if (config.icon) {
                                if (config.icon.includes('.') || config.icon.includes('/')) {
                                    content = (
                                        <div style={{ width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', overflow: 'hidden' }}>
                                            <img src={config.icon} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                    );
                                } else {
                                    content = <div style={{ fontSize: '4rem', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 100, height: 100 }}>{config.icon}</div>;
                                }
                            } else {
                                content = <div style={{ fontSize: '3rem' }}>{item.type === 'Angle' ? '📐' : '🧿'}</div>;
                            }
                        }
                    }

                    return (
                        <div
                            key={item.id}
                            className={`${styles.choiceCard} ${styleClass} ${(!canAfford || item.purchased) ? styles.disabled : ''}`}
                            onClick={() => {
                                if (canAfford && !item.purchased) {
                                    buyShopItem(item.id);
                                }
                            }}
                            onMouseEnter={(e) => {
                                setHoveredItemId(item.id);
                                // Calculate position relative to game board
                                const wrapper = document.getElementById('game-scale-wrapper');
                                if (wrapper) {
                                    const wrapperRect = wrapper.getBoundingClientRect();
                                    const cardRect = e.currentTarget.getBoundingClientRect();
                                    setHoveredCardPos({
                                        x: (cardRect.left - wrapperRect.left) / scale,
                                        y: (cardRect.top - wrapperRect.top) / scale,
                                        width: cardRect.width / scale
                                    });
                                }
                            }}
                            onMouseLeave={() => {
                                setHoveredItemId(null);
                                setHoveredCardPos(null);
                            }}
                        >
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                {content}
                            </div>

                            <div className={styles.cardTitle}>{title}</div>
                            {item.purchased ? (
                                <div className={styles.costContainer} style={{ borderColor: '#4ade80' }}>
                                    <span className={styles.costValue} style={{ color: '#4ade80' }}>OWNED</span>
                                </div>
                            ) : (
                                <div className={styles.costContainer}>
                                    <span className={styles.costValue}>₵{cost}</span>
                                </div>
                            )}

                            {/* Tooltip via Portal */}
                            {hoveredItemId === item.id && renderTooltipPortal(item)}
                        </div>
                    );
                })}
            </div>

            <button className={styles.leaveButton} onClick={leaveShop}>
                LEAVE SHOP
            </button>
        </div>
    );
};
