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

    const updateStaticBodies = (buttonRotation = 0, currentRadii: number[] = []) => {
        if (!engineRef.current) return;
        
        // Clear existing
        clearStaticBodies();

        // Add Collision for Title Letters
        const letterEls = document.querySelectorAll(`.${styles.letter}`);
        letterEls.forEach((el, i) => {
            const char = el.textContent;
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            let cy = rect.top + rect.height / 2;
            
            // Use explicitly passed radius, or fallback to default base radius
            // Fallback (for initial render) is base radius derived from rect
            const rectBaseRadius = Math.min(rect.width, rect.height) / 2;
            const radius = currentRadii[i] || rectBaseRadius;

            if (char === 'I') {
                cy -= (radius * 0.8); // Maintain the shift logic
            }
            
            // Circle collision for each letter
            const letterBody = Matter.Bodies.circle(cx, cy, radius, { 
                isStatic: true, 
                restitution: 0.3, // Reduced from 1.0 to match a more solid feel
                friction: 0.01, 
                frictionStatic: 0,
                render: { 
                    visible: false,
                    fillStyle: 'rgba(255, 215, 0, 0.05)',
                    strokeStyle: '#ffd700',
                    lineWidth: 1
                } 
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
                render: { 
                    visible: false,
                    fillStyle: 'rgba(255, 255, 255, 0.1)',
                    strokeStyle: '#fff',
                    lineWidth: 1
                } 
            });
            
            if (buttonBody) {
                staticBodies.push(buttonBody);
                (buttonEl as HTMLElement).style.transform = `rotate(${buttonRotation}rad)`;
            }
        }

        // Add Collision for Gambler Cards
        const cardEls = document.querySelectorAll('[data-physics="gambler-card"]');
        cardEls.forEach(el => {
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            
            // Adjust dimensions: 10% taller, 20% less wide
            const targetWidth = rect.width * 0.8;
            const targetHeight = rect.height * 1.1;

            // Create a circle based on adjusted height and scale it to adjusted width
            const baseRadius = targetHeight / 2;
            const cardBody = Matter.Bodies.circle(cx, cy, baseRadius, {
                isStatic: true,
                restitution: 0.3, // Reduced to match title letters
                friction: 0.01,
                frictionStatic: 0,
                render: { 
                    visible: false,
                    fillStyle: 'rgba(255, 215, 0, 0.15)',
                    strokeStyle: '#ffd700',
                    lineWidth: 1
                }
            });
            
            // Scale horizontally to reach the target width
            Matter.Body.scale(cardBody, targetWidth / targetHeight, 1);
            
            staticBodies.push(cardBody);
        });

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
                const collisionRadii: number[] = [];
                
                // Track stable word top for growth ceiling
                const wordRect = els[0].parentElement?.getBoundingClientRect();
                const wordTop = wordRect?.top || 0;
                // Target height for pressure wave peaks.
                // Adjusted to be lower (closer to letters) as requested (50% reduction of gap)
                const globalTargetY = wordTop - 65; 

                els.forEach((el, i) => {
                    const rect = rects[i];
                    const char = el.textContent;
                    // Calculate center of this letter relative to the total word width (0 to 1)
                    const letterCenter = rect.left + rect.width / 2;
                    const relativeX = (letterCenter - startX) / totalWidth;

                    // Vertical Phase: proportional to position (1/4 sin across total width)
                    const yPhase = relativeX * (Math.PI * 2 / 4);
                    const yOffset = Math.sin(time * speed + yPhase) * amplitude;
                    
                    // Get unscaled dimensions
                    // We need to approximate base dimensions because the element is currently transformed
                    // Assuming centered transform origin:
                    const currentTransform = el.style.transform;
                    const scaleMatch = currentTransform.match(/scale\(([^)]+)\)/);
                    const currentScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1.0;
                    
                    // Current viewport center of the letter (includes yOffset)
                    const viewportCy = rect.top + rect.height / 2;
                    // Resting center (removing the wave movement)
                    const baseCy = viewportCy - yOffset;
                    
                    // Base Radius (from unscaled dimensions)
                    // Note: 'I' is narrow, so we use min(w,h).
                    const unscaledWidth = rect.width / currentScale;
                    const unscaledHeight = rect.height / currentScale;
                    const baseRadius = Math.min(unscaledWidth, unscaledHeight) / 2;

                    // Calculate Peak Radius Requirement
                    // We want: Top_Y_at_Peak = globalTargetY
                    // For normal letters: Top_Y = baseCy - R
                    // For 'I': Top_Y = baseCy - (0.8 * R) - R = baseCy - 1.8 * R
                    
                    let targetPeakRadius: number;
                    if (char === 'I') {
                        // baseCy - 1.8 * R = globalTargetY
                        // 1.8 * R = baseCy - globalTargetY
                        targetPeakRadius = (baseCy - globalTargetY) / 1.8;
                    } else {
                        // baseCy - R = globalTargetY
                        targetPeakRadius = baseCy - globalTargetY;
                    }
                    
                    // Clamp min radius to base radius so it doesn't shrink
                    targetPeakRadius = Math.max(targetPeakRadius, baseRadius);

                    // Scale Phase: Pressure wave L-to-R proportional to position
                    const sPhase = -(relativeX * Math.PI * 1.5);
                    const theta = (time * scaleSpeed + sPhase) % pulseCycle;
                    
                    // Gated pulse (0 to 1)
                    const scaleSin = (theta > 0 && theta < Math.PI) ? Math.sin(theta) : 0;
                    
                    // 1. Visual Animation (Standard fixed pulse)
                    const visualScale = 1.0 + scaleAmplitude * scaleSin;

                    // 2. Collision Animation (Targeted growth with Hold)
                    // Multiply sine by 1.5 and clamp to 1.0 to create a plateau/hold at the peak
                    const impulseFactor = Math.min(1.0, scaleSin * 1.5);
                    const currentRadius = baseRadius + (targetPeakRadius - baseRadius) * impulseFactor;

                    el.style.transform = `translateY(${yOffset}px) scale(${visualScale})`;
                    
                    letterScales.push(visualScale); // Kept for consistency if needed elsewhere, though unused for collision now
                    collisionRadii.push(currentRadius);
                });

                // Button rotation animation
                const buttonRotationAmplitude = 5.25 * (Math.PI / 180); 
                const buttonRotationSpeed = 0.001;
                const buttonRotation = Math.sin(time * buttonRotationSpeed) * buttonRotationAmplitude;

                // Update colliders with explicit radii
                updateStaticBodies(buttonRotation, collisionRadii);
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
