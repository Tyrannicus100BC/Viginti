import { getChallengeCard, type ChallengeCard } from '../logic/challengeCards';
import { ChallengeProgress } from './ChallengeProgress';
import { RelicManager } from '../logic/relics/manager';
import { canAcquireRelic } from '../logic/relics/inventory';
import { RelicTooltip } from './RelicTooltip';
import { PackCardDetails } from './PackCardDetails';
import { getPackCard, type PackCard } from '../logic/packCards';
import { SPECIAL_COLORS } from '../logic/specialCards';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGameBridge } from '../store/gameBridge';
import { getRaise } from '../logic/handScoring';
import { RaiseCard } from './RaiseCard';
import { getRelicRarityFrameColor, getRelicRarityTextColor } from '../logic/relics/rarity';
import { sfxEngine } from '../utils/sfxEngine';
import { PackVisual } from './PackVisual';
import { PACK_FAMILY_COLORS, PACK_FAMILY_LABELS, RaisePackArt } from './RaisePackArt';
import { getPackDefinition, getTargetedPackReward, type PackId, type PendingPack } from '../logic/packs';
import { useLayout } from './ResponsiveLayout';
import styles from './RaisePackChoice.module.css';

export interface PackSourceRect { left: number; top: number; width: number; height: number; packId?: PackId }
type RevealStage = 'growing' | 'charging' | 'bursting' | 'revealing' | 'ready' | 'flying' | 'received';

function UpgradeCard({ card }: { card: PackCard }) {
    const suitIcons = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
    return <>
        <span className={styles.modifiers}>
            {card.benefits.map((benefit, index) => <span key={index} className={styles.modifier}>
                <span className={styles.modifierName}>
                    {benefit.kind === 'suit' ? <>
                        <span aria-hidden="true" className={`${styles.suitIcon} ${benefit.target === 'hearts' || benefit.target === 'diamonds' ? styles.redSuit : styles.blackSuit}`}>
                            {suitIcons[benefit.target]}
                        </span>{benefit.label}
                    </> : benefit.kind === 'rank' ? <>Rank {benefit.label}</> : (
                        <span style={{ color: SPECIAL_COLORS[benefit.type] }}>{benefit.label}</span>
                    )}
                </span>
                <strong className={benefit.change.endsWith('fewer') ? styles.negative : styles.cash}>
                    {benefit.change.replace(/\b\w/g, letter => letter.toUpperCase())}
                </strong>
            </span>)}
        </span>
    </>;
}

function ChallengeOption({ card }: { card: ChallengeCard }) {
    return <PackCardDetails icon={<ChallengeProgress challenge={card.challenge} />} name={card.name}>
        {card.challenge.description} to earn a {card.challenge.rewardTier === 'major' ? 'Major' : 'Minor'} Pack.
    </PackCardDetails>;
}

function PackReveal({ choices, pendingPack, sourceRect, arrivedFromChallenge, onComplete, onOpenPack }: {
    choices: readonly string[]; pendingPack: PendingPack | null; sourceRect: PackSourceRect | null; arrivedFromChallenge: boolean; onComplete: () => void; onOpenPack: (cardId: string, source: PackSourceRect) => Promise<void>;
}) {
    const [stage, setStage] = useState<RevealStage>(arrivedFromChallenge ? 'charging' : 'growing');
    const [selected, setSelected] = useState<string | null>(null);
    const [offers, setOffers] = useState<readonly string[] | null>(null);
    const { idealWidth, referencePanelsFit } = useLayout();
    const inventory = useGameBridge(state => state.inventory);
    const relicSlots = useGameBridge(state => state.relicSlots);
    const definition = useRef(getPackDefinition(pendingPack?.packId ?? sourceRect?.packId)).current;
    const progressionPack = useGameBridge(state => !state.gameState.debugPackReturn);
    const familyLabel = definition.id === 'relic_boss' ? 'Table Action' : PACK_FAMILY_LABELS[definition.family];
    const rewardTitle = definition.id === 'mixed_major' ? 'Major Reward'
        : definition.id === 'mixed_minor' ? 'Minor Reward'
        : definition.id === 'relic_boss' ? 'Boss Reward' : definition.name;
    const picksRemaining = pendingPack?.picksRemaining ?? 1;
    const [finishing, setFinishing] = useState(false);
    const scene = useRef<HTMLDivElement>(null);
    const pack = useRef<HTMLDivElement>(null);
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
                if (!arrivedFromChallenge) await play(element, [
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
    }, [sourceRect, arrivedFromChallenge, play, reducedMotion]);

    useEffect(() => {
        if (stage !== 'revealing') return;
        if (!choices.length) { setStage('ready'); return; }
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
        const isRelic = !!RelicManager.getRelicConfig(id);
        const isRaise = !!getRaise(id);
        if (stage !== 'ready' || selecting.current || (isRelic && !canAcquireRelic(id, inventory, relicSlots))) return;
        selecting.current = true;
        // Keep the original card positions for the remaining picks in a multi-pick pack.
        if (!offers) setOffers(choices);
        const lastPick = picksRemaining <= 1;
        setFinishing(lastPick);
        setSelected(id);
        setStage('flying');
        scene.current?.querySelector<HTMLElement>('[role="region"]')?.focus({ preventScroll: true });
        const card = cards.current.get(id)!;
        const targeted = getTargetedPackReward(id);
        if (targeted) {
            // Carry the sealed reward straight into the next opening scene.
            const { left, top, width, height } = card.getBoundingClientRect();
            try {
                await onOpenPack(id, { left, top, width, height, packId: targeted.id });
            } catch {
                if (alive.current) {
                    selecting.current = false;
                    setFinishing(false);
                    setSelected(null);
                    setStage('ready');
                }
            }
            return;
        }
        sfxEngine.play('cardPlace');
        const button = isRelic
            ? document.querySelector<HTMLElement>(`[aria-label="Empty relic slot ${inventory.filter(instance => !RelicManager.getRelicConfig(instance.id)?.tableAction).length + 1}"]`)
            : document.getElementById(isRaise ? 'hand-scores-button' : getChallengeCard(id) ? 'challenges-label' : 'deck-view-button');
        let flightCard = card;
        try {
            if (isRelic && scene.current) {
                // Preserve the option's layout while its relic flies into the inventory.
                const root = scene.current;
                const rootRect = root.getBoundingClientRect();
                const from = card.getBoundingClientRect();
                const scale = rootRect.width / root.offsetWidth;
                const appearance = getComputedStyle(card);
                flightCard = card.cloneNode(true) as HTMLElement;
                flightCard.removeAttribute('id');
                flightCard.removeAttribute('aria-describedby');
                flightCard.setAttribute('aria-hidden', 'true');
                flightCard.setAttribute('inert', '');
                flightCard.classList.add(styles.flightCard);
                Object.assign(flightCard.style, {
                    left: `${(from.left - rootRect.left) / scale}px`,
                    top: `${(from.top - rootRect.top) / scale}px`,
                    width: `${from.width / scale}px`,
                    height: `${from.height / scale}px`,
                    color: appearance.color,
                });
                flightCard.style.setProperty('--rarity-color', appearance.getPropertyValue('--rarity-color'));
                flightCard.style.setProperty('--card-type-color', appearance.getPropertyValue('--card-type-color'));
                root.appendChild(flightCard);
                card.style.visibility = 'hidden';
            }
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
            const flight = play(flightCard, flightFrames, flightMs, 0, 'cubic-bezier(.45,0,1,1)');
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
            })()]);
            if (!alive.current) return;
            await useGameBridge.getState().dispatch(definition.family === 'raise' ? { type: 'choose_raise', raiseId: id } : { type: 'choose_pack_card', cardId: id });
            const bridge = useGameBridge.getState();
            if ([...bridge.pendingRaiseChoices, ...bridge.pendingPackChoices].includes(id)) throw new Error('Pack selection was not accepted');
            if (getTargetedPackReward(id) && bridge.pendingPack) return;
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
                card.style.removeProperty('visibility');
                selecting.current = false;
                setFinishing(false);
                setSelected(null);
                setStage('ready');
            }
        } finally {
            if (flightCard !== card) {
                // Keep the consumed original hidden while its option and the scene fade out.
                // Restoring it here flashes the full-size card after the flight ends.
                flightCard.remove();
            }
        }
    };

    const skip = async () => {
        if (stage !== 'ready' || selecting.current) return;
        selecting.current = true;
        try {
            await useGameBridge.getState().dispatch({ type: 'skip_pack' });
            complete.current();
        } finally {
            selecting.current = false;
        }
    };

    // Let the burst finish naturally even when the cards become selectable.
    const showSparks = stage !== 'growing';
    const showChoices = stage === 'revealing' || stage === 'ready' || stage === 'flying' || stage === 'received';
    return <div ref={scene} className={styles.scene} data-pack-stage={stage}
        style={referencePanelsFit ? { left: '50%', width: idealWidth, transform: 'translateX(-50%)' } : undefined}
        onClick={event => event.stopPropagation()}>
        <div className={`${styles.spotlight} ${finishing ? styles.fadeOut : ''}`} aria-hidden="true" />
        <div className={styles.packPosition}>
            <div ref={pack} className={`${styles.openingPack} ${stage === 'charging' ? styles.chargingPack : ''}`}
                style={{ '--pack-color': PACK_FAMILY_COLORS[definition.family] } as CSSProperties} aria-hidden="true">
                <PackVisual packId={definition.id} />
            </div>
            {showSparks && !reducedMotion && <div
                className={`${styles.sparks} ${stage === 'charging' ? styles.chargeSparks : styles.burstSparks}`}
                style={{ '--pack-color': PACK_FAMILY_COLORS[definition.family] } as CSSProperties}
                key={stage === 'charging' ? 'charge' : 'burst'} aria-hidden="true">
                <span className={styles.burstRays} />
                {Array.from({ length: stage === 'charging' ? 28 : 96 }, (_, index) => {
                    const charging = stage === 'charging';
                    const angle = index * 2.399;
                    const radius = charging ? 140 + index % 4 * 30 : 260 + index % 7 * 45;
                    return <i key={index} style={{
                        '--spark-x': `${Math.cos(angle) * radius}px`,
                        '--spark-y': `${Math.sin(angle) * radius}px`,
                        '--spark-size': `${charging ? 7 + index % 4 * 2 : 10 + index % 5 * 3}px`,
                        '--spark-spin': `${(index % 2 ? -1 : 1) * (180 + index % 5 * 90)}deg`,
                        '--spark-delay': `${index % (charging ? 5 : 8) * (charging ? 14 : 24)}ms`,
                        '--spark-duration': `${charging ? 480 : 1000 + index % 4 * 100}ms`,
                    } as CSSProperties} />;
                })}
            </div>}
        </div>
        <section className={`${styles.choices} ${definition.offerCount > 3 ? styles.multiRowChoices : ''} ${definition.offerCount === 2 ? styles.twoChoices : ''} ${finishing ? styles.dismissedChoices : ''} ${definition.offerCount === 5 ? styles.fiveCompact : ''}`} role="region" tabIndex={-1} aria-labelledby="raise-pack-title" aria-busy={stage !== 'ready'}>
            <h2 id="raise-pack-title" className={showChoices ? styles.title : styles.hiddenTitle}>
                {progressionPack ? rewardTitle : <>Choose Your {definition.family === 'mixed' ? 'Upgrades' : definition.family === 'deck' ? 'Deck Upgrade' : familyLabel}{definition.family !== 'mixed' && definition.pickCount > 1 ? 's' : ''}</>}
                {(!progressionPack || definition.pickCount > 1) && <span className={styles.pickCount}>{picksRemaining} {picksRemaining === 1 ? 'choice' : 'choices'} remaining</span>}
            </h2>
            <p className={styles.srOnly} aria-live="polite">{stage === 'ready' ? `${choices.length} cards available. ${picksRemaining} ${picksRemaining === 1 ? 'choice' : 'choices'} remaining.` : stage === 'received' ? `${familyLabel} added.` : stage === 'flying' ? `Adding your ${familyLabel.toLowerCase()}.` : `Opening your ${definition.family} pack.`}</p>
            {(definition.family === 'relic' || definition.family === 'mixed') && inventory.filter(instance => !RelicManager.getRelicConfig(instance.id)?.tableAction).length >= relicSlots && definition.id !== 'relic_boss' && <p className={styles.slotStatus}>
                Relic slots full. {definition.family === 'mixed' ? 'Choose another card or skip.' : 'Skip to continue.'}
            </p>}
            <div className={styles.options}>
                {(offers ?? choices).map(id => {
                    const raise = getRaise(id);
                    const upgrade = getPackCard(id);
                    const relic = RelicManager.getRelicConfig(id);
                    const challenge = getChallengeCard(id);
                    const targeted = getTargetedPackReward(id);
                    const card = raise ?? upgrade ?? relic ?? challenge ?? targeted;
                    if (!card) return null;
                    const cardFamily = targeted?.family ?? (raise ? 'raise' : relic ? 'relic' : challenge ? 'challenge' : 'deck');
                    const consumed = !choices.includes(id);
                    const blocked = !!relic && !canAcquireRelic(id, inventory, relicSlots);
                    return <div key={id} ref={element => { if (element) options.current.set(id, element); else options.current.delete(id); }}
                        aria-hidden={consumed || undefined}
                        style={{ '--rarity-color': getRelicRarityFrameColor(card.rarity), '--card-type-color': PACK_FAMILY_COLORS[cardFamily] } as CSSProperties}
                        className={`${styles.option} ${consumed || finishing && selected && selected !== id ? styles.unselected : ''} ${selected === id ? styles.selected : ''}`}>
                        <button type="button" data-raise-card ref={element => { if (element) cards.current.set(id, element); else cards.current.delete(id); }}
                            id={`raise-card-${id}`}
                            disabled={stage !== 'ready' || consumed || blocked}
                            aria-label={`Select ${card.name} card, ${card.rarity}`}
                            onClick={() => void choose(id)}
                            className={`${styles.card} ${targeted ? styles.packCard : ''} ${blocked ? styles.blockedCard : ''} ${(raise?.modifiers.length ?? 0) > 3 ? styles.denseCard : ''}`}>
                            {targeted ? <PackVisual packId={targeted.id} /> : <>
                                <span className={styles.cardType}>
                                    <RaisePackArt family={cardFamily} />
                                    {relic?.tableAction ? 'Table Action' : PACK_FAMILY_LABELS[cardFamily]}
                                </span>
                                <span className={styles.rarity} style={{ color: getRelicRarityTextColor(card.rarity) }}>{relic?.tableAction ? 'TABLE ACTION' : card.rarity}</span>
                                <span className={styles.cardBody}>
                                    {raise ? <RaiseCard raise={raise} /> : relic ? <RelicTooltip relic={relic} layout="card" displayValues={relic.properties ?? {}} /> : challenge ? <ChallengeOption card={challenge} /> : <UpgradeCard card={upgrade!} />}
                                </span>
                                {blocked && <span className={styles.blockedLabel}>Relic slots full</span>}
                            </>}
                        </button>
                        <button data-choose-raise className={`${styles.chooseButton} ${selected === id ? styles.fadeOut : ''}`}
                            disabled={stage !== 'ready' || consumed || blocked} aria-label={`Choose ${card.name}, ${card.rarity}`}
                            aria-describedby={`raise-card-${id}`}
                            onClick={() => void choose(id)}>CHOOSE</button>
                    </div>;
                })}
            </div>
            <button type="button" className={`${styles.skipButton} ${showChoices ? '' : styles.fadeOut}`}
                disabled={stage !== 'ready'} onClick={() => void skip()}>
                {definition.pickCount === 2 && picksRemaining < 2 ? 'SKIP REMAINING' : 'SKIP'}
            </button>
        </section>
    </div>;
}

export function RaisePackChoice({ sourceRect, arrivedFromChallenge = false, onComplete }: { sourceRect: PackSourceRect | null; arrivedFromChallenge?: boolean; onComplete: () => void }) {
    const [nestedSource, setNestedSource] = useState<PackSourceRect | null>(null);
    const raises = useGameBridge(state => state.pendingRaiseChoices);
    const upgrades = useGameBridge(state => state.pendingPackChoices);
    const choices = upgrades.length ? upgrades : raises;
    const pendingPack = useGameBridge(state => state.pendingPack);
    if (!sourceRect && !choices.length && !pendingPack) return null;
    const openNestedPack = async (cardId: string, source: PackSourceRect) => {
        setNestedSource(source);
        await useGameBridge.getState().dispatch({ type: 'choose_pack_card', cardId });
        if (useGameBridge.getState().pendingPack?.packId !== source.packId) throw new Error('Pack selection was not accepted');
    };
    const openingSource = nestedSource?.packId === pendingPack?.packId ? nestedSource : sourceRect;
    return <PackReveal key={pendingPack?.packId ?? sourceRect?.packId} choices={choices} pendingPack={pendingPack} sourceRect={openingSource} arrivedFromChallenge={arrivedFromChallenge && !openingSource} onComplete={onComplete} onOpenPack={openNestedPack} />;
}
