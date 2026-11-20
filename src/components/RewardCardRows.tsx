import { getRaise } from '../logic/handScoring';
import { getPackCard, type PackCard } from '../logic/packCards';
import type { RewardCard } from '../logic/rewardCards';
import { RelicManager } from '../logic/relics/manager';
import type { RelicInstance } from '../logic/relics/types';
import { INITIAL_RELIC_SLOTS } from '../logic/relics/inventory';
import { SPECIAL_COLORS } from '../logic/specialCards';
import { RaiseCard } from './RaiseCard';
import { RankIcon } from './RankIcon';
import { SpecialCardIcon } from './SpecialCardIcon';
import { RelicTooltip } from './RelicTooltip';
import { RewardRowTooltip } from './RewardRowTooltip';
import { describeDeckReward } from '../logic/rewardDescriptions';
import styles from './RaisePackChoice.module.css';

export function DeckRewardRows({ card }: { card: PackCard }) {
    const suitIcons = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
    return <span className={styles.modifiers}>
        {card.benefits.map((benefit, index) => <RewardRowTooltip key={index}
            className={`${styles.modifier} ${styles.deckModifier}`} title={benefit.label} subtitle="Deck probability"
            icon={benefit.kind === 'suit' ? <span className={`${styles.suitIcon} ${benefit.target === 'hearts' || benefit.target === 'diamonds' ? styles.redSuit : styles.blackSuit}`}>{suitIcons[benefit.target]}</span>
                : benefit.kind === 'rank' ? <RankIcon rank={benefit.target} /> : <SpecialCardIcon type={benefit.type} />}
            description={describeDeckReward(benefit)}>
            <span className={styles.modifierName}>
                {benefit.kind === 'suit' ? <>
                    <span aria-hidden="true" className={`${styles.suitIcon} ${benefit.target === 'hearts' || benefit.target === 'diamonds' ? styles.redSuit : styles.blackSuit}`}>
                        {suitIcons[benefit.target]}
                    </span>{benefit.label}
                </> : benefit.kind === 'rank' ? <><RankIcon rank={benefit.target} />{benefit.label}</> : <>
                    <SpecialCardIcon type={benefit.type} />
                    <span style={{ color: SPECIAL_COLORS[benefit.type] }}>{benefit.label}</span>
                </>}
            </span>
            <strong className={benefit.change.endsWith('fewer') ? styles.negative : styles.cash}>
                {benefit.change.replace(/\b\w/g, letter => letter.toUpperCase())}
            </strong>
        </RewardRowTooltip>)}
    </span>;
}

export function RewardCardRows({ card, inventory = [] }: { card: RewardCard; inventory?: readonly RelicInstance[] }) {
    const effects = inventory.filter(instance => !RelicManager.getRelicConfig(instance.id)?.tableAction);
    const replaced = effects.length >= INITIAL_RELIC_SLOTS ? RelicManager.getRelicConfig(effects[0].id) : undefined;
    const rowOrder = { relic: 0, raise: 1, deck: 2 };
    const rows = [...card.rows].sort((left, right) => rowOrder[left.kind] - rowOrder[right.kind]);
    return <>
        <span className={`${styles.modifiers} ${styles.rewardRows}`} data-reward-rows>
            {rows.map((row, index) => {
                if (row.kind === 'raise') return <RaiseCard key={index} raise={getRaise(row.raiseId)!} />;
                if (row.kind === 'deck') return <DeckRewardRows key={index} card={getPackCard(row.cardId)!} />;
                const effect = RelicManager.getRelicConfig(row.relicId)!;
                return <RewardRowTooltip key={index} className={`${styles.modifier} ${styles.effectRow}`}
                    effectId={effect.id} description={effect.description}
                    content={<RelicTooltip relic={effect} displayValues={effect.properties ?? {}} isFlexible subtitle="Reward effect" />}>
                    <span className={styles.effectName}>
                        {effect.icon && /[./]/.test(effect.icon) ? <img src={effect.icon} alt="" /> : <span aria-hidden="true">{effect.icon}</span>}
                        {effect.name}
                    </span>
                </RewardRowTooltip>;
            })}
        </span>
        {replaced && card.rows.some(row => row.kind === 'relic') && <span className={styles.replacementNote}>
            Replaces {replaced.name}
        </span>}
    </>;
}
