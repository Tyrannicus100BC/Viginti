import { RAISE_HAND_TYPES, formatRaiseCash, formatRaiseMult, type Raise } from '../logic/handScoring';
import { HandIcon } from './HandIcon';
import { RewardRowTooltip } from './RewardRowTooltip';
import { describeRaiseReward } from '../logic/rewardDescriptions';
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
                return <RewardRowTooltip key={index} className={styles.modifier} title={hand.name} icon={<HandIcon icon={hand.icon} />} subtitle="Hand score" description={describeRaiseReward(effect)}>
                    <span className={styles.handName}><HandIcon icon={hand.icon} /> {hand.name}</span>
                    <strong className={effect.chips < 0 || effect.mult < 0 ? styles.negative : effect.chips ? styles.cash : styles.mult}>
                        {effect.chips ? formatRaiseCash(effect.chips) : formatRaiseMult(effect.mult)}
                    </strong>
                </RewardRowTooltip>;
            })}
        </span>
    </>;
}
