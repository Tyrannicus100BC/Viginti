import { useEffect } from 'react';
import { HAND_TYPES, getHandPayout, formatRaiseMult, type HandUpgrades } from '../logic/handScoring';
import styles from './HandScores.module.css';

export function HandScores({ upgrades = {}, onClose }: { upgrades?: HandUpgrades; onClose: () => void }) {
    useEffect(() => {
        const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', close);
        return () => window.removeEventListener('keydown', close);
    }, [onClose]);
    const cash = (amount: number) => `${amount < 0 ? '−' : ''}$${Math.abs(amount)}`;
    const hands = HAND_TYPES.map(type => getHandPayout(type.id, upgrades));
    const outcomes = hands.filter(hand => !hand.chipCards).flatMap(hand => [
        hand,
        ...(hand.variant ? [{
            ...hand,
            id: hand.variant.id,
            name: hand.variant.id === 'viginti' ? 'Viginti' : hand.variant.name,
            chips: hand.variant.chips,
        }] : []),
    ]);
    const patterns = hands.filter(hand => hand.chipCards);
    return <div className={styles.overlay} onClick={onClose}>
        <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="hand-scores-title" onClick={event => event.stopPropagation()}>
            <div className={styles.content}>
                <h2 id="hand-scores-title">Hand Scores</h2>
                <div className={styles.list}>
                    {[outcomes, patterns].map((group, index) => <div className={styles.group} role="group" aria-label={index === 0 ? 'Hand outcomes' : 'Card patterns'} key={index}>
                        {group.map(hand => <article className={`${styles.hand} ${hand.compTickets ? styles.hasComps : ''}`} key={hand.id}>
                            <div className={styles.icon} aria-hidden="true">{hand.icon}</div>
                            <h3>{hand.name}</h3>
                            {(hand.compTickets ?? 0) > 0 && <strong className={styles.comps} aria-label={`${hand.compTickets} comp ticket earned`}>£{hand.compTickets}</strong>}
                            <strong className={`${styles.cash} ${hand.chips < 0 ? styles.isNegative : ''}`} aria-label={`${cash(hand.chips)} cash`}>{cash(hand.chips)}</strong>
                            <strong className={styles.mult + (hand.mult < 0 ? ' ' + styles.isNegative : '')} aria-label={formatRaiseMult(hand.mult)}>{formatRaiseMult(hand.mult)}</strong>
                        </article>)}
                    </div>)}
                </div>
            </div>
            <button className="close-x-btn" aria-label="Close hand scores" autoFocus onClick={onClose}>×</button>
        </section>
    </div>;
}
