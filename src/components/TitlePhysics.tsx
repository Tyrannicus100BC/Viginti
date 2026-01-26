import React, { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import styles from './TitlePhysics.module.css';
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

export const TitlePhysics: React.FC = () => {
  const { viewportWidth, viewportHeight, scale } = useLayout();
  
  // Refs for Matter.js instances
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  
  // Refs for tracking bodies and layout across closures
  const staticBodiesRef = useRef<Matter.Body[]>([]);
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
        
        // Note: We rely on the animation loop to pick up the new scale/dims 
        // and update static bodies in the next frame.
    }
  }, [viewportWidth, viewportHeight, scale]);

  // Main Matter.js Initialization and Animation Loop
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

    // 2. Helper Functions (defined inside effect to access closure variables if needed, 
    //    but mostly using refs to stay fresh)

    const updateStaticBodies = (buttonRotation = 0, currentRadii: number[] = []) => {
        if (!engineRef.current) return;
        const { scale } = layoutRef.current;
        
        // Remove old static bodies
        staticBodiesRef.current.forEach(b => Matter.World.remove(engineRef.current!.world, b));
        staticBodiesRef.current = [];

        // Add Collision for Title Letters
        const letterEls = document.querySelectorAll(`.${styles.letter}`);
        letterEls.forEach((el, i) => {
            const char = el.textContent;
            const rect = el.getBoundingClientRect();
            // Convert screen coordinates to virtual coordinates
            const cx = (rect.left + rect.width / 2) / scale;
            let cy = (rect.top + rect.height / 2) / scale;
            
            const rectBaseRadius = (Math.min(rect.width, rect.height) / scale) / 2;
            const radius = currentRadii[i] || rectBaseRadius;

            if (char === 'I') {
                cy -= (radius * 0.8);
            }
            
            const letterBody = Matter.Bodies.circle(cx, cy, radius, { 
                isStatic: true, 
                restitution: 0.3,
                friction: 0.01, 
                frictionStatic: 0,
                render: { 
                    visible: false,
                    fillStyle: 'rgba(255, 215, 0, 0.05)',
                    strokeStyle: '#ffd700',
                    lineWidth: 1
                } 
            });
            staticBodiesRef.current.push(letterBody);
        });

        // Add Collision for Start Button
        const buttonEl = document.querySelector(`button[class*="startRunButton"]`);
        if (buttonEl) {
            const el = buttonEl as HTMLElement;
            const rect = el.getBoundingClientRect();
            const scaledW = rect.width / scale;
            const scaledH = rect.height / scale;

            const cx = (rect.left + rect.width / 2) / scale;
            const cy = (rect.top + rect.height / 2) / scale;

            const buttonBody = Matter.Bodies.rectangle(cx, cy, scaledW, scaledH, { 
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
            
            staticBodiesRef.current.push(buttonBody);
            el.style.transform = `rotate(${buttonRotation}rad)`;
        }

        // Add Collision for Gambler Cards
        const cardEls = document.querySelectorAll('[data-physics="gambler-card"]');
        cardEls.forEach(el => {
            const rect = el.getBoundingClientRect();
            const cx = (rect.left + rect.width / 2) / scale;
            const cy = (rect.top + rect.height / 2) / scale;
            
            const targetWidth = (rect.width / scale) * 0.8;
            const targetHeight = (rect.height / scale) * 1.1;

            const baseRadius = targetHeight / 2;
            const cardBody = Matter.Bodies.circle(cx, cy, baseRadius, {
                isStatic: true,
                restitution: 0.3,
                friction: 0.01,
                frictionStatic: 0,
                render: { 
                    visible: false,
                    fillStyle: 'rgba(255, 215, 0, 0.15)',
                    strokeStyle: '#ffd700',
                    lineWidth: 1
                }
            });
            
            Matter.Body.scale(cardBody, targetWidth / targetHeight, 1);
            staticBodiesRef.current.push(cardBody);
        });

        Matter.World.add(engineRef.current.world, staticBodiesRef.current);
    };

    // 3. Animation Loop
    let animationFrameId: number;
    const animateLetters = (time: number) => {
        const { scale } = layoutRef.current;
        const letterEls = document.querySelectorAll(`.${styles.letter}`);
        const buttonEl = document.querySelector(`button[class*="startRunButton"]`);
        
        if (letterEls.length > 0 || buttonEl) {
            if (letterEls.length > 0) {
                const els = Array.from(letterEls) as HTMLElement[];
                const rects = els.map(el => el.getBoundingClientRect());
                
                const startX = rects[0].left / scale;
                const endX = rects[rects.length - 1].right / scale;
                const totalWidth = endX - startX || 1;

                const textHeight = rects[0].height / scale;
                const amplitude = textHeight * 0.15;
                const speed = 0.003;
                
                const scaleAmplitude = 0.25; 
                const scaleSpeed = 0.004; 
                const pulseCycle = Math.PI * 4; 

                const collisionRadii: number[] = [];
                
                const wordRect = els[0].parentElement?.getBoundingClientRect();
                const wordTop = wordRect ? (wordRect.top / scale) : 0; // Use scaled top? Actually rect.top is screen coords.
                // Wait, globalTargetY calculation logic:
                // wordTop is screen coord. globalTargetY should be screen or virtual?
                // The physics bodies are virtual. 
                // In previous code: globalTargetY = wordTop - 65;
                // targetPeakRadius = baseCy - globalTargetY; 
                // baseCy was virtual.
                // So globalTargetY must be virtual.
                
                // Fix: Convert wordTop to virtual
                const virtualWordTop = wordTop / scale; // Simplification
                // But wait, wordTop is screen absolute. Dividing by scale gives virtual absolute? Yes.
                
                const globalTargetY = (wordRect?.top || 0) / scale - (65 / scale); 

                els.forEach((el, i) => {
                    const rect = rects[i];
                    const char = el.textContent;
                    const letterCenter = (rect.left + rect.width / 2) / scale;
                    const relativeX = (letterCenter - startX) / totalWidth;

                    const yPhase = relativeX * (Math.PI * 2 / 4);
                    const yOffset = Math.sin(time * speed + yPhase) * amplitude;
                    
                    const currentTransform = el.style.transform;
                    const scaleMatch = currentTransform.match(/scale\(([^)]+)\)/);
                    const currentScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1.0;
                    
                    const viewportCy = (rect.top + rect.height / 2) / scale;
                    const baseCy = viewportCy - yOffset;
                    
                    const unscaledWidth = (rect.width / scale) / currentScale;
                    const unscaledHeight = (rect.height / scale) / currentScale;
                    const baseRadius = Math.min(unscaledWidth, unscaledHeight) / 2;

                    let targetPeakRadius: number;
                    if (char === 'I') {
                        targetPeakRadius = (baseCy - globalTargetY) / 1.8;
                    } else {
                        targetPeakRadius = baseCy - globalTargetY;
                    }
                    
                    targetPeakRadius = Math.max(targetPeakRadius, baseRadius);

                    const sPhase = -(relativeX * Math.PI * 1.5);
                    const theta = (time * scaleSpeed + sPhase) % pulseCycle;
                    
                    const scaleSin = (theta > 0 && theta < Math.PI) ? Math.sin(theta) : 0;
                    const visualScale = 1.0 + scaleAmplitude * scaleSin;

                    const impulseFactor = Math.min(1.0, scaleSin * 1.5);
                    const currentRadius = baseRadius + (targetPeakRadius - baseRadius) * impulseFactor;

                    el.style.transform = `translateY(${yOffset}px) scale(${visualScale})`;
                    collisionRadii.push(currentRadius);
                });

                const buttonRotationAmplitude = 5.25 * (Math.PI / 180); 
                const buttonRotationSpeed = 0.001;
                const buttonRotation = Math.sin(time * buttonRotationSpeed) * buttonRotationAmplitude;

                updateStaticBodies(buttonRotation, collisionRadii);
            }
        }
        animationFrameId = requestAnimationFrame(animateLetters);
    };

    updateStaticBodies();
    animationFrameId = requestAnimationFrame(animateLetters);

    // 4. Burst Logic
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
      cancelAnimationFrame(animationFrameId);
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
    <div className={styles.container}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
};
