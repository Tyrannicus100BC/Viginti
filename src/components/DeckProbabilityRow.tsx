import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { DeckProbabilities, DeckProbabilityTarget } from '../engine/GameState';
import { getDeckProbabilityRaiseChanges } from '../logic/packCards';
import styles from './DeckView.module.css';
import tooltipStyles from './HandScores.module.css';

const RANK_DETAILS = {
    ace: { description: 'Chance that each card drawn is an Ace.', note: 'Aces count as 1 or 11 toward your hand total.' },
    face: { description: 'Chance that each card drawn is a 10, Jack, Queen, or King.', note: 'These four ranks are equally likely within this group. Each counts as 10 toward your hand total.' },
    upper: { description: 'Chance that each card drawn is a 6, 7, 8, or 9.', note: 'These four ranks are equally likely within this group. Each counts as its face value toward your hand total.' },
    lower: { description: 'Chance that each card drawn is a 2, 3, 4, or 5.', note: 'These four ranks are equally likely within this group. Each counts as its face value toward your hand total.' },
};
const SPECIAL_DETAILS = {
    chip: { description: 'Chance that each card drawn carries a cash bonus.', note: 'Adds $4, $7, or $9 for Win or Viginti, and for each Pair, Straight, or Flush the card belongs to. Straight and Flush bonuses repeat cards − 1 times. Patterns pay on any outcome. The bonus amount is rolled separately from this draw chance.' },
    mult: { description: 'Chance that each card drawn carries a multiplier bonus.', note: 'Adds 2%, 4%, or 6% to the round multiplier for Win or Viginti, and for each Pair, Straight, or Flush the card belongs to. Straight and Flush bonuses repeat cards − 1 times. Patterns pay on any outcome. The bonus amount is rolled separately from this draw chance.' },
    score: { description: 'Chance that each card drawn carries a value reduction.', note: 'Subtracts 1, 2, 3, or 4 from your hand total toward 21. The reduction is rolled separately from this draw chance.' },
};

function formatPercent(chance: number) {
    return `${Number((chance * 100).toFixed(2))}%`;
}

export function DeckProbabilityDetails({ label, chance, target, probabilities }: {
    label: string; chance: number; target: DeckProbabilityTarget; probabilities: DeckProbabilities;
}) {
    const details = target.kind === 'suit'
        ? { description: `Chance that each card drawn is ${target.target}.`, note: 'Suit is rolled independently of rank and special bonuses. Suit probabilities total 100%.' }
        : target.kind === 'rank' ? RANK_DETAILS[target.target] : SPECIAL_DETAILS[target.target];
    const changes = getDeckProbabilityRaiseChanges(probabilities, target);
    return <>
        <strong className={tooltipStyles.tooltipTitle}>{label}</strong>
        <p className={tooltipStyles.handDescription}>{details.description}</p>
        <dl className={tooltipStyles.scoringParameters}>
            <div><dt>Current chance</dt><dd><strong className={styles.chanceValue}>{Math.round(chance * 100)}%</strong> per card drawn</dd></div>
        </dl>
        <p className={tooltipStyles.scoringNote}>{details.note}</p>
        {target.kind === 'rank' && <p className={tooltipStyles.scoringNote}>Rank is rolled independently of suit and special bonuses. Rank group probabilities total 100%.</p>}
        {target.kind === 'special' && <p className={tooltipStyles.scoringNote}>The card keeps its normal suit and rank. Each draw can have at most one special bonus; the remaining chance gives no bonus.</p>}
        <p className={tooltipStyles.scoringNote}>Applies to player and dealer draws. Each draw is independent; drawing a card does not use it up. Displayed percentages are rounded.</p>
        <div className={tooltipStyles.raisesSection}>
            <strong className={tooltipStyles.raisesTitle}>Raises</strong>
            {changes.length ? <ul className={tooltipStyles.raiseChanges}>
                {changes.map(change => <li key={`${change.cardId}-${change.occurrence}`}>
                    <span className={tooltipStyles.raiseName}>Deck Upgrade · {change.description}
                        {change.indirect && <span className={styles.changeNote}>Probability rebalanced</span>}
                    </span>
                    <span className={change.after < change.before ? tooltipStyles.negativeChange : tooltipStyles.cashChange}>
                        {change.after < change.before ? '-' : '+'}{Number((Math.abs(change.after - change.before) * 100).toFixed(2))} percentage points
                        <span className={styles.changeNote}>{formatPercent(change.before)} → {formatPercent(change.after)}</span>
                    </span>
                </li>)}
            </ul> : <p className={tooltipStyles.noRaises}>No recorded Raises affect this probability.</p>}
        </div>
    </>;
}

export function DeckProbabilityRow({ label, chance, color, icon, target, probabilities }: {
    label: string; chance: number; color?: string; icon?: ReactNode;
    target: DeckProbabilityTarget; probabilities: DeckProbabilities;
}) {
    const [showTooltip, setShowTooltip] = useState(false);
    const [position, setPosition] = useState({ left: 0, top: 0 });
    const row = useRef<HTMLDivElement>(null);
    const tooltip = useRef<HTMLDivElement>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tooltipId = useId();
    const cancelClose = () => { if (closeTimer.current !== null) clearTimeout(closeTimer.current); };
    const open = () => { cancelClose(); setShowTooltip(true); };
    const close = () => {
        cancelClose();
        closeTimer.current = setTimeout(() => {
            if (document.activeElement !== row.current && !tooltip.current?.contains(document.activeElement)) setShowTooltip(false);
        }, 120);
    };
    useEffect(() => () => { if (closeTimer.current !== null) clearTimeout(closeTimer.current); }, []);
    useLayoutEffect(() => {
        if (!showTooltip) return;
        const place = () => {
            if (!row.current || !tooltip.current) return;
            const anchor = row.current.getBoundingClientRect();
            const popup = tooltip.current.getBoundingClientRect();
            const gap = 8;
            let left = anchor.left - popup.width - gap;
            let top = anchor.top;
            if (left < gap) {
                left = anchor.right + gap;
                if (left + popup.width > window.innerWidth - gap) {
                    left = anchor.left + (anchor.width - popup.width) / 2;
                    top = anchor.bottom + gap;
                    if (top + popup.height > window.innerHeight - gap) top = anchor.top - popup.height - gap;
                }
            }
            setPosition({
                left: Math.max(gap, Math.min(left, window.innerWidth - popup.width - gap)),
                top: Math.max(gap, Math.min(top, window.innerHeight - popup.height - gap)),
            });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [showTooltip, probabilities, chance]);

    const percent = Math.round(chance * 100);
    return <div ref={row} className={styles.probRow} tabIndex={0}
        aria-label={`${label}: ${percent}% chance per draw`} aria-describedby={showTooltip ? tooltipId : undefined}
        onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}
        onKeyDown={event => {
            if (event.key === 'Escape' && showTooltip) {
                event.stopPropagation();
                cancelClose();
                setShowTooltip(false);
            }
        }}>
        <div className={styles.probLabel}>
            {icon && <span className={styles.probIcon} style={{ color }}>{icon}</span>}
            <span className={styles.probText}>{label}</span>
        </div>
        <div className={styles.probBarContainer}>
            <div className={styles.probBar} style={{ width: `${percent}%`, backgroundColor: color || '#3498db' }} />
        </div>
        <div className={styles.probPercent}>{percent}%</div>
        {showTooltip && createPortal(<div ref={tooltip} id={tooltipId} role="tooltip"
            className={tooltipStyles.scoreTooltip} style={position} onMouseEnter={cancelClose} onMouseLeave={close}
            onClick={event => event.stopPropagation()}>
            <DeckProbabilityDetails label={label} chance={chance} target={target} probabilities={probabilities} />
        </div>, document.body)}
    </div>;
}
