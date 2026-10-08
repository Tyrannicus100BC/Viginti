import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGameBridge } from '../store/gameBridge';
import { getRaise, HAND_TYPES, formatRaiseCash, formatRaiseMult, type Raise } from '../logic/handScoring';
import { getRelicRarityFrameColor, getRelicRarityTextColor } from '../logic/relics/rarity';
import { sfxEngine } from '../utils/sfxEngine';
import { RaisePackArt } from './RaisePackArt';
import { getPackDefinition, type PendingPack } from '../logic/packs';
import { useLayout } from './ResponsiveLayout';
import styles from './RaisePackChoice.module.css';

export interface PackSourceRect { left: number; top: number; width: number; height: number }
type RevealStage = 'growing' | 'charging' | 'bursting' | 'revealing' | 'ready' | 'flying' | 'received';

function RaiseCard({ raise }: { raise: Raise }) {
    const group = ({ chips, mult }: Raise['modifiers'][number]) => chips > 0 ? 0 : mult > 0 ? 1 : chips < 0 ? 2 : 3;
    const modifiers = [...raise.modifiers].sort((left, right) =>
        group(left) - group(right)
        || HAND_TYPES.findIndex(hand => hand.id === left.handTypeId) - HAND_TYPES.findIndex(hand => hand.id === right.handTypeId)
    );
    return <>
        <span className={styles.rarity} style={{ color: getRelicRarityTextColor(raise.rarity) }}>{raise.rarity}</span>
        <span className={styles.modifiers}>
            {modifiers.map((effect, index) => {
                const hand = HAND_TYPES.find(hand => hand.id === effect.handTypeId)!;
                return <span key={index} className={styles.modifier}>
                    <span className={styles.handName}><span aria-hidden="true">{hand.icon}</span> {hand.name}</span>
                    <strong className={effect.chips < 0 || effect.mult < 0 ? styles.negative : effect.chips ? styles.cash : styles.mult}>
                        {effect.chips ? formatRaiseCash(effect.chips) : formatRaiseMult(effect.mult)}
                    </strong>
                </span>;
            })}
        </span>
    </>;
}

function PackReveal({ choices, pendingPack, sourceRect, onComplete }: {
    choices: readonly string[]; pendingPack: PendingPack | null; sourceRect: PackSourceRect | null; onComplete: () => void;
}) {
    const [stage, setStage] = useState<RevealStage>('growing');
    const [selected, setSelected] = useState<string | null>(null);
    const [offers, setOffers] = useState<readonly string[] | null>(null);
    const { viewportWidth } = useLayout();
    const definition = getPackDefinition(pendingPack?.packId);
    const picksRemaining = pendingPack?.picksRemaining ?? 1;
    const [finishing, setFinishing] = useState(false);
    const scene = useRef<HTMLDivElement>(null);
    const pack = useRef<HTMLDivElement>(null);
    const title = useRef<HTMLHeadingElement>(null);
    const cards = useRef(new Map<string, HTMLElement>());
    const options = useRef(new Map<string, HTMLDivElement>());
    const animations = useRef(new Set<Animation>());
    const selecting = useRef(false);
    const alive = useRef(true);
    const complete = useRef(onComplete);
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = useCallback((ms: number) => reducedMotion ? 50 : ms, [reducedMotion]);
    useEffect(() => { complete.current = onComplete; }, [onComplete]);
    useEffect(() => {
        if (stage === 'ready' && !document.querySelector('[role="dialog"]')) {
            scene.current?.querySelector<HTMLElement>('[role="region"]')?.focus({ preventScroll: true });
        }
    }, [stage]);

    const play = useCallback(async (element: HTMLElement, frames: Keyframe[], ms: number, delay = 0, easing = 'cubic-bezier(.2,.8,.2,1)', persist = true) => {
        const animation = element.animate(frames, {
            duration: duration(ms), delay: reducedMotion ? 0 : delay,
            easing, fill: 'both',
        });
        animations.current.add(animation);
        await animation.finished;
        if (persist) animation.commitStyles();
        animation.cancel();
        animations.current.delete(animation);
    }, [duration, reducedMotion]);

    useEffect(() => {
        alive.current = true;
        const activeAnimations = animations.current;
        const open = async () => {
            const element = pack.current;
            const root = scene.current;
            if (!element || !root) return;
            const rect = element.getBoundingClientRect();
            const scale = root.getBoundingClientRect().width / root.offsetWidth;
            const dx = sourceRect ? (sourceRect.left + sourceRect.width / 2 - rect.left - rect.width / 2) / scale : 0;
            const dy = sourceRect ? (sourceRect.top + sourceRect.height / 2 - rect.top - rect.height / 2) / scale : 0;
            const size = sourceRect ? sourceRect.width / rect.width : 0.6;
            try {
                await play(element, [
                    { transform: `translate(${dx}px, ${dy}px) scale(${size})`, opacity: 1 },
                    { transform: 'translate(0, 0) scale(1.08)', offset: 0.8 },
                    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                ], 620);
                setStage('charging');
                sfxEngine.play('cardFlip');
                await play(element, reducedMotion ? [{ opacity: 1 }, { opacity: 1 }] : [
                    { transform: 'rotate(0deg) scale(1)' },
                    { transform: 'rotate(-5deg) scale(1.04)', offset: 0.2 },
                    { transform: 'rotate(5deg) scale(1.07)', offset: 0.4 },
                    { transform: 'rotate(-6deg) scale(1.08)', offset: 0.6 },
                    { transform: 'rotate(4deg) scale(1.12)', offset: 0.8 },
                    { transform: 'rotate(0deg) scale(1.14)' },
                ], 480);
                setStage('bursting');
                sfxEngine.play('confetti');
                await play(element, [
                    { transform: 'scale(1.14)', opacity: 1 },
                    { transform: 'scale(1.4)', opacity: 0 },
                ], 220);
                setStage('revealing');
            } catch {
                // Unmount/restart cancels the presentation, never the stored pack choices.
            }
        };
        void open();
        return () => {
            alive.current = false;
            for (const animation of activeAnimations) animation.cancel();
            activeAnimations.clear();
        };
    }, [sourceRect, play, reducedMotion]);

    useEffect(() => {
        if (stage !== 'revealing' || !choices.length) return;
        const reveal = async () => {
            const root = scene.current;
            const origin = pack.current?.getBoundingClientRect();
            if (!root || !origin) return;
            const scale = root.getBoundingClientRect().width / root.offsetWidth;
            try {
                await Promise.all(choices.map((id, index) => {
                    const option = options.current.get(id)!;
                    const rect = option.getBoundingClientRect();
                    const dx = (origin.left + origin.width / 2 - rect.left - rect.width / 2) / scale;
                    const dy = (origin.top + origin.height / 2 - rect.top - rect.height / 2) / scale;
                    return play(option, [
                        { transform: `translate(${dx}px, ${dy}px) scale(.2) rotate(${(index - (choices.length - 1) / 2) * 12}deg)`, opacity: 0 },
                        { transform: 'translate(0, -12px) scale(1.02) rotate(0deg)', opacity: 1, offset: 0.8 },
                        { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
                    ], 540, index * 110, 'cubic-bezier(.2,.8,.2,1)', false);
                }));
                setStage('ready');
            } catch { /* Cancelled when the scene unmounts. */ }
        };
        void reveal();
    }, [stage, choices, play]);

    const choose = async (id: string) => {
        if (stage !== 'ready' || selecting.current) return;
        selecting.current = true;
        // Keep the original card positions for the second choice in a Mega pack.
        if (!offers) setOffers(choices);
        const lastPick = picksRemaining <= 1;
        setFinishing(lastPick);
        setSelected(id);
        setStage('flying');
        scene.current?.querySelector<HTMLElement>('[role="region"]')?.focus({ preventScroll: true });
        sfxEngine.play('cardPlace');
        const card = cards.current.get(id)!;
        const button = document.getElementById('hand-scores-button');
        try {
            let flightFrames: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }];
            let flightMs = 250;
            if (button && scene.current && !reducedMotion) {
                const from = card.getBoundingClientRect();
                const to = button.getBoundingClientRect();
                const scale = scene.current.getBoundingClientRect().width / scene.current.offsetWidth;
                const dx = (to.left + to.width / 2 - from.left - from.width / 2) / scale;
                const dy = (to.top + to.height / 2 - from.top - from.height / 2) / scale;
                const endScale = to.height / from.height;
                flightMs = 700;
                flightFrames = [
                    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                    { transform: `translate(${dx * .3}px, ${dy * .32}px) scale(.72) rotate(-6deg)`, opacity: 1, offset: .55 },
                    { opacity: 1, offset: .84 },
                    { transform: `translate(${dx}px, ${dy}px) scale(${endScale}) rotate(0deg)`, opacity: 0 },
                ];
            }
            const flight = play(card, flightFrames, flightMs, 0, 'cubic-bezier(.45,0,1,1)');
            // The pulse peaks at arrival, as the card's final fade reveals the button.
            const pulse = button ? play(button, [
                { transform: 'scale(1)', boxShadow: '0 0 0px #ffd77a00' },
                { transform: reducedMotion ? 'scale(1)' : 'scale(1.22)', boxShadow: '0 0 28px #ffd77aaa', offset: .25 },
                { transform: 'scale(1)', boxShadow: '0 0 0px #ffd77a00' },
            ], 280, flightMs - 70, 'linear', false).finally(() => {
                button.style.removeProperty('transform');
                button.style.removeProperty('box-shadow');
            }) : Promise.resolve();
            await Promise.all([pulse, (async () => {
                await flight;
                if (!alive.current) return;
                setStage('received');
                sfxEngine.play('score');
                if (lastPick && title.current) await play(title.current, [{ opacity: 1 }, { opacity: 0 }], 280);
            })()]);
            if (!alive.current) return;
            await useGameBridge.getState().dispatch({ type: 'choose_raise', raiseId: id });
            if (useGameBridge.getState().pendingRaiseChoices.includes(id)) throw new Error('Raise selection was not accepted');
            if (lastPick) {
                complete.current();
            } else {
                selecting.current = false;
                setSelected(null);
                setStage('ready');
            }
        } catch {
            if (alive.current) {
                card.style.opacity = '1';
                card.style.transform = 'none';
                if (title.current) title.current.style.opacity = '1';
                selecting.current = false;
                setFinishing(false);
                setSelected(null);
                setStage('ready');
            }
        }
    };

    const showSparks = stage === 'charging' || stage === 'bursting' || stage === 'revealing';
    const showChoices = stage === 'revealing' || stage === 'ready' || stage === 'flying' || stage === 'received';
    return <div ref={scene} className={styles.scene} data-pack-stage={stage} onClick={event => event.stopPropagation()}>
        <div className={`${styles.spotlight} ${stage === 'received' && finishing ? styles.fadeOut : ''}`} aria-hidden="true" />
        <div className={styles.packPosition}>
            <div ref={pack} className={`${styles.openingPack} ${stage === 'charging' ? styles.chargingPack : ''}`} aria-hidden="true">
                <div className={styles.packSeal} />
                <RaisePackArt />
                <strong>{definition.name}</strong>
                <span>VIGINTI</span>
            </div>
            {showSparks && !reducedMotion && <div className={styles.sparks} key={stage === 'charging' ? 'charge' : 'burst'} aria-hidden="true">
                {Array.from({ length: stage === 'charging' ? 12 : 30 }, (_, index) => {
                    const angle = index * 2.399;
                    const radius = stage === 'charging' ? 100 : 200 + index % 5 * 35;
                    return <i key={index} style={{ '--spark-x': `${Math.cos(angle) * radius}px`, '--spark-y': `${Math.sin(angle) * radius}px`, '--spark-delay': `${index % 5 * 25}ms` } as CSSProperties} />;
                })}
            </div>}
        </div>
        <section className={`${styles.choices} ${definition.offerCount === 5 ? viewportWidth >= 1180 ? styles.fiveWide : styles.fiveCompact : ''}`} role="region" tabIndex={-1} aria-labelledby="raise-pack-title" aria-busy={stage !== 'ready'}>
            <h2 ref={title} id="raise-pack-title" className={showChoices ? styles.title : styles.hiddenTitle}>
                {definition.pickCount === 2 ? 'Choose Your Raises' : 'Choose Your Raise'}
                {definition.offerCount === 5 && <span className={styles.pickCount}>{picksRemaining} {picksRemaining === 1 ? 'choice' : 'choices'} remaining</span>}
            </h2>
            <p className={styles.srOnly} aria-live="polite">{stage === 'ready' ? `${choices.length} raises available. ${picksRemaining} ${picksRemaining === 1 ? 'choice' : 'choices'} remaining.` : stage === 'received' ? 'Raise added to Hand Scores.' : stage === 'flying' ? 'Adding your raise to Hand Scores.' : 'Opening your raise pack.'}</p>
            <div className={styles.options}>
                {(offers ?? choices).map(id => {
                    const raise = getRaise(id);
                    if (!raise) return null;
                    const consumed = !choices.includes(id);
                    return <div key={id} ref={element => { if (element) options.current.set(id, element); else options.current.delete(id); }}
                        aria-hidden={consumed || undefined}
                        style={{ '--rarity-color': getRelicRarityFrameColor(raise.rarity) } as CSSProperties}
                        className={`${styles.option} ${consumed || finishing && selected && selected !== id ? styles.unselected : ''} ${selected === id ? styles.selected : ''}`}>
                        <button type="button" data-raise-card ref={element => { if (element) cards.current.set(id, element); else cards.current.delete(id); }}
                            id={`raise-card-${id}`}
                            disabled={stage !== 'ready' || consumed}
                            aria-label={`Select ${raise.name} card, ${raise.rarity}`}
                            onClick={() => void choose(id)}
                            className={`${styles.card} ${raise.modifiers.length > 3 ? styles.denseCard : ''}`}>
                            <RaiseCard raise={raise} />
                        </button>
                        <button data-choose-raise className={`${styles.chooseButton} ${selected ? styles.fadeOut : ''}`}
                            disabled={stage !== 'ready' || consumed} aria-label={`Choose ${raise.name}, ${raise.rarity}`}
                            aria-describedby={`raise-card-${id}`}
                            onClick={() => void choose(id)}>CHOOSE</button>
                    </div>;
                })}
            </div>
        </section>
    </div>;
}

export function RaisePackChoice({ sourceRect, onComplete }: { sourceRect: PackSourceRect | null; onComplete: () => void }) {
    const choices = useGameBridge(state => state.pendingRaiseChoices);
    const pendingPack = useGameBridge(state => state.pendingPack);
    if (!sourceRect && !choices.length) return null;
    return <PackReveal choices={choices} pendingPack={pendingPack} sourceRect={sourceRect} onComplete={onComplete} />;
}
