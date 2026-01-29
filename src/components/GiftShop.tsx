import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { RelicManager } from '../logic/relics/manager';
import { PlayingCard } from './PlayingCard';
import { TransparentImage } from './TransparentImage';
import { RelicTooltip } from './RelicTooltip';
import { BonusPhysics } from './BonusPhysics';
import styles from './GiftShop.module.css';

export const GiftShop: React.FC = () => {
    const { comps, shopItems, buyShopItem, leaveShop, shopRewardSummary } = useGameStore();
    const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
    const [introStep, setIntroStep] = useState(0);
    // 0: Init
    // 1: "CASINO CLEARED"
    // 2: Deals Bonus
    // 3: Surrender Bonus
    // 4: Win Bonus
    // 5: Complete/Shop

    React.useEffect(() => {
        // Start sequence
        const seq = async () => {
            // Step 1: Text
            setIntroStep(1);
            await new Promise(r => setTimeout(r, 1500)); // Slower
            // Step 2: Deals
            setIntroStep(2);
            await new Promise(r => setTimeout(r, 1200)); // Slower
            // Step 3: Surrender
            setIntroStep(3);
            await new Promise(r => setTimeout(r, 1200)); // Slower
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

    // Helper to get tooltip content for an item
    const renderTooltip = (item: typeof shopItems[0]) => {
        if (item.type === 'Card' && item.card) {
            if (item.card.specialEffect) {
                const { type, value } = item.card.specialEffect;
                const desc = `Special Card:\n${type === 'chip' ? `+${value} Chips` : type === 'mult' ? `x${value} Mult` : `-${value} Target`}`;
                return (
                    <div className={styles.tooltipContainer}>
                        <div className={styles.tooltipTitle}>Enhanced Card</div>
                        <div className={styles.tooltipDesc}>{desc}</div>
                    </div>
                );
            }
            return null; // No tooltip for standard cards unless we want flavor text
        } else {
            // Relic
            const config = RelicManager.getRelicConfig(item.id);
            if (!config) return null;

            // Re-use RelicTooltip component but maybe styled slightly differently if needed
            // Or just inline the structure if RelicTooltip is too specific to the sidebar
            // Let's rely on standard RelicTooltip logic but render it cleanly

            return (
                <div className={styles.tooltipWrapper}>
                    <RelicTooltip
                        relic={{
                            ...config,
                            // state: config.properties || {} // RelicTooltip uses config.properties directly if available
                        }}
                        hideIcon={true} // We already show icon in card
                        className={styles.shopTooltip}
                    />
                </div>
            );
        }
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
                                <span className={styles.bonusValue}>+${shopRewardSummary.dealsBonus}</span>
                            </div>
                        )}

                        {introStep >= 3 && shopRewardSummary && (
                            <div className={styles.bonusLine}>
                                <span className={styles.bonusLabel}>Surrenders Bonus</span>
                                <span className={styles.bonusValue}>+${shopRewardSummary.surrenderBonus}</span>
                            </div>
                        )}

                        {introStep >= 4 && shopRewardSummary && (
                            <div className={styles.bonusLine}>
                                <span className={styles.bonusLabel}>Win Bonus</span>
                                <span className={styles.bonusValue}>+${shopRewardSummary.winBonus}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className={styles.balanceDisplay}>
                <span>${comps}</span>
                <span style={{ fontSize: '0.8rem', color: '#aaa' }}>COMPS</span>
            </div>

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
                                content = (
                                    <div style={{ width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <TransparentImage src={config.icon} threshold={200} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                    </div>
                                );
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
                            onMouseEnter={() => setHoveredItemId(item.id)}
                            onMouseLeave={() => setHoveredItemId(null)}
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
                                    <span className={styles.costValue}>${cost}</span>
                                </div>
                            )}

                            {/* Tooltip Overlay */}
                            {hoveredItemId === item.id && (
                                <div className={styles.hoverOverlay}>
                                    {renderTooltip(item)}
                                </div>
                            )}
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
