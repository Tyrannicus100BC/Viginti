import React, { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import Matter from 'matter-js';
import { useGameStore } from '../store/gameStore';
import { RelicManager } from '../logic/relics/manager';
import { RelicTooltip } from './RelicTooltip';
import { useLayout } from './ResponsiveLayout';
import styles from './GiftShop.module.css';
import { CITY_DEFINITIONS } from '../logic/cities/definitions';

interface GiftShopProps {
    onOpenDeckRemoval: () => void;
    onOpenEnhanceCards: () => void;
    isExiting?: boolean;
    onEnterAnimationComplete?: () => void;
    onExitAnimationComplete?: () => void;
    onRelicPurchased?: (payload: {
        relicId: string;
        relicType: 'Charm' | 'Angle';
        icon: string | null;
        name: string;
        sourceRect: { left: number; top: number; width: number; height: number };
    }) => void;
}

const SHELVES_ENTER_TOTAL_MS = 1200;
const SHOP_EXIT_MS = 300;

export const GiftShop: React.FC<GiftShopProps> = ({
    onOpenDeckRemoval,
    onOpenEnhanceCards,
    isExiting = false,
    onEnterAnimationComplete,
    onExitAnimationComplete,
    onRelicPurchased
}) => {
    const { inventory, shopItems, buyShopItem, comps, restockGiftShop, giftShopRestockCost, getMaxCharms, getMaxAngles, isSellingMode, toggleSellingMode, selectedCityId, round } = useGameStore();
    const city = CITY_DEFINITIONS.find(c => c.id === selectedCityId);
    const disabledButtons = city?.getGiftShopDisabledButtons?.(round - 1) || [];

    const [fullSlotErrorItemId, setFullSlotErrorItemId] = React.useState<string | null>(null);

    const signRef = useRef<HTMLDivElement>(null);
    const rope1Ref = useRef<SVGPolylineElement>(null);
    const rope2Ref = useRef<SVGPolylineElement>(null);
    const isExitingRef = useRef(isExiting);
    const isSellingModeRef = useRef(isSellingMode);
    const hasFiredEnterCompleteRef = useRef(false);
    const hasFiredExitCompleteRef = useRef(false);
    const exitStartTimeRef = useRef<number | null>(null);
    const hasAppliedSignExitBoostRef = useRef(false);

    const { viewportWidth, viewportHeight, scale } = useLayout();
    const layoutRef = useRef({ viewportWidth, viewportHeight, scale });

    useEffect(() => {
        layoutRef.current = { viewportWidth, viewportHeight, scale };
    }, [viewportWidth, viewportHeight, scale]);

    useEffect(() => {
        isExitingRef.current = isExiting;
    }, [isExiting]);

    useEffect(() => {
        if (isSellingModeRef.current && !isSellingMode) {
            hasFiredEnterCompleteRef.current = false;
            exitStartTimeRef.current = null;
            hasAppliedSignExitBoostRef.current = false;
        }
        isSellingModeRef.current = isSellingMode;
    }, [isSellingMode]);

    useEffect(() => {
        const signEl = signRef.current;
        if (!signEl) return;

        const { Engine, Bodies, Body, Composite, Constraint } = Matter;
        const engine = Engine.create({
            positionIterations: 10,
            velocityIterations: 10
        });
        const world = engine.world;

        const initialLayout = layoutRef.current;
        const signRect = signEl.getBoundingClientRect();
        const width = (signRect.width / initialLayout.scale) || 400;
        const height = (signRect.height / initialLayout.scale) || 120;
        const startX = initialLayout.viewportWidth / 2;
        const startY = -250;
        const noCollisionGroup = -1;

        const signBody = Bodies.rectangle(startX, startY, width, height, {
            restitution: 0,
            frictionAir: 0.01,
            density: 1.5,
            collisionFilter: { group: noCollisionGroup }
        });

        const ropeAnchorY = 0;
        const anchorOffset = width / 2 - 30;

        const getAnchorPositions = (curWidth: number) => {
            const centerX = curWidth / 2;
            return {
                left: { x: centerX - anchorOffset, y: ropeAnchorY },
                right: { x: centerX + anchorOffset, y: ropeAnchorY }
            };
        };

        const initialAnchors = getAnchorPositions(initialLayout.viewportWidth);

        const segmentSize = 10;
        const segmentW = 4;

        const createRopeChain = (segments: number, sX: number, sY: number) => {
            const bodies: Matter.Body[] = [];
            for (let i = 0; i < segments; i++) {
                const body = Bodies.rectangle(sX, sY + i * 5, segmentW, segmentSize, {
                    collisionFilter: { group: noCollisionGroup },
                    frictionAir: 0.05,
                    density: 8,
                    render: { visible: false }
                });
                bodies.push(body);
            }
            const constraints: Matter.Constraint[] = [];
            for (let i = 0; i < bodies.length - 1; i++) {
                constraints.push(Constraint.create({
                    bodyA: bodies[i],
                    bodyB: bodies[i + 1],
                    pointA: { x: 0, y: segmentSize / 2 },
                    pointB: { x: 0, y: -segmentSize / 2 },
                    stiffness: 1,
                    damping: 0.1,
                    length: 0
                }));
            }
            return { bodies, constraints };
        };

        const leftSegments = 15;
        const rightSegments = 12;

        const ropeL = createRopeChain(leftSegments, initialAnchors.left.x, startY);
        const ropeR = createRopeChain(rightSegments, initialAnchors.right.x, startY);

        const attachToAnchor = (rope: { bodies: Matter.Body[] }, anchor: { x: number; y: number }) => {
            return Constraint.create({
                bodyB: rope.bodies[0],
                pointB: { x: 0, y: -segmentSize / 2 },
                pointA: { ...anchor },
                stiffness: 1,
                damping: 0.1,
                length: 0
            });
        };

        const signAttachLeftLocal = { x: -anchorOffset, y: -height / 2 + 10 };
        const signAttachRightLocal = { x: anchorOffset, y: -height / 2 + 10 };

        const attachToSign = (rope: { bodies: Matter.Body[] }, signPoint: { x: number; y: number }) => {
            return Constraint.create({
                bodyA: rope.bodies[rope.bodies.length - 1],
                pointA: { x: 0, y: segmentSize / 2 },
                bodyB: signBody,
                pointB: signPoint,
                stiffness: 1,
                damping: 0.1,
                length: 0
            });
        };

        const cL1 = attachToAnchor(ropeL, initialAnchors.left);
        const cL2 = attachToSign(ropeL, signAttachLeftLocal);
        const cR1 = attachToAnchor(ropeR, initialAnchors.right);
        const cR2 = attachToSign(ropeR, signAttachRightLocal);

        Composite.add(world, [
            signBody,
            ...ropeL.bodies, ...ropeL.constraints, cL1, cL2,
            ...ropeR.bodies, ...ropeR.constraints, cR1, cR2
        ]);

        let reqId: number;
        const runner = () => {
            const { viewportWidth } = layoutRef.current;

            const currentAnchors = getAnchorPositions(viewportWidth);
            cL1.pointA.x = currentAnchors.left.x;
            cL1.pointA.y = currentAnchors.left.y;
            cR1.pointA.x = currentAnchors.right.x;
            cR1.pointA.y = currentAnchors.right.y;

            Engine.update(engine, 1000 / 60);

            if (signEl) {
                const { x, y } = signBody.position;
                const angle = signBody.angle;
                let signExitOffsetY = 0;
                let signOpacity = 1;
                const effectiveExiting = isExitingRef.current || isSellingModeRef.current;
                
                if (effectiveExiting) {
                    if (exitStartTimeRef.current === null) {
                        exitStartTimeRef.current = performance.now();
                    }
                    if (!hasAppliedSignExitBoostRef.current) {
                        hasAppliedSignExitBoostRef.current = true;
                        Body.setVelocity(signBody, { x: signBody.velocity.x, y: -18 });
                    }
                    const elapsed = performance.now() - exitStartTimeRef.current;
                    const progress = Math.max(0, Math.min(1, elapsed / SHOP_EXIT_MS));
                    signExitOffsetY = -220 * progress;
                    signOpacity = 1 - progress;
                } else {
                    // Sign is visible/active
                    // If it was previously exiting, we reset the boost flag in the useEffect above
                }
                signEl.style.opacity = `${signOpacity}`;
                signEl.style.transform = `translate3d(${x - width / 2}px, ${y - height / 2 + signExitOffsetY}px, 0) rotate(${angle}rad)`;
            }

            const drawRope = (bodies: Matter.Body[], ref: SVGPolylineElement | null, anchor: { x: number; y: number }) => {
                if (!ref) return;
                let pts = `${anchor.x},${anchor.y}`;
                bodies.forEach(b => {
                    pts += ` ${b.position.x},${b.position.y}`;
                });
                ref.setAttribute('points', pts);
            };

            drawRope(ropeL.bodies, rope1Ref.current, cL1.pointA);
            drawRope(ropeR.bodies, rope2Ref.current, cR1.pointA);

            reqId = requestAnimationFrame(runner);
        };
        runner();

        return () => {
            cancelAnimationFrame(reqId);
            Matter.World.clear(world, false);
            Matter.Engine.clear(engine);
        };
    }, []);

    useEffect(() => {
        if (isExiting) return;
        hasFiredEnterCompleteRef.current = false;
        const timeoutId = window.setTimeout(() => {
            if (hasFiredEnterCompleteRef.current) return;
            hasFiredEnterCompleteRef.current = true;
            onEnterAnimationComplete?.();
        }, SHELVES_ENTER_TOTAL_MS + 80);
        return () => window.clearTimeout(timeoutId);
    }, [isExiting, onEnterAnimationComplete]);

    useEffect(() => {
        if (!isExiting) {
            hasFiredExitCompleteRef.current = false;
            exitStartTimeRef.current = null;
            hasAppliedSignExitBoostRef.current = false;
            return;
        }
        const timeoutId = window.setTimeout(() => {
            if (hasFiredExitCompleteRef.current) return;
            hasFiredExitCompleteRef.current = true;
            onExitAnimationComplete?.();
        }, SHOP_EXIT_MS + 60);
        return () => window.clearTimeout(timeoutId);
    }, [isExiting, onExitAnimationComplete]);

    const charms = shopItems.filter(i => i.type === 'Charm');
    const angles = shopItems.filter(i => i.type === 'Angle');
    const tableActions = shopItems.filter(i => i.type === 'TableAction');
    const charmSlots = Array.from({ length: 3 }, (_, i) => charms[i] ?? null);
    const angleSlot = angles[0] ?? null;
    const tableActionSlot = tableActions[0] ?? null;
    const canAffordRestock = comps >= giftShopRestockCost;
    const hasNoCharms = charms.length === 0;
    const hasNoAngles = !angleSlot;
    const hasNoTableActions = !tableActionSlot;

    const renderItem = (item: typeof shopItems[number]) => {
        const isSoldRelic = (item.type === 'Charm' || item.type === 'Angle' || item.type === 'TableAction') && !!item.purchased;

        const canAfford = comps >= item.cost;

        const config = RelicManager.getRelicConfig(item.id);
        if (!config) return null;

        const isAngle = item.type === 'Angle';
        const isDisabled = !canAfford || isSoldRelic;

        return (
            <div
                key={item.id}
                className={styles.relicRow}
                style={{
                    zIndex: 1
                }}
            >
                {fullSlotErrorItemId === item.id && (
                    <div className={styles.slotsFullPopup}>Slots Full</div>
                )}
                <div
                    onClick={(event) => {
                        if (isDisabled) return;
                        const iconEl = event.currentTarget.querySelector('[data-relic-icon="true"]') as HTMLElement | null;
                        const titleEl = event.currentTarget.querySelector('[data-relic-title="true"]') as HTMLElement | null;
                        const fallbackRect = event.currentTarget.getBoundingClientRect();
                        const iconRect = iconEl?.getBoundingClientRect();
                        const titleRect = titleEl?.getBoundingClientRect();
                        const sourceRect = (() => {
                            if (!iconEl || !titleEl) return fallbackRect;
                            if (!iconRect || !titleRect) return fallbackRect;
                            const left = Math.min(iconRect.left, titleRect.left);
                            const top = Math.min(iconRect.top, titleRect.top);
                            const right = Math.max(iconRect.right, titleRect.right);
                            const bottom = Math.max(iconRect.bottom, titleRect.bottom);
                            return new DOMRect(left, top, right - left, bottom - top);
                        })();
                        const isCharm = config.categories.includes('Charm');
                        const isAngle = config.categories.includes('Angle');

                        if (isCharm) {
                            const currentCharms = inventory.filter(inst => {
                                const cfg = RelicManager.getRelicConfig(inst.id);
                                return cfg?.categories.includes('Charm');
                            }).length;
                            if (currentCharms >= getMaxCharms()) {
                                setFullSlotErrorItemId(item.id);
                                setTimeout(() => setFullSlotErrorItemId(null), 1500);
                                return;
                            }
                        }

                        if (isAngle) {
                            const currentAngles = inventory.filter(inst => {
                                const cfg = RelicManager.getRelicConfig(inst.id);
                                return cfg?.categories.includes('Angle');
                            }).length;
                            if (currentAngles >= getMaxAngles()) {
                                setFullSlotErrorItemId(item.id);
                                setTimeout(() => setFullSlotErrorItemId(null), 1500);
                                return;
                            }
                        }

                        flushSync(() => {
                            onRelicPurchased?.({
                                relicId: item.id,
                                relicType: isAngle ? 'Angle' : 'Charm',
                                icon: config.icon ?? null,
                                name: item.nameOverride || config.handType?.name || config.name,
                                sourceRect: sourceRect
                                    ? { left: sourceRect.left, top: sourceRect.top, width: sourceRect.width, height: sourceRect.height }
                                    : { left: 0, top: 0, width: 0, height: 0 }
                            });
                        });
                        buyShopItem(item.id);
                    }}
                    className={`${styles.expandedRelicCard} ${isAngle ? styles.expandedRelicCardAngle : ''} ${isSoldRelic ? styles.expandedRelicCardSold : ''} ${isDisabled ? styles.expandedRelicCardDisabled : ''}`}
                >
                    <RelicTooltip
                        relic={config}
                        displayValues={config.properties || {}}
                        isRightAligned={isAngle}
                        className={styles.expandedRelicTooltip}
                        style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '2px solid #444',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                            pointerEvents: 'none',
                            animation: 'none',
                            width: '100%',
                            minWidth: 0,
                            maxWidth: 'none'
                        }}
                    />
                    <div
                        className={`${styles.expandedRelicPrice} ${isAngle ? styles.expandedRelicPriceAngle : ''} ${isSoldRelic ? styles.expandedRelicPriceSold : ''} ${!canAfford && !isSoldRelic ? styles.expandedRelicPriceLocked : ''}`}
                    >
                        {isSoldRelic ? 'SOLD' : `₵${item.cost}`}
                    </div>
                </div>
            </div>
        );
    };

    const handleShelvesAnimationEnd = (event: React.AnimationEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.animationName === 'giftShopShelvesEnter') {
            if (hasFiredEnterCompleteRef.current) return;
            hasFiredEnterCompleteRef.current = true;
            onEnterAnimationComplete?.();
            return;
        }
        if (event.animationName === 'giftShopShelvesExit') {
            if (!isExiting) return;
            if (hasFiredExitCompleteRef.current) return;
            hasFiredExitCompleteRef.current = true;
            onExitAnimationComplete?.();
        }
    };

    const effectiveExiting = isExiting || isSellingMode;

    return (
        <div className={`${styles.giftShopContainer} ${isExiting ? styles.giftShopContainerExiting : ''}`}>
            <svg className={`${styles.ropesLayer} ${effectiveExiting ? styles.ropesLayerExiting : ''}`}>
                <polyline ref={rope1Ref} fill="none" stroke="#8d6e63" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <polyline ref={rope2Ref} fill="none" stroke="#8d6e63" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>

            <div ref={signRef} className={styles.signContainer}>
                <div className={styles.signText}>Gift Shop</div>
            </div>

            <div
                className={`${styles.shelvesContainer} ${effectiveExiting ? styles.shelvesContainerExiting : ''}`}
                onAnimationEnd={handleShelvesAnimationEnd}
            >
                <div className={styles.shelvesContentRow}>
                    <div className={styles.leftShelf}>
                        <div className={styles.zoneHeader}>CHARMS</div>
                        <div id="gift-shop-charms" className={styles.charmsList}>
                            {charmSlots.map((item, index) => (
                                <div key={item?.id ?? `empty_charm_${index}`} className={styles.itemSlot}>
                                    {item ? renderItem(item) : <div className={styles.emptySlot} />}
                                </div>
                            ))}
                            {hasNoCharms && <div className={styles.soldOutStamp}>NO STOCK</div>}
                        </div>
                    </div>

                    <div className={styles.rightShelf}>
                        <div className={styles.zoneHeader}>ANGLES</div>
                        <div className={styles.rightShelfRows}>
                            <div id="gift-shop-angles" className={`${styles.itemSlot} ${styles.rightShelfRow}`}>
                                {angleSlot ? renderItem(angleSlot) : <div className={styles.emptySlot} />}
                                {hasNoAngles && <div className={styles.soldOutStamp}>NO STOCK</div>}
                            </div>
                            <div className={`${styles.itemSlot} ${styles.rightShelfSpacer}`}>
                                <div className={styles.emptySlot} />
                            </div>
                            <div id="gift-shop-table-actions" className={`${styles.itemSlot} ${styles.rightShelfRow}`}>
                                <div className={`${styles.zoneHeader} ${styles.tableActionHeader}`}>TABLE ACTION</div>
                                {tableActionSlot ? renderItem(tableActionSlot) : <div className={styles.emptySlot} />}
                                {hasNoTableActions && <div className={styles.soldOutStamp}>NO STOCK</div>}
                            </div>
                    </div>
                </div>
            </div>
                <div className={styles.bottomActionRow}>
                    <button
                        id="gift-shop-sell-button"
                        className={`${styles.bottomActionButton} ${styles.sellActionButton} ${disabledButtons.includes('sell') ? styles.actionButtonDisabled : ''}`}
                        onClick={() => !disabledButtons.includes('sell') && toggleSellingMode(true)}
                        disabled={disabledButtons.includes('sell')}
                    >
                        SELL
                    </button>
                    <button
                        id="gift-shop-enhance-button"
                        className={`${styles.bottomActionButton} ${styles.enhanceActionButton} ${disabledButtons.includes('enhance') ? styles.actionButtonDisabled : ''}`}
                        onClick={() => !disabledButtons.includes('enhance') && onOpenEnhanceCards()}
                        disabled={disabledButtons.includes('enhance')}
                    >
                        ENHANCE
                    </button>
                    <button
                        id="gift-shop-destroy-button"
                        className={`${styles.bottomActionButton} ${styles.destroyActionButton} ${disabledButtons.includes('destroy') ? styles.actionButtonDisabled : ''}`}
                        onClick={() => !disabledButtons.includes('destroy') && onOpenDeckRemoval()}
                        disabled={disabledButtons.includes('destroy')}
                    >
                        DESTROY
                    </button>
                    <button
                        id="gift-shop-restock-button"
                        className={`${styles.bottomActionButton} ${styles.restockActionButton} ${(!canAffordRestock || disabledButtons.includes('restock')) ? styles.actionButtonDisabled : ''}`}
                        onClick={restockGiftShop}
                        disabled={!canAffordRestock || disabledButtons.includes('restock')}
                    >
                        {disabledButtons.includes('restock') ? 'RESTOCK' : `RESTOCK ₵${giftShopRestockCost}`}
                    </button>
                </div>
            </div>
        </div>
    );
};
