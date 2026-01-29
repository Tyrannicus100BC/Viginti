import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import styles from '../App.module.css';
import { useGameStore } from '../store/gameStore';
import { DeckView } from '../components/DeckView';
import { HandRankingsView } from '../components/HandRankingsView';

import { CasinoListingView } from '../components/CasinoListingView';
import { RelicStore } from '../components/RelicStore';
import { EventsModule } from '../components/EventsModule';
import { type RouletteEvent } from '../logic/events';
import { getNodeValue, TOTAL_NODES } from '../logic/rouletteNodes';
import { PlayerIcon } from '../components/PlayerIcon';
import bluePokerChip from '../assets/blue_poker_chip.png';


// --- Types ---
interface RouletteBoardProps {
    onClose: () => void;
}

// --- Constants ---
const TOTAL_SPACES = TOTAL_NODES;
const WEDGE_ANGLE = 360 / TOTAL_SPACES; // ~18.95 degrees

// Dimensions
const BOARD_SIZE = 800;
const BOARD_RADIUS = BOARD_SIZE / 2;

// Visual Radius Layers (Outer -> Inner)
const R_FULL_RIM = 380; // Gold Edge
const R_BOWL_OUTER = 370; // Start of Wood Bowl
const R_TRACK_OUTER = 340; // Start of Sloped Track
const R_WHEEL_OUTER = 295; // Number Ring Outer Edge
const R_POCKETS_OUTER = 260; // Separator Ring
const R_POCKETS_INNER = 150; // Inner edge of pockets
const R_CONE_BASE = 150; // Start of Inner Wood Cone
const R_TURRET_BASE = 40; // Gold Centerpiece

// Physics Constraints (Ball Movement Area)

// Physics Constants
const BALL_RADIUS = 12; // Slightly larger
const SPIN_FORCE = 0.35; // Even faster initial push
const FRICTION_AIR = 0.002; // Keep low air resistance

// Colors
const COLOR_GOLD_LIGHT = '#FDF5C0';
const COLOR_GOLD_MED = '#D4AF37';
const COLOR_GOLD_DARK = '#AA771C';
const COLOR_RED = '#8B0000'; // Deep Red
const COLOR_BLACK = '#1a1a1a'; // Soft Black
const COLOR_GREEN = '#006400'; // Dark Green


const NodeIcon: React.FC<{ event: RouletteEvent }> = ({ event }) => {
    if (!event) return null;

    switch (event.type) {
        case 'Shop':
            // Dollar Sign ($)
            return (
                <text
                    fill="#ffd700"
                    fontSize="24"
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.8))' }}
                >
                    $
                </text>
            );
        case 'Boss':
            // Keep existing Boss Icon or simple text if preferred, but user didn't ask to change Boss specifically other than "none placed on boss"
            // I'll keep the existing Boss icon structure but maybe simplify to ensure it works, or just return the visual.
            // Actually, the user didn't ask to change Boss icon, but I'll leave it as is or similar.
            // Let's use a skull or similar for Boss if we want, or keep the previous SVG.
            // The previous one was a castle/skull thing. I'll just keep it consistent/simple.
            return (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
            );
        case 'Blackjack':
            if (event.isBaseGame) return null; // Don't show icon for base game (standard nodes)
            // Two cards one on top of the other, face down
            return (
                <g>
                    {/* Bottom Card */}
                    <rect x="-8" y="-6" width="14" height="20" rx="2" fill="#eee" stroke="#333" strokeWidth="1" transform="rotate(-15)" />
                    <rect x="-6" y="-4" width="10" height="16" rx="1" fill="#b71c1c" transform="rotate(-15)" /> {/* Card Back Pattern */}

                    {/* Top Card */}
                    <rect x="-2" y="-6" width="14" height="20" rx="2" fill="#eee" stroke="#333" strokeWidth="1" transform="rotate(10)" />
                    <rect x="0" y="-4" width="10" height="16" rx="1" fill="#b71c1c" transform="rotate(10)" />   {/* Card Back Pattern */}
                </g>
            );
        case 'Random':
            // Question Mark (?)
            return (
                <text
                    fill="white"
                    fontSize="24"
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.8))' }}
                >
                    ?
                </text>
            );
        default:
            return <text fill="white" fontSize="14">?</text>;
    }
};

export const RouletteBoard: React.FC<RouletteBoardProps> = ({ onClose }) => {
    // --- State ---
    const {
        round,
        targetScore,
        totalScore,
        handsRemaining,
        comps,
        deck,
        dealer,
        playerHands,
        drawnCard,
        discardPile,
        triggerDebugChips,
        movesRemaining,
        maxMoves,
        chips,
        decrementMoves,
        triggerGameOver,
        triggerEvent,
        boardConfig
    } = useGameStore();

    const [showDeck, setShowDeck] = useState(false);
    const [showHandRankings, setShowHandRankings] = useState(false);
    const [showCasinoListing, setShowCasinoListing] = useState(false);
    const [showRelicStore, setShowRelicStore] = useState(false);

    const activeCards = [
        ...dealer.cards.filter((_, idx) => idx !== 0 || dealer.isRevealed),
        ...playerHands.flatMap(h => h.cards),
        ...(drawnCard ? [drawnCard] : []),
        ...discardPile
    ];

    const [currentSpaceIndex, setCurrentSpaceIndex] = useState(1);
    const [boardRotation, setBoardRotation] = useState(0);
    const [hoveredWedgeIndex, setHoveredWedgeIndex] = useState<number | null>(null);

    const [isHoveringWheel, setIsHoveringWheel] = useState(false);
    const [ballPosition, setBallPosition] = useState<{ x: number, y: number } | null>(null);

    // --- Physics Refs ---
    const engineRef = useRef<Matter.Engine | null>(null);
    const runnerRef = useRef<Matter.Runner | null>(null);
    const wheelBodyRef = useRef<Matter.Body | null>(null);
    const ballBodyRef = useRef<Matter.Body | null>(null);
    const requestRef = useRef<number>(0);

    // Rotation Tracking
    const ballAngleRef = useRef<number>(0); // Total radians traveled
    const targetRotationRef = useRef<number>(0); // Target radians before descending
    const lastBallPosRef = useRef<{ x: number, y: number } | null>(null);


    // Initial rotation for Space 1 (Top)
    const initialTargetRotation = -90 - (1 * WEDGE_ANGLE);

    // --- Init Physics ---
    useEffect(() => {
        const engine = Matter.Engine.create();
        engine.gravity.y = 0;
        engine.gravity.x = 0;
        engineRef.current = engine;

        const runner = Matter.Runner.create();
        runnerRef.current = runner;

        // 1. Wheel Body (The Board)
        const wheel = Matter.Bodies.circle(0, 0, 10, {
            isStatic: false,
            isSensor: true,
            mass: 100,
            frictionAir: 0.03, // Slightly less friction for smooth spin
            angle: initialTargetRotation * (Math.PI / 180)
        });
        wheelBodyRef.current = wheel;

        // 2. Separators (Physics collision for ball pockets)
        // We place these at the boundaries of the pockets
        const parts: Matter.Body[] = [wheel];
        const separatorLength = R_POCKETS_OUTER - R_POCKETS_INNER;
        const separatorThickness = 4;

        for (let i = 0; i < TOTAL_SPACES; i++) {
            // Angle between wedges
            const angleVal = ((i + 0.5) * WEDGE_ANGLE) * (Math.PI / 180);
            const r = R_POCKETS_INNER + separatorLength / 2;
            const x = r * Math.cos(angleVal);
            const y = r * Math.sin(angleVal);

            const separator = Matter.Bodies.rectangle(x, y, separatorLength, separatorThickness, {
                angle: angleVal,
                isStatic: false,
                render: { visible: false }
            });
            parts.push(separator);
        }

        const compoundWheel = Matter.Body.create({
            parts: parts,
            isStatic: false,
            frictionAir: 0.03,
            mass: 2000,
            angle: initialTargetRotation * (Math.PI / 180)
        });
        wheelBodyRef.current = compoundWheel;
        Matter.World.add(engine.world, compoundWheel);


        // Start Logic
        Matter.Runner.run(runner, engine);

        // --- Update Loop ---
        const update = () => {
            // 1. Sync React State from Physics Wheel
            if (wheelBodyRef.current) {
                const angleDeg = wheelBodyRef.current.angle * (180 / Math.PI);
                setBoardRotation(angleDeg);
            }

            // 2. Ball Physics
            const ball = ballBodyRef.current;
            if (ball) {
                setBallPosition({ x: ball.position.x, y: ball.position.y });

                // Gravity (Center Pull) - gets stronger closer to center
                const dist = Math.sqrt(ball.position.x ** 2 + ball.position.y ** 2);

                // Track Slope Logic
                let canDescend = true;

                // Update Rotation Tracking
                if (lastBallPosRef.current) {
                    const prevAngle = Math.atan2(lastBallPosRef.current.y, lastBallPosRef.current.x);
                    const currAngle = Math.atan2(ball.position.y, ball.position.x);
                    let delta = currAngle - prevAngle;
                    // Fix wrap-around (-PI to PI)
                    if (delta < -Math.PI) delta += 2 * Math.PI;
                    if (delta > Math.PI) delta -= 2 * Math.PI;

                    // We expect positive rotation (clockwise? matter-js dir depends, let's just take abs or accumulated)
                    // The ball is spun with a specific tangent, let's track absolute progress
                    ballAngleRef.current += Math.abs(delta);
                }
                lastBallPosRef.current = { x: ball.position.x, y: ball.position.y };

                // "Brown Section" Constraint
                // If we haven't spun enough, keep it out
                if (ballAngleRef.current < targetRotationRef.current) {
                    canDescend = false;
                }

                if (dist > R_POCKETS_OUTER) {
                    // On slope
                    if (canDescend) {
                        const slopeForce = 0.0004;
                        const force = Matter.Vector.mult(Matter.Vector.normalise(Matter.Vector.neg(ball.position)), slopeForce * ball.mass);
                        Matter.Body.applyForce(ball, ball.position, force);
                    } else {
                        // KEEP IT OUT: Apply a tiny outward force if it gets too close to the edge of the pockets
                        // Or just zero gravity so it orbits simply thanks to initial velocity + wall bounce
                        // Let's actually PUSH it out if it drifts in
                        const safeRadius = R_TRACK_OUTER - BALL_RADIUS - 5;
                        if (dist < safeRadius) {
                            const pushOut = 0.0002;
                            const force = Matter.Vector.mult(Matter.Vector.normalise(ball.position), pushOut * ball.mass);
                            Matter.Body.applyForce(ball, ball.position, force);
                        }

                        // Maintain Velocity so it doesn't die on the track
                        const currentSpeed = Matter.Vector.magnitude(ball.velocity);
                        // Ensure it stays fast (speed > 15)
                        if (currentSpeed < 15) {
                            const velNorm = Matter.Vector.normalise(ball.velocity);
                            const boost = 0.0005 * ball.mass;
                            Matter.Body.applyForce(ball, ball.position, Matter.Vector.mult(velNorm, boost));
                        }
                    }

                } else if (dist > 10) {
                    // In pocket area
                    const centerForce = 0.0001;
                    const force = Matter.Vector.mult(Matter.Vector.normalise(Matter.Vector.neg(ball.position)), centerForce * ball.mass);
                    Matter.Body.applyForce(ball, ball.position, force);
                }


                // Rim Constraint (The outer wall)
                const rimR = R_TRACK_OUTER - BALL_RADIUS;
                if (dist > rimR) {
                    const correction = Matter.Vector.mult(Matter.Vector.normalise(ball.position), rimR);
                    Matter.Body.setPosition(ball, correction);
                    // Bounce dampen
                    Matter.Body.setVelocity(ball, {
                        x: ball.velocity.x * 0.9,
                        y: ball.velocity.y * 0.9
                    });
                }

                // Inner Constraint (The Cone/Turret)
                const coneR = R_POCKETS_INNER + BALL_RADIUS;
                if (dist < coneR) {
                    const correction = Matter.Vector.mult(Matter.Vector.normalise(ball.position), coneR);
                    Matter.Body.setPosition(ball, correction);
                    Matter.Body.setVelocity(ball, {
                        x: ball.velocity.x * 0.8,
                        y: ball.velocity.y * 0.8
                    });
                }
            }

            requestRef.current = requestAnimationFrame(update);
        };
        requestRef.current = requestAnimationFrame(update);

        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            Matter.Runner.stop(runner);
            Matter.Engine.clear(engine);
        };
    }, []);

    // --- Actions ---



    const handleWedgeClick = (targetIndex: number) => {

        moveBoardTo(targetIndex);
    };

    const moveBoardTo = (targetIndex: number) => {
        if (!wheelBodyRef.current) return;

        let distance = targetIndex - currentSpaceIndex;
        if (distance <= 0) distance += TOTAL_SPACES;
        // Basic click-to-move logic constraints (only close ones?)
        // For debug/demo consistency, let's allow moving to any for now or keep existing limitation.
        // Existing: if (distance < 1 || distance > 3) return;
        // Let's relax it for testing if needed, but keeping strict for game rules if that was intent.
        if (distance < 1 || distance > 3) return;

        // Animate...
        const startAngle = wheelBodyRef.current.angle;
        const deltaAngle = -(distance * WEDGE_ANGLE) * (Math.PI / 180);

        const startTime = performance.now();
        const duration = 500;

        const animateMove = (time: number) => {
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);

            const current = startAngle + (deltaAngle * ease);

            if (wheelBodyRef.current) {
                Matter.Body.setAngle(wheelBodyRef.current, current);
                Matter.Body.setAngularVelocity(wheelBodyRef.current, 0);
            }

            if (progress < 1) {
                requestAnimationFrame(animateMove);
            } else {
                setCurrentSpaceIndex(targetIndex);
                decrementMoves();

                // If 0 moves left and handled (store is updated next render, but we need immediate check)
                const nextMoves = movesRemaining - 1;

                if (nextMoves <= 0 && targetIndex !== 0) {
                    // Trigger Game Over
                    triggerGameOver();
                    onClose(); // Exit demo view to show Game Over screen in App
                } else {
                    // Trigger Event logic
                    triggerEvent(targetIndex);
                }
            }
        };
        requestAnimationFrame(animateMove);
    };

    // --- Rendering Helpers ---

    // Generate Wedges
    const wedges = [];
    const validMoves = [1, 2, 3].map(k => (currentSpaceIndex + k) % TOTAL_SPACES);

    for (let i = 0; i < TOTAL_SPACES; i++) {
        const isBoss = i === 0;
        const isEven = i % 2 === 0;

        let fillColor;
        if (isBoss) fillColor = COLOR_GREEN;
        else fillColor = isEven ? COLOR_RED : COLOR_BLACK;

        // Wedge Math
        const startDeg = (i - 0.5) * WEDGE_ANGLE;
        const endDeg = (i + 0.5) * WEDGE_ANGLE;

        const startRad = (startDeg * Math.PI) / 180;
        const endRad = (endDeg * Math.PI) / 180;

        // 1. The Number Ring Segment
        // Outer Arc
        const p1x = R_WHEEL_OUTER * Math.cos(startRad);
        const p1y = R_WHEEL_OUTER * Math.sin(startRad);
        const p2x = R_WHEEL_OUTER * Math.cos(endRad);
        const p2y = R_WHEEL_OUTER * Math.sin(endRad);
        // Inner Arc (Cone starts here effectively)
        const p3x = R_POCKETS_INNER * Math.cos(endRad);
        const p3y = R_POCKETS_INNER * Math.sin(endRad);
        const p4x = R_POCKETS_INNER * Math.cos(startRad);
        const p4y = R_POCKETS_INNER * Math.sin(startRad);

        const pathData = `
            M ${p1x} ${p1y}
            A ${R_WHEEL_OUTER} ${R_WHEEL_OUTER} 0 0 1 ${p2x} ${p2y}
            L ${p3x} ${p3y}
            A ${R_POCKETS_INNER} ${R_POCKETS_INNER} 0 0 0 ${p4x} ${p4y}
            Z
        `;

        // Text Position
        const txtAngle = i * WEDGE_ANGLE * (Math.PI / 180);
        // Place text in the outer band
        const txtR = (R_WHEEL_OUTER + R_POCKETS_OUTER) / 2;
        const txtX = txtR * Math.cos(txtAngle);
        const txtY = txtR * Math.sin(txtAngle);

        const isValid = validMoves.includes(i);
        // If we are hovering the wheel, any non-valid move should be dimmed.
        // Valid moves stay at opacity 1.
        // If not hovering wheel, everything is normal (1).
        const opacity = (validMoves.length > 0 && isHoveringWheel && !isValid) ? 0.3 : 1;

        wedges.push(
            <g key={i}
                onClick={() => handleWedgeClick(i)}
                onMouseEnter={() => setHoveredWedgeIndex(i)}
                onMouseLeave={() => setHoveredWedgeIndex(null)}
                style={{
                    cursor: isValid ? 'pointer' : 'default',
                    opacity: opacity,
                    transition: 'opacity 0.2s'
                }}
            >
                {/* Wedge Shape with Gradient for Depth */}
                <path d={pathData} fill={fillColor} stroke="#d4af37" strokeWidth="1" />

                {/* Inner Shadow Overlay for 'Pocket' feel at the bottom */}
                <path d={pathData} fill="url(#grad-wedge-shadow)" style={{ mixBlendMode: 'multiply', pointerEvents: 'none' }} />

                {/* Number */}
                {/* Icon or Number */}
                <g transform={`translate(${txtX}, ${txtY}) rotate(${i * WEDGE_ANGLE + 90})`} style={{ pointerEvents: 'none' }}>
                    {boardConfig[i] && (boardConfig[i].type !== 'Blackjack' || !boardConfig[i].isBaseGame) ? (
                        <NodeIcon event={boardConfig[i]} />
                    ) : (
                        <text
                            fill="white"
                            fontSize="24"
                            fontFamily="'Times New Roman', serif"
                            fontWeight="bold"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            style={{ filter: 'drop-shadow(1px 1px 0px rgba(0,0,0,0.5))' }}
                        >
                            {getNodeValue(i).label}
                        </text>
                    )}
                </g>
            </g>
        );
    }

    // Static Diamonds (Deflectors)
    const diamonds = [];
    const NUM_DIAMONDS = 8;
    for (let d = 0; d < NUM_DIAMONDS; d++) {
        const ang = (d / NUM_DIAMONDS) * 360 * (Math.PI / 180);
        // Place on the track
        const r = (R_BOWL_OUTER + R_TRACK_OUTER) / 2 - 5;
        const dx = r * Math.cos(ang);
        const dy = r * Math.sin(ang);
        diamonds.push(
            <g key={d} transform={`translate(${dx}, ${dy}) rotate(${d * (360 / NUM_DIAMONDS)})`}>
                <path d="M 0 -8 L 5 0 L 0 8 L -5 0 Z" fill="url(#grad-gold-linear)" filter="drop-shadow(0 2px 3px rgba(0,0,0,0.5))" />
            </g>
        );
    }


    return (
        <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            background: 'transparent',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
            zIndex: 2000, overflow: 'hidden', fontFamily: 'Inter, sans-serif'
        }}>
            <header className={styles.header} style={{ top: 20 }}>
                <div className={styles.stat}>
                    <span className={styles.statLabel}>Casino</span>
                    <span className={styles.statValue}>{round}</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statLabel}>Target</span>
                    <span className={styles.statValue}>
                        {"$" + targetScore.toLocaleString()}
                    </span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statLabel}>Winnings</span>
                    <span className={styles.statValue}>
                        {"$" + totalScore.toLocaleString()}
                    </span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statLabel}>Deals</span>
                    <span className={styles.statValue}>{handsRemaining}</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statLabel}>Comps</span>
                    <span className={styles.statValue}>{comps}</span>
                </div>
            </header>

            <EventsModule
                isVisible={hoveredWedgeIndex !== null}
                title={hoveredWedgeIndex !== null ? getNodeValue(hoveredWedgeIndex).label : ""}
                description={
                    hoveredWedgeIndex !== null
                        ? getNodeValue(hoveredWedgeIndex).description || ""
                        : ""
                }
            />




            {/* SVG DEFINITIONS */}
            <svg style={{ position: 'absolute', width: 0, height: 0 }}>
                <defs>
                    {/* Metallic Gold Gradients */}
                    <linearGradient id="grad-gold-linear" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={COLOR_GOLD_LIGHT} />
                        <stop offset="40%" stopColor={COLOR_GOLD_MED} />
                        <stop offset="60%" stopColor={COLOR_GOLD_DARK} />
                        <stop offset="100%" stopColor={COLOR_GOLD_LIGHT} />
                    </linearGradient>
                    <radialGradient id="grad-gold-radial" cx="50%" cy="50%" r="50%">
                        <stop offset="40%" stopColor={COLOR_GOLD_MED} />
                        <stop offset="80%" stopColor={COLOR_GOLD_DARK} />
                        <stop offset="100%" stopColor="#8a6e2f" />
                    </radialGradient>

                    {/* Wood Texture */}
                    <filter id="wood-texture">
                        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
                        <feColorMatrix type="saturate" values="0" />
                        <feComponentTransfer>
                            <feFuncR type="linear" slope="0.5" intercept="0.25" />
                            <feFuncG type="linear" slope="0.5" intercept="0.25" />
                            <feFuncB type="linear" slope="0.5" intercept="0.25" />
                        </feComponentTransfer>
                        <feComposite operator="in" in2="SourceGraphic" result="textured" />
                        <feBlend mode="multiply" in="textured" in2="SourceGraphic" />
                    </filter>

                    {/* Wood Gradient (Mahogany) */}
                    <radialGradient id="grad-wood-bowl" cx="50%" cy="50%" r="50%">
                        <stop offset="70%" stopColor="#3e2723" />
                        <stop offset="90%" stopColor="#26140c" />
                        <stop offset="100%" stopColor="#0d0502" />
                    </radialGradient>

                    {/* Cone Gradient */}
                    <radialGradient id="grad-wood-cone" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#5d4037" />
                        <stop offset="100%" stopColor="#3e2723" />
                    </radialGradient>

                    {/* Wedge Shadows (Simulates depth in pockets) */}
                    <radialGradient id="grad-wedge-shadow" cx="50%" cy="50%" r="70%">
                        <stop offset="60%" stopColor="white" stopOpacity="0" />
                        <stop offset="100%" stopColor="black" stopOpacity="0.4" />
                    </radialGradient>

                    {/* Global Shine/Glass Overlay */}
                    <linearGradient id="grad-shine" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="white" stopOpacity="0.1" />
                        <stop offset="40%" stopColor="white" stopOpacity="0.0" />
                        <stop offset="60%" stopColor="white" stopOpacity="0.0" />
                        <stop offset="100%" stopColor="white" stopOpacity="0.1" />
                    </linearGradient>

                    <filter id="drop-shadow-heavy">
                        <feDropShadow dx="0" dy="10" stdDeviation="10" floodOpacity="0.8" />
                    </filter>
                </defs>
            </svg>

            {/* MAIN BOARD */}
            <div style={{
                position: 'relative',
                width: BOARD_SIZE, height: BOARD_SIZE,
                filter: 'drop-shadow(0 20px 50px rgba(0,0,0,0.8))'
            }}>
                <svg width="100%" height="100%" viewBox={`-${BOARD_RADIUS} -${BOARD_RADIUS} ${BOARD_SIZE} ${BOARD_SIZE}`}>

                    {/* 1. OUTER RIM (Gold) */}
                    <circle r={R_FULL_RIM} fill="url(#grad-gold-linear)" stroke="#8a6e2f" strokeWidth="2" />
                    <circle r={R_FULL_RIM - 5} fill="none" stroke="#634f22" strokeWidth="1" opacity="0.5" />

                    {/* 2. WOOD BOWL (Static) */}
                    <circle r={R_BOWL_OUTER} fill="url(#grad-wood-bowl)" />
                    {/* Inner shadowed rim */}
                    <circle r={R_BOWL_OUTER} fill="none" stroke="black" strokeWidth="20" strokeOpacity="0.3" />

                    {/* 3. BALL TRACK (Static) */}
                    {/* Lighter wood track */}
                    <circle r={R_TRACK_OUTER} fill="none" stroke="#4e342e" strokeWidth="40" opacity="0.5" />

                    {/* Track Divider (Gold Line) */}
                    <circle r={R_TRACK_OUTER} fill="none" stroke="url(#grad-gold-linear)" strokeWidth="2" />

                    {/* Diamonds */}
                    {diamonds}

                    {/* 4. SPINNING WHEEL GROUP */}
                    <g
                        transform={`rotate(${boardRotation})`}
                        onMouseEnter={() => setIsHoveringWheel(true)}
                        onMouseLeave={() => setIsHoveringWheel(false)}
                    >
                        {/* Wheel Base Shadow */}
                        <circle r={R_WHEEL_OUTER + 2} fill="black" opacity="0.5" />

                        {/* Wheel Outer Gold Ring */}
                        {/* Wheel Background (Grey for darkened/disabled wedges) */}
                        <circle r={R_WHEEL_OUTER} fill="#444444" />

                        {/* The Pockets/Numbers Layer */}
                        {wedges}

                        {/* Separator Ring (Between numbers and cone) */}
                        <circle r={R_POCKETS_OUTER} fill="none" stroke="url(#grad-gold-linear)" strokeWidth="3" />

                        {/* Inner Cone (Wood) */}
                        <circle r={R_CONE_BASE} fill="url(#grad-wood-cone)" />
                        <circle r={R_CONE_BASE} fill="url(#wood-texture)" opacity="0.3" style={{ mixBlendMode: 'overlay' }} />

                        {/* Cone Segments (Lines radiating from center) */}
                        {Array.from({ length: TOTAL_NODES }).map((_, i) => (
                            <line key={`line-${i}`}
                                x1={0} y1={0}
                                x2={R_CONE_BASE * Math.cos((i - 0.5) * WEDGE_ANGLE * Math.PI / 180)}
                                y2={R_CONE_BASE * Math.sin((i - 0.5) * WEDGE_ANGLE * Math.PI / 180)}
                                stroke="black" strokeWidth="1" opacity="0.2"
                            />
                        ))}

                        {/* PLAYER ICON */}
                        {(() => {
                            // Place on the current space index
                            const i = currentSpaceIndex;
                            // Angle center of the wedge
                            const angle = i * WEDGE_ANGLE * (Math.PI / 180);
                            // Radius - visually place it in the pocket
                            const r = (R_POCKETS_INNER + R_CONE_BASE) / 2 + 20;

                            // Coordinates inside the rotated group
                            const px = r * Math.cos(angle);
                            const py = r * Math.sin(angle);

                            // Counter-rotate the icon so it stays upright relative to the screen? 
                            // Or let it rotate with the board? 
                            // Board rotates (boardRotation). We are INSIDE the rotated group.
                            // If we want it upright, we rotate by -boardRotation - (wedgeAngle).
                            // But usually board pieces stick to the board. Let's stick it for now, 
                            // maybe rotate it to face center (which is default 0 relative to group if drawn upright).
                            // The Icon is upright by default.
                            // Rotation to align with wedge: (i * WEDGE_ANGLE) + 90

                            return (
                                <g transform={`translate(${px}, ${py}) rotate(${i * WEDGE_ANGLE + 90})`}>
                                    <foreignObject width={32} height={32} x={-16} y={-16}>
                                        <PlayerIcon size={32} />
                                    </foreignObject>
                                </g>
                            );
                        })()}

                        {/* TURRET (Centerpiece) */}
                        <g filter="url(#drop-shadow-heavy)">
                            {/* Cross Arms */}
                            <rect x={-R_TURRET_BASE - 20} y={-8} width={(R_TURRET_BASE + 20) * 2} height={16} rx={8} fill="url(#grad-gold-linear)" />
                            <rect x={-8} y={-R_TURRET_BASE - 20} width={16} height={(R_TURRET_BASE + 20) * 2} rx={8} fill="url(#grad-gold-linear)" />

                            {/* Central Knob */}
                            <circle r={R_TURRET_BASE} fill="url(#grad-gold-radial)" stroke="#8a6e2f" strokeWidth="2" />
                            <circle r={10} fill="#fcf6ba" opacity="0.8" style={{ mixBlendMode: 'screen' }} />
                        </g>

                    </g>
                </svg>

                {/* BALL (DOM Element for Physics match) */}
                {ballPosition && (
                    <div style={{
                        position: 'absolute',
                        left: BOARD_RADIUS + ballPosition.x,
                        top: BOARD_RADIUS + ballPosition.y,
                        width: BALL_RADIUS * 2, height: BALL_RADIUS * 2,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle at 30% 30%, #fff 0%, #ddd 50%, #999 100%)',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                        zIndex: 10
                    }} />
                )}
            </div>



            {/* Navigation Buttons */}
            <button className={styles.deckBtn} onClick={() => setShowDeck(true)}>
                Deck
            </button>

            <button className={styles.handsBtn} onClick={() => setShowHandRankings(true)}>
                Scores
            </button>

            <button className={styles.casinosBtn} onClick={() => setShowCasinoListing(true)}>
                Casinos
            </button>

            <button
                className={styles.casinosBtn}
                style={{ top: 94, background: '#e67e22' }}
                onClick={() => setShowRelicStore(true)}
            >
                Store
            </button>

            <button className={styles.debugBtn} onClick={triggerDebugChips}>
                $$$
            </button>

            {/* MOVES & SHIPS UI */}
            <div style={{
                position: 'absolute',
                top: 145, // Moved below header
                left: '50%',
                transform: 'translateX(-50%)',
                width: '800px', // Match header width
                height: 0, // Wrapper
                zIndex: 2005,
                display: 'flex',
                justifyContent: 'space-between',
                paddingRight: '32px', // Match header padding
                paddingLeft: '32px'
            }}>
                {/* SHIPS TRACKER (Left) */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    pointerEvents: 'auto'
                }}>
                    {/* Blue Chip Icon */}
                    <img
                        src={bluePokerChip}
                        alt="Chips"
                        style={{
                            width: 36, height: 36,
                            borderRadius: '50%',
                            filter: 'drop-shadow(0 0 5px rgba(52, 152, 219, 0.5))'
                        }}
                    />
                    <div style={{
                        color: '#3498db',
                        fontSize: '1.5rem',
                        fontWeight: 'bold',
                        textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                        fontFamily: "'Courier New', Courier, monospace"
                    }}>
                        Chips: {chips}
                    </div>
                </div>

                {/* MOVES REMAINING (Right) */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    pointerEvents: 'auto'
                }}>
                    <div style={{
                        color: '#f1c40f',
                        fontSize: '1.5rem',
                        fontWeight: 'bold',
                        textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                        fontFamily: "'Courier New', Courier, monospace"
                    }}>
                        Moves Remaining: {movesRemaining}/{maxMoves}
                    </div>
                    {/* Yellow Footprint/Boot Icon */}
                    <div style={{
                        width: 36, height: 36,
                        background: '#f1c40f',
                        borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 10px rgba(241, 196, 15, 0.5)'
                    }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 11 3.8 11 8c0 2.85-2.92 5.5-3 5.5l2 1.34c.65.43.91 1.25.6 1.95l-.17.38C10.08 18.06 9.17 19 8.23 19H4z" />
                            <path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 13 7.8 13 12c0 2.85 2.92 5.5 3 5.5l-2 1.34c-.65.43-.91 1.25-.6 1.95l.17.38c.35.79 1.26 1.73 2.2 1.73H20z" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* EXIT Button */}
            <button onClick={onClose} style={{
                position: 'absolute', top: 94, right: 20, width: 64, height: 64,
                padding: 0, background: 'rgba(255,255,255,0.1)', color: '#aaa',
                border: '1px solid #555', borderRadius: '50%', cursor: 'pointer',
                backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(0, 0, 0, 0.3)', fontWeight: 'bold', fontSize: '0.7rem',
                textTransform: 'uppercase'
            }}>
                EXIT
            </button>

            {/* Modals */}
            {showDeck && (
                <DeckView
                    remainingDeck={deck}
                    activeCards={activeCards}
                    onClose={() => setShowDeck(false)}
                />
            )}

            {showHandRankings && (
                <HandRankingsView
                    onClose={() => setShowHandRankings(false)}
                />
            )}

            {showCasinoListing && (
                <CasinoListingView
                    currentRound={round}
                    onClose={() => setShowCasinoListing(false)}
                />
            )}

            {showRelicStore && (
                <RelicStore onClose={() => setShowRelicStore(false)} />
            )}
        </div>
    );
};
