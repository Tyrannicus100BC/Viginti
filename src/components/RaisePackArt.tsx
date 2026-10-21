import type { PackFamily } from '../logic/packs';
import styles from './RaisePackChoice.module.css';

export const PACK_FAMILY_LABELS = { raise: 'Raise', deck: 'Deck', relic: 'Relic', mixed: 'Mixed', challenge: 'Challenge' } as const;
export const PACK_FAMILY_COLORS = { raise: '#9cd7ff', deck: '#86e2b3', relic: '#d4a7ff', mixed: '#f4be79', challenge: '#ff9fae' } as const;

export function RaisePackArt({ family = 'raise', sparkles = false }: { family?: PackFamily; sparkles?: boolean }) {
    return <svg className={styles.packArt} style={{ color: PACK_FAMILY_COLORS[family] }} viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <rect x="15" y="23" width="48" height="64" rx="6" stroke="currentColor" strokeWidth="2" transform="rotate(-13 39 55)" opacity=".35" />
        <rect x="30" y="17" width="48" height="64" rx="6" stroke="currentColor" strokeWidth="2" transform="rotate(10 54 49)" opacity=".65" />
        <rect x="25" y="17" width="48" height="66" rx="6" fill="#172638" stroke="currentColor" strokeWidth="2" />
        {family === 'raise' ? <path d="M38 59L59 38M42 38H59V55" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            : family === 'deck' ? <><path d="M49 31C42 42 35 44 35 51C35 59 44 61 49 55C54 61 63 59 63 51C63 44 56 42 49 31Z" fill="currentColor" /><path d="M49 53L43 68H55Z" fill="currentColor" /></>
            : family === 'mixed' ? <><path d="M36 40H61M36 50H61M36 60H61" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /><circle cx="40" cy="40" r="5" fill="#9cd7ff" /><circle cx="56" cy="50" r="5" fill="#86e2b3" /><circle cx="45" cy="60" r="5" fill="#d4a7ff" /></>
            : family === 'challenge' ? <><circle cx="49" cy="49" r="17" stroke="currentColor" strokeWidth="3" /><path d="M40 49L47 56L59 42" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></>
            : <><circle cx="49" cy="47" r="14" stroke="currentColor" strokeWidth="4" /><path d="M40 60L36 72L49 66L62 72L58 60M49 37L52 44L60 45L54 50L56 58L49 54L42 58L44 50L38 45L46 44Z" fill="currentColor" /></>}
        {sparkles && <path d="M79 9V21M73 15H85M14 72V82M9 77H19" stroke="#ffd77a" strokeWidth="2" strokeLinecap="round" />}
    </svg>;
}
