import { useState } from 'react';
import { SeededRNG } from '../engine/rng';
import { generateRewardCard } from '../logic/rewardCards';
import { createInitialState } from '../engine/engine';
import type { RelicRarity } from '../logic/relics/types';
import { RewardPreviewCard } from './RewardPreviewCard';
import styles from './RewardGallery.module.css';

const rarities = ['Common', 'Uncommon', 'Rare'] as const;
const probabilities = createInitialState().deckProbabilities;
function sample(rarity: RelicRarity) {
    const rng = SeededRNG.random();
    return { rarity, seed: rng.getState(), cards: Array.from({ length: 9 }, () => generateRewardCard(rng, rarity, probabilities, [])) };
}

export default function RewardGallery() {
    const [batch, setBatch] = useState(() => sample('Common'));
    return <main className={styles.gallery}>
        <div className={styles.content}>
            <header className={styles.header}>
                <div><span className={styles.eyebrow}>VIGINTI / DEBUG</span><h1>Reward Gallery</h1>
                    <p>Live reward cards, combining hand scores, deck probabilities, and effects.</p></div>
                <nav aria-label="Debug tools"><a href="/balance">Balance Lab</a><a href="/">Back to game</a></nav>
            </header>
            <div className={styles.toolbar}>
                <div className={styles.rarities} aria-label="Card rarity">{rarities.map(rarity => <button key={rarity}
                    aria-pressed={batch.rarity === rarity} onClick={() => setBatch(sample(rarity))}>{rarity}</button>)}</div>
                <button className={styles.reroll} onClick={() => setBatch(sample(batch.rarity))}>Deal nine more ↻</button>
            </div>
            <div className={styles.batchInfo} aria-live="polite"><strong>9 {batch.rarity} Rewards</strong><span>Seed {batch.seed}</span></div>
            <section className={styles.grid} aria-label={`${batch.rarity} Reward samples`}>
                {batch.cards.map((card, index) => <RewardPreviewCard key={`${batch.seed}:${index}`} card={card} />)}
            </section>
            <p className={styles.rules}>Common rewards combine 2 upgrades, Uncommon 3, and Rare 4. Each card mixes at least two reward types and contains at most one effect. A hand-score tradeoff includes its drawback. Hover any line for details.</p>
        </div>
    </main>;
}
