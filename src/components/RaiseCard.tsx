import type { CSSProperties } from 'react';
import { RAISE_HAND_TYPES, formatRaiseCash, formatRaiseMult, type Raise } from '../logic/handScoring';
import { getRelicRarityFrameColor, getRelicRarityTextColor } from '../logic/relics/rarity';
import { HandIcon } from './HandIcon';
import { PACK_FAMILY_COLORS, RaisePackArt } from './RaisePackArt';
import styles from './RaisePackChoice.module.css';

export function RaiseCard({ raise }: { raise: Raise }) {
    const group = ({ chips, mult }: Raise['modifiers'][number]) => chips > 0 ? 0 : mult > 0 ? 1 : chips < 0 ? 2 : 3;
    const modifiers = [...raise.modifiers].sort((left, right) =>
        group(left) - group(right)
        || RAISE_HAND_TYPES.findIndex(hand => hand.id === left.handTypeId) - RAISE_HAND_TYPES.findIndex(hand => hand.id === right.handTypeId)
    );
    return <>
        <span className={styles.modifiers}>
            {modifiers.map((effect, index) => {
                const hand = RAISE_HAND_TYPES.find(hand => hand.id === effect.handTypeId)!;
                return <span key={index} className={styles.modifier}>
                    <span className={styles.handName}><HandIcon icon={hand.icon} /> {hand.name}</span>
                    <strong className={effect.chips < 0 || effect.mult < 0 ? styles.negative : effect.chips ? styles.cash : styles.mult}>
                        {effect.chips ? formatRaiseCash(effect.chips) : formatRaiseMult(effect.mult)}
                    </strong>
                </span>;
            })}
        </span>
    </>;
}

/** Non-interactive version of the same reward card used by pack choices. */
export function RaisePreviewCard({ raise }: { raise: Raise }) {
    return <article aria-label={`${raise.rarity} Raise`} data-raise-preview
        className={`${styles.card} ${raise.modifiers.length > 3 ? styles.denseCard : ''}`}
        style={{ '--rarity-color': getRelicRarityFrameColor(raise.rarity), '--card-type-color': PACK_FAMILY_COLORS.raise, cursor: 'default' } as CSSProperties}>
        <span className={styles.cardType}><RaisePackArt family="raise" />Raise</span>
        <span className={styles.rarity} style={{ color: getRelicRarityTextColor(raise.rarity) }}>{raise.rarity}</span>
        <span className={styles.cardBody}><RaiseCard raise={raise} /></span>
    </article>;
}
