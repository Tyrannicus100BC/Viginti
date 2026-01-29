import React, { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import styles from './TitlePhysics.module.css'; // We can reuse basic canvas styles or make new ones
import { useLayout } from './ResponsiveLayout';

interface ChipData {
    value: number;
    color: string;
}

const CHIP_VALUES: ChipData[] = [
    { value: 1000, color: '#f1c40f' },
    { value: 500, color: '#9b59b6' },
    { value: 25, color: '#2ecc71' },
    { value: 5, color: '#e74c3c' },
    { value: 1, color: '#ecf0f1' },
];

const CHIP_WIDTH = 48;
const CHIP_HEIGHT = 12;
const CARD_WIDTH = 50;
const CARD_HEIGHT = 70;

export const BonusPhysics: React.FC = () => {
    const { viewportWidth, viewportHeight, scale } = useLayout();

    // Refs for Matter.js instances
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Matter.Engine | null>(null);
    const renderRef = useRef<Matter.Render | null>(null);
    const runnerRef = useRef<Matter.Runner | null>(null);

    const layoutRef = useRef({ scale, viewportWidth, viewportHeight });

    // Update layout ref and canvas/bounds when layout changes
    useEffect(() => {
        layoutRef.current = { scale, viewportWidth, viewportHeight };

        if (canvasRef.current && renderRef.current) {
            // Update canvas style to fill window (virtual viewport)
            canvasRef.current.style.width = viewportWidth + 'px';
            canvasRef.current.style.height = viewportHeight + 'px';

            // Update Matter renderer sizing
            Matter.Render.setPixelRatio(renderRef.current, window.devicePixelRatio || 1);
            renderRef.current.options.width = viewportWidth;
            renderRef.current.options.height = viewportHeight;

            // Sync engine bounds
            renderRef.current.bounds.max.x = viewportWidth;
            renderRef.current.bounds.max.y = viewportHeight;
        }
    }, [viewportWidth, viewportHeight, scale]);

    // Main Matter.js Initialization
    useEffect(() => {
        if (!canvasRef.current) return;

        // 1. Setup Matter.js
        const engine = Matter.Engine.create();
        engine.gravity.y = 1.0;
        engineRef.current = engine;

        const render = Matter.Render.create({
            canvas: canvasRef.current,
            engine: engine,
            options: {
                width: layoutRef.current.viewportWidth,
                height: layoutRef.current.viewportHeight,
                background: 'transparent',
                wireframes: false,
                pixelRatio: window.devicePixelRatio,
            }
        });
        renderRef.current = render;

        const runner = Matter.Runner.create();
        runnerRef.current = runner;

        Matter.Runner.run(runner, engine);
        Matter.Render.run(render);

        // 2. Burst Logic
        let leftTimer: any;
        let rightTimer: any;

        const spawnBurst = (side: 'left' | 'right') => {
            if (!engineRef.current || document.visibilityState === 'hidden') return;
            const { viewportWidth, viewportHeight } = layoutRef.current;

            const count = 3 + Math.floor(Math.random() * 13);
            const startX = side === 'left' ? -50 : viewportWidth + 50;
            const startY = viewportHeight * (0.6 + Math.random() * 0.35);

            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    if (!engineRef.current || document.visibilityState === 'hidden') return;

                    const isCard = Math.random() < 0.10;
                    const chip = CHIP_VALUES[Math.floor(Math.random() * CHIP_VALUES.length)];

                    const variationX = (Math.random() - 0.5) * 50;
                    const variationY = (Math.random() - 0.5) * 50;

                    const width = isCard ? CARD_WIDTH : CHIP_WIDTH;
                    const height = isCard ? CARD_HEIGHT : CHIP_HEIGHT;

                    const body = Matter.Bodies.rectangle(startX + variationX, startY + variationY, width, height, {
                        restitution: 0.6,
                        friction: 0.01,
                        frictionStatic: 0,
                        frictionAir: isCard ? 0.015 : 0.01,
                        density: isCard ? 0.1 : 0.001,
                        chamfer: { radius: isCard ? 6 : 4 },
                        render: {
                            fillStyle: isCard ? '#2c3e50' : chip.color,
                            strokeStyle: isCard ? '#ecf0f1' : '#000',
                            lineWidth: isCard ? 3 : 2
                        }
                    });

                    const baseVelX = side === 'left'
                        ? (6 + Math.random() * 8)
                        : -(6 + Math.random() * 8);
                    const baseVelY = -(15 + Math.random() * 10);

                    const finalVelX = isCard ? baseVelX * 1.5 : baseVelX;
                    const finalVelY = isCard ? baseVelY * 1.2 : baseVelY;

                    Matter.Body.setVelocity(body, { x: finalVelX, y: finalVelY });
                    Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * (isCard ? 0.2 : 0.4));

                    Matter.World.add(engineRef.current.world, body);
                }, i * 40);
            }
        };

        const scheduleBurst = (side: 'left' | 'right', isFirstLoad = false) => {
            const minTime = isFirstLoad ? 675 : 1350;
            const maxTime = isFirstLoad ? 3300 : 6600;
            const nextTime = minTime + Math.random() * (maxTime - minTime);

            const timer = setTimeout(() => {
                spawnBurst(side);
                scheduleBurst(side);
            }, nextTime);

            if (side === 'left') leftTimer = timer;
            else rightTimer = timer;
        };

        scheduleBurst('left', true);
        scheduleBurst('right', true);

        const cleanupId = setInterval(() => {
            if (!engineRef.current) return;
            const { viewportHeight } = layoutRef.current;
            const bodies = Matter.Composite.allBodies(engineRef.current.world);
            bodies.forEach(body => {
                if (body.position.y > viewportHeight + 100) {
                    Matter.World.remove(engineRef.current!.world, body);
                }
            });
        }, 500);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                clearTimeout(leftTimer);
                clearTimeout(rightTimer);
            } else {
                scheduleBurst('left', true);
                scheduleBurst('right', true);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearInterval(cleanupId);
            clearTimeout(leftTimer);
            clearTimeout(rightTimer);
            Matter.Render.stop(render);
            Matter.Runner.stop(runner);
            if (render.canvas) {
                // render.canvas.remove();
            }
        };
    }, []); // Run once!

    return (
        <div className={styles.container} style={{ zIndex: 0 }}>
            <canvas ref={canvasRef} className={styles.canvas} />
        </div>
    );
};

