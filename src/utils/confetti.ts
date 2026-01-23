export interface ConfettiConfig {
    angle?: number;
    spread?: number;
    startVelocity?: number;
    elementCount?: number;
    decay?: number;
    colors?: string[];
    random?: () => number;
    originX?: number;
    originY?: number;
}

export function fireConfetti(canvas: HTMLCanvasElement, config: ConfettiConfig = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const particles: Particle[] = [];
    const colors = config.colors || ['#2ecc71', '#3498db', '#e74c3c', '#f1c40f', '#9b59b6'];
    const count = config.elementCount || 50;
    const angle = (config.angle || 90) * (Math.PI / 180);
    const spread = (config.spread || 45) * (Math.PI / 180);
    const startVelocity = config.startVelocity || 45;
    const decay = config.decay || 0.9;

    // Use provided origin or default to center of canvas
    const originX = config.originX ?? (canvas.width / 2);
    const originY = config.originY ?? (canvas.height / 2);

    for (let i = 0; i < count; i++) {
        particles.push(new Particle(originX, originY, angle, spread, startVelocity, decay, colors));
    }

    function animate() {
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let activeParticles = 0;
        particles.forEach(p => {
            p.update();
            p.draw(ctx);
            if (p.life > 0) activeParticles++;
        });

        if (activeParticles > 0) {
            requestAnimationFrame(animate);
        }
    }

    animate();
}

class Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    decay: number;
    color: string;
    size: number;
    tilt: number;
    tiltAngleIncrement: number;
    tiltAngle: number;
    age: number;

    constructor(x: number, y: number, angle: number, spread: number, velocity: number, decay: number, colors: string[]) {
        this.x = x;
        this.y = y;
        this.life = 1.0;
        this.decay = decay;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.size = Math.random() * 8 + 4;
        this.age = 0;

        // Calculate velocity based on angle and spread
        const particleAngle = angle + (Math.random() - 0.5) * spread;
        // Randomized velocity to be 40% - 75% of current velocity
        const particleVelocity = velocity * (0.4 + Math.random() * 0.35);

        this.vx = Math.cos(particleAngle) * particleVelocity;
        this.vy = -Math.sin(particleAngle) * particleVelocity; // Negative Y is up

        this.tilt = Math.random() * 10 - 10;
        this.tiltAngleIncrement = Math.random() * 0.07 + 0.05;
        this.tiltAngle = 0;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        
        // Gravity and air resistance
        this.vy += 1.2; // 1.5x gravity
        this.vx *= 0.98; // Soft air resistance
        this.vy *= 0.99; // Less resistance on Y for better falls
        
        this.life *= this.decay;
        this.age++;

        this.tiltAngle += this.tiltAngleIncrement;
        this.tilt = Math.sin(this.tiltAngle) * 12;
    }

    draw(ctx: CanvasRenderingContext2D) {
        // Alpha fading logic: 
        // 1. Quick fade up at the start (first 8 frames)
        // 2. Slow fade out (managed by life and decay)
        const fadeIn = Math.min(1, this.age / 8);
        const alpha = fadeIn * this.life;

        ctx.beginPath();
        ctx.lineWidth = this.size / 2;
        ctx.strokeStyle = this.color;
        ctx.moveTo(this.x + this.tilt + this.size / 3, this.y);
        ctx.lineTo(this.x + this.tilt, this.y + this.tilt + this.size / 3);
        ctx.globalAlpha = alpha;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
}
