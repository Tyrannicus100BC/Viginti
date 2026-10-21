import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useGameBridge } from '../store/gameBridge';
import { getPackDefinition, PACK_QUALITY_LABELS, type PackId } from '../logic/packs';
import { PACK_FAMILY_COLORS, PACK_FAMILY_LABELS, RaisePackArt } from './RaisePackArt';
import { RaisePackChoice, type PackSourceRect } from './RaisePackChoice';
import { ChallengeRewardIntro } from './ChallengeRewardIntro';
import { formatChallengeProgress } from './ChallengeProgress';
import styles from './PackReward.module.css';

export function PackReward() {
    const offeredPacks = useGameBridge(state => state.offeredPacks);
    const pendingPack = useGameBridge(state => state.pendingPack);
    const processing = useGameBridge(state => state.isProcessingEvents);
    const rewards = useGameBridge(state => state.challengeRewards);
    const reward = rewards[0];
    const debug = useGameBridge(state => !!state.gameState.debugPackReturn);
    const challenge = useGameBridge(state => state.challenges.find(goal => goal.id === reward?.id));
    const [introStage, setIntroStage] = useState<'moving' | 'revealing' | 'ready'>(() =>
        reward && challenge && !debug && !pendingPack ? 'moving' : 'ready');
    const departChallenge = useCallback(() => {
        if (!reward) return;
        useGameBridge.setState(state => ({
            departedChallengeIds: state.departedChallengeIds.includes(reward.id)
                ? state.departedChallengeIds : [...state.departedChallengeIds, reward.id],
        }));
    }, [reward]);
    const revealPacks = useCallback(() => setIntroStage('revealing'), []);
    const finishIntro = useCallback(() => setIntroStage('ready'), []);
    const [source, setSource] = useState<PackSourceRect | null>(null);
    const [exiting, setExiting] = useState(false);
    const choosing = useRef(false);
    const region = useRef<HTMLElement>(null);
    const packOptions = useRef(new Map<PackId, HTMLButtonElement>());

    useEffect(() => { region.current?.focus({ preventScroll: true }); }, []);
    useEffect(() => {
        if (!exiting) return;
        const timer = window.setTimeout(() => void useGameBridge.getState().dispatch({ type: 'finish_pack' }), 300);
        return () => window.clearTimeout(timer);
    }, [exiting]);

    useLayoutEffect(() => {
        if (introStage !== 'revealing' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const root = region.current;
        if (!root) return;
        const rect = root.getBoundingClientRect();
        const scale = rect.width / root.offsetWidth || 1;
        const animations = [...packOptions.current.values()].map((element, index) => {
            const target = element.getBoundingClientRect();
            const dx = (rect.left + rect.width / 2 - target.left - target.width / 2) / scale;
            const dy = (rect.top + rect.height / 2 - target.top - target.height / 2) / scale;
            return element.animate([
                { transform: `translate(${dx}px, ${dy}px) scale(.08) rotate(${(index - 1) * 14}deg)`, opacity: 0 },
                { transform: 'translate(0, -10px) scale(1.03)', opacity: 1, offset: .8 },
                { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            ], { duration: 500, delay: index * 80, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
        });
        return () => animations.forEach(animation => animation.cancel());
    }, [introStage]);

    const open = async (packId: PackId, element: HTMLButtonElement) => {
        if (choosing.current || processing || exiting || introStage !== 'ready') return;
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
    const skip = async () => {
        if (choosing.current || processing || exiting || introStage !== 'ready') return;
        choosing.current = true;
        try {
            await useGameBridge.getState().dispatch({ type: 'skip_pack' });
            setExiting(true);
        } finally {
            choosing.current = false;
        }
    };

    return <>
        <section ref={region} tabIndex={-1} aria-label="Pack reward"
            className={`${styles.reward} ${introStage !== 'ready' ? styles.introducing : ''} ${opening ? styles.opening : ''} ${exiting ? styles.exiting : ''}`}>
            {!opening && introStage !== 'moving' && offeredPacks.length > 0 && <div className={`${styles.selection} ${reward && !debug ? styles.fromChallenge : ''}`}>
                {(debug || reward) && <p className={styles.eyebrow}>{debug ? 'DEBUG PACK' : `${challenge ? formatChallengeProgress(challenge) : reward!.title} · Complete`}</p>}
                <h1 id="pack-reward-title">{reward && !debug ? `${reward.tier === 'major' ? 'Major' : 'Minor'} Pack Upgrade` : 'Choose Your Pack'}</h1>
                <div className={styles.packs}>
                    {offeredPacks.map(packId => {
                        const pack = getPackDefinition(packId);
                        const familyLabel = PACK_FAMILY_LABELS[pack.family];
                        return <button key={packId} type="button" disabled={processing || exiting || introStage !== 'ready'}
                            ref={element => { if (element) packOptions.current.set(packId, element); else packOptions.current.delete(packId); }}
                            className={styles.pack} style={{ '--pack-color': PACK_FAMILY_COLORS[pack.family] } as CSSProperties}
                            aria-label={`Open ${pack.name}, choose ${pack.pickCount} of ${pack.offerCount}, ${PACK_QUALITY_LABELS[pack.quality]} choices`}
                            onClick={event => void open(packId, event.currentTarget)}>
                            <span className={styles.seal} aria-hidden="true" />
                            <span className={styles.brand}>VIGINTI</span>
                            <span className={styles.identity}>
                                <RaisePackArt family={pack.family} sparkles />
                                <strong>{familyLabel} Pack</strong>
                            </span>
                            <span className={styles.contents}>Choose {pack.pickCount} of {pack.offerCount}<strong className={styles.quality}>{PACK_QUALITY_LABELS[pack.quality]} choices</strong></span>
                            <span className={styles.open}>OPEN PACK</span>
                        </button>;
                    })}
                </div>
                <button type="button" className={styles.skip}
                    disabled={processing || exiting || introStage !== 'ready'} onClick={() => void skip()}>SKIP</button>
            </div>}
            {!opening && !offeredPacks.length && <button className={styles.resume}
                disabled={processing || exiting} onClick={() => setExiting(true)}>{rewards.length > 1 && !debug ? 'Next Reward' : 'Back to Table'}</button>}
        </section>
        {introStage !== 'ready' && challenge && <ChallengeRewardIntro challenge={challenge} onDepart={departChallenge} onReveal={revealPacks} onComplete={finishIntro} />}
        {opening && <div className={`${styles.reveal} ${exiting ? styles.exiting : ''}`}>
            <RaisePackChoice sourceRect={source} onComplete={() => setExiting(true)} />
        </div>}
    </>;
}
