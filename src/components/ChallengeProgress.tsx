import type { Challenge, ChallengeMetric } from '../engine/challenges';
import styles from './ChallengeBoard.module.css';

const GOAL_PREFIX: Record<ChallengeMetric, string> = {
    earnings: 'Earn', rounds: 'Rounds', pairs: 'Pairs', straights: 'Straights', flushes: 'Flushes', wins: 'Wins',
};

export function formatChallengeProgress(challenge: Challenge) {
    const progress = Math.min(challenge.target, Math.max(0, challenge.progress));
    const format = (value: number) => `${challenge.metric === 'earnings' ? '$' : ''}${value.toLocaleString()}`;
    return `${GOAL_PREFIX[challenge.metric]} ${format(progress)} / ${format(challenge.target)}`;
}

function ChallengeIcon({ metric }: { metric: ChallengeMetric }) {
    if (metric === 'earnings') return <span className={styles.dollar}>$</span>;
    if (metric === 'rounds') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5" />
        <path d="M12 7v5l3 2" />
    </svg>;
    const icon = { pairs: 'pair', straights: 'straight', flushes: 'flush', wins: 'win' }[metric];
    return <img src={`/hands/${icon}.svg`} alt="" draggable={false} />;
}

export function ChallengeProgress({ challenge }: { challenge: Challenge }) {
    const progress = Math.min(challenge.target, Math.max(0, challenge.progress));
    return <div className={styles.icon} role="progressbar" aria-label={challenge.description}
        aria-valuemin={0} aria-valuemax={challenge.target} aria-valuenow={progress}
        aria-valuetext={`${formatChallengeProgress(challenge)}${challenge.main ? ', Main challenge' : ''}${challenge.completed ? ', pack earned' : ''}`}>
        <svg className={styles.ring} viewBox="0 0 40 40" aria-hidden="true">
            <circle className={styles.track} cx="20" cy="20" r="18.5" />
            <circle className={styles.fill} cx="20" cy="20" r="18.5" pathLength="100"
                strokeDasharray="100" strokeDashoffset={100 - progress / challenge.target * 100} />
        </svg>
        <span className={styles.art} aria-hidden="true">
            {challenge.completed ? '✓' : <ChallengeIcon metric={challenge.metric} />}
        </span>
        {challenge.main && <span className={styles.mainMarker} aria-hidden="true">★</span>}
    </div>;
}

