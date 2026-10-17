import { HANDS_PER_ANTE } from '../engine/economy';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGameBridge } from '../store/gameBridge';
import { getPackDefinition, type PackId } from '../logic/packs';
import { getRelicRarityFrameColor } from '../logic/relics/rarity';
import { RaisePackArt } from './RaisePackArt';
import { RaisePackChoice, type PackSourceRect } from './RaisePackChoice';
import styles from './PackReward.module.css';

export function PackReward() {
    const offeredPacks = useGameBridge(state => state.offeredPacks);
    const pendingPack = useGameBridge(state => state.pendingPack);
    const processing = useGameBridge(state => state.isProcessingEvents);
    const dealsTaken = useGameBridge(state => state.dealsTaken);
    const [source, setSource] = useState<PackSourceRect | null>(null);
    const [exiting, setExiting] = useState(false);
    const choosing = useRef(false);
    const region = useRef<HTMLElement>(null);

    useEffect(() => { region.current?.focus({ preventScroll: true }); }, []);
    useEffect(() => {
        if (!exiting) return;
        const timer = window.setTimeout(() => void useGameBridge.getState().dispatch({ type: 'finish_pack' }), 300);
        return () => window.clearTimeout(timer);
    }, [exiting]);

    const open = async (packId: PackId, element: HTMLButtonElement) => {
        if (choosing.current || processing) return;
        choosing.current = true;
        const { left, top, width, height } = element.getBoundingClientRect();
        setSource({ left, top, width, height, packId });
        try {
            await useGameBridge.getState().dispatch({ type: 'open_pack', packId });
            if (!useGameBridge.getState().pendingPack) setSource(null);
        } finally {
            choosing.current = false;
        }
    };

    const opening = !!source || !!pendingPack;
    return <>
        <section ref={region} tabIndex={-1} aria-label="Pack reward"
            className={`${styles.reward} ${opening ? styles.opening : ''} ${exiting ? styles.exiting : ''}`}>
            {!opening && offeredPacks.length > 0 && <div className={styles.selection}>
                <p className={styles.eyebrow}>{dealsTaken === 0 ? 'YOUR RUN STARTS HERE' : `ROUND ${dealsTaken} COMPLETE`}</p>
                <h1 id="pack-reward-title">Choose Your Pack</h1>
                <p className={styles.subtitle}>Pick one. Make it yours.</p>
                <div className={styles.packs}>
                    {offeredPacks.map(packId => {
                        const pack = getPackDefinition(packId);
                        return <button key={packId} type="button" disabled={processing}
                            className={styles.pack} style={{ '--pack-color': getRelicRarityFrameColor(pack.rarity) } as CSSProperties}
                            aria-label={`Open ${pack.name}, choose ${pack.pickCount} of ${pack.offerCount}`}
                            onClick={event => void open(packId, event.currentTarget)}>
                            <span className={styles.seal} aria-hidden="true" />
                            <span className={styles.brand}>VIGINTI</span>
                            <RaisePackArt family={pack.family} />
                            <strong>{pack.name}</strong>
                            <span className={styles.contents}>Choose {pack.pickCount} of {pack.offerCount}</span>
                            <span className={styles.open}>OPEN PACK</span>
                        </button>;
                    })}
                </div>
                <p className={styles.cadence}>A free pack whenever the ante increases · Every {HANDS_PER_ANTE} rounds</p>
            </div>}
            {!opening && !offeredPacks.length && <button className={styles.resume}
                disabled={processing || exiting} onClick={() => setExiting(true)}>Back to Table</button>}
        </section>
        {opening && <div className={`${styles.reveal} ${exiting ? styles.exiting : ''}`}>
            <RaisePackChoice sourceRect={source} onComplete={() => setExiting(true)} />
        </div>}
    </>;
}
