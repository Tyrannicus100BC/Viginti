import type { ReactNode } from 'react';
import styles from './PackCardDetails.module.css';

/** Shared portrait layout for the descriptive cards offered in packs. */
export function PackCardDetails({ icon, name, children }: {
    icon: ReactNode; name: string; children: ReactNode;
}) {
    return <span className={styles.details}>
        <span className={styles.art}>{icon}</span>
        <strong className={styles.name}>{name}</strong>
        <span className={styles.description}>{children}</span>
    </span>;
}
