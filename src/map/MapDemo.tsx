import React, { useState, useMemo } from 'react';
import styles from './MapDemo.module.css';
import playerTokenImg from '../assets/player_token.png';
import { useGameStore } from '../store/gameStore';
import { generateBoard } from '../logic/events';

const TOTAL_SLICES = 19;
// Sizing
const OUTER_RADIUS = 340;
const TRACK_RADIUS = 300;
const POCKET_OUTER_RADIUS = 280;
const POCKET_INNER_RADIUS = 180;
const CENTER_HUB_RADIUS = 80;
const CENTER = 350; // Viewbox 700x700

export const MapDemo = ({ onClose }: { onClose?: () => void }) => {
    const { boardConfig: storeBoardConfig, movesRemaining, decrementMoves } = useGameStore();

    const boardConfig = useMemo(() => {
        if (Object.keys(storeBoardConfig).length > 0) return storeBoardConfig;
        return generateBoard(1);
    }, [storeBoardConfig]);

    const [position, setPosition] = useState(1);

    const move = (steps: number) => {
        setPosition((prev) => (prev + steps) % TOTAL_SLICES);
        decrementMoves();
    };

    // Generate wedges
    const slices = [];
    const separators = []; // Gold lines between numbers
    const anglePerSlice = 360 / TOTAL_SLICES;

    for (let i = 0; i < TOTAL_SLICES; i++) {
        const startAngle = (i * anglePerSlice) - 90;
        const endAngle = ((i + 1) * anglePerSlice) - 90;

        // Convert to radians
        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;

        // Path for the colored pocket area
        const p_x1 = CENTER + POCKET_OUTER_RADIUS * Math.cos(startRad);
        const p_y1 = CENTER + POCKET_OUTER_RADIUS * Math.sin(startRad);
        const p_x2 = CENTER + POCKET_OUTER_RADIUS * Math.cos(endRad);
        const p_y2 = CENTER + POCKET_OUTER_RADIUS * Math.sin(endRad);

        const p_x3 = CENTER + POCKET_INNER_RADIUS * Math.cos(endRad);
        const p_y3 = CENTER + POCKET_INNER_RADIUS * Math.sin(endRad);
        const p_x4 = CENTER + POCKET_INNER_RADIUS * Math.cos(startRad);
        const p_y4 = CENTER + POCKET_INNER_RADIUS * Math.sin(startRad);

        // Arc path
        const pocketPath = `
            M ${p_x4} ${p_y4}
            L ${p_x1} ${p_y1}
            A ${POCKET_OUTER_RADIUS} ${POCKET_OUTER_RADIUS} 0 0 1 ${p_x2} ${p_y2}
            L ${p_x3} ${p_y3}
            A ${POCKET_INNER_RADIUS} ${POCKET_INNER_RADIUS} 0 0 0 ${p_x4} ${p_y4}
            Z
        `;

        // Color Logic
        let fill;
        let label = "";
        let textFill = "white";

        if (i === 0) {
            fill = "url(#greenGradient)";
            label = "BOSS";
        } else {
            // Red/Black logic
            const isRed = i % 2 !== 0; // 1 is Red
            fill = isRed ? "url(#redGradient)" : "url(#blackGradient)";
            label = `${i}`;
        }

        // Label Position (Near inner radius)
        const midAngle = startAngle + (anglePerSlice / 2);
        const midRad = (midAngle * Math.PI) / 180;
        const labelRadius = POCKET_INNER_RADIUS + 20; // Close to inner edge
        const lx = CENTER + labelRadius * Math.cos(midRad);
        const ly = CENTER + labelRadius * Math.sin(midRad);

        // Icon Position (Centered in pocket)
        const iconRadius = POCKET_INNER_RADIUS + (POCKET_OUTER_RADIUS - POCKET_INNER_RADIUS) * 0.5;
        const ix = CENTER + iconRadius * Math.cos(midRad);
        const iy = CENTER + iconRadius * Math.sin(midRad);

        // Determine Icon
        const event = boardConfig[i];
        let iconElement = null;

        if (event) {
            const rotation = midAngle + 90;
            // Approx 60% of space. Pocket depth is 100 (280-180). 60% is 60px.
            const iconSize = 60;

            if (event.type === 'Shop') {
                // Dollar Sign
                iconElement = (
                    <text
                        x={ix}
                        y={iy}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#FFD700"
                        fontSize={iconSize}
                        fontWeight="bold"
                        transform={`rotate(${rotation}, ${ix}, ${iy})`}
                        style={{ filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.5))' }}
                    >
                        $
                    </text>
                );
            } else if (event.type === 'Random') {
                // Question Mark
                iconElement = (
                    <text
                        x={ix}
                        y={iy}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#fff"
                        fontSize={iconSize}
                        fontWeight="bold"
                        transform={`rotate(${rotation}, ${ix}, ${iy})`}
                        style={{ filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.5))' }}
                    >
                        ?
                    </text>
                );
            } else if (event.type === 'Blackjack' && !event.isBaseGame) {
                // Two cards (one top of other, face down)
                // We'll just draw two rectangles
                const cardWidth = 20;
                const cardHeight = 30;

                // Group transform handles position and rotation
                iconElement = (
                    <g transform={`translate(${ix}, ${iy}) rotate(${rotation})`}>
                        {/* Card 1 (Bottom) */}
                        <rect
                            x={-cardWidth / 2 - 5}
                            y={-cardHeight / 2 - 5}
                            width={cardWidth}
                            height={cardHeight}
                            fill="#3498db"
                            stroke="white"
                            strokeWidth="2"
                            rx="2"
                        />
                        {/* Card 2 (Top) */}
                        <rect
                            x={-cardWidth / 2 + 5}
                            y={-cardHeight / 2 + 5}
                            width={cardWidth}
                            height={cardHeight}
                            fill="#3498db"
                            stroke="white"
                            strokeWidth="2"
                            rx="2"
                        />
                    </g>
                );
            }
        }

        slices.push(
            <g key={`slice-${i}`}>
                <path d={pocketPath} fill={fill} stroke="none" />
                {iconElement}
                <text
                    x={lx}
                    y={ly}
                    className={styles.nodeLabel}
                    transform={`rotate(${midAngle + 90}, ${lx}, ${ly})`}
                    fill={textFill}
                    fontSize="14" // Smaller font for numbers to leave room
                >
                    {label}
                </text>
            </g>
        );

        // Gold Separator Lines
        separators.push(
            <line
                key={`sep-${i}`}
                x1={p_x4} y1={p_y4}
                x2={p_x1} y2={p_y1}
                stroke="url(#goldGradient)"
                strokeWidth="2"
            />
        );
    }

    // Player Token Position
    // We want the token to sit in the "pocket"
    const currentAngle = (position * anglePerSlice) - 90 + (anglePerSlice / 2);
    const rad = (currentAngle * Math.PI) / 180;
    // Place it slightly towards the outer edge of the pocket
    const tokenDist = POCKET_INNER_RADIUS + (POCKET_OUTER_RADIUS - POCKET_INNER_RADIUS) * 0.5;
    const tokenX = CENTER + tokenDist * Math.cos(rad);
    const tokenY = CENTER + tokenDist * Math.sin(rad);


    return (
        <div className={styles.container}>
            {onClose && (
                <button
                    className={styles.closeButton}
                    style={{ position: 'absolute', top: 20, right: 20, zIndex: 100 }}
                    onClick={onClose}
                >
                    Close
                </button>
            )}

            <div className={styles.boardContainer}>
                <svg width="700" height="700" viewBox="0 0 700 700">
                    <defs>
                        {/* Gradients for Materials */}
                        <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#bf953f" />
                            <stop offset="25%" stopColor="#fcf6ba" />
                            <stop offset="50%" stopColor="#b38728" />
                            <stop offset="75%" stopColor="#fbf5b7" />
                            <stop offset="100%" stopColor="#aa771c" />
                        </linearGradient>

                        <radialGradient id="woodGradient">
                            <stop offset="70%" stopColor="#3E2723" />
                            <stop offset="100%" stopColor="#1a0f0a" />
                        </radialGradient>

                        <radialGradient id="redGradient" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#e74c3c" />
                            <stop offset="100%" stopColor="#922b21" />
                        </radialGradient>

                        <radialGradient id="blackGradient" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#34495e" />
                            <stop offset="100%" stopColor="#17202a" />
                        </radialGradient>

                        <radialGradient id="greenGradient" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#2ecc71" />
                            <stop offset="100%" stopColor="#1e8449" />
                        </radialGradient>

                        <radialGradient id="metalGradient">
                            <stop offset="0%" stopColor="#95a5a6" />
                            <stop offset="80%" stopColor="#7f8c8d" />
                            <stop offset="100%" stopColor="#2c3e50" />
                        </radialGradient>

                        <filter id="shadow">
                            <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.5" />
                        </filter>
                    </defs>

                    {/* 1. Outer Casing (Wood) */}
                    <circle cx={CENTER} cy={CENTER} r={OUTER_RADIUS} fill="url(#woodGradient)" stroke="#1a0f0a" strokeWidth="8" />

                    {/* 2. Ball Track (Metal Ring) */}
                    <circle cx={CENTER} cy={CENTER} r={TRACK_RADIUS} fill="none" stroke="url(#metalGradient)" strokeWidth="20" opacity="0.8" />

                    {/* Dark background for pockets */}
                    <circle cx={CENTER} cy={CENTER} r={POCKET_OUTER_RADIUS + 2} fill="#111" />

                    {/* 3. Pockets */}
                    <g filter="url(#shadow)">
                        {slices}
                    </g>

                    {/* 4. Separators */}
                    <g>
                        {separators}
                    </g>

                    {/* Inner Rim (Gold) */}
                    <circle cx={CENTER} cy={CENTER} r={POCKET_INNER_RADIUS} fill="none" stroke="url(#goldGradient)" strokeWidth="4" />
                    <circle cx={CENTER} cy={CENTER} r={POCKET_OUTER_RADIUS} fill="none" stroke="url(#goldGradient)" strokeWidth="4" />

                    {/* 5. Center Hub (Turret) */}
                    <circle cx={CENTER} cy={CENTER} r={POCKET_INNER_RADIUS} fill="#1a1a1a" />

                    {/* Turret Cone */}
                    <circle cx={CENTER} cy={CENTER} r={CENTER_HUB_RADIUS} fill="url(#metalGradient)" stroke="#111" strokeWidth="2">
                    </circle>

                    {/* Center Decoration */}
                    <circle cx={CENTER} cy={CENTER} r={CENTER_HUB_RADIUS - 20} fill="none" stroke="url(#goldGradient)" strokeWidth="2" strokeDasharray="5,5" />

                    {/* Top Knob */}
                    <circle cx={CENTER} cy={CENTER} r="15" fill="url(#goldGradient)" filter="url(#shadow)" />

                </svg>

                {/* Player Token (Overlay) */}
                <div
                    className={styles.playerToken}
                    style={{
                        left: tokenX,
                        top: tokenY,
                        position: 'absolute',
                        backgroundImage: `url(${playerTokenImg})`,
                        backgroundSize: 'contain',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center',
                        backgroundColor: 'transparent',
                        border: 'none',
                        boxShadow: 'none' // The image should have its own shadow/depth if generated correctly, or we can keep a drop shadow provided by CSS if needed. Let's start with none or maybe a simple drop shadow.
                    }}
                />
            </div>

            <div className={styles.controls}>
                <div style={{ color: 'white', marginBottom: 10 }}>Moves: {movesRemaining}</div>
                <button className={styles.moveButton} onClick={() => move(1)}>Move 1</button>
                <button className={styles.moveButton} onClick={() => move(2)}>Move 2</button>
                <button className={styles.moveButton} onClick={() => move(3)}>Move 3</button>
            </div>

        </div>
    );
};
