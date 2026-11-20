import type { PackFamily } from '../logic/packs';
import styles from './RaisePackChoice.module.css';

export const PACK_FAMILY_LABELS = { relic: 'Relic', mixed: 'Reward' } as const;
export const PACK_FAMILY_COLORS = { relic: '#d4a7ff', mixed: '#f4be79' } as const;

export function RaisePackArt({ family = 'mixed', sparkles = false }: { family?: PackFamily; sparkles?: boolean }) {
    return <svg className={styles.packArt} style={{ color: PACK_FAMILY_COLORS[family] }} viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <rect x="15" y="23" width="48" height="64" rx="6" stroke="currentColor" strokeWidth="2" transform="rotate(-13 39 55)" opacity=".35" />
        <rect x="30" y="17" width="48" height="64" rx="6" stroke="currentColor" strokeWidth="2" transform="rotate(10 54 49)" opacity=".65" />
        <rect x="25" y="17" width="48" height="66" rx="6" fill="#172638" stroke="currentColor" strokeWidth="2" />
        {family === 'mixed' ? <><path d="M36 40H61M36 50H61M36 60H61" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /><circle cx="40" cy="40" r="5" fill="#9cd7ff" /><circle cx="56" cy="50" r="5" fill="#86e2b3" /><circle cx="45" cy="60" r="5" fill="#d4a7ff" /></>
            : <><circle cx="49" cy="47" r="14" stroke="currentColor" strokeWidth="4" /><path d="M40 60L36 72L49 66L62 72L58 60M49 37L52 44L60 45L54 50L56 58L49 54L42 58L44 50L38 45L46 44Z" fill="currentColor" /></>}
        {sparkles && <path d="M79 9V21M73 15H85M14 72V82M9 77H19" stroke="#ffd77a" strokeWidth="2" strokeLinecap="round" />}
    </svg>;
}
