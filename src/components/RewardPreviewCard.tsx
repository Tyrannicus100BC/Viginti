import type { CSSProperties } from 'react';
import type { RewardCard } from '../logic/rewardCards';
import { getRelicRarityFrameColor, getRelicRarityTextColor } from '../logic/relics/rarity';
import { RewardCardRows } from './RewardCardRows';
import { PACK_FAMILY_COLORS, RaisePackArt } from './RaisePackArt';
import styles from './RaisePackChoice.module.css';

export function RewardPreviewCard({ card }: { card: RewardCard }) {
    return <article aria-label={`${card.rarity} Reward`} data-reward-preview tabIndex={0}
        className={styles.card}
        style={{ '--rarity-color': getRelicRarityFrameColor(card.rarity), '--card-type-color': PACK_FAMILY_COLORS.mixed, cursor: 'default' } as CSSProperties}>
        <span className={styles.rarity} style={{ color: getRelicRarityTextColor(card.rarity) }}>{card.rarity}</span>
        <span className={styles.cardBody}><RewardCardRows card={card} /></span>
        <span className={styles.cardType}><RaisePackArt family="mixed" />Reward</span>
    </article>;
}
