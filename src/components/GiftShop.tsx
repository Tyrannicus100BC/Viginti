import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { RelicManager } from '../logic/relics/manager';
import { TrashButton } from './HeaderButtons';
import styles from './GiftShop.module.css';
import { TransparentImage } from './TransparentImage';
import { RelicTooltip } from './RelicTooltip';
import Matter from 'matter-js';
import { useLayout } from './ResponsiveLayout';
import { PlayingCard } from './PlayingCard';

interface GiftShopProps {
    onOpenDeckRemoval: () => void;
    onOpenEnhanceCards: () => void;
}

export const GiftShop: React.FC<GiftShopProps> = ({ onOpenDeckRemoval, onOpenEnhanceCards }) => {
    const { shopItems, selectedShopItemId, confirmShopSelection } = useGameStore();

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
        // Create engine with higher iterations for stable chain simulation
        const engine = Engine.create({
            positionIterations: 10,
            velocityIterations: 10
        });
        const world = engine.world;

        // Config - use virtual centered coordinates
        const initialLayout = layoutRef.current;
        const signRect = signEl.getBoundingClientRect();
        const width = (signRect.width / initialLayout.scale) || 400;
        const height = (signRect.height / initialLayout.scale) || 120;
        const startX = initialLayout.viewportWidth / 2;
        const startY = -250; 
        const noCollisionGroup = -1;

        // 1. Sign Body
        const signBody = Bodies.rectangle(startX, startY, width, height, {
            restitution: 0, 
            frictionAir: 0.01, // Low drag for fast fall
            density: 1.5,
            collisionFilter: { group: noCollisionGroup }
        });

        // 2. Ropes
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
                    bodyB: bodies[i+1],
                    pointA: { x: 0, y: segmentSize/2 },
                    pointB: { x: 0, y: -segmentSize/2 },
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

        // 3. Attachments
        const attachToAnchor = (rope: { bodies: Matter.Body[] }, anchor: {x:number, y:number}) => {
            return Constraint.create({
                bodyB: rope.bodies[0],
                pointB: { x: 0, y: -segmentSize/2 },
                pointA: { ...anchor }, 
                stiffness: 1,
                damping: 0.1,
                length: 0
            });
        };

        const signAttachLeftLocal = { x: -anchorOffset, y: -height/2 + 10 }; 
        const signAttachRightLocal = { x: anchorOffset, y: -height/2 + 10 };

        const attachToSign = (rope: { bodies: Matter.Body[] }, signPoint: {x:number, y:number}) => {
            return Constraint.create({
                bodyA: rope.bodies[rope.bodies.length - 1],
                pointA: { x: 0, y: segmentSize/2 }, 
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
            
            // Sync anchor points to viewport center if it shifted
            const currentAnchors = getAnchorPositions(viewportWidth);
            cL1.pointA.x = currentAnchors.left.x;
            cL1.pointA.y = currentAnchors.left.y;
            cR1.pointA.x = currentAnchors.right.x;
            cR1.pointA.y = currentAnchors.right.y;

            Engine.update(engine, 1000 / 60);

            if (signEl) {
                const { x, y } = signBody.position;
                const angle = signBody.angle;
                signEl.style.transform = `translate3d(${x - width/2}px, ${y - height/2}px, 0) rotate(${angle}rad)`;
            }

            const drawRope = (bodies: Matter.Body[], ref: SVGPolylineElement | null, anchor: {x:number, y:number}) => {
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

    // Check if any relic is purchased
    const isRelicPurchased = shopItems.some(i => (i.type === 'Charm' || i.type === 'Angle') && i.purchased);

    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const renderItem = (item: { id: string, type: 'Charm' | 'Angle' | 'Card', card?: any, purchased?: boolean }) => {
        if (item.purchased) {
             return <div style={{ width: '100%', height: '100%' }} />; // Blank spot
        }
        if (item.type === 'Card' && item.card) {
            const isHovered = hoveredId === item.id;
            return (
                <div 
                    key={item.id}
                    onClick={() => confirmShopSelection(item.id)}
                    onMouseEnter={() => setHoveredId(item.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                        transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                        transition: 'transform 0.2s ease',
                        cursor: 'pointer',
                        zIndex: isHovered ? 2000 : 1
                    }}
                >
                    <div style={{ transform: 'scale(0.8)', transformOrigin: 'center' }}>
                         <PlayingCard card={item.card} isFaceUp={true} />
                    </div>
                </div>
            );
        }

        const config = RelicManager.getRelicConfig(item.id);
        if (!config) return null;

        const isSelected = selectedShopItemId === item.id;
        const isHovered = hoveredId === item.id;
        const isAngle = item.type === 'Angle';
        
        // Disabled if another relic is bought and this one matches relic type restrictions
        // Requirement: "all of the unchosen relics should darken"
        // Since Charms/Angles are all "Relics", if ANY is bought, ALL others darken.
        const isDisabled = isRelicPurchased && !item.purchased;

        const borderStyle = isSelected ? '3px solid #f39c12' : (isDisabled ? '3px solid #555' : '3px solid rgba(255, 215, 0, 0.6)');

        return (
            <div 
                key={item.id}
                style={{ 
                    position: 'relative',
                    zIndex: isHovered ? 2000 : (isSelected ? 10 : 1),
                    width: '100%',
                    display: 'flex',
                    justifyContent: isAngle ? 'flex-end' : 'flex-start',
                    opacity: 1,
                    pointerEvents: isDisabled ? 'none' : 'auto',
                    filter: isDisabled ? 'grayscale(1) brightness(0.4)' : 'none'
                }}>
                {isHovered && (
                    <RelicTooltip 
                        relic={config}
                        displayValues={config.properties || {}}
                        hideIcon={true}
                        layout="horizontal"
                        direction={isAngle ? "rtl" : "ltr"}
                        isRightAligned={isAngle}
                        style={{
                            position: 'absolute', 
                            top: -11,
                            left: isAngle ? 'auto' : -21,
                            right: isAngle ? -21 : 'auto',
                            pointerEvents: 'none'
                        }}
                    />
                )}
                <div 
                    onClick={() => confirmShopSelection(item.id)}
                    onMouseEnter={() => setHoveredId(item.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                        minWidth: 160,
                        height: 40,
                        borderRadius: '20px',
                        background: 'transparent',
                        border: 'none', 
                        transform: isSelected ? 'scale(1.1)' : (isHovered ? 'scale(1.05)' : 'scale(1)'),
                        transition: 'transform 0.2s ease, background 0.2s, border-color 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        flexDirection: isAngle ? 'row-reverse' : 'row',
                        position: 'relative',
                        cursor: 'pointer',
                        pointerEvents: 'auto',
                        paddingRight: isAngle ? 0 : 8,
                        paddingLeft: isAngle ? 8 : 0,
                    }}
                >
                    {/* Icon Circle */}
                    <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: isSelected ? '#f1c40f' : '#2c3e50',
                        border: borderStyle, 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
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
                                    filter: isSelected ? 'brightness(1.2) drop-shadow(0 0 5px rgba(255,255,255,0.5))' : 'none'
                                }} 
                                />
                            ) : (
                                <div style={{
                                    fontSize: '0.6rem',
                                    fontWeight: 'bold',
                                    textAlign: 'center',
                                    color: isSelected ? '#fff' : '#ecf0f1',
                                    padding: 2
                                }}>
                                    {config.name.substring(0, 2).toUpperCase()}
                                </div>
                            )}
                    </div>
                    
                    {/* Name Label */}
                    <div style={{
                        marginLeft: isAngle ? 0 : 10,
                        marginRight: isAngle ? 10 : 0,
                        color: isSelected ? '#f1c40f' : '#fff',
                        fontWeight: 'bold',
                        fontSize: '0.9rem',
                        whiteSpace: 'nowrap',
                        textShadow: '0 1px 2px rgba(0,0,0,0.8)'
                    }}>
                        {config.handType?.name || config.name}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={styles.giftShopContainer}>
            {/* Ropes Layer */}
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 40 }}>
                <polyline ref={rope1Ref} fill="none" stroke="#8d6e63" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <polyline ref={rope2Ref} fill="none" stroke="#8d6e63" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>

            <div ref={signRef} className={styles.signContainer}>
                <div className={styles.signText}>Gift Shop</div>
            </div>
            
            <div className={styles.shelvesContainer}>
                {/* Column 1: Charms */}
                <div className={styles.leftShelf}>
                    <div className={styles.zoneHeader}>CHARMS</div>
                    <div className={styles.charmsList}>
                        {charms.map(item => (
                            <div key={item.id} className={styles.itemSlot}>
                                {renderItem(item)}
                            </div>
                        ))}
                    </div>
                    {/* Buttons - Full width, bottom */}
                    <button 
                        className={styles.shopEnhanceButton}
                        onClick={onOpenEnhanceCards}
                        style={{ marginBottom: 10 }}
                    >
                        ENHANCE CARDS
                    </button>
                    <button 
                        className={styles.shopTrashButton}
                        onClick={onOpenDeckRemoval}
                    >
                        REMOVE CARDS
                    </button>
                </div>

                {/* Column 2: Angles & Cards */}
                <div className={styles.rightShelf}>
                    <div className={styles.anglesZone}>
                        <div className={styles.zoneHeader}>ANGLES</div>
                        <div className={styles.anglesList}>
                            {angles.map(item => (
                                <div key={item.id} className={styles.itemSlot}>
                                    {renderItem(item)}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className={styles.cardsZone}>
                        {cards.map(item => (
                            <div key={item.id} className={styles.itemSlot}>
                                {renderItem(item)}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
