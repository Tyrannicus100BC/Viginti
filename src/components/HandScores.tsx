import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HAND_TYPES, getHandPayout, getHandRaiseChanges, formatRaiseCash, formatRaiseMult, type HandTypeId, type HandUpgrades } from '../logic/handScoring';
import styles from './HandScores.module.css';

const cash = (amount: number) => `${amount < 0 ? '−' : ''}$${Math.abs(amount)}`;
type ScoreRow = Omit<ReturnType<typeof getHandPayout>, 'id'> & { id: string; handTypeId: HandTypeId };

function HandScoreRow({ hand, upgrades }: { hand: ScoreRow; upgrades: HandUpgrades }) {
    const [showTooltip, setShowTooltip] = useState(false);
    const [position, setPosition] = useState({ left: 0, top: 0 });
    const row = useRef<HTMLElement>(null);
    const tooltip = useRef<HTMLDivElement>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const changes = getHandRaiseChanges(hand.handTypeId, upgrades);
    const tooltipId = `hand-raises-${hand.id}`;
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

    return <article ref={row} className={`${styles.hand} ${hand.compTickets ? styles.hasComps : ''}`}
        tabIndex={0} aria-describedby={showTooltip ? tooltipId : undefined}
        onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}>
        <div className={styles.icon} aria-hidden="true">{hand.icon}</div>
        <h3>{hand.name}</h3>
        {(hand.compTickets ?? 0) > 0 && <strong className={styles.comps} aria-label={`${hand.compTickets} comp ticket earned`}>£{hand.compTickets}</strong>}
        <strong className={`${styles.cash} ${hand.chips < 0 ? styles.isNegative : ''}`} aria-label={`${cash(hand.chips)} cash`}>{cash(hand.chips)}</strong>
        <strong className={styles.mult + (hand.mult < 0 ? ' ' + styles.isNegative : '')} aria-label={formatRaiseMult(hand.mult)}>{formatRaiseMult(hand.mult)}</strong>
        {showTooltip && createPortal(<div ref={tooltip} id={tooltipId} role="tooltip"
            className={styles.raiseTooltip} style={position} onMouseEnter={cancelClose} onMouseLeave={close}>
            <strong className={styles.tooltipTitle}>{hand.name} Raises</strong>
            {changes.length ? <ul className={styles.raiseChanges}>
                {changes.map((change, index) => <li key={`${change.raiseId}-${change.occurrence}-${index}`}
                    className={change.value < 0 ? styles.negativeChange : change.stat === 'chips' ? styles.cashChange : styles.multChange}>
                    {change.stat === 'chips' ? `${formatRaiseCash(change.value)} chips` : `${formatRaiseMult(change.value)} multiplier`}
                </li>)}
            </ul> : <p className={styles.noRaises}>No raises yet.</p>}
        </div>, document.body)}
    </article>;
}

export function HandScores({ upgrades = {}, onClose }: { upgrades?: HandUpgrades; onClose: () => void }) {
    useEffect(() => {
        const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', close);
        return () => window.removeEventListener('keydown', close);
    }, [onClose]);
    const hands = HAND_TYPES.map(type => ({ ...getHandPayout(type.id, upgrades), handTypeId: type.id }));
    const outcomes = hands.filter(hand => !hand.chipCards).flatMap(hand => [
        hand,
        ...(hand.variant ? [{
            ...hand,
            id: hand.variant.id,
            name: hand.variant.id === 'viginti' ? 'Viginti' : hand.variant.name,
            chips: hand.variant.chips,
            mult: hand.variant.mult,
        }] : []),
    ]);
    const patterns = hands.filter(hand => hand.chipCards);
    return <div className={styles.overlay} onClick={onClose}>
        <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="hand-scores-title" onClick={event => event.stopPropagation()}>
            <div className={styles.content}>
                <h2 id="hand-scores-title">Hand Scores</h2>
                <div className={styles.list}>
                    {[outcomes, patterns].map((group, index) => <div className={styles.group} role="group" aria-label={index === 0 ? 'Hand outcomes' : 'Card patterns'} key={index}>
                        {group.map(hand => <HandScoreRow hand={hand} upgrades={upgrades} key={hand.id} />)}
                    </div>)}
                </div>
            </div>
            <button className="close-x-btn" aria-label="Close hand scores" autoFocus onClick={onClose}>×</button>
        </section>
    </div>;
}
