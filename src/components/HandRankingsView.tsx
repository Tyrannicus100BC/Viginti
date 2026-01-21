import React from 'react';
import styles from './HandRankingsView.module.css';
import { MULTIPLIERS } from '../logic/scoring';
import type { PokerHandType } from '../types';

interface HandRankingsViewProps {
  onClose: () => void;
}

const HAND_LABELS: Record<PokerHandType, string> = {
    'mini_royal_flush': 'Mini Royal Flush',
    'straight_flush': 'Straight Flush',
    'three_of_a_kind': 'Three of a Kind',
    'straight': 'Straight',
    'flush': 'Flush',
    'one_pair': 'One Pair',
    'high_card': 'High Card'
};

const ORDERED_HANDS: PokerHandType[] = [
    'mini_royal_flush',
    'straight_flush',
    'three_of_a_kind',
    'straight',
    'flush',
    'one_pair',
    'high_card'
];

export const HandRankingsView: React.FC<HandRankingsViewProps> = ({ onClose }) => {
    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2>Poker Hand Rankings</h2>
                
                {ORDERED_HANDS.map(type => (
                    <div key={type} className={styles.row}>
                        <span className={styles.handName}>{HAND_LABELS[type]}</span>
                        <span className={styles.multiplier}>{MULTIPLIERS[type]}x</span>
                    </div>
                ))}
                
                <button className={styles.closeBtn} onClick={onClose}>Close</button>
            </div>
        </div>
    );
};
