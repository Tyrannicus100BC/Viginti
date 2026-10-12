import styles from './HandIcon.module.css';

/** Hand labels carry the accessible name; their artwork is decorative. */
export function HandIcon({ icon, className = '' }: { icon: string; className?: string }) {
    return <span className={`${styles.icon} ${className}`} aria-hidden="true">
        {icon.startsWith('/')
            ? <img src={icon} alt="" draggable={false} />
            : icon}
    </span>;
}
