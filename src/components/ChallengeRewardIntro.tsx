import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Challenge } from '../engine/challenges';
import { ChallengeProgress, formatChallengeProgress } from './ChallengeProgress';
import challengeStyles from './ChallengeBoard.module.css';
import styles from './PackReward.module.css';

/** Presentation only: the queued engine reward stays untouched throughout the flight. */
export function ChallengeRewardIntro({ challenge, onDepart, onReveal, onComplete }: {
    challenge: Challenge; onDepart: () => void; onReveal: () => void; onComplete: () => void;
}) {
    const scene = useRef<HTMLDivElement>(null);
    const token = useRef<HTMLDivElement>(null);
    const [bursting, setBursting] = useState(false);

    useLayoutEffect(() => {
        const root = scene.current;
        const element = token.current;
        if (!root || !element) { onReveal(); onComplete(); return; }
        const source = Array.from(document.querySelectorAll<HTMLElement>('[data-challenge-id]'))
            .find(row => row.dataset.challengeId === challenge.id);
        const origin = source?.getBoundingClientRect();
        const destination = element.getBoundingClientRect();
        const scale = root.getBoundingClientRect().width / root.offsetWidth || 1;
        const dx = origin ? (origin.left + origin.width / 2 - destination.left - destination.width / 2) / scale : 0;
        const dy = origin ? (origin.top + origin.height / 2 - destination.top - destination.height / 2) / scale : 0;
        onDepart();
        const animations: Animation[] = [];
        let alive = true;
        let revealed = false;
        const reveal = () => { if (!revealed) { revealed = true; onReveal(); } };
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const play = async (frames: Keyframe[], duration: number) => {
            const animation = element.animate(frames, { duration, fill: 'both', easing: 'cubic-bezier(.2,.8,.2,1)' });
            animations.push(animation);
            await animation.finished;
        };
        const run = async () => {
            try {
                if (reducedMotion) {
                    await play([{ opacity: 1 }, { opacity: 0 }], 120);
                    if (!alive) return;
                    reveal();
                    await play([{ opacity: 0 }, { opacity: 0 }], 160);
                } else {
                    await play([
                        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1 },
                        { transform: 'translate(-50%, -50%) scale(1.8)', opacity: 0, offset: 0.76 },
                        { transform: 'translate(-50%, -50%) scale(1.8)', opacity: 0 },
                    ], 1000);
                    if (!alive) return;
                    setBursting(true);
                    reveal();
                    // Keep the token invisible throughout the burst and card reveal.
                    await play([{ opacity: 0 }, { opacity: 0 }], 700);
                }
                if (alive) onComplete();
            } catch {
                // A missing animation API must never block a reward; unmounts simply cancel.
                if (alive) { reveal(); onComplete(); }
            }
        };
        void run();
        return () => {
            alive = false;
            animations.forEach(animation => animation.cancel());
        };
    }, [challenge.id, onDepart, onReveal, onComplete]);

    return <div ref={scene} className={`${styles.challengeIntro} ${bursting ? styles.bursting : ''}`}
        role="status" aria-label={`${formatChallengeProgress(challenge)} complete. ${challenge.main ? 'Major' : 'Minor'} pack reward.`}>
        <div ref={token} aria-hidden="true"
            className={`${challengeStyles.challenge} ${challenge.main ? challengeStyles.main : ''} ${styles.challengeToken}`}>
            <span className={challengeStyles.goal}>{formatChallengeProgress(challenge)}</span>
            <ChallengeProgress challenge={challenge} />
        </div>
        <div className={styles.introCaption} aria-hidden="true">CHALLENGE COMPLETE</div>
        {bursting && <div className={styles.challengeBurst} aria-hidden="true">
            <div className={styles.burstRing} />
            {Array.from({ length: 12 }, (_, index) => {
                const angle = index / 12 * Math.PI * 2;
                return <i key={index} className={styles.spark} style={{
                    '--spark-x': `${Math.cos(angle) * 310}px`, '--spark-y': `${Math.sin(angle) * 230}px`,
                } as CSSProperties} />;
            })}
        </div>}
    </div>;
}
