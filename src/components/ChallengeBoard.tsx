import { useId, useState } from 'react';
import { useGameBridge } from '../store/gameBridge';
import type { Challenge } from '../engine/challenges';
import { ChallengeProgress, formatChallengeProgress } from './ChallengeProgress';
import tooltipStyles from './RelicTooltip.module.css';
import styles from './ChallengeBoard.module.css';

function ChallengeTooltip({ challenge, id, offset }: { challenge: Challenge; id: string; offset: number }) {
    const tier = challenge.rewardTier ?? (challenge.main ? 'major' : 'minor');
    const description = challenge.main
        ? 'Complete either Main for a major pack.\nAnte and goals update after all packs.'
        : `Complete for a ${tier} pack.\n${challenge.source === 'pack' ? 'This extra goal carries across ante changes.' : 'Keep the ante and other goal progress.'}`;
    return <div id={id} role="tooltip"
        className={`${tooltipStyles.container} ${tooltipStyles.containerHorizontal} ${styles.tooltip} ${challenge.main ? styles.main : ''}`}
        style={{ top: Math.max(-11, offset - 11) }}>
        <div className={`${tooltipStyles.header} ${tooltipStyles.headerHorizontal} ${styles.tooltipHeader}`}>
            <ChallengeProgress challenge={challenge} />
            <div className={tooltipStyles.titleBlock}>
                <div className={tooltipStyles.title}>{formatChallengeProgress(challenge)}</div>
                <div className={`${tooltipStyles.rarity} ${styles.tooltipSubtitle}`}>
                    {tier === 'major' ? 'Major' : 'Minor'}
                </div>
            </div>
        </div>
        <div className={tooltipStyles.divider} />
        <div className={`${tooltipStyles.content} ${tooltipStyles.contentHorizontal}`}>
            <div className={`${tooltipStyles.description} ${styles.tooltipDescription}`}>{description}</div>
        </div>
    </div>;
}

export function ChallengeBoard() {
    const challenges = useGameBridge(state => state.challenges);
    const rewards = useGameBridge(state => state.challengeRewards);
    const departed = useGameBridge(state => state.departedChallengeIds);
    const openedRewardId = useGameBridge(state => state.pendingPack && !state.gameState.debugPackReturn ? state.challengeRewards[0]?.id : null);
    const isVacant = (challenge: Challenge) => departed.includes(challenge.id) || openedRewardId === challenge.id
        || (challenge.completed && !rewards.some(reward => reward.id === challenge.id));
    const [scrollTop, setScrollTop] = useState(0);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const tooltipId = useId();
    const expandedIndex = challenges.findIndex(challenge => challenge.id === (hoveredId ?? focusedId));
    const hovered = challenges[expandedIndex];
    const expanded = hovered && !isVacant(hovered) ? hovered : null;
    return <section id="challenge-board" className={styles.board} aria-label="Challenges" onClick={event => event.stopPropagation()}>
        <div className={styles.rows} onScroll={event => {
            setScrollTop(event.currentTarget.scrollTop);
            setHoveredId(null);
            setFocusedId(null);
        }}>
        {challenges.map(challenge => <div key={challenge.id} tabIndex={isVacant(challenge) ? -1 : 0} aria-hidden={isVacant(challenge)} data-challenge-id={challenge.id}
            className={`${styles.challenge} ${challenge.main ? styles.main : ''} ${challenge.completed ? styles.completed : ''} ${isVacant(challenge) ? styles.vacant : ''}`}
            aria-describedby={expanded?.id === challenge.id ? tooltipId : undefined}
            onMouseEnter={() => setHoveredId(challenge.id)} onMouseLeave={() => setHoveredId(null)}
            onFocus={() => setFocusedId(challenge.id)} onBlur={() => setFocusedId(null)}
            onKeyDown={event => {
                if (event.key === 'Escape') { setHoveredId(null); setFocusedId(null); event.stopPropagation(); }
            }}>
            <span className={styles.goal}>{formatChallengeProgress(challenge)}</span>
            <ChallengeProgress challenge={challenge} />
        </div>)}
        </div>
        {expanded && <ChallengeTooltip challenge={expanded} id={tooltipId} offset={expandedIndex * 50 - scrollTop} />}
    </section>;
}
