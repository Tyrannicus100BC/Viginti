import styles from './RaisePackChoice.module.css';

export function RaisePackArt() {
    return <svg className={styles.packArt} viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <rect x="15" y="23" width="48" height="64" rx="6" stroke="currentColor" strokeWidth="2" transform="rotate(-13 39 55)" opacity=".35" />
        <rect x="30" y="17" width="48" height="64" rx="6" stroke="currentColor" strokeWidth="2" transform="rotate(10 54 49)" opacity=".65" />
        <rect x="25" y="17" width="48" height="66" rx="6" fill="#172638" stroke="currentColor" strokeWidth="2" />
        <path d="M38 59L59 38M42 38H59V55" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M79 9V21M73 15H85M14 72V82M9 77H19" stroke="#ffd77a" strokeWidth="2" strokeLinecap="round" />
    </svg>;
}
