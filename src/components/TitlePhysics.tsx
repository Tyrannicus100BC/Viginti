import React, { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import styles from './TitlePhysics.module.css';

interface ChipData {
  value: number;
  color: string;
}

const CHIP_VALUES: ChipData[] = [
  { value: 1000, color: '#f1c40f' },
  { value: 500, color: '#9b59b6' }, 
  // { value: 100, color: '#111111' }, // Removed black chips
  { value: 25, color: '#2ecc71' },  
  { value: 5, color: '#e74c3c' },   
  { value: 1, color: '#ecf0f1' },   
];

const CHIP_WIDTH = 48;
const CHIP_HEIGHT = 12;
const CARD_WIDTH = 50;
const CARD_HEIGHT = 70;

export const TitlePhysics: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = Matter.Engine.create();
    engine.gravity.y = 1.0;
    engineRef.current = engine;

    const render = Matter.Render.create({
      canvas: canvasRef.current,
      engine: engine,
      options: {
        width: window.innerWidth,
        height: window.innerHeight,
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

    // Dynamic Collision Objects for UI
    let staticBodies: Matter.Body[] = [];
    const updateStaticBodies = () => {
        if (!engineRef.current) return;
        
        // Remove old static bodies
        staticBodies.forEach(b => Matter.World.remove(engineRef.current!.world, b));
        staticBodies = [];

        // Add Collision for Title Text
        const titleEl = document.querySelector(`.${styles.titleText}`);
        if (titleEl) {
            const rect = titleEl.getBoundingClientRect();
            // Use a circle but offset it slightly down to create a steeper dome
            // Or better: use a "house" shape (triangle on rectangle) to perfectly shed items.
            // Vertices for a "pointy" top to shed chips
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const w = rect.width;
            const h = rect.height;
            
            // Octagon-like shape but very pointy on top
            const titleBody = Matter.Bodies.fromVertices(cx, cy, [
                [
                    { x: -w/2, y: h/2 },    // Bottom Left
                    { x: w/2, y: h/2 },     // Bottom Right
                    { x: w/2, y: 0 },       // Middle Right
                    { x: 0, y: -h * 0.8 },  // Pointy Top Center
                    { x: -w/2, y: 0 },      // Middle Left
                ]
            ], { isStatic: true, render: { visible: false } });
            
            if (titleBody) staticBodies.push(titleBody);
        }

        // Add Collision for Start Button
        const buttonEl = document.querySelector(`button[class*="button"]`);
        if (buttonEl) {
            const rect = buttonEl.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const w = rect.width;
            const h = rect.height;

            const buttonBody = Matter.Bodies.fromVertices(cx, cy, [
                [
                    { x: -w/2, y: h/2 },
                    { x: w/2, y: h/2 },
                    { x: w/2, y: 0 },
                    { x: 0, y: -h * 0.8 }, // Pointy top
                    { x: -w/2, y: 0 },
                ]
            ], { isStatic: true, render: { visible: false } });
            
            if (buttonBody) staticBodies.push(buttonBody);
        }

        Matter.World.add(engineRef.current.world, staticBodies);
    };

    // Initial update and periodic refresh to handle layout shifts/animations
    updateStaticBodies();
    const staticRefreshInterval = setInterval(updateStaticBodies, 2000);

    // Cleanup loop for off-screen chips
    const cleanupId = setInterval(() => {
       if (!engineRef.current) return;
       const bodies = Matter.Composite.allBodies(engineRef.current.world);
       const screenHeight = window.innerHeight;
       bodies.forEach(body => {
           if (body.position.y > screenHeight + 100) {
               Matter.World.remove(engineRef.current!.world, body);
           }
       });
    }, 500);

    const spawnBurst = (side: 'left' | 'right') => {
        if (!engineRef.current || document.visibilityState === 'hidden') return;
        
        const count = 3 + Math.floor(Math.random() * 13); // Reduced by 25% (3-15 chips)
        const startX = side === 'left' ? -50 : window.innerWidth + 50;
        // Bias towards starting lower on the screen (60-95% height)
        const startY = window.innerHeight * (0.6 + Math.random() * 0.35);
        
        for (let i = 0; i < count; i++) {
            // Stagger spawning within the plume
            setTimeout(() => {
                if (!engineRef.current || document.visibilityState === 'hidden') return;

                const isCard = Math.random() < 0.10; // 10% chance
                const chip = CHIP_VALUES[Math.floor(Math.random() * CHIP_VALUES.length)];
                
                // Randomize spawn a bit for the whole burst
                const variationX = (Math.random() - 0.5) * 50;
                const variationY = (Math.random() - 0.5) * 50;

                const width = isCard ? CARD_WIDTH : CHIP_WIDTH;
                const height = isCard ? CARD_HEIGHT : CHIP_HEIGHT;

                const body = Matter.Bodies.rectangle(startX + variationX, startY + variationY, width, height, {
                    restitution: 0.6,
                    friction: 0.1,
                    frictionAir: isCard ? 0.015 : 0.01, // Reduced card drag to help them fly further
                    density: isCard ? 0.1 : 0.001, // 100x density for cards
                    chamfer: { radius: isCard ? 6 : 4 },
                    render: {
                        fillStyle: isCard ? '#2c3e50' : chip.color,
                        strokeStyle: isCard ? '#ecf0f1' : '#000',
                        lineWidth: isCard ? 3 : 2
                    }
                });

                // Initial Velocity
                // Side push
                const baseVelX = side === 'left' 
                    ? (6 + Math.random() * 8) 
                    : -(6 + Math.random() * 8);
                const baseVelY = -(15 + Math.random() * 10); 

                // If it's a card, we give it even more initial velocity to overcome its own high density/drag
                // and really "plow" into the scene.
                const finalVelX = isCard ? baseVelX * 1.5 : baseVelX;
                const finalVelY = isCard ? baseVelY * 1.2 : baseVelY;

                Matter.Body.setVelocity(body, { x: finalVelX, y: finalVelY });
                Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * (isCard ? 0.2 : 0.4));

                Matter.World.add(engineRef.current.world, body);
            }, i * 40); // 40ms spacing between chips in the plume
        }
    };

    let leftTimer: any;
    let rightTimer: any;

    const scheduleBurst = (side: 'left' | 'right', isFirstLoad = false) => {
        // Increased base wait by 35% and range by 30%
        // Normal: 1350ms to 6600ms
        // First Load: 675ms to 3300ms
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

    const handleResize = () => {
      if (canvasRef.current && renderRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        renderRef.current.options.width = window.innerWidth;
        renderRef.current.options.height = window.innerHeight;
        updateStaticBodies();
      }
    };

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            clearTimeout(leftTimer);
            clearTimeout(rightTimer);
        } else {
            // Resume with "first load" logic to get chips moving again quickly
            scheduleBurst('left', true);
            scheduleBurst('right', true);
        }
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(cleanupId);
      clearInterval(staticRefreshInterval);
      clearTimeout(leftTimer);
      clearTimeout(rightTimer);
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      if (render.canvas) {
          // render.canvas.remove();
      }
    };
  }, []);

  return (
    <div className={styles.container}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
};
