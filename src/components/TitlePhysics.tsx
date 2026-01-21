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
    
    const clearStaticBodies = () => {
        if (!engineRef.current) return;
        // Remove old static bodies
        staticBodies.forEach(b => Matter.World.remove(engineRef.current!.world, b));
        staticBodies = [];
    };

    const updateStaticBodies = (buttonRotation = 0, letterScales: number[] = []) => {
        if (!engineRef.current) return;
        
        // Clear existing
        clearStaticBodies();

        // Add Collision for Title Letters
        const letterEls = document.querySelectorAll(`.${styles.letter}`);
        letterEls.forEach((el, i) => {
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            
            // Get the current visual scale of this letter
            const visualScale = letterScales[i] || 1.0;
            
            // Base radius (unscaled)
            const baseRadius = Math.min(rect.width, rect.height) / (2 * visualScale);
            
            // Collision growth is 9x the visual growth (3x the previous 3x)
            const collisionScale = 1 + 9 * (visualScale - 1);
            const radius = baseRadius * collisionScale;
            
            // Circle collision for each letter
            const letterBody = Matter.Bodies.circle(cx, cy, radius, { 
                isStatic: true, 
                restitution: 1.0, 
                friction: 0.01, // 10% of default to allow sliding
                frictionStatic: 0,
                render: { visible: false } 
            });
            
            staticBodies.push(letterBody);
        });

        // Add Collision for Start Button
        const buttonEl = document.querySelector(`button[class*="startRunButton"]`);
        if (buttonEl) {
            const el = buttonEl as HTMLElement;
            const w = el.offsetWidth;
            const h = el.offsetHeight;
            
            // To get the correct center even when rotated, we use the bounding rect center
            // but the intrinsic w/h for the body dimensions.
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;

            const buttonBody = Matter.Bodies.rectangle(cx, cy, w, h, { 
                isStatic: true, 
                angle: buttonRotation,
                friction: 0.01,
                frictionStatic: 0,
                render: { visible: false } 
            });
            
            if (buttonBody) {
                staticBodies.push(buttonBody);
                (buttonEl as HTMLElement).style.transform = `rotate(${buttonRotation}rad)`;
            }
        }

        Matter.World.add(engineRef.current.world, staticBodies);
    };

    // Animation loop for letters and colliders
    let animationFrameId: number;
    const animateLetters = (time: number) => {
        const letterEls = document.querySelectorAll(`.${styles.letter}`);
        const buttonEl = document.querySelector(`button[class*="startRunButton"]`);
        
        if (letterEls.length > 0 || buttonEl) {
            // Letter animation
            if (letterEls.length > 0) {
                const els = Array.from(letterEls) as HTMLElement[];
                const rects = els.map(el => el.getBoundingClientRect());
                
                // Calculate total span from start of first to end of last letter
                const startX = rects[0].left;
                const endX = rects[rects.length - 1].right;
                const totalWidth = endX - startX || 1; // avoid div by zero

                const textHeight = rects[0].height;
                const amplitude = textHeight * 0.15;
                const speed = 0.003;
                
                // Scale animation parameters
                const scaleAmplitude = 0.25; 
                const scaleSpeed = 0.004; 
                const pulseCycle = Math.PI * 4; 

                const letterScales: number[] = [];

                els.forEach((el, i) => {
                    const rect = rects[i];
                    // Calculate center of this letter relative to the total word width (0 to 1)
                    const letterCenter = rect.left + rect.width / 2;
                    const relativeX = (letterCenter - startX) / totalWidth;

                    // Vertical Phase: proportional to position (1/4 sin across total width)
                    const yPhase = relativeX * (Math.PI * 2 / 4);
                    const yOffset = Math.sin(time * speed + yPhase) * amplitude;
                    
                    // Scale Phase: Pressure wave L-to-R proportional to position
                    const sPhase = -(relativeX * Math.PI * 1.5);
                    const theta = (time * scaleSpeed + sPhase) % pulseCycle;
                    
                    // Gated pulse
                    const scaleSin = (theta > 0 && theta < Math.PI) ? Math.sin(theta) : 0;
                    const scale = 1.0 + scaleAmplitude * scaleSin;

                    el.style.transform = `translateY(${yOffset}px) scale(${scale})`;
                    letterScales.push(scale);
                });

                // Button rotation animation
                const buttonRotationAmplitude = 5.25 * (Math.PI / 180); 
                const buttonRotationSpeed = 0.001;
                const buttonRotation = Math.sin(time * buttonRotationSpeed) * buttonRotationAmplitude;

                // Update colliders to match new positions, scale, and rotation
                updateStaticBodies(buttonRotation, letterScales);
            }
        }
        animationFrameId = requestAnimationFrame(animateLetters);
    };

    // Initial update and start animation loop
    updateStaticBodies();
    animationFrameId = requestAnimationFrame(animateLetters);

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
                    friction: 0.01,
                    frictionStatic: 0,
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
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // Update canvas style to fill window
        canvasRef.current.style.width = width + 'px';
        canvasRef.current.style.height = height + 'px';
        
        // Update Matter renderer sizing and pixel ratio
        Matter.Render.setPixelRatio(renderRef.current, window.devicePixelRatio || 1);
        renderRef.current.options.width = width;
        renderRef.current.options.height = height;
        
        // Sync engine bounds if needed (Matter.js usually does this automatically but good to be explicit)
        renderRef.current.bounds.max.x = width;
        renderRef.current.bounds.max.y = height;

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
      cancelAnimationFrame(animationFrameId);
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
