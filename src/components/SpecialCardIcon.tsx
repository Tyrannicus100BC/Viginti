import type { SpecialType } from '../logic/specialCards';
import styles from './HandIcon.module.css';

const SYMBOL_COLORS: Record<SpecialType, string> = {
    chip: '#16a34a', mult: '#ea580c', score: '#9333ea',
};

/** The adjacent card label supplies the accessible name. */
export function SpecialCardIcon({ type }: { type: SpecialType }) {
    return <span className={styles.icon} aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none" focusable="false" data-special-card-icon={type}>
            <rect x="5" y="2" width="22" height="28" rx="3" fill="#fffaf0" stroke="#aeb9c3" strokeWidth="1.5" />
            <g stroke={SYMBOL_COLORS[type]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {type === 'chip' ? <>
                    <path d="M20 11.5c-1-2-8-2-8 1.5s8 2.5 8 6-7 3.5-8 1.5" />
                    <path d="M16 7.5v17" />
                </> : type === 'mult' ? <>
                    <path d="M11 23l10-14" />
                    <circle cx="12" cy="11" r="2" />
                    <circle cx="20" cy="21" r="2" />
                </> : <path d="M11 16h10" strokeWidth="3" />}
            </g>
        </svg>
    </span>;
}
