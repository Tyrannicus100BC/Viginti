import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
            className={`${styles.modifier} ${styles.deckModifier}`} description={describeDeckReward(benefit)}>
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
    const [hover, setHover] = useState<{ id: string; left: number; top: number } | null>(null);
    const root = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const button = root.current?.closest('button');
        if (!button) return;
        const focus = () => {
            const row = root.current?.querySelector<HTMLElement>('[data-reward-effect], [data-reward-tooltip]');
            if (!row?.dataset.rewardEffect) return;
            const rect = row.getBoundingClientRect();
            setHover({ id: row.dataset.rewardEffect!, left: Math.max(12, Math.min(rect.left, window.innerWidth - 332)),
                top: Math.max(12, Math.min(rect.bottom + 12, window.innerHeight - 240)) });
        };
        const blur = () => setHover(null);
        const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') setHover(null); };
        button.addEventListener('focus', focus);
        button.addEventListener('blur', blur);
        button.addEventListener('keydown', keydown);
        return () => {
            button.removeEventListener('focus', focus);
            button.removeEventListener('blur', blur);
            button.removeEventListener('keydown', keydown);
        };
    }, []);
    const effects = inventory.filter(instance => !RelicManager.getRelicConfig(instance.id)?.tableAction);
    const replaced = effects.length >= INITIAL_RELIC_SLOTS ? RelicManager.getRelicConfig(effects[0].id) : undefined;
    const hovered = hover && RelicManager.getRelicConfig(hover.id);
    const rowOrder = { relic: 0, raise: 1, deck: 2 };
    const rows = [...card.rows].sort((left, right) => rowOrder[left.kind] - rowOrder[right.kind]);
    return <>
        <span ref={root} className={`${styles.modifiers} ${styles.rewardRows}`} data-reward-rows
            onMouseOver={event => {
                if ((event.target as HTMLElement).closest('[data-reward-tooltip]')) setHover(null);
            }}>
            {rows.map((row, index) => {
                if (row.kind === 'raise') return <RaiseCard key={index} raise={getRaise(row.raiseId)!} />;
                if (row.kind === 'deck') return <DeckRewardRows key={index} card={getPackCard(row.cardId)!} />;
                const effect = RelicManager.getRelicConfig(row.relicId)!;
                return <span key={index} className={`${styles.modifier} ${styles.effectRow}`}
                    data-reward-effect={effect.id}
                    onMouseEnter={event => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setHover({ id: effect.id, left: Math.max(12, Math.min(rect.left, window.innerWidth - 332)),
                            top: Math.max(12, Math.min(rect.bottom + 12, window.innerHeight - 240)) });
                    }} onMouseLeave={() => setHover(null)}>
                    <span className={styles.effectName}>
                        {effect.icon && /[./]/.test(effect.icon) ? <img src={effect.icon} alt="" /> : <span aria-hidden="true">{effect.icon}</span>}
                        {effect.name}
                    </span>
                </span>;
            })}
        </span>
        {replaced && card.rows.some(row => row.kind === 'relic') && <span className={styles.replacementNote}>
            Replaces {replaced.name}
        </span>}
        {hover && hovered && createPortal(<RelicTooltip relic={hovered} displayValues={hovered.properties ?? {}}
            subtitle="Reward effect" style={{ position: 'fixed', left: hover.left, top: hover.top, width: 300,
                pointerEvents: 'none', zIndex: 20000 }} />, document.body)}
    </>;
}
