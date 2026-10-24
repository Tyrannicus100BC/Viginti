import { useState } from 'react';
import { SeededRNG } from '../engine/rng';
import { generateRaise, RAISE_HAND_TYPES } from '../logic/handScoring';
import type { RelicRarity } from '../logic/relics/types';
import { RAISE_BONUS_RANGES, RAISE_LOSS_PENALTY_RANGES, type RaiseRange } from '../logic/upgradeTuning';
import { RaisePreviewCard } from './RaiseCard';
import styles from './RaiseGallery.module.css';

const rarities = ['Common', 'Uncommon', 'Rare'] as const;
const formatRange = ([min, max]: RaiseRange, unit: '$' | '%') => unit === '$' ? `$${min}–${max}` : `${min}–${max}%`;
function sample(rarity: RelicRarity) {
    const rng = SeededRNG.random();
    return { rarity, seed: rng.getState(), cards: Array.from({ length: 9 }, () => generateRaise(rng, rarity)) };
}

export default function RaiseGallery() {
    const [batch, setBatch] = useState(() => sample('Common'));
    return <main className={styles.gallery}>
        <div className={styles.content}>
            <header className={styles.header}>
                <div><span className={styles.eyebrow}>VIGINTI / DEBUG</span><h1>Raise Gallery</h1>
                    <p>Nine random cards. Pick a rarity to deal a fresh batch.</p></div>
                <nav aria-label="Debug tools"><a href="/balance">Balance Lab</a><a href="/">Back to game</a></nav>
            </header>
            <div className={styles.toolbar}>
                <div className={styles.rarities} aria-label="Card rarity">{rarities.map(rarity => <button key={rarity}
                    aria-pressed={batch.rarity === rarity} onClick={() => setBatch(sample(rarity))}>{rarity}</button>)}</div>
                <button className={styles.reroll} onClick={() => setBatch(sample(batch.rarity))}>Deal nine more ↻</button>
            </div>
            <div className={styles.batchInfo} aria-live="polite"><strong>9 {batch.rarity} Raises</strong><span>Seed {batch.seed}</span></div>
            <section className={styles.grid} aria-label={`${batch.rarity} Raise samples`}>
                {batch.cards.map((raise, index) => <RaisePreviewCard key={`${batch.seed}:${index}`} raise={raise} />)}
            </section>
            <details className={styles.tuning}><summary>Roll ranges & rules</summary>
                <p>Common: 1 slot · Uncommon: 2 · Rare: 3. Simple uses 1 slot; Double uses 2; Tradeoff uses 1 with a penalty. Double and Tradeoff share the strong range. At most one penalty per card; no repeated hand/stat combinations.</p>
                <div className={styles.tableWrap}><table><thead><tr><th>Hand</th><th>Regular cash</th><th>Strong cash</th><th>Regular mult</th><th>Strong mult</th></tr></thead>
                    <tbody>{RAISE_HAND_TYPES.filter(hand => hand.id !== 'loss' && hand.id !== 'bust').map(hand => {
                        const ranges = RAISE_BONUS_RANGES[hand.id as keyof typeof RAISE_BONUS_RANGES];
                        return <tr key={hand.id}><th>{hand.name}</th><td>{formatRange(ranges.regular.cash, '$')}</td><td>{formatRange(ranges.strong.cash, '$')}</td><td>{formatRange(ranges.regular.multPercent, '%')}</td><td>{formatRange(ranges.strong.multPercent, '%')}</td></tr>;
                    })}</tbody></table></div>
                <p>Four-value ranges roll with 16% / 34% / 34% / 16% odds, from lowest to highest. Five-value ranges use 16% / 20% / 28% / 20% / 16%. The central values are more common. Regular Flush multipliers roll 1% / 2% / 3% with 42% / 42% / 16% odds; zero is excluded.</p>
                <p>Tradeoff penalties target Lose 25% of the time, Bust 25%, and other hand types 50%. Lose and Bust each use: −{formatRange(RAISE_LOSS_PENALTY_RANGES.cash, '$')} or −{formatRange(RAISE_LOSS_PENALTY_RANGES.multPercent, '%')}. Other penalties use the targeted category’s regular range, except Pair drawbacks retain $3–6 or 2–5 percentage points. Viginti rolls independently from Win, using the same bonus ranges. Lose/Bust never roll as benefits. Multiplier values are percentage points.</p>
            </details>
        </div>
    </main>;
}
