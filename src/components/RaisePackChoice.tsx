import { useEffect, useRef } from 'react';
import { useGameBridge } from '../store/gameBridge';
import { getRaise, HAND_TYPES, formatRaiseCash, formatRaiseMult } from '../logic/handScoring';
import { getRelicRarityFrameColor, getRelicRarityTextColor } from '../logic/relics/rarity';
import styles from './GiftShop.module.css';

export function RaisePackChoice({ onOpenHandScores }: { onOpenHandScores: () => void }) {
    const choices = useGameBridge(state => state.pendingRaiseChoices);
    const dispatch = useGameBridge(state => state.dispatch);
    const dialog = useRef<HTMLElement>(null);
    useEffect(() => {
        if (!choices.length) return;
        dialog.current?.querySelector('button')?.focus();
    }, [choices]);
    if (!choices.length) return null;
    return (
        <div className={styles.packOverlay}>
            <section ref={dialog} className={styles.packDialog} role="region" aria-labelledby="raise-pack-title" aria-describedby="raise-pack-description">
                <h2 id="raise-pack-title">Choose Your Raise</h2>
                <button className={styles.packScoresButton} onClick={onOpenHandScores}>Hand Scores</button>
                <p id="raise-pack-description">Pick one. Every change is permanent for this run.</p>
                <div className={styles.raiseChoices}>
                    {choices.map(id => {
                        const raise = getRaise(id);
                        if (!raise) return null;
                        return <button key={id} className={styles.raiseChoice}
                            style={{ borderColor: getRelicRarityFrameColor(raise.rarity) }}
                            onClick={() => void dispatch({ type: 'choose_raise', raiseId: id })}>
                            <span className={styles.raiseRarity} style={{ color: getRelicRarityTextColor(raise.rarity) }}>{raise.rarity}</span>
                            <span className={styles.modifierCount}>{raise.modifiers.length} {raise.modifiers.length === 1 ? 'modifier' : 'modifiers'}</span>
                            <span className={styles.raiseModifiers}>
                                {raise.modifiers.map((effect, index) => {
                                    const hand = HAND_TYPES.find(hand => hand.id === effect.handTypeId)!;
                                    const negative = effect.chips < 0 || effect.mult < 0;
                                    return <span key={index} className={styles.raiseModifier}>
                                        <span className={styles.modifierHand}><span aria-hidden="true">{hand.icon}</span> {hand.name}</span>
                                        <strong className={negative ? styles.raiseNegative : effect.chips ? styles.raiseCash : styles.raiseMult}>
                                            {effect.chips ? formatRaiseCash(effect.chips) : formatRaiseMult(effect.mult)}
                                        </strong>
                                    </span>;
                                })}
                            </span>
                            <span className={styles.chooseRaise}>CHOOSE</span>
                        </button>;
                    })}
                </div>
                <p className={styles.packFootnote}>Raises stack and use no relic slots.</p>
            </section>
        </div>
    );
}
