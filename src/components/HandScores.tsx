import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HAND_TYPES, getHandPayout, getHandRaiseChanges, getRaise, formatRaiseCash, formatRaiseMult, type RaiseHandTypeId, type HandUpgrades } from '../logic/handScoring';
import styles from './HandScores.module.css';
import panelStyles from './ReferencePanel.module.css';
import { HandIcon } from './HandIcon';

type ScoreRow = Omit<ReturnType<typeof getHandPayout>, 'id'> & { id: string; handTypeId: RaiseHandTypeId };

const HAND_DETAILS: Record<RaiseHandTypeId, { description: string; nuance: string; unit: string }> = {
    win: {
        description: 'Beat the dealer without busting.',
        nuance: 'Winning 21 → Viginti. Push → no outcome score.',
        unit: 'Per hand',
    },
    viginti: {
        description: 'Win with exactly 21. Any number of cards.',
        nuance: 'Replaces Win. A push does not qualify.',
        unit: 'Per hand',
    },
    loss: {
        description: 'Lose without busting.',
        nuance: 'Push → no outcome score. Patterns still score.',
        unit: 'Per hand',
    },
    bust: {
        description: 'Exceed your bust limit (normally 21).',
        nuance: 'Replaces Lose. Patterns still score.',
        unit: 'Per hand',
    },
    pair: {
        description: '2 cards of the same rank.',
        nuance: '3 or 4 of a kind = 3× base and Raises. Card values and card bonuses count once. Max 3 pairs per hand.',
        unit: 'Per pair',
    },
    straight: {
        description: '2+ consecutive ranks. Any suits.',
        nuance: 'A low or high; no wrap. Repeated ranks count once.',
        unit: 'Per run',
    },
    flush: {
        description: '2+ cards of the same suit.',
        nuance: 'Each suit scores separately.',
        unit: 'Per suit group',
    },
};

function HandScoreDetails({ hand }: { hand: ScoreRow }) {
    const details = HAND_DETAILS[hand.handTypeId];
    const isRun = hand.handTypeId === 'straight' || hand.handTypeId === 'flush';
    return <>
        <strong className={styles.tooltipTitle}>{hand.name}</strong>
        <p className={styles.handDescription}>{details.description}</p>
        <div className={styles.scoringParameters}>
            <span className={styles.scoringUnit}>{details.unit}</span>
            <dl>
                <div><dt>Cash</dt><dd>
                    {hand.chipCards && <span>Card sum + </span>}
                    <strong className={hand.chips < 0 ? styles.negativeChange : styles.cashChange}
                        aria-label={formatRaiseCash(hand.chips, true)}>{formatRaiseCash(hand.chips)}</strong>
                    {isRun && ' × (cards − 1)'}
                </dd></div>
                <div><dt>Multiplier</dt><dd>
                    <strong className={hand.mult < 0 ? styles.negativeChange : styles.multChange}
                        aria-label={formatRaiseMult(hand.mult, true)}>{formatRaiseMult(hand.mult)}</strong>
                    {isRun && ' × (cards − 1)'}
                </dd></div>
            </dl>
        </div>
        <p className={styles.scoringNote}>{details.nuance}</p>
        {['win', 'viginti', 'pair', 'straight', 'flush'].includes(hand.handTypeId) &&
            <p className={styles.scoringNote}>Cash and Mult card bonuses add to this score{isRun ? ' × (cards − 1)' : ''}.
                {hand.chipCards && ' Only participating cards apply.'}</p>}
        {hand.chipCards && <>
            <p className={styles.scoringNote}>Card sum: 2–10 as shown · J/Q/K = 10 · A = 11.</p>
            <p className={styles.scoringNote}>Patterns stack on any outcome.</p>
        </>}
    </>;
}

function HandScoreRow({ hand, upgrades }: { hand: ScoreRow; upgrades: HandUpgrades }) {
    const [showTooltip, setShowTooltip] = useState(false);
    const [position, setPosition] = useState({ left: 0, top: 0 });
    const row = useRef<HTMLElement>(null);
    const tooltip = useRef<HTMLDivElement>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const changes = getHandRaiseChanges(hand.handTypeId, upgrades);
    const tooltipId = `hand-score-${hand.id}`;
    const cancelClose = () => {
        if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    };
    const open = () => { cancelClose(); setShowTooltip(true); };
    const close = () => {
        cancelClose();
        closeTimer.current = setTimeout(() => {
            if (document.activeElement !== row.current && !tooltip.current?.contains(document.activeElement)) setShowTooltip(false);
        }, 120);
    };
    useEffect(() => () => {
        if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    }, []);
    useLayoutEffect(() => {
        if (!showTooltip) return;
        const place = () => {
            if (!row.current || !tooltip.current) return;
            const anchor = row.current.getBoundingClientRect();
            const popup = tooltip.current.getBoundingClientRect();
            const gap = 8;
            let left = anchor.right + gap;
            let top = anchor.top;
            if (left + popup.width > window.innerWidth - gap) {
                left = anchor.left - popup.width - gap;
                if (left < gap) {
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
    }, [showTooltip, upgrades]);

    return <article ref={row} className={`${styles.hand}`}
        tabIndex={0} aria-describedby={showTooltip ? tooltipId : undefined}
        onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}>
        <HandIcon icon={hand.icon} className={styles.icon} />
        <h3>{hand.name}</h3>
        <strong className={`${styles.cash} ${hand.chips < 0 ? styles.isNegative : ''}`} aria-label={`${formatRaiseCash(hand.chips, true)} cash`}>{formatRaiseCash(hand.chips)}</strong>
        <strong className={styles.mult + (hand.mult < 0 ? ' ' + styles.isNegative : '')} aria-label={formatRaiseMult(hand.mult, true)}>{formatRaiseMult(hand.mult)}</strong>
        {showTooltip && createPortal(<div ref={tooltip} id={tooltipId} role="tooltip"
            className={styles.scoreTooltip} style={position} onMouseEnter={cancelClose} onMouseLeave={close}>
            <HandScoreDetails hand={hand} />
            <div className={styles.raisesSection}>
                <strong className={styles.raisesTitle}>Raises</strong>
                {changes.length ? <ul className={styles.raiseChanges}>
                    {changes.map((change, index) => <li key={`${change.raiseId}-${change.occurrence}-${index}`}
                        className={change.value < 0 ? styles.negativeChange : change.stat === 'chips' ? styles.cashChange : styles.multChange}>
                        <span className={styles.raiseName}>{getRaise(change.raiseId)?.name ?? 'Raise'}</span>
                        <span aria-label={change.stat === 'chips' ? `${formatRaiseCash(change.value, true)} cash` : `${formatRaiseMult(change.value, true)} multiplier`}>
                            {change.stat === 'chips' ? `${formatRaiseCash(change.value)} cash` : `${formatRaiseMult(change.value)} multiplier`}
                        </span>
                    </li>)}
                </ul> : <p className={styles.noRaises}>None yet.</p>}
            </div>
        </div>, document.body)}
    </article>;
}

export function HandScores({ upgrades = {}, onClose, docked = false }: { upgrades?: HandUpgrades; onClose: () => void; docked?: boolean }) {
    useEffect(() => {
        if (docked) return;
        const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', close);
        return () => window.removeEventListener('keydown', close);
    }, [onClose, docked]);
    const hands = HAND_TYPES.map(type => ({ ...getHandPayout(type.id, upgrades), handTypeId: type.id }));
    const outcomes = hands.filter(hand => !hand.chipCards).flatMap(hand => [
        hand,
        ...(hand.variant ? [{
            ...hand,
            id: hand.variant.id,
            handTypeId: hand.variant.id,
            name: hand.variant.id === 'viginti' ? 'Viginti' : hand.variant.name,
            icon: hand.variant.icon ?? hand.icon,
            chips: hand.variant.chips,
            mult: hand.variant.mult,
        }] : []),
    ]);
    const patterns = hands.filter(hand => hand.chipCards);
    return <div className={`${styles.overlay} ${docked ? `${panelStyles.docked} ${panelStyles.left}` : ''}`} onClick={docked ? event => event.stopPropagation() : onClose}>
        <section id="hand-scores-panel" className={`${styles.modal} ${panelStyles.compact}`} role={docked ? 'complementary' : 'dialog'} aria-modal={docked ? undefined : true} aria-labelledby="hand-scores-title" onClick={event => event.stopPropagation()}>
            <div className={styles.content}>
                <h2 id="hand-scores-title">Hand Scores</h2>
                <div className={styles.list}>
                    {[outcomes, patterns].map((group, index) => <div className={styles.group} role="group" aria-label={index === 0 ? 'Hand outcomes' : 'Card patterns'} key={index}>
                        {group.map(hand => <HandScoreRow hand={hand} upgrades={upgrades} key={hand.id} />)}
                    </div>)}
                </div>
            </div>
            <button className="close-x-btn" aria-label="Close hand scores" autoFocus={!docked} onClick={onClose}>×</button>
        </section>
    </div>;
}
