import React, { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import styles from './TitlePhysics.module.css';
import { useLayout } from './ResponsiveLayout';
import { useGameStore } from '../store/gameStore';
import { sfxEngine } from '../utils/sfxEngine';

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
const MOUSE_COLLIDER_RADIUS = 42;
const BURST_MIN_COUNT = 3;
const BURST_RANGE_SIZE = 13;
const BURST_MAX_COUNT = BURST_MIN_COUNT + BURST_RANGE_SIZE - 1;
const FLING_CONFETTI_VOLUME = 0.05;

const COLLISION_CATEGORY = {
  STATIC: 0x0002,
  CONFETTI: 0x0004,
  CARD: 0x0008,
  MOUSE: 0x0010,
} as const;

export const TitlePhysics: React.FC = () => {
  const { viewportWidth, viewportHeight, scale } = useLayout();
  const debugEnabled = useGameStore(state => state.debugEnabled);
  const debugVisualizationEnabled = false;
  
  // Refs for Matter.js instances
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const debugEnabledRef = useRef(debugEnabled);
  const lastImpulseRef = useRef(new Map<number, number>());
  const mouseColliderRef = useRef<Matter.Body | null>(null);
  
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

  useEffect(() => {
    debugEnabledRef.current = debugEnabled && debugVisualizationEnabled;
    if (renderRef.current) {
        renderRef.current.options.wireframes = debugEnabled && debugVisualizationEnabled;
    }
  }, [debugEnabled, debugVisualizationEnabled]);

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

    const updateStaticBodies = (
        buttonRotation = 0,
        currentRadii: number[] = [],
        currentRestitution: number[] = []
    ) => {
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
            const baseCy = (rect.top + rect.height / 2) / scale;
            let cy = baseCy;
            
            const rectBaseRadius = (Math.min(rect.width, rect.height) / scale) / 2;
            const radius = currentRadii[i] || rectBaseRadius;
            const restitution = currentRestitution[i] ?? 0.3;

            if (char === 'I') {
                cy = baseCy - (radius * 0.8);
            }
            
            const letterBody = Matter.Bodies.circle(cx, cy, radius, { 
                isStatic: true, 
                restitution,
                friction: 0.01, 
                frictionStatic: 0,
                collisionFilter: {
                    category: COLLISION_CATEGORY.STATIC,
                    mask: COLLISION_CATEGORY.CONFETTI | COLLISION_CATEGORY.CARD,
                },
                render: { 
                    visible: debugEnabledRef.current,
                    fillStyle: 'rgba(255, 215, 0, 0.05)',
                    strokeStyle: '#ffd700',
                    lineWidth: 1
                } 
            });
            letterBody.label = `title-letter-${i}-top`;
            staticBodiesRef.current.push(letterBody);

        });

        // Add Collision for Start Button
        const buttonEl = document.querySelector(`button[class*="startRunButton"]`);
        if (buttonEl) {
            const el = buttonEl as HTMLElement;
            const rect = el.getBoundingClientRect();
            // Keep collision size stable while rotating:
            // getBoundingClientRect() expands/contracts as the element rotates because it
            // returns an axis-aligned bounds box. offsetWidth/offsetHeight stay constant
            // in virtual layout units and should not be divided by scale.
            const scaledW = el.offsetWidth;
            const scaledH = el.offsetHeight;

            const cx = (rect.left + rect.width / 2) / scale;
            const cy = (rect.top + rect.height / 2) / scale;

            const buttonBody = Matter.Bodies.rectangle(cx, cy, scaledW, scaledH, { 
                isStatic: true, 
                angle: buttonRotation,
                friction: 0.01,
                frictionStatic: 0,
                collisionFilter: {
                    category: COLLISION_CATEGORY.STATIC,
                    mask: COLLISION_CATEGORY.CONFETTI | COLLISION_CATEGORY.CARD,
                },
                render: { 
                    visible: debugEnabledRef.current,
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
                collisionFilter: {
                    category: COLLISION_CATEGORY.STATIC,
                    mask: COLLISION_CATEGORY.CONFETTI | COLLISION_CATEGORY.CARD,
                },
                render: { 
                    visible: debugEnabledRef.current,
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
                const scaleSpeed = 0.0075; 
                const pulseCycle = Math.PI * 4; 

                const collisionRadii: number[] = [];
                const collisionRestitution: number[] = [];
                const collisionImpulse: number[] = [];
                
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
                const visualScale = 1.0 + (scaleAmplitude * 1.3) * scaleSin;

                    const impulseFactor = Math.min(1.0, scaleSin * 1.5);
                    const reducedGrowthRadius = baseRadius + (targetPeakRadius - baseRadius) * impulseFactor * 0.2625;
                    const boostedRestitution = 0.3 + (0.7 * impulseFactor);

                    el.style.transform = `translateY(${yOffset}px) scale(${visualScale})`;
                    collisionRadii.push(reducedGrowthRadius);
                    collisionRestitution.push(boostedRestitution);
                    collisionImpulse.push(impulseFactor);
                });

                const buttonRotationAmplitude = 5.25 * (Math.PI / 180); 
                const buttonRotationSpeed = 0.001;
                const buttonRotation = Math.sin(time * buttonRotationSpeed) * buttonRotationAmplitude;

                updateStaticBodies(buttonRotation, collisionRadii, collisionRestitution);

                // Impulse nearby dynamic bodies during peak growth to fling chips off letters
                if (engineRef.current) {
                    const dynamicBodies = Matter.Composite.allBodies(engineRef.current.world)
                        .filter(body => !body.isStatic);

                    staticBodiesRef.current
                        .filter(body => body.label.startsWith('title-letter-'))
                        .forEach(letterBody => {
                            const match = letterBody.label.match(/^title-letter-(\d+)-/);
                            const index = match ? Number(match[1]) : -1;
                            const impulseStrength = collisionImpulse[index] ?? 0;
                            if (impulseStrength < 0.65) return;
                            const now = time;
                            const last = lastImpulseRef.current.get(letterBody.id) || 0;
                            if (now - last < 80) return;
                            lastImpulseRef.current.set(letterBody.id, now);

                            const radius = letterBody.circleRadius || 0;
                            const lx = letterBody.position.x - (radius * 0.35);
                            const ly = letterBody.position.y;
                            const maxRange = radius + 80;
                            const forceScale = 0.0012 * impulseStrength * 0.7;

                            dynamicBodies.forEach(body => {
                                const dx = body.position.x - lx;
                                const dy = body.position.y - ly;
                                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                                if (dist > maxRange) return;
                                const nx = dx / dist;
                                const ny = dy / dist;
                                const isCardLike = body.density >= 0.05 || (body.bounds.max.x - body.bounds.min.x) >= 45;
                                const cardBoost = isCardLike ? 1.5 : 1.0;
                                const massBoost = Math.max(1, body.mass) * cardBoost;
                                const jitter = (Math.random() - 0.5) * 0.35;
                                const tx = -ny;
                                const ty = nx;
                                Matter.Body.applyForce(body, body.position, {
                                    x: (nx + tx * jitter) * forceScale * massBoost,
                                    y: (ny + ty * jitter) * forceScale * massBoost
                                });
                                Matter.Body.setAngularVelocity(body, body.angularVelocity + (Math.random() - 0.5) * 0.02);
                            });
                        });
                }
            }
        }
        animationFrameId = requestAnimationFrame(animateLetters);
    };

    updateStaticBodies();
    animationFrameId = requestAnimationFrame(animateLetters);

    const removeMouseCollider = () => {
        if (!engineRef.current || !mouseColliderRef.current) return;
        Matter.World.remove(engineRef.current.world, mouseColliderRef.current);
        mouseColliderRef.current = null;
    };

    const isPointInsideViewport = (x: number, y: number) => {
        const { viewportWidth, viewportHeight } = layoutRef.current;
        return x >= 0 && x <= viewportWidth && y >= 0 && y <= viewportHeight;
    };

    const upsertMouseCollider = (x: number, y: number) => {
        if (!engineRef.current) return;

        if (!mouseColliderRef.current) {
            const collider = Matter.Bodies.circle(x, y, MOUSE_COLLIDER_RADIUS, {
                isStatic: true,
                friction: 0,
                frictionStatic: 0,
                restitution: 0.95,
                collisionFilter: {
                    category: COLLISION_CATEGORY.MOUSE,
                    mask: COLLISION_CATEGORY.CONFETTI | COLLISION_CATEGORY.CARD,
                },
                render: { visible: false },
            });

            mouseColliderRef.current = collider;
            Matter.World.add(engineRef.current.world, collider);
            return;
        }

        Matter.Body.setPosition(mouseColliderRef.current, { x, y });
    };

    const handlePointerMove = (event: MouseEvent) => {
        const { scale } = layoutRef.current;
        const x = event.clientX / scale;
        const y = event.clientY / scale;

        if (!document.hasFocus() || !isPointInsideViewport(x, y)) {
            removeMouseCollider();
            return;
        }

        upsertMouseCollider(x, y);
    };

    const handleBlur = () => {
        removeMouseCollider();
    };

    const handleMouseOut = (event: MouseEvent) => {
        if (!event.relatedTarget && !event.toElement) {
            removeMouseCollider();
        }
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('mouseout', handleMouseOut);

    // 4. Burst Logic
    let leftTimer: any;
    let rightTimer: any;

    const getConfettiVariantIndex = (value: number, min: number, max: number) => {
        if (max <= min) return 0;
        const normalized = (value - min) / (max - min);
        if (normalized < 2 / 4) return 0;
            if (normalized < 3 / 4) return 1;
        return 2;
    };

    const spawnBurst = (side: 'left' | 'right') => {
        if (!engineRef.current || document.visibilityState === 'hidden') return;
        const { viewportWidth, viewportHeight } = layoutRef.current;
        
        const count = BURST_MIN_COUNT + Math.floor(Math.random() * BURST_RANGE_SIZE);
        const confettiVariant = getConfettiVariantIndex(count, BURST_MIN_COUNT, BURST_MAX_COUNT);
        sfxEngine.play('confetti', { volume: FLING_CONFETTI_VOLUME, variantIndex: confettiVariant });
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
                    collisionFilter: {
                        category: isCard ? COLLISION_CATEGORY.CARD : COLLISION_CATEGORY.CONFETTI,
                        mask: COLLISION_CATEGORY.STATIC | COLLISION_CATEGORY.CONFETTI | COLLISION_CATEGORY.CARD | COLLISION_CATEGORY.MOUSE,
                    },
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
            removeMouseCollider();
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
      removeMouseCollider();
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('mouseout', handleMouseOut);
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
