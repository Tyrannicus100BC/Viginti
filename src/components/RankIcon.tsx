import type { RankWeights } from '../engine/GameState';
import styles from './HandIcon.module.css';

/** Rank labels carry the accessible name; the single-card artwork is decorative. */
export function RankIcon({ rank }: { rank: keyof RankWeights }) {
    return <span className={styles.icon} aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none" focusable="false" data-rank-icon={rank}>
            <rect x="5" y="2" width="22" height="28" rx="3" fill="#fffaf0" stroke="#aeb9c3" strokeWidth="1.5" />
            {rank === 'ace' ? <path d="M13 12l4-3v14m-4 0h8" stroke="#111820" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                : rank === 'face' ? <>
                    <path d="M9 12l4 3 3-6 3 6 4-3-2 9H11z" fill="#111820" stroke="#111820" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M11 24h10" stroke="#111820" strokeWidth="2" strokeLinecap="round" />
                </> : <path d="M16 23V9m-5 5 5-5 5 5" transform={rank === 'lower' ? 'rotate(180 16 16)' : undefined}
                    stroke="#111820" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
    </span>;
}
