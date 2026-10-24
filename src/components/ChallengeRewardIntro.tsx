import { useLayoutEffect, useRef } from 'react';
import type { Challenge } from '../engine/challenges';
import type { PackId } from '../logic/packs';
import { ChallengeProgress, formatChallengeProgress } from './ChallengeProgress';
import { PackVisual } from './PackVisual';
import { useLayout } from './ResponsiveLayout';
import challengeStyles from './ChallengeBoard.module.css';
import packStyles from './RaisePackChoice.module.css';
import styles from './PackReward.module.css';

/** Presentation only: the queued engine reward stays untouched throughout the flight. */
export function ChallengeRewardIntro({ challenge, packId, onDepart, onReveal, onComplete }: {
    challenge: Challenge; packId: PackId; onDepart: () => void; onReveal: () => void; onComplete: () => void;
}) {
    const scene = useRef<HTMLDivElement>(null);
    const token = useRef<HTMLDivElement>(null);
    const row = useRef<HTMLDivElement>(null);
    const pack = useRef<HTMLDivElement>(null);
    const { idealWidth, referencePanelsFit } = useLayout();

    useLayoutEffect(() => {
        const root = scene.current;
        const element = token.current;
        const challengeRow = row.current;
        const packFace = pack.current;
        if (!root || !element || !challengeRow || !packFace) { onReveal(); onComplete(); return; }
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
        const play = async (target: HTMLElement, frames: Keyframe[], duration: number) => {
            const animation = target.animate(frames, { duration, fill: 'both', easing: 'cubic-bezier(.2,.8,.2,1)' });
            animations.push(animation);
            await animation.finished;
        };
        const run = async () => {
            try {
                if (reducedMotion) {
                    await Promise.all([
                        play(challengeRow, [{ opacity: 1 }, { opacity: 0 }], 120),
                        play(packFace, [{ opacity: 0 }, { opacity: 1 }], 120),
                    ]);
                } else {
                    // Both faces share one flight, so the pack replaces the row in place.
                    await Promise.all([
                        play(element, [
                            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))` },
                            { transform: 'translate(-50%, -50%)' },
                        ], 1000),
                        play(challengeRow, [
                            { opacity: 1, scale: '1' },
                            { opacity: 1, offset: .15 },
                            { opacity: 0, scale: '1.8', offset: .8 },
                            { opacity: 0, scale: '1.8' },
                        ], 1000),
                        play(packFace, [
                            { opacity: 0, transform: 'scale(.28)' },
                            { opacity: 0, offset: .15 },
                            { opacity: 1, offset: .8 },
                            { opacity: 1, transform: 'scale(1)' },
                        ], 1000),
                    ]);
                }
                // Hand off the full-size sealed pack directly to its opening animation.
                if (alive) { reveal(); onComplete(); }
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

    return <div ref={scene} className={`${packStyles.scene} ${styles.challengeIntro}`}
        style={referencePanelsFit ? { left: '50%', width: idealWidth, transform: 'translateX(-50%)' } : undefined}
        role="status" aria-label={`${formatChallengeProgress(challenge)} complete. ${challenge.main ? 'Major' : 'Minor'} pack reward.`}>
        <div ref={token} className={packStyles.packPosition} aria-hidden="true">
            <div ref={row}
                className={`${challengeStyles.challenge} ${challenge.main ? challengeStyles.main : ''} ${styles.challengeToken}`}>
                <span className={challengeStyles.goal}>{formatChallengeProgress(challenge)}</span>
                <ChallengeProgress challenge={challenge} />
            </div>
            <div ref={pack} className={styles.challengePack}><PackVisual packId={packId} /></div>
        </div>
    </div>;
}
