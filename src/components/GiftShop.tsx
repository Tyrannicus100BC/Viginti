import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { useGameStore } from '../store/gameStore';
import { RelicManager } from '../logic/relics/manager';
import { RelicTooltip } from './RelicTooltip';
import { PlayingCard } from './PlayingCard';
import { useLayout } from './ResponsiveLayout';
import styles from './GiftShop.module.css';

interface GiftShopProps {
    onOpenDeckRemoval: () => void;
    onOpenEnhanceCards: () => void;
}

export const GiftShop: React.FC<GiftShopProps> = ({ onOpenDeckRemoval, onOpenEnhanceCards }) => {
    const { shopItems, buyShopItem, comps, restockGiftShop, giftShopRestockCost } = useGameStore();

    const signRef = useRef<HTMLDivElement>(null);
    const rope1Ref = useRef<SVGPolylineElement>(null);
    const rope2Ref = useRef<SVGPolylineElement>(null);

    const { viewportWidth, viewportHeight, scale } = useLayout();
    const layoutRef = useRef({ viewportWidth, viewportHeight, scale });

    useEffect(() => {
        layoutRef.current = { viewportWidth, viewportHeight, scale };
    }, [viewportWidth, viewportHeight, scale]);

    useEffect(() => {
        const signEl = signRef.current;
        if (!signEl) return;

        const { Engine, Bodies, Composite, Constraint } = Matter;
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
                signEl.style.transform = `translate3d(${x - width / 2}px, ${y - height / 2}px, 0) rotate(${angle}rad)`;
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

    const charms = shopItems.filter(i => i.type === 'Charm');
    const angles = shopItems.filter(i => i.type === 'Angle');
    const cards = shopItems.filter(i => i.type === 'Card');
    const charmSlots = Array.from({ length: 3 }, (_, i) => charms[i] ?? null);
    const angleSlots = Array.from({ length: 2 }, (_, i) => angles[i] ?? null);
    const canAffordRestock = comps >= giftShopRestockCost;
    const hasNoCharms = charms.length === 0;
    const hasNoAngles = angles.length === 0;
    const hasNoCards = cards.length === 0;

    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const renderItem = (item: typeof shopItems[number]) => {
        const isSoldCharm = item.type === 'Charm' && item.purchased;

        if (item.purchased && !isSoldCharm) {
            return <div className={styles.emptySlot} />;
        }

        const canAfford = comps >= item.cost;

        if (item.type === 'Card' && item.card) {
            const isHovered = hoveredId === item.id;
            const isDisabled = !canAfford;

            return (
                <div
                    key={item.id}
                    onClick={() => {
                        if (!isDisabled) buyShopItem(item.id);
                    }}
                    onMouseEnter={() => {
                        if (!isDisabled) setHoveredId(item.id);
                    }}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`${styles.cardSlot} ${isDisabled ? styles.itemDisabled : ''}`}
                    style={{
                        transform: isHovered && !isDisabled ? 'translateY(-4px) scale(1.05)' : 'translateY(0) scale(1)',
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        zIndex: isHovered && !isDisabled ? 2000 : 1
                    }}
                >
                    <div className={styles.cardWrapper}>
                        <PlayingCard card={item.card} isDrawn={true} suppressEnterAnimation />
                    </div>
                    <div className={`${styles.priceTag} ${!canAfford ? styles.priceTagLocked : ''}`}>
                        ₵{item.cost}
                    </div>
                </div>
            );
        }

        const config = RelicManager.getRelicConfig(item.id);
        if (!config) return null;

        const isAngle = item.type === 'Angle';
        const isDisabled = !canAfford || isSoldCharm;

        return (
            <div
                key={item.id}
                className={styles.relicRow}
                style={{
                    zIndex: 1
                }}
            >
                <div
                    onClick={() => {
                        if (!isDisabled) buyShopItem(item.id);
                    }}
                    className={`${styles.expandedRelicCard} ${isAngle ? styles.expandedRelicCardAngle : ''} ${isSoldCharm ? styles.expandedRelicCardSold : ''} ${isDisabled ? styles.expandedRelicCardDisabled : ''}`}
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
                        className={`${styles.expandedRelicPrice} ${isAngle ? styles.expandedRelicPriceAngle : ''} ${isSoldCharm ? styles.expandedRelicPriceSold : ''} ${!canAfford && !isSoldCharm ? styles.expandedRelicPriceLocked : ''}`}
                    >
                        {isSoldCharm ? 'SOLD' : `₵${item.cost}`}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={styles.giftShopContainer}>
            <svg className={styles.ropesLayer}>
                <polyline ref={rope1Ref} fill="none" stroke="#8d6e63" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <polyline ref={rope2Ref} fill="none" stroke="#8d6e63" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>

            <div ref={signRef} className={styles.signContainer}>
                <div className={styles.signText}>Gift Shop</div>
            </div>

            <div className={styles.shelvesContainer}>
                <div className={styles.shelvesContentRow}>
                    <div className={styles.leftShelf}>
                        <div className={styles.zoneHeader}>CHARMS</div>
                        <div className={styles.charmsList}>
                            {charmSlots.map((item, index) => (
                                <div key={item?.id ?? `empty_charm_${index}`} className={styles.itemSlot}>
                                    {item ? renderItem(item) : <div className={styles.emptySlot} />}
                                </div>
                            ))}
                            {hasNoCharms && <div className={styles.soldOutStamp}>NO STOCK</div>}
                        </div>
                    </div>

                    <div className={styles.rightShelf}>
                        <div className={styles.anglesZone}>
                            <div className={styles.zoneHeader}>ANGLES</div>
                            <div className={styles.anglesList}>
                                {angleSlots.map((item, index) => (
                                    <div key={item?.id ?? `empty_angle_${index}`} className={styles.itemSlot}>
                                        {item ? renderItem(item) : <div className={styles.emptySlot} />}
                                    </div>
                                ))}
                                {hasNoAngles && <div className={styles.soldOutStamp}>NO STOCK</div>}
                            </div>
                        </div>
                        <div className={styles.cardsZone}>
                            <div className={styles.zoneHeader}>CARDS</div>
                            <div className={styles.cardsGrid}>
                                {cards.map(item => (
                                    <div key={item.id} className={styles.itemSlot}>
                                        {renderItem(item)}
                                    </div>
                                ))}
                                {hasNoCards && <div className={styles.soldOutStamp}>NO STOCK</div>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.bottomActionRow}>
                    <button
                        className={`${styles.bottomActionButton} ${styles.enhanceActionButton}`}
                        onClick={onOpenEnhanceCards}
                    >
                        ENHANCE CARDS
                    </button>
                    <button
                        className={`${styles.bottomActionButton} ${styles.removeActionButton}`}
                        onClick={onOpenDeckRemoval}
                    >
                        REMOVE CARDS
                    </button>
                    <button
                        className={`${styles.bottomActionButton} ${styles.restockActionButton} ${!canAffordRestock ? styles.actionButtonDisabled : ''}`}
                        onClick={restockGiftShop}
                        disabled={!canAffordRestock}
                    >
                        {`RESTOCK ₵${giftShopRestockCost}`}
                    </button>
                </div>
            </div>
        </div>
    );
};
