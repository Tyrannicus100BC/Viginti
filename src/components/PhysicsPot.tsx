import React, { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import styles from './PhysicsPot.module.css';

interface PhysicsPotProps {
  scoreDetails: { handId: number; score: number; sourceId: string } | null;
  isCollecting: boolean;
  targetId: string;
  onCollectionComplete: () => void;
  onChipArrived?: (value: number) => void;
}

interface ChipData {
  value: number;
  color: string;
  radius: number;
}

// Side profile dimensions
const CHIP_WIDTH = 48; // 300% of original 16px roughly? Original was radius 12 (dia 24). 300% dia is 72. 
// User asked for "chips to be 300% larger" previously. 
// Let's make them fairly large.
const CHIP_HEIGHT = 12; 

const CHIP_VALUES: ChipData[] = [
  { value: 1000, color: '#f1c40f', radius: 32 }, // Gold
  { value: 500, color: '#9b59b6', radius: 32 },  // Purple
  { value: 100, color: '#111111', radius: 32 },  // Black
  { value: 25, color: '#2ecc71', radius: 32 },   // Green
  { value: 5, color: '#e74c3c', radius: 32 },    // Red
  { value: 1, color: '#ecf0f1', radius: 32 },    // White
];

export const PhysicsPot: React.FC<PhysicsPotProps> = ({
  scoreDetails,
  isCollecting,
  targetId,
  onCollectionComplete,
  onChipArrived
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const bodiesRef = useRef<Matter.Body[]>([]);
  const [potTotal, setPotTotal] = React.useState(0);
  const [isPulsing, setIsPulsing] = React.useState(false);
  
  // Initialize Engine
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;
    
    const engine = Matter.Engine.create();
    engine.gravity.y = 1.3; // Increased gravity
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

    // Create walls to contain chips in the center "Pot"
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const wallOpts = { isStatic: true, render: { visible: false } };
    
    // Pot boundaries (invisible box in center) - seal the bucket
    const floorY = cy + 40; // Moved up from +120
    const floorWidth = 450; // Wider to ensure overlap
    const wallHeight = 800; // Much taller for funneling
    
    const floor = Matter.Bodies.rectangle(cx, floorY + 240, floorWidth, 500, wallOpts);
    const leftWall = Matter.Bodies.rectangle(cx - (floorWidth/2) - 240, floorY - (wallHeight/2), 500, wallHeight, wallOpts); 
    const rightWall = Matter.Bodies.rectangle(cx + (floorWidth/2) + 240, floorY - (wallHeight/2), 500, wallHeight, wallOpts); 

    // Additional Funnel Walls just past the center hand
    // Center hand is ~250px wide. Funnel at ~300px total width.
    const funnelWidth = 320; 
    const funnelLeft = Matter.Bodies.rectangle(cx - (funnelWidth/2) - 240, floorY - 500, 500, 1000, wallOpts);
    const funnelRight = Matter.Bodies.rectangle(cx + (funnelWidth/2) + 240, floorY - 500, 500, 1000, wallOpts);
    
    Matter.World.add(engine.world, [floor, leftWall, rightWall, funnelLeft, funnelRight]);

    const runner = Matter.Runner.create();
    runnerRef.current = runner;
    Matter.Runner.run(runner, engine);
    Matter.Render.run(render);

    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      if (render.canvas) {
         // render.canvas.remove(); 
      }
    };
  }, []);

  // Spawn Chips logic
  useEffect(() => {
    if (!scoreDetails || !engineRef.current) return;

    const { score } = scoreDetails;
    
    // Decompose score into chips
    let remaining = score;
    const chipsToSpawn: ChipData[] = [];
    
    for (const chipType of CHIP_VALUES) {
        while (remaining >= chipType.value) {
            chipsToSpawn.push(chipType);
            remaining -= chipType.value;
        }
    }

    // Spawn physics bodies
    chipsToSpawn.forEach((chip, i) => {
        setTimeout(() => {
            if (!engineRef.current) return;
            
            // Spawn from top center with some random spread
            const cx = window.innerWidth / 2;
            const startX = cx + (Math.random() - 0.5) * 100; // Random spread +/- 50px
            const startY = -60; // Just above screen

            // Rectangular Side Profile
            const width = CHIP_WIDTH; 
            const height = CHIP_HEIGHT;

            const body = Matter.Bodies.rectangle(startX, startY, width, height, {
                restitution: 0.5,
                friction: 0.1,
                chamfer: { radius: 4 }, // Rounded corners
                render: {
                    fillStyle: chip.color,
                    strokeStyle: '#000',
                    lineWidth: 2
                }
            });

            // Attach Custom Data
            (body as any).spawnTime = Date.now();
            (body as any).chipValue = chip.value;
            (body as any).hasArrived = false;

            // Update Total
            setPotTotal(prev => prev + chip.value);
            setIsPulsing(true);
            setTimeout(() => setIsPulsing(false), 200);

            // Initial random spin or slight horizontal push
            Matter.Body.setVelocity(body, {
                x: (Math.random() - 0.5) * 2,
                y: 5 + Math.random() * 5 // Initial downward velocity
            });
            
            // 30% Check for angular velocity
            if (Math.random() < 0.3) {
                 Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.2);
            }

            Matter.World.add(engineRef.current.world, body);
            bodiesRef.current.push(body);
        }, i * 50); // Stagger spawning
    });

  }, [scoreDetails]);

  // Collection logic
  useEffect(() => {
    if (!isCollecting || !engineRef.current || bodiesRef.current.length === 0) return;

    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;
    
    const targetRect = targetEl.getBoundingClientRect();
    const tx = targetRect.left + targetRect.width / 2;
    const ty = targetRect.top + targetRect.height / 2;

    // Disable gravity for collection phase
    engineRef.current.gravity.y = 0;

    let animFrame: number;
    const animateCollection = () => {
        let allArrived = true;
        const arrivalThreshold = 30;
        bodiesRef.current.forEach(body => {
            // Remove per-chip delay: all chips move together when isCollecting is true
            const isReady = true; 

            if (!isReady) {
                allArrived = false;
                return;
            }

            // Only disable collisions once it starts moving
            if (!body.isSensor) body.isSensor = true;

            const dx = tx - body.position.x;
            const dy = ty - body.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > arrivalThreshold) {
                allArrived = false;
                // Lerp towards target
                 const vx = (dx * 0.1); 
                 const vy = (dy * 0.1);
                 
                Matter.Body.setVelocity(body, { x: vx, y: vy });
            } else {
                // Hide body once arrived if not already hidden
                if (body.render.opacity !== 0) {
                     body.render.opacity = 0;
                     // Decrement removed as per user request (show total won this round)
                     if (!(body as any).hasArrived) {
                        (body as any).hasArrived = true;
                        if (onChipArrived) {
                            onChipArrived((body as any).chipValue);
                        }
                     }
                }
            }
        });

        if (allArrived) {
            cancelAnimationFrame(animFrame);
            // Cleanup bodies
            setTimeout(() => {
                if (engineRef.current) {
                    bodiesRef.current.forEach(b => Matter.World.remove(engineRef.current!.world, b));
                    bodiesRef.current = [];
                    // Restore gravity for next time
                    engineRef.current.gravity.y = 1.3;
                }
                setPotTotal(0); // Ensure clear
                onCollectionComplete();
            }, 100);
        } else {
            animFrame = requestAnimationFrame(animateCollection);
        }
    };

    animFrame = requestAnimationFrame(animateCollection);

    return () => cancelAnimationFrame(animFrame);

  }, [isCollecting, targetId, onCollectionComplete]);

  return (
    <div ref={containerRef} className={styles.container}>
      <canvas ref={canvasRef} />
      {potTotal > 0 && (
          <div className={`${styles.potTotal} ${isPulsing ? styles.pulse : ''}`}>
            <div className={styles.potValue}>${potTotal}</div>
          </div>
      )}
    </div>
  );
};
