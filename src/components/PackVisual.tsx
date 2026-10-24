import type { CSSProperties } from 'react';
import { getPackDefinition, PACK_QUALITY_LABELS, type PackId } from '../logic/packs';
import { PACK_FAMILY_COLORS, RaisePackArt } from './RaisePackArt';
import detailsStyles from './PackCardDetails.module.css';
import styles from './RaisePackChoice.module.css';

/** The same sealed foil pack, whether offered as a reward or opening. */
export function PackVisual({ packId }: { packId: PackId }) {
    const pack = getPackDefinition(packId);
    const majorOrMinor = packId === 'mixed_major' || packId === 'mixed_minor';
    const progression = majorOrMinor || packId === 'relic_boss';
    return <span className={styles.packFace}
        style={{ '--pack-color': PACK_FAMILY_COLORS[pack.family] } as CSSProperties}>
        <span className={styles.packSeal} />
        <strong className={`${styles.rarity} ${styles.packName}`}>{pack.name}</strong>
        <span className={detailsStyles.details}>
            <span className={`${detailsStyles.art} ${styles.packIcon}`}>
                <RaisePackArt family={pack.family} sparkles />
            </span>
            {!progression && <strong className={detailsStyles.name}>{PACK_QUALITY_LABELS[pack.quality]} Choices</strong>}
            {!majorOrMinor && <span className={detailsStyles.description}>Choose {pack.pickCount} of {pack.offerCount}</span>}
        </span>
        {majorOrMinor && <span className={styles.packBrand}>VIGINTI</span>}
    </span>;
}
