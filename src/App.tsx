import React, { useState, useRef, useEffect } from 'react';
import styles from './App.module.css';
import { useGameStore } from './store/gameStore';
import { fireConfetti } from './utils/confetti';
import { PlayingCard } from './components/PlayingCard';
import { Hand } from './components/Hand';
import { DeckView } from './components/DeckView';
import { PhysicsPot } from './components/PhysicsPot';
import { TitlePhysics } from './components/TitlePhysics';
import titleStyles from './components/TitlePhysics.module.css';
import { CasinoListingView } from './components/CasinoListingView';
import { GamblerSelect } from './components/GamblerSelect';
import { CitySelect } from './components/CitySelect';

import { CompsWindow } from './components/CompsWindow';
import { RelicInventory } from './components/RelicInventory';

import { RelicStore } from './components/RelicStore';
import { GiftShop } from './components/GiftShop';
import { TableActionButton } from './components/TableActionButton';

import type { PlayerHand, Card } from './types';
import { useLayout } from './components/ResponsiveLayout';
import { CasinosButton, DeckButton } from './components/HeaderButtons';
import { CITY_DEFINITIONS } from './logic/cities/definitions';
import { RelicManager } from './logic/relics/manager';
import { AudioControls } from './components/AudioControls';
import { sfxEngine } from './utils/sfxEngine';

import { TutorialOverlay } from './components/TutorialOverlay';
import { TutorialManager } from './logic/tutorials/tutorials';
import {
    getPersistedState,
    getSelectedCityId,
    getSelectedGamblerId,
    getUnlockedCityIds,
    getUnlockedGamblerIds,
    isCityUnlocked,
    isCityCleared,
    isGamblerUnlocked,
    resetPersistedState,
    setSelectedCityId as setPersistedCityId,
    setSelectedGamblerId as setPersistedGamblerId,
    getMusicVolume as getPersistedMusicVolume,
    getSfxVolume as getPersistedSfxVolume,
    getMusicMuted as getPersistedMusicMuted,
    getSfxMuted as getPersistedSfxMuted,
    setMusicVolume as setPersistedMusicVolume,
    setSfxVolume as setPersistedSfxVolume,
    setMusicMuted as setPersistedMusicMuted,
    setSfxMuted as setPersistedSfxMuted,
    getSkipAtlanticTutorials as getPersistedSkipAtlanticTutorials,
    setSkipAtlanticTutorials as setPersistedSkipAtlanticTutorials
} from './store/persistence';
import { ensureUnlocksUpToDate, unlockAllContent } from './logic/progression';
import { STAND_TUTORIAL_ID, TUTORIAL_STEPS, shouldPromptStandNow } from './logic/tutorials/definitions';

// Constants for layout
const POT_TOP_Y = 380; // Anchor pots to this Y value
const MUSIC_FADE_MS = 800;
const MUSIC_VOLUME_SCALE = 0.5;
const MENU_MUSIC = '/sounds/Music-Menu.mp3';
const GIFT_SHOP_MUSIC = '/sounds/Music-GiftShop.mp3';
const GAME_MUSIC_TRACKS = [
    '/sounds/Music-Game-01.mp3',
    '/sounds/Music-Game-02.mp3',
    '/sounds/Music-Game-03.mp3',
    '/sounds/Music-Game-04.mp3'
];

type SwapAnimationItem = {
    key: string;
    card: Card;
    from: { x: number; y: number; width: number; height: number };
    to: { x: number; y: number; width: number; height: number };
    path: string;
};

type SwapAnimation = {
    items: SwapAnimationItem[];
    durationMs: number;
};

export default function App() {
    const {
        dealer,
        playerHands,
        deck,
        phase,
        round,
        nextRound,
        scoringHandIndex,
        isInitialDeal,
        isCollectingChips,
        runningSummary,

        totalScore,
        targetScore,
        comps,
        handsRemaining,

        isShaking,

        dealerMessage,
        dealerMessageExiting,
        drawnCards,
        selectedDrawIndex,
        redrawDiscard,
        isRedrawAnimating,
        selectDrawnCard,
        discardPile,
        dealsTaken,

        startGame,
        dealFirstHand,
        drawCard,
        assignCard,
        holdReturns,

        setAnimationSpeed,
        animationSpeed,
        modifiers,
        inventory,
        roundSummary,
        getProjectedDrawCount,
        // showFinalScore removed
        // continueFromFinalScore removed

        interactionMode,
        activeTableActionId,
        debugWin,
        debugUndo,
        drawSpecificCard,
        allWinnersEnlarged,
        dealerVisible,
        isDealerPlaying,
        debugEnabled,
        toggleDebug,
        triggerDebugChips,
        removeCard,
        enhanceCard,
        leaveShop,
        cardsPlacedThisTurn,
        getProjectedPlaceCount,

        // Table Actions
        tableActionCharges,
        tableActionHeldCards,
        startTableAction,
        cancelTableAction,
        selectTableActionHand,
        selectTableActionCard,
        selectTableActionDrawCard,

        // Debug Functions
        debugFillTableAction,
        isReshuffling,
        goToTitle,
        winGame,
        selectedCityId: storeCityId,

        // Tutorial Actions
        checkTutorials,
        isTutorialInputLocked,
        onTutorialContinue,
        onInitialDealAnimationsComplete,
        signalTotalWinningsAnimationComplete,
        drawTutorialReady,
    } = useGameStore();

    const { scale, viewportWidth, viewportHeight } = useLayout();

    const tableActionSlots = inventory.flatMap(instance => {
        const config = RelicManager.getRelicConfig(instance.id);
        if (!config?.tableAction) return [];
        return [{ relicId: instance.id, config, action: config.tableAction }];
    }).slice(0, 2);

    const activeActionConfig = activeTableActionId ? RelicManager.getRelicConfig(activeTableActionId)?.tableAction : null;
    const activeActionColor = activeActionConfig?.accentColor;
    const activeActionPrompt = activeActionConfig
        ? (activeTableActionId === 'hold' && tableActionHeldCards[activeTableActionId]
            ? (activeActionConfig.promptWhenHeld || activeActionConfig.prompt)
            : activeActionConfig.prompt)
        : null;

    const [showDeck, setShowDeck] = useState(false);
    const [isRemovingCards, setIsRemovingCards] = useState(false);
    const [isEnhancingCards, setIsEnhancingCards] = useState(false);
    const [isSelectingDebugCard, setIsSelectingDebugCard] = useState(false);
    const [swapAnimation, setSwapAnimation] = useState<SwapAnimation | null>(null);
    const [hiddenCardIds, setHiddenCardIds] = useState<string[]>([]);
    // showHandRankings removed
    const [showCasinoListing, setShowCasinoListing] = useState(false);
    const [showCompsWindow, setShowCompsWindow] = useState(false);
    const [showRelicStore, setShowRelicStore] = useState(false);
    const [relicStoreFilter, setRelicStoreFilter] = useState<string | undefined>(undefined);
    const [overlayComplete, setOverlayComplete] = useState(false);
    // scoreAnimate removed

    const [hasClickedWin, setHasClickedWin] = useState(false);
    const [skipAtlanticTutorials, setSkipAtlanticTutorials] = useState(() => getPersistedSkipAtlanticTutorials());
    const [skipTutorialToggleEnabled, setSkipTutorialToggleEnabled] = useState(false);
    const [standWarningMessage, setStandWarningMessage] = useState<string | null>(null);
    const [standWarningStyle, setStandWarningStyle] = useState<React.CSSProperties | null>(null);
    const standWarningTimeoutRef = useRef<number | null>(null);
    const standButtonRef = useRef<HTMLButtonElement | null>(null);
    const swapTimeoutRef = useRef<number | null>(null);

    const drawAreaRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const totalWinningsAnimationSignaled = useRef(false);

    const [musicVolume, setMusicVolume] = useState(() => getPersistedMusicVolume());
    const [sfxVolume, setSfxVolume] = useState(() => getPersistedSfxVolume());
    const [musicMuted, setMusicMuted] = useState(() => getPersistedMusicMuted());
    const [sfxMuted, setSfxMuted] = useState(() => getPersistedSfxMuted());
    const [audioUnlocked, setAudioUnlocked] = useState(false);
    const musicRef = useRef<HTMLAudioElement | null>(null);
    const musicTrackRef = useRef<string | null>(null);
    const musicFadeRef = useRef<number | null>(null);
    const phaseRef = useRef(phase);
    const roundRef = useRef(round);
    const musicVolumeRef = useRef(musicVolume);
    const musicMutedRef = useRef(musicMuted);
    const vigintiSoundKey = useGameStore(state => state.vigintiSoundKey);
    const lastVigintiKey = useRef(vigintiSoundKey);

    const [selectedGamblerId, setSelectedGamblerId] = useState(() => getSelectedGamblerId());

    useEffect(() => {
        setPersistedGamblerId(selectedGamblerId);
    }, [selectedGamblerId]);

    useEffect(() => {
        setPersistedSkipAtlanticTutorials(skipAtlanticTutorials);
    }, [skipAtlanticTutorials]);

    const [selectedCityId, setSelectedCityId] = useState(() => getSelectedCityId());

    useEffect(() => {
        setPersistedCityId(selectedCityId);
    }, [selectedCityId]);

    useEffect(() => {
        ensureUnlocksUpToDate();
        const persisted = getPersistedState();
        const unlockedCities = getUnlockedCityIds();
        const unlockedGamblers = getUnlockedGamblerIds();

        if (!isCityUnlocked(persisted.selectedCityId)) {
            const fallbackCity = unlockedCities[0] || 'atlantic_city';
            setSelectedCityId(fallbackCity);
            setPersistedCityId(fallbackCity);
        }

        if (!isGamblerUnlocked(persisted.selectedGamblerId)) {
            const fallbackGambler = unlockedGamblers[0] || 'newbie';
            setSelectedGamblerId(fallbackGambler);
            setPersistedGamblerId(fallbackGambler);
        }
    }, []);

    const stopMusicFade = () => {
        if (musicFadeRef.current !== null) {
            cancelAnimationFrame(musicFadeRef.current);
            musicFadeRef.current = null;
        }
    };

    const fadeMusicTo = (
        audio: HTMLAudioElement,
        from: number,
        to: number,
        durationMs: number,
        onComplete?: () => void
    ) => {
        stopMusicFade();
        if (durationMs <= 0) {
            audio.volume = to;
            onComplete?.();
            return;
        }
        const start = performance.now();
        const tick = (now: number) => {
            const progress = Math.min(1, (now - start) / durationMs);
            const nextVolume = from + (to - from) * progress;
            audio.volume = Math.max(0, Math.min(1, nextVolume));
            if (progress < 1) {
                musicFadeRef.current = requestAnimationFrame(tick);
            } else {
                musicFadeRef.current = null;
                onComplete?.();
            }
        };
        musicFadeRef.current = requestAnimationFrame(tick);
    };

    const getGameMusicForRound = (casinoRound: number) => {
        const total = GAME_MUSIC_TRACKS.length;
        const safeRound = Math.max(1, casinoRound || 1);
        const index = (safeRound - 1) % total;
        return GAME_MUSIC_TRACKS[index];
    };

    const getDesiredMusicTrack = (currentPhase: string, casinoRound: number) => {
        if (currentPhase === 'init') return MENU_MUSIC;
        if (currentPhase === 'gift_shop') return GIFT_SHOP_MUSIC;
        return getGameMusicForRound(casinoRound);
    };

    const getScaledMusicVolume = (rawVolume: number, isMuted: boolean) => {
        if (isMuted) return 0;
        return Math.max(0, Math.min(1, rawVolume * MUSIC_VOLUME_SCALE));
    };

    useEffect(() => {
        phaseRef.current = phase;
    }, [phase]);

    useEffect(() => {
        roundRef.current = round;
    }, [round]);

    useEffect(() => {
        musicVolumeRef.current = musicVolume;
    }, [musicVolume]);

    useEffect(() => {
        musicMutedRef.current = musicMuted;
    }, [musicMuted]);

    useEffect(() => {
        const music = new Audio();
        music.loop = true;
        music.volume = 0;
        musicRef.current = music;

        const resumeOnGesture = () => {
            setAudioUnlocked(true);
            void sfxEngine.resume();
            const currentMusic = musicRef.current;
            if (!currentMusic) return;
            const desiredTrack = getDesiredMusicTrack(phaseRef.current, roundRef.current);
            const desiredVolume = getScaledMusicVolume(musicVolumeRef.current, musicMutedRef.current);
            if (desiredVolume <= 0) return;

            if (musicTrackRef.current !== desiredTrack) {
                stopMusicFade();
                musicTrackRef.current = desiredTrack;
                currentMusic.src = desiredTrack;
                currentMusic.currentTime = 0;
                currentMusic.volume = 0;
                currentMusic.play().catch(() => {});
                fadeMusicTo(currentMusic, 0, desiredVolume, MUSIC_FADE_MS);
                return;
            }

            if (currentMusic.paused) {
                currentMusic.volume = 0;
                currentMusic.play().catch(() => {});
                fadeMusicTo(currentMusic, 0, desiredVolume, MUSIC_FADE_MS);
            } else {
                currentMusic.volume = desiredVolume;
            }
        };
        window.addEventListener('pointerdown', resumeOnGesture, { once: true });
        void sfxEngine.preloadAll();

        return () => {
            window.removeEventListener('pointerdown', resumeOnGesture);
            stopMusicFade();
            music.pause();
            music.src = '';
        };
    }, []);

    useEffect(() => {
        const music = musicRef.current;
        if (!music) return;

        const desiredTrack = getDesiredMusicTrack(phase, round);
        const desiredVolume = getScaledMusicVolume(musicVolume, musicMuted);

        const startTrack = () => {
            musicTrackRef.current = desiredTrack;
            music.src = desiredTrack;
            music.currentTime = 0;
            music.volume = 0;
            music.play().catch(() => {});
            fadeMusicTo(music, 0, desiredVolume, MUSIC_FADE_MS);
        };

        if (musicTrackRef.current === desiredTrack) {
            if (!audioUnlocked || desiredVolume === 0) {
                stopMusicFade();
                music.volume = 0;
                if (!music.paused) music.pause();
                return;
            }
            if (music.paused) {
                music.volume = 0;
                music.play().catch(() => {});
                fadeMusicTo(music, 0, desiredVolume, MUSIC_FADE_MS);
                return;
            }
            music.volume = desiredVolume;
            return;
        }

        if (!audioUnlocked || desiredVolume === 0) {
            stopMusicFade();
            musicTrackRef.current = desiredTrack;
            music.src = desiredTrack;
            music.currentTime = 0;
            music.volume = 0;
            music.pause();
            return;
        }

        if (!music.paused) {
            const from = music.volume;
            fadeMusicTo(music, from, 0, MUSIC_FADE_MS, () => {
                startTrack();
            });
        } else {
            startTrack();
        }
    }, [phase, round, audioUnlocked, musicMuted, musicVolume]);

    useEffect(() => {
        sfxEngine.setSfxVolume(sfxVolume);
        sfxEngine.setSfxMuted(sfxMuted);
    }, [sfxVolume, sfxMuted]);

    useEffect(() => {
        setPersistedMusicVolume(musicVolume);
    }, [musicVolume]);

    useEffect(() => {
        setPersistedSfxVolume(sfxVolume);
    }, [sfxVolume]);

    useEffect(() => {
        setPersistedMusicMuted(musicMuted);
    }, [musicMuted]);

    useEffect(() => {
        setPersistedSfxMuted(sfxMuted);
    }, [sfxMuted]);

    useEffect(() => {
        if (vigintiSoundKey === lastVigintiKey.current) return;
        lastVigintiKey.current = vigintiSoundKey;
        if (sfxMuted || sfxVolume <= 0) return;
        sfxEngine.play('viginti');
    }, [vigintiSoundKey, sfxMuted, sfxVolume]);

    const playClick = React.useCallback(() => {
        if (sfxMuted || sfxVolume <= 0) return;
        sfxEngine.play('click');
    }, [sfxMuted, sfxVolume]);

    const playCardFlip = React.useCallback(() => {
        if (sfxMuted || sfxVolume <= 0) return;
        sfxEngine.play('cardFlip');
    }, [sfxMuted, sfxVolume]);

    const playCardDeal = React.useCallback(() => {
        if (sfxMuted || sfxVolume <= 0) return;
        sfxEngine.play('cardDeal');
    }, [sfxMuted, sfxVolume]);

    const playCardPlace = React.useCallback(() => {
        if (sfxMuted || sfxVolume <= 0) return;
        sfxEngine.play('cardPlace');
    }, [sfxMuted, sfxVolume]);

    const handleCardFlipSound = React.useCallback((_cardId: string) => {
        playCardFlip();
    }, [playCardFlip]);

    const handleCardDealSound = React.useCallback((_cardId: string) => {
        playCardDeal();
    }, [playCardDeal]);

    const handleCardDiscardSound = React.useCallback((_cardId: string) => {
        playCardPlace();
    }, [playCardPlace]);

    const hasClearedAtlanticCity = isCityCleared('atlantic_city');
    const shouldShowSkipTutorial = selectedCityId === 'atlantic_city';


    const [displayRound, setDisplayRound] = useState(round);
    const [displayTarget, setDisplayTarget] = useState(targetScore);
    const [displayComps, setDisplayComps] = useState(comps);
    const [delayedRemainingTarget, setDelayedRemainingTarget] = useState(targetScore - totalScore); // New state for delayed visual update

    const [handsAnimate, setHandsAnimate] = useState(false);
    const prevHandsRemaining = React.useRef(handsRemaining);
    const prevTotalScore = React.useRef(totalScore);

    const [roundAnimate, setRoundAnimate] = useState(false);
    const [targetAnimate, setTargetAnimate] = useState(false);
    const [compsAnimate, setCompsAnimate] = useState(false);
    const runInitializedRef = useRef(false);
    const confettiFiredRef = useRef(false);

    const [showSelectionUI, setShowSelectionUI] = useState(false);
    const [hasSettledFirstOverlay, setHasSettledFirstOverlay] = useState(false);
    const [, setProgressionRevision] = useState(0);
    const pendingDrawAnimationIds = useRef<Set<string>>(new Set());
    const isDrawAnimationActive = useRef(false);
    useEffect(() => {
        return () => {
            if (standWarningTimeoutRef.current !== null) {
                window.clearTimeout(standWarningTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!standWarningMessage) {
            setStandWarningStyle(null);
            return;
        }

        const updatePosition = () => {
            const button = standButtonRef.current;
            const wrapper = document.getElementById('game-scale-wrapper');
            if (!button || !wrapper) return;

            const rect = button.getBoundingClientRect();
            const wrapperRect = wrapper.getBoundingClientRect();
            const left = (rect.left - wrapperRect.left) / scale + rect.width / scale / 2;
            const gap = 12;
            const top = (rect.top - wrapperRect.top) / scale - gap;

            setStandWarningStyle({
                left: `${left}px`,
                top: `${top}px`,
                transform: 'translate(-50%, -100%)'
            });
        };

        updatePosition();
        const interval = window.setInterval(updatePosition, 80);
        window.addEventListener('resize', updatePosition);

        return () => {
            window.clearInterval(interval);
            window.removeEventListener('resize', updatePosition);
        };
    }, [standWarningMessage, scale, viewportWidth, viewportHeight]);

    // Watch for phase change to handle initial overlay transition
    useEffect(() => {
        if (phase === 'entering_casino' && round === 1) {
            if (debugEnabled) {
                setHasSettledFirstOverlay(true);
                return;
            }
            const timer = setTimeout(() => setHasSettledFirstOverlay(true), 100);
            return () => clearTimeout(timer);
        } else if (phase === 'init') {
            setHasSettledFirstOverlay(false);
        }
    }, [phase, round, debugEnabled]);

    // Watch for drawn card to delay selection UI
    useEffect(() => {
        if (drawnCards.some(c => c !== null)) {
            setShowSelectionUI(true);
        } else {
            setShowSelectionUI(false);
        }
    }, [drawnCards]);

    // Track draw animations so tutorial steps can wait for them to finish
    useEffect(() => {
        const activeDrawn = drawnCards.filter((c): c is Card => c !== null);

        if (activeDrawn.length === 0) {
            pendingDrawAnimationIds.current.clear();
            isDrawAnimationActive.current = false;
            return;
        }

        if (!isDrawAnimationActive.current) {
            isDrawAnimationActive.current = true;
        }

        const pending = pendingDrawAnimationIds.current;
        activeDrawn.forEach(card => {
            if (card.origin === 'deck') {
                pending.add(card.id);
            }
        });
    }, [drawnCards]);

    const handleDrawAnimationEnd = (cardId: string) => {
        const pending = pendingDrawAnimationIds.current;
        if (!pending.has(cardId)) return;

        pending.delete(cardId);
        if (pending.size === 0 && isDrawAnimationActive.current) {
            isDrawAnimationActive.current = false;
            TutorialManager.getInstance().signalEvent('player_draw_animation_complete');
        }
    };

    // Track discarded cards for animation
    const [discardingCards, setDiscardingCards] = useState<{ card: any, offset: number, index: number }[]>([]);
    const [redrawDiscardingCards, setRedrawDiscardingCards] = useState<{ card: any, offset: number, index: number }[]>([]);
    const redrawDiscardTimeouts = useRef<number[]>([]);
    const prevDrawnCards = useRef<any[]>([]);
    const prevSelectedDrawIndex = useRef<number | null>(null);

    useEffect(() => {
        // If cards were cleared (length 0) and we had cards before (length > 0)
        let discardTimeouts: number[] = [];
        let discardClearTimeout: number | null = null;

        if (drawnCards.length === 0 && prevDrawnCards.current.length > 0) {
            // Determine which cards were NOT placed
            // Logic: The card at selectedDrawIndex was placed (or 0 if single). Rest are discards.
            const selectedIdx = prevSelectedDrawIndex.current ?? 0;

            // Filter out the selected card, keep others for animation
            // prevDrawnCards might contain nulls if sequential placement happened
            const discards = prevDrawnCards.current
                .map((card, idx) => ({ card, idx }))
                .filter(({ card, idx }) => card !== null && idx !== selectedIdx);

            if (discards.length > 0) {
                // Calculate offsets for these cards based on original count
                const count = prevDrawnCards.current.length; // Use previous count
                const spacing = 120;
                // Need to re-calculate offset logic matching the render loop
                const cardsToAnimate = discards.map(({ card, idx }) => {
                    const offset = (idx - (count - 1) / 2) * spacing;
                    return { card, offset, index: idx };
                });

                setDiscardingCards(cardsToAnimate);

                discards.forEach((_, discardIndex) => {
                    const timeoutId = window.setTimeout(() => {
                        playCardPlace();
                    }, discardIndex * 40);
                    discardTimeouts.push(timeoutId);
                });

                // Clear after animation
                discardClearTimeout = window.setTimeout(() => {
                    setDiscardingCards([]);
                }, 350);
            }
        }

        prevDrawnCards.current = drawnCards;
        prevSelectedDrawIndex.current = selectedDrawIndex;

        return () => {
            discardTimeouts.forEach(timeoutId => window.clearTimeout(timeoutId));
            if (discardClearTimeout !== null) {
                window.clearTimeout(discardClearTimeout);
            }
        };
    }, [drawnCards, selectedDrawIndex, playCardPlace]);

    useEffect(() => {
        if (!redrawDiscard) return;
        const count = drawnCards.length;
        const spacing = 120;
        const offset = (redrawDiscard.index - (count - 1) / 2) * spacing;
        setRedrawDiscardingCards(prev => [
            ...prev,
            { card: redrawDiscard.card, offset, index: redrawDiscard.index }
        ]);
        const timeoutId = window.setTimeout(() => {
            setRedrawDiscardingCards(prev => prev.filter(entry => entry.card.id !== redrawDiscard.card.id));
        }, 350);
        redrawDiscardTimeouts.current.push(timeoutId);
    }, [redrawDiscard, drawnCards.length]);

    useEffect(() => {
        return () => {
            redrawDiscardTimeouts.current.forEach(timeoutId => window.clearTimeout(timeoutId));
            redrawDiscardTimeouts.current = [];
        };
    }, []);

    // Visual Draw Count Logic
    const [visualDrawCount, setVisualDrawCount] = useState(1);

    // Update projected count when drawnCards is empty
    useEffect(() => {
        if (drawnCards.length === 0 && discardingCards.length === 0) {
            const count = getProjectedDrawCount();
            setVisualDrawCount(prev => prev !== count ? count : prev);
        }
    }, [drawnCards.length, discardingCards.length, getProjectedDrawCount, JSON.stringify(modifiers), inventory.map(i => i.id).join(',')]);

    // Watch for Total Winnings appearance to fire confetti
    useEffect(() => {
        if (phase === 'playing') {
            confettiFiredRef.current = false;
        }

        if ((phase === 'round_over' || roundSummary || isCollectingChips) && runningSummary && runningSummary.chips > 0 && !confettiFiredRef.current) {
            if (canvasRef.current) {
                confettiFiredRef.current = true;
                const canvas = canvasRef.current;
                canvas.width = viewportWidth;
                canvas.height = viewportHeight;

                let originX = viewportWidth / 2;
                const labelNode = totalWinningsLabelRef.current;
                if (labelNode) {
                    const targetNode = labelNode.querySelector(`.${styles.valueAndTitle}`) ?? labelNode;
                    const canvasRect = canvas.getBoundingClientRect();
                    const labelRect = targetNode.getBoundingClientRect();
                    if (canvasRect.width > 0) {
                        const scaleX = canvas.width / canvasRect.width;
                        originX = (labelRect.left + labelRect.width / 2 - canvasRect.left) * scaleX;
                    }
                }

                fireConfetti(canvas, {
                    elementCount: 150,
                    spread: 130,
                    startVelocity: 55,
                    decay: 0.96,
                    originX,
                    originY: POT_TOP_Y - 50
                });
            }
        }
    }, [isCollectingChips, phase, !!runningSummary, roundSummary]);

    React.useEffect(() => {
        // Target Reduction Animation
        // When totalScore changes, valid remaining decreases.
        const actualRemaining = Math.max(0, targetScore - totalScore);

        if (actualRemaining !== delayedRemainingTarget) {
            // Update value and trigger pulse animation immediately
            setDelayedRemainingTarget(actualRemaining);
            setTargetAnimate(true);

            const timer = setTimeout(() => {
                setTargetAnimate(false);
            }, 500); // Match dealDecrement animation duration (0.5s)

            return () => {
                clearTimeout(timer);
                setTargetAnimate(false);
            };
        }
    }, [totalScore, targetScore]);

    React.useEffect(() => {
        if (handsRemaining !== prevHandsRemaining.current) {
            setHandsAnimate(true);
            const timer = setTimeout(() => setHandsAnimate(false), 500);
            prevHandsRemaining.current = handsRemaining;
            return () => clearTimeout(timer);
        } else {
            prevHandsRemaining.current = handsRemaining;
        }
    }, [handsRemaining]);

    // Handle value updates for Casino and Target
    React.useEffect(() => {
        if (phase === 'entering_casino') {
            if (debugEnabled) {
                setOverlayComplete(true);
                setDisplayRound(round);
                setDisplayTarget(targetScore);
                setDisplayComps(comps);
                return;
            }

            setOverlayComplete(false);

            // Wait for HUD to arrive at center (0.8s transition)
            const transitionTimer = setTimeout(() => {
                // Update values and trigger pulse animations
                if (round !== displayRound) {
                    setDisplayRound(round);
                    setRoundAnimate(true);
                    setTimeout(() => setRoundAnimate(false), 500 / animationSpeed);
                }
                if (targetScore !== displayTarget) {
                    setDisplayTarget(targetScore);
                    setTargetAnimate(true);
                    setTimeout(() => setTargetAnimate(false), 500 / animationSpeed);
                }
                if (comps !== displayComps) {
                    setDisplayComps(comps);
                    setCompsAnimate(true);
                    setTimeout(() => setCompsAnimate(false), 500 / animationSpeed);
                }
            }, 800 / animationSpeed);

            // Calculate exit delay
            const delay = round === 1 ? 1080 : 1800;
            const exitTimer = setTimeout(() => {
                setOverlayComplete(true);
            }, delay / animationSpeed);

            return () => {
                clearTimeout(transitionTimer);
                clearTimeout(exitTimer);
            };
        } else {
            // Sync values if they change while already in HUD mode
            if (round !== displayRound) {
                setDisplayRound(round);
            }
            if (targetScore !== displayTarget) {
                setDisplayTarget(targetScore);
            }
            if (comps !== displayComps) {
                setDisplayComps(comps);
                // Trigger animation for Comps when they change (e.g. Gift Shop purchase)
                setCompsAnimate(true);
                const timer = setTimeout(() => setCompsAnimate(false), 500 / animationSpeed);
                return () => clearTimeout(timer);
            }
        }
    }, [phase, round, targetScore, comps, debugEnabled]);

    // Synchronize display values immediately when starting a new run (Round 1) 
    // to avoid showing old run values or starting from the top of the screen.
    if (phase === 'entering_casino' && round === 1) {
        if (!runInitializedRef.current) {
            setOverlayComplete(debugEnabled);
            setDisplayRound(1);
            setDisplayTarget(targetScore);
            setDisplayComps(5);
            runInitializedRef.current = true;
        }
    } else {
        runInitializedRef.current = false;
    }

    const isOverlayMode = phase === 'entering_casino' && !overlayComplete;

    const shouldBlockForStandTutorial = () => {
        const tutorialManager = TutorialManager.getInstance();
        if (!tutorialManager.areSessionTutorialsEnabled()) return false;
        if (tutorialManager.isCompleted(STAND_TUTORIAL_ID)) return false;
        return shouldPromptStandNow({
            phase,
            isInitialDeal,
            isDealerPlaying,
            interactionMode,
            playerHands,
            drawnCards
        });
    };

    const handleDraw = () => {
        if (shouldBlockForStandTutorial()) return;
        drawCard();
    };

    const handleHandClick = (index: number) => {
        if (interactionMode === 'select_hand' && activeTableActionId) {
            selectTableActionHand(index);
        } else if (interactionMode === 'default' && drawnCards.length > 0) {
            assignCard(index);
        }
    };

    const triggerSwitchAnimation = (playerCard: Card, dealerCard: Card) => {
        const playerEl = document.querySelector(`[data-card-id="${playerCard.id}"]`) as HTMLElement | null;
        const dealerEl = document.querySelector(`[data-card-id="${dealerCard.id}"]`) as HTMLElement | null;
        const wrapper = document.getElementById('game-scale-wrapper');
        if (!playerEl || !dealerEl || !wrapper) return;

        const playerRect = playerEl.getBoundingClientRect();
        const dealerRect = dealerEl.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        const durationMs = 650;

        if (swapTimeoutRef.current) {
            window.clearTimeout(swapTimeoutRef.current);
        }

        const toWrapperSpace = (rect: DOMRect) => ({
            x: (rect.left - wrapperRect.left) / scale,
            y: (rect.top - wrapperRect.top) / scale,
            width: rect.width / scale,
            height: rect.height / scale
        });

        const buildBezierPath = (
            from: { x: number; y: number },
            to: { x: number; y: number },
            normal: { x: number; y: number },
            curveSign: number
        ) => {
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const distance = Math.hypot(dx, dy) || 1;
            const curve = Math.min(140, Math.max(60, distance * 0.35)) * curveSign;
            const c1x = dx * 0.33 + normal.x * curve;
            const c1y = dy * 0.33 + normal.y * curve;
            const c2x = dx * 0.66 + normal.x * curve;
            const c2y = dy * 0.66 + normal.y * curve;
            return `path("M 0 0 C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)}")`;
        };

        const playerPos = toWrapperSpace(playerRect);
        const dealerPos = toWrapperSpace(dealerRect);
        const baseDx = dealerPos.x - playerPos.x;
        const baseDy = dealerPos.y - playerPos.y;
        const baseDist = Math.hypot(baseDx, baseDy) || 1;
        const baseNormal = { x: -baseDy / baseDist, y: baseDx / baseDist };

        setHiddenCardIds([playerCard.id, dealerCard.id]);
        setSwapAnimation({
            durationMs,
            items: [
                {
                    key: `${playerCard.id}-to-dealer`,
                    card: playerCard,
                    from: { x: playerPos.x, y: playerPos.y, width: playerPos.width, height: playerPos.height },
                    to: { x: dealerPos.x, y: dealerPos.y, width: dealerPos.width, height: dealerPos.height },
                    path: buildBezierPath(playerPos, dealerPos, baseNormal, 1)
                },
                {
                    key: `${dealerCard.id}-to-player`,
                    card: dealerCard,
                    from: { x: dealerPos.x, y: dealerPos.y, width: dealerPos.width, height: dealerPos.height },
                    to: { x: playerPos.x, y: playerPos.y, width: playerPos.width, height: playerPos.height },
                    path: buildBezierPath(dealerPos, playerPos, baseNormal, -1)
                }
            ]
        });

        swapTimeoutRef.current = window.setTimeout(() => {
            setSwapAnimation(null);
            setHiddenCardIds([]);
            swapTimeoutRef.current = null;
        }, durationMs);
    };

    const handleCardSelect = (target: 'player' | 'dealer', handIndex: number | undefined, cardId: string) => {
        if (interactionMode !== 'select_card' || !activeTableActionId) return;

        if (activeTableActionId === 'switch') {
            if (target !== 'player' || handIndex === undefined) return;
            const dealerFaceUp = dealer.cards.find(card => card.isFaceUp);
            const playerCard = playerHands[handIndex]?.cards.find(card => card.id === cardId);
            if (!dealerFaceUp || !playerCard) return;
            triggerSwitchAnimation(playerCard, dealerFaceUp);
        }

        selectTableActionCard({ target, handIndex, cardId });
    };

    const areAllHandsUnplayable = playerHands.every(h => h.isBust || h.isHeld || h.blackjackValue === 21);
    const hasDrawnCards = drawnCards.some(c => c !== null);
    const isDrawAreaClear = !hasDrawnCards;
    const canDraw = phase === 'playing' && isDrawAreaClear && !isDealerPlaying && !isInitialDeal && interactionMode === 'default' && !areAllHandsUnplayable && !isRedrawAnimating;
    const canDrawNow = canDraw && !shouldBlockForStandTutorial();
    const canHold = phase === 'playing' && isDrawAreaClear && !isDealerPlaying && !isInitialDeal && interactionMode === 'default' && !areAllHandsUnplayable && !isRedrawAnimating;
    const isDrawAreaVisible = phase === 'playing' && !isDealerPlaying && !isInitialDeal && (interactionMode === 'default' || interactionMode === 'select_draw' || hasDrawnCards);
    const showTableActions = phase === 'playing' && !dealer.isRevealed && !isInitialDeal;
    const hasDealerFaceUpCard = dealer.cards.some(card => card.isFaceUp);
    const hasPlayableHandForActions = playerHands.some(h => !h.isBust && !h.isHeld && h.blackjackValue !== 21 && h.cards.length > 0);
    const hasSurrenderTarget = playerHands.some(h => !h.isBust && !h.isHeld && h.blackjackValue !== 21 && h.cards.length > 0);
    const hasDiscardPlayerTargets = playerHands.some(h => !h.isBust && h.blackjackValue !== 21 && h.cards.length > 0);
    const hasDiscardDealerTargets = hasDealerFaceUpCard && dealer.blackjackValue < 21;
    const hasHoldPlacementTargets = playerHands.some(h => !h.isBust && !h.isHeld && h.blackjackValue !== 21);
    const hasSwitchTargets = hasDealerFaceUpCard && playerHands.some(h => !h.isBust && h.blackjackValue !== 21 && h.cards.length > 0);
    const dealerSelectableCardIds = (interactionMode === 'select_card' && activeTableActionId === 'discard' && hasDiscardDealerTargets)
        ? dealer.cards.filter(card => card.isFaceUp).map(card => card.id)
        : undefined;

    const isTableActionUsable = (relicId: string, cost: number, hasHeldCard: boolean) => {
        if (!showTableActions || isDealerPlaying) return false;
        if (isRedrawAnimating) return false;
        if (interactionMode !== 'default' && activeTableActionId !== relicId) return false;
        const charges = tableActionCharges[relicId] ?? 0;
        const hasCharge = charges >= cost;

        switch (relicId) {
            case 'double_down':
                return hasCharge && isDrawAreaClear && hasPlayableHandForActions;
            case 'surrender':
                return hasCharge && isDrawAreaClear && hasSurrenderTarget;
            case 'discard':
                return hasCharge && (hasDiscardPlayerTargets || hasDiscardDealerTargets);
            case 'redraw':
                return hasCharge && hasDrawnCards;
            case 'hold':
                return hasHeldCard ? hasHoldPlacementTargets : (hasCharge && hasDrawnCards);
            case 'switch':
                return hasCharge && hasSwitchTargets;
            default:
                return false;
        }
    };

    const areHandsVisible = phase !== 'gift_shop';

    const showStandWarning = () => {
        if (standWarningTimeoutRef.current !== null) {
            window.clearTimeout(standWarningTimeoutRef.current);
        }
        setStandWarningMessage('You should keep hitting');
        if (!sfxMuted && sfxVolume > 0) {
            sfxEngine.play('tutorial');
        }
        standWarningTimeoutRef.current = window.setTimeout(() => {
            setStandWarningMessage(null);
            standWarningTimeoutRef.current = null;
        }, 1100);
    };

    useEffect(() => {
        if (phase !== 'init' || hasClearedAtlanticCity) {
            setSkipTutorialToggleEnabled(false);
            return;
        }

        setSkipTutorialToggleEnabled(false);
        const timer = window.setTimeout(() => {
            setSkipTutorialToggleEnabled(true);
        }, 800);

        return () => {
            window.clearTimeout(timer);
        };
    }, [phase, hasClearedAtlanticCity]);

    // Reset debug button state when draw area reappears
    React.useEffect(() => {
        if (isDrawAreaVisible) {
            setHasClickedWin(false);
        }
    }, [isDrawAreaVisible]);

    useEffect(() => {
        return () => {
            if (swapTimeoutRef.current) {
                window.clearTimeout(swapTimeoutRef.current);
                swapTimeoutRef.current = null;
            }
        };
    }, []);

    const activeCards = [
        ...dealer.cards.filter((_, idx) => idx !== 0 || dealer.isRevealed),
        ...playerHands.flatMap(h => h.cards),
        ...drawnCards.filter((c): c is Card => c !== null),
        ...Object.values(tableActionHeldCards).filter((card): card is Card => !!card),
        ...discardPile
    ];

    useEffect(() => {
        onTutorialContinue('deal_first_hand', async () => {
            dealFirstHand();
        });
    }, [onTutorialContinue, dealFirstHand]);

    useEffect(() => {
        checkTutorials();
    }, [phase, round, isInitialDeal, isDealerPlaying, interactionMode, dealer.cards.length, playerHands, drawnCards, checkTutorials]);

    useEffect(() => {
        if (!drawTutorialReady || !canDraw) return;
        TutorialManager.getInstance().signalEvent('draw_available_after_debt');
    }, [drawTutorialReady, canDraw]);

    const isTotalWinningsVisible = ((phase === 'scoring' && (isCollectingChips || roundSummary || allWinnersEnlarged)) || phase === 'round_over') && runningSummary && runningSummary.chips > 0;
    const totalWinningsSoundPlayedRef = useRef(false);

    useEffect(() => {
        if (!isTotalWinningsVisible) {
            totalWinningsAnimationSignaled.current = false;
            totalWinningsSoundPlayedRef.current = false;
        }
    }, [isTotalWinningsVisible, runningSummary?.chips, runningSummary?.mult]);

    const totalWinningsLabelRef = useRef<HTMLDivElement>(null);

    const signalTotalWinningsOnce = () => {
        if (totalWinningsAnimationSignaled.current) return;
        totalWinningsAnimationSignaled.current = true;
        signalTotalWinningsAnimationComplete();
    };

    useEffect(() => {
        if (!isTotalWinningsVisible) return;
        if (!totalWinningsSoundPlayedRef.current && !sfxMuted && sfxVolume > 0) {
            totalWinningsSoundPlayedRef.current = true;
            sfxEngine.play('totalWinnings');
        }
        const node = totalWinningsLabelRef.current;
        if (!node) return;
        const styles = window.getComputedStyle(node);
        const duration = styles.animationDuration;
        const name = styles.animationName;
        const isZeroDuration = duration === '0s' || duration === '0ms' || duration === '0' || duration === '0.0s';
        if (name === 'none' || isZeroDuration) {
            signalTotalWinningsOnce();
        }
    }, [isTotalWinningsVisible, signalTotalWinningsAnimationComplete]);

    const handleTotalWinningsAnimationEnd = (event: React.AnimationEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        signalTotalWinningsOnce();
    };

    if (phase === 'init') {
        const canStartRun = isCityUnlocked(selectedCityId) && isGamblerUnlocked(selectedGamblerId);

        return (
            <div className={styles.container} style={{ justifyContent: 'center', cursor: 'default' }}>
                <TitlePhysics />
                <AudioControls
                    musicVolume={musicVolume}
                    sfxVolume={sfxVolume}
                    musicMuted={musicMuted}
                    sfxMuted={sfxMuted}
                    onMusicVolumeChange={(value) => {
                        setMusicVolume(value);
                        if (value > 0 && musicMuted) setMusicMuted(false);
                    }}
                    onSfxVolumeChange={(value) => {
                        setSfxVolume(value);
                        if (value > 0 && sfxMuted) setSfxMuted(false);
                    }}
                    onToggleMusicMute={() => setMusicMuted(muted => !muted)}
                    onToggleSfxMute={() => setSfxMuted(muted => !muted)}
                />
                <div className={styles.titleContainer} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 }}>
                    <h1 className={titleStyles.titleText}>
                        {"VIGINTI".split('').map((char, i) => (
                            <span key={i} className={titleStyles.letter} data-index={i}>{char}</span>
                        ))}
                    </h1>
                    <button
                        className={`${styles.button} ${styles.startRunButton}`}
                        style={{ zIndex: 1, marginBottom: 40 }}
                        onClick={() => {
                            playClick();
                            startGame(selectedGamblerId, selectedCityId, { skipAtlanticTutorials });
                        }}
                        disabled={!canStartRun}
                        title={canStartRun ? 'Start Run' : 'Select unlocked city and gambler'}
                    >
                        Start Run
                    </button>
                </div>

                {hasClearedAtlanticCity ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', alignItems: 'center', zIndex: 100 }}>
                        {/* We render them in a flex column so they stack naturally without absolute positioning conflicts */}
                        <div style={{ position: 'relative', bottom: 'auto', left: 'auto', transform: 'none' }}>
                            <CitySelect
                                selectedId={selectedCityId}
                                onSelect={setSelectedCityId}
                                onClickSound={playClick}
                            />
                        </div>
                        <div style={{ position: 'relative', bottom: 'auto', left: 'auto', transform: 'none' }}>
                             <GamblerSelect
                                selectedId={selectedGamblerId}
                                onSelect={setSelectedGamblerId}
                                onClickSound={playClick}
                            />
                        </div>
                        {shouldShowSkipTutorial && (
                            <div className={styles.skipTutorialInline}>
                                <input
                                    id="skip-atlantic-city-tutorials"
                                    type="checkbox"
                                    checked={skipAtlanticTutorials}
                                    onChange={(e) => {
                                        playClick();
                                        setSkipAtlanticTutorials(e.target.checked);
                                    }}
                                    disabled={!skipTutorialToggleEnabled}
                                />
                                <label htmlFor="skip-atlantic-city-tutorials">Skip Tutorial</label>
                            </div>
                        )}
                    </div>
                ) : (
                    shouldShowSkipTutorial && (
                        <div className={styles.skipTutorialContainer}>
                            <input
                                id="skip-atlantic-city-tutorials"
                                type="checkbox"
                                checked={skipAtlanticTutorials}
                                onChange={(e) => {
                                    playClick();
                                    setSkipAtlanticTutorials(e.target.checked);
                                }}
                                disabled={!skipTutorialToggleEnabled}
                            />
                            <label htmlFor="skip-atlantic-city-tutorials">Skip Tutorial</label>
                        </div>
                    )
                )}
                <button
                    className={styles.debugToggle}
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleDebug();
                    }}
                    title="Toggle Debug Mode"
                />
                {debugEnabled && (
                    <svg className={styles.bugIcon} viewBox="0 0 24 24">
                        <path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5c-.49 0-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z" />
                    </svg>
                )}
                {debugEnabled && (
                    <>
                        <div className={styles.debugMenu}>
                            <button
                                className={`${styles.button} ${styles.debugMenuButton}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playClick();
                                    resetPersistedState({ preserveDebug: true });
                                    TutorialManager.getInstance().reset();
                                    const persisted = getPersistedState();
                                    setSelectedCityId(persisted.selectedCityId);
                                    setSelectedGamblerId(persisted.selectedGamblerId);
                                    setProgressionRevision(v => v + 1);
                                }}
                            >
                                Reset Everything
                            </button>
                            <button
                                className={`${styles.button} ${styles.debugMenuButton}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playClick();
                                    unlockAllContent();
                                    ensureUnlocksUpToDate();
                                    setProgressionRevision(v => v + 1);
                                }}
                            >
                                Unlock Everything
                            </button>
                        </div>
                        <div className={styles.debugMenuLeft}>
                            <button
                                className={`${styles.button} ${styles.debugMenuButton}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playClick();
                                    TutorialManager.getInstance().reset();
                                }}
                            >
                                Reset Tutorials
                            </button>
                            <button
                                className={`${styles.button} ${styles.debugMenuButton}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playClick();
                                    const allTutorialIds = TUTORIAL_STEPS.map(step => step.id);
                                    TutorialManager.getInstance().setCompletedSteps(allTutorialIds);
                                    setProgressionRevision(v => v + 1);
                                }}
                            >
                                Clear Tutorials
                            </button>
                        </div>
                    </>
                )}
            </div>
        );
    }

    if (phase === 'game_over') {
        return (
            <div className={styles.container} style={{ justifyContent: 'center' }}>
                <h1 style={{ fontSize: '3rem', color: '#ff4444', marginBottom: 20 }}>GAME OVER</h1>
                <p style={{ fontSize: '1.5rem', color: '#fff', marginBottom: 10 }}>
                    Failed to beat Casino {round}
                </p>
                <p style={{ fontSize: '1.2rem', color: '#aaa', marginBottom: 40 }}>
                    Final Winnings: ${totalScore.toLocaleString()} / ${targetScore.toLocaleString()}
                </p>
                <button className={styles.button} onClick={goToTitle}>Back to Title</button>
            </div>
        );
    }

    if (phase === 'victory') {
        const city = CITY_DEFINITIONS.find(c => c.id === selectedCityId) || CITY_DEFINITIONS[0];
        return (
            <div className={styles.container} style={{ justifyContent: 'center' }}>
                <h1 style={{ fontSize: '3rem', color: '#ffd700', marginBottom: 20 }}>CITY CLEARED</h1>
                <p style={{ fontSize: '1.5rem', color: '#fff', marginBottom: 20 }}>
                     You've conquered {city.name}!
                </p>
                <p style={{ fontSize: '1.2rem', color: '#aaa', marginBottom: 40 }}>
                    Final Score: ${totalScore.toLocaleString()}
                </p>
                <button className={styles.button} onClick={goToTitle} style={{ borderColor: '#ffd700', color: '#ffd700' }}>Victory</button>
            </div>
        );
    }


    // Construct Dealer Props
    const dealerHandProps: PlayerHand = {
        id: -1,
        cards: dealer.cards,
        isHeld: true,
        isBust: dealer.blackjackValue > 21,
        blackjackValue: dealer.blackjackValue
    };

    // Click anywhere to hit (draw) or advance to next round
    const handleGlobalClick = (e: React.MouseEvent) => {
        if (showDeck || showCasinoListing || showCompsWindow || showRelicStore) return;
        if (isTutorialInputLocked()) return;

        // Ignore clicks on buttons or interactive elements
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;

        // Speed up animations if dealer is revealed (Dealer Turn OR Scoring Phase)
        // or during the entering_casino interstitial
        // and the round is not yet over.
        const canSpeedUp = (dealer.isRevealed && phase !== 'round_over') || (phase === 'entering_casino' && !overlayComplete);

        if (canSpeedUp && animationSpeed === 1) {
            setAnimationSpeed(4);
            // If we just sped up the interstitial, consume this click so they don't accidentally start the deal instantly
            if (phase === 'entering_casino') return;
        }

        if (canDrawNow) {
            handleDraw();
        } else if (phase === 'round_over') {
            nextRound();
        } else if (phase === 'entering_casino') {
            // Allow global click to start dealing 
            dealFirstHand();
        }
    };

    // Logic for pot placement relative to the game board (800px max)
    // The user's "1/3 and 1/4 across the screen" refers to the literal coordinates of the play board.
    const boardWidth = 800; // The canonical 800px coordinate system

    // "1/3 across" means the pot is at 1/3 (266px) and 2/3 (533px) of the width.
    // Offset from center (400px) = 400 - 266 = 133.
    const defaultOffset = boardWidth / 6;

    // "1/4 across" means the pot is at 1/4 (200px) and 3/4 (600px) of the width.
    // Offset from center (400px) = 400 - 200 = 200.
    const scoringOffset = boardWidth / 4;

    // Apply the offset based on whether total winnings are displayed
    const currentPotOffset = isTotalWinningsVisible ? scoringOffset : defaultOffset;

    // Calculate stable center X
    const centerX = viewportWidth / 2;

    // Calculate Button Positions relative to Draw Area
    // Draw spots are 100px wide, spaced 120px apart.
    // The play area width extends from center to: ((count - 1) / 2) * 120 + 50
    const drawCountVal = Math.max(drawnCards.length, visualDrawCount);
    const playAreaHalfWidth = ((drawCountVal - 1) / 2) * 120 + 50;
    
    // User requested doubling the spacing (80 -> 160)
    // But constrained to 800px board width (half-width 400px)
    const desiredSpacing = 160; 
    const buttonHalfWidth = 60; // Button is 120px wide
    const maxBoardHalfWidth = 400;
    
    const targetOffset = playAreaHalfWidth + desiredSpacing + buttonHalfWidth;
    const maxOffset = maxBoardHalfWidth - buttonHalfWidth;
    
    // Compromise spacing if needed to fit in board
    const buttonOffset = Math.min(targetOffset, maxOffset);

    const currentCity = CITY_DEFINITIONS.find(c => c.id === selectedCityId) || CITY_DEFINITIONS[0];
    const isLastCasino = round >= currentCity.casinoTargets.length;

    return (
        <div
            className={`${styles.container} ${isShaking ? 'shake-screen red-tint' : ''}`}
            onClick={handleGlobalClick}
            style={{
                '--header-transition-duration': `${0.8 / animationSpeed}s`
            } as React.CSSProperties}
        >
            <div className={styles.topNavContainer}>

                <CasinosButton onClick={() => {
                    playClick();
                    setShowCasinoListing(true);
                }} />

                <div className={styles.headerPlaceholder} />

                <header
                    id="hud-bar"
                    className={`${styles.header} ${isOverlayMode ? styles.headerCentered : ''} ${(isOverlayMode && round === 1 && !hasSettledFirstOverlay) ? styles.noTransition : ''}`}
                    style={isOverlayMode ? { top: 460 } : {}}
                >
                    {debugEnabled && !isOverlayMode && (
                        <button 
                            className={`${styles.manageDebugBtn} ${styles.debugFade}`}
                            style={{
                                position: 'absolute',
                                top: 16,
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                width: 'auto',
                                padding: '4px 12px',
                                zIndex: 100
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                triggerDebugChips();
                            }}
                        >
                            CASH
                        </button>
                    )}
                    <div className={styles.stat}>
                        <span className={styles.statLabel}>Casino</span>
                        <span key={displayRound} className={`${styles.statValue} ${roundAnimate ? styles.statValueAnimate : ''}`}>{displayRound}</span>
                    </div>
                    <div id="hud-debt" className={styles.stat}>
                        <span className={styles.statLabel}>Debt</span>
                        <span key={displayTarget} className={`${styles.statValue} ${targetAnimate ? styles.statValueAnimate : ''}`}>
                            {"$" + delayedRemainingTarget.toLocaleString()}
                        </span>
                    </div>
                    <div id="hud-draws" className={`${styles.stat} ${isOverlayMode ? styles.statHidden : ''}`}>
                        <span className={styles.statLabel}>Draws</span>
                        <span key={handsRemaining} className={`${styles.statValue} ${handsAnimate ? styles.statValueAnimate : ''}`}>{handsRemaining}</span>
                    </div>
                    <div className={styles.stat}>
                        <span className={styles.statLabel}>Comps</span>
                        <span key={displayComps} className={`${styles.statValue} ${compsAnimate ? styles.statValueAnimate : ''}`}>
                            ₵{displayComps}
                        </span>
                    </div>
                </header>

                <div className={styles.rightButtons}>
                    <DeckButton 
                        onClick={() => {
                            playClick();
                            setIsRemovingCards(false);
                            setShowDeck(true);
                        }} 
                        className={isReshuffling ? styles.reshuffleAnim : ''}
                        title={isReshuffling ? "Reshuffling..." : "Deck"}
                    />
                </div>
            </div>

            <div className={styles.headerSpacer} />

            {/* Remove CasinoIntroOverlay usage */}
            {/* Remove CasinoIntroOverlay usage */}

            <PhysicsPot
                key={`chips-${round}-${handsRemaining}`}
                totalValue={runningSummary?.chips ?? 0}
                variant="chips"
                isCollecting={isCollectingChips}
                center={{ x: centerX - currentPotOffset, y: POT_TOP_Y }}
                labelId="total-winnings"
                onCollectionComplete={() => { }}
                onItemArrived={() => { }}
                labelPrefix="$"
            />

            {/* RelicInventory moved to sidebar */}

            <PhysicsPot
                key={`mult-${round}-${handsRemaining}`}
                totalValue={runningSummary?.mult ?? 0}
                variant="multiplier"
                isCollecting={isCollectingChips}
                center={{ x: centerX + currentPotOffset, y: POT_TOP_Y }}
                onCollectionComplete={() => { }}
                onItemArrived={() => { }}
                labelPrefix="x"
            />

            {/* Total Winnings Label (Center) - Only visible when we have a full summary */}
            {isTotalWinningsVisible && runningSummary && runningSummary.chips > 0 && (
                <div
                    ref={totalWinningsLabelRef}
                    className={styles.totalWinningsLabel}
                    style={{
                        left: centerX,
                        top: POT_TOP_Y - 135
                    }}
                    onAnimationEnd={handleTotalWinningsAnimationEnd}
                    onAnimationEnd={handleTotalWinningsAnimationEnd}
                >
                    <div className={styles.winningsWrapper}>
                        <span className={styles.currency}>$</span>
                        <div className={styles.valueAndTitle}>
                            <div className={styles.winningsValue}>
                                {Math.floor(runningSummary.chips * runningSummary.mult).toLocaleString()}
                            </div>
                            <div className={styles.winningsTitle}>TOTAL</div>
                        </div>
                    </div>
                </div>
            )}

            <canvas ref={canvasRef} className={styles.confettiCanvas} />

            <div className={styles.gameWrapper}>
                <div className={styles.sidebarsContainer}>
                    <div className={styles.leftSidebar}>
                        <div
                            className={`${styles.zoneLabel} ${debugEnabled ? styles.manageDebugBtn : ''}`}
                            style={{
                                alignSelf: 'flex-start',
                                width: 'auto',
                                marginBottom: 10,
                                opacity: debugEnabled ? 1 : 0.5,
                                padding: debugEnabled ? '4px 12px' : 0,
                                cursor: debugEnabled ? 'pointer' : 'default',
                                pointerEvents: 'auto'
                            }}
                            onClick={debugEnabled ? () => {
                                setRelicStoreFilter('Charm');
                                setShowRelicStore(true);
                            } : undefined}
                        >
                            Charms
                        </div>
                        <RelicInventory
                            enabledCategories={['Charm']}
                        />
                    </div>
                    <div className={styles.sidebar}>
                        <div
                            className={`${styles.zoneLabel} ${debugEnabled ? styles.manageDebugBtn : ''}`}
                            style={{
                                alignSelf: 'flex-end',
                                width: 'auto',
                                marginBottom: 10,
                                opacity: debugEnabled ? 1 : 0.5,
                                padding: debugEnabled ? '4px 12px' : 0,
                                cursor: debugEnabled ? 'pointer' : 'default',
                                pointerEvents: 'auto'
                            }}
                            onClick={debugEnabled ? () => {
                                setRelicStoreFilter('Angle');
                                setShowRelicStore(true);
                            } : undefined}
                        >
                            Angles
                        </div>
                        <RelicInventory
                            enabledCategories={['Angle']}
                            viewMode="table"
                        />
                    </div>
                </div>

                {standWarningMessage && standWarningStyle && (
                    <div className={styles.popupLayer}>
                        <div
                            className="tutorial-popup tutorial-popup--floating"
                            style={standWarningStyle}
                        >
                            <div className="tutorial-popup-text">{standWarningMessage}</div>
                        </div>
                    </div>
                )}

                <div className={styles.board}>
                    <div className={styles.topContent}>
                        <div id="dealer-hand-zone" className={`${styles.dealerZone} ${!dealerVisible ? styles.dealerZoneHidden : ''}`}>
                            <div className={styles.zoneLabel}>Dealer</div>
                            <div style={{ pointerEvents: dealerSelectableCardIds && dealerSelectableCardIds.length > 0 ? 'auto' : 'none', position: 'relative' }}>
                                <Hand
                                    key={`dealer-${dealerHandProps.id}-${round}-${dealsTaken}`}
                                    hand={dealerHandProps}
                                    baseDelay={dealer.isRevealed ? 0 : 0.4}
                                    stagger={!dealer.isRevealed}
                                    onDealAnimationComplete={isInitialDeal ? onInitialDealAnimationsComplete : undefined}
                                    onCardDealSound={handleCardDealSound}
                                    onCardFlipSound={handleCardFlipSound}
                                    selectableCardIds={dealerSelectableCardIds}
                                    onCardSelect={(cardId) => handleCardSelect('dealer', undefined, cardId)}
                                    tableActionColor={interactionMode === 'select_card' ? activeActionColor : undefined}
                                    hiddenCardIds={hiddenCardIds}
                                />
                            </div>
                            {/* Win Button */}
                            {debugEnabled && (
                                <button
                                    className={`${styles.subtleDebugBtn} ${styles.debugFade} ${phase === 'playing' && isDrawAreaVisible && !hasClickedWin
                                        ? styles.debugVisible
                                        : styles.debugHidden
                                        }`}
                                    onClick={() => {
                                        setHasClickedWin(true);
                                        debugWin();
                                    }}
                                    style={{
                                        width: 100,
                                        position: 'absolute',
                                        bottom: -40,
                                        left: '50%',
                                        transform: 'translateX(-50%)'
                                    }}
                                >
                                    Win
                                </button>
                            )}
                        </div>

                        {dealerMessage && (
                            <div
                                className={`${styles.dealerMessage} ${dealerMessageExiting ? styles.dealerMessageExiting : ''}`}
                                style={{ top: POT_TOP_Y }}
                            >
                                {dealerMessage}
                            </div>
                        )}
                        <div
                            id="dealer-action-anchor"
                            className={styles.dealerActionAnchor}
                            style={{ top: POT_TOP_Y }}
                        />
                    </div>

                    <div className={styles.bottomContent}>
                        <div className={styles.middleZone} style={{ position: 'relative' }}>
                            <div id="draw-area-zone" className={styles.drawAreaContainer} ref={drawAreaRef}>
                                {debugEnabled && (
                                    <div
                                        className={`${styles.debugFade} ${isDrawAreaVisible ? styles.debugVisible : styles.debugHidden}`}
                                        style={{
                                            width: 100,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            position: 'absolute',
                                            top: -40,
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            zIndex: 10
                                        }}>
                                        {drawnCards.some(c => c !== null) && (
                                            <button className={styles.subtleDebugBtn} onClick={debugUndo}>
                                                Undo
                                            </button>
                                        )}
                                        {drawnCards.every(c => c === null) && (
                                            <button
                                                className={styles.subtleDebugBtn}
                                                onClick={() => {
                                                    setShowDeck(true);
                                                    setIsSelectingDebugCard(true);
                                                }}
                                            >
                                                CHOOSE
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div id="draw-indicator-zone" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%', height: '140px' }}>
                                    <div className={styles.drawHitSpotAnchor} id="draw-hit-spot-anchor" />
                                    {/* Render dynamic draw spots */}
                                    {Array.from({ length: Math.max(drawnCards.length, visualDrawCount) }).map((_, idx) => {
                                        // Calculate Offset
                                        const count = Math.max(drawnCards.length, visualDrawCount);
                                        const spacing = 120;
                                        const offset = (idx - (count - 1) / 2) * spacing;

                                        const card = drawnCards[idx];
                                        const isSelected = idx === selectedDrawIndex;
                                        const showHitText = !card && canDrawNow;
                                        const isMultiple = drawnCards.length > 1;
                                        const isPrimaryHitSpot = showHitText && idx === Math.floor(count / 2);

                                        return (
                                            <div
                                                key={`draw-spot-${idx}`}
                                                id={
                                                    isSelected && card
                                                        ? 'selected-drawn-card'
                                                        : isPrimaryHitSpot
                                                            ? 'draw-hit-spot'
                                                            : undefined
                                                }
                                                className={`
                                                ${styles.drawnCardSpot} 
                                                ${showHitText ? styles.hitSpot : ''} 
                                                ${!isDrawAreaVisible ? styles.hiddenSpot : ''}
                                                ${interactionMode === 'select_draw' && card ? styles.actionSpot : ''}
                                                ${isSelected && isMultiple ? styles.selectedSpot : ''}
                                            `}
                                                style={{
                                                    position: 'absolute',
                                                    left: '50%',
                                                    top: '50%',
                                                    transform: `translate(calc(-50% + ${offset}px), -50%)`,
                                                    zIndex: isSelected ? 20 : 10 + idx,
                                                    opacity: !isDrawAreaVisible ? 0 : 1,
                                                    ...(interactionMode === 'select_draw' && activeActionColor ? { '--action-color': activeActionColor } : {})
                                                } as React.CSSProperties}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (interactionMode === 'select_draw' && activeTableActionId) {
                                                        if (card) {
                                                            selectTableActionDrawCard(idx);
                                                        }
                                                    } else if (interactionMode !== 'default') {
                                                        return;
                                                    } else if (card) {
                                                        selectDrawnCard(idx);
                                                    } else if (canDrawNow) {
                                                        handleDraw();
                                                    }
                                                }}
                                            >
                                                {card ? (
                                                    <PlayingCard
                                                        card={card}
                                                        isDrawn
                                                        origin={card.origin}
                                                        onEnterAnimationEnd={handleDrawAnimationEnd}
                                                        onDealSound={handleCardDealSound}
                                                        onFlipSound={handleCardFlipSound}
                                                    />
                                                ) : (
                                                    showHitText && <span className={styles.hitText} style={{ opacity: 1, position: 'relative', transform: 'none', left: 'auto', top: 'auto' }}>HIT</span>
                                                )}

                                                {isSelected && drawnCards.length > 1 && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: -25,
                                                        left: '50%',
                                                        transform: 'translateX(-50%)',
                                                        background: '#ffd700',
                                                        color: '#000',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 'bold',
                                                        whiteSpace: 'nowrap',
                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                                        pointerEvents: 'none',
                                                        opacity: 0 // Hide "SELECT" badge since the glow is enough
                                                    }}>
                                                        SELECT
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Render discarding cards */}
                                    {discardingCards.map(({ card, offset, index }) => (
                                        <div
                                            key={`discard-${index}`}
                                            className={`${styles.drawnCardSpot} ${styles.discardingCard}`}
                                            style={{
                                                position: 'absolute',
                                                left: '50%',
                                                top: '50%',
                                                transform: `translate(calc(-50% + ${offset}px), -50%)`,
                                                zIndex: 5,
                                                // @ts-ignore
                                                '--startX': `${offset}px`
                                            }}
                                        >
                                            <PlayingCard
                                                card={card}
                                                isDrawn
                                                origin="discard"
                                            />
                                        </div>
                                    ))}

                                    {redrawDiscardingCards.map(({ card, offset }) => (
                                        <div
                                            key={`redraw-discard-${card.id}`}
                                            className={`${styles.drawnCardSpot} ${styles.discardingCard}`}
                                            style={{
                                                position: 'absolute',
                                                left: '50%',
                                                top: '50%',
                                                transform: `translate(calc(-50% + ${offset}px), -50%)`,
                                                zIndex: 5,
                                                // @ts-ignore
                                                '--startX': `${offset}px`
                                            }}
                                        >
                                            <PlayingCard
                                                card={card}
                                                isDrawn
                                                origin="discard"
                                            />
                                        </div>
                                    ))}

                                    {/* Debug Charge Buttons - Above Table Actions */}
                                    {debugEnabled && tableActionSlots.map((slot, slotIndex) => {
                                        const slotOffset = slotIndex === 0 ? buttonOffset : -buttonOffset;
                                        return (
                                            <button
                                                key={`debug-charge-${slot.relicId}`}
                                                className={`${styles.subtleDebugBtn} ${styles.debugFade} ${isDrawAreaVisible ? styles.debugVisible : styles.debugHidden}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    debugFillTableAction(slot.relicId);
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    left: '50%',
                                                    top: -40,
                                                    transform: `translate(calc(-50% + ${slotOffset}px), 0)`,
                                                    width: '100px',
                                                    zIndex: 10
                                                }}
                                            >
                                                CHARGE
                                            </button>
                                        );
                                    })}

                                    {/* Table Action Buttons */}
                                    {showTableActions && tableActionSlots.map((slot, slotIndex) => {
                                        const slotOffset = slotIndex === 0 ? buttonOffset : -buttonOffset;
                                        const charges = tableActionCharges[slot.relicId] ?? 0;
                                        const heldCard = tableActionHeldCards[slot.relicId] || null;
                                        const label = slot.relicId === 'hold' && heldCard ? 'PLACE' : slot.action.label;
                                        const isSelectionMode = activeTableActionId === slot.relicId && interactionMode !== 'default';
                                        const isActive = isTableActionUsable(slot.relicId, slot.action.chargeCost, !!heldCard);

                                        return (
                                            <TableActionButton
                                                key={`table-action-${slot.relicId}`}
                                                label={label}
                                                charges={charges}
                                                maxCharges={slot.action.maxCharges}
                                                cost={slot.action.chargeCost}
                                                accentColor={slot.action.accentColor}
                                                isActive={isActive}
                                                isSelectionMode={isSelectionMode}
                                                heldCard={heldCard || undefined}
                                                onClick={() => {
                                                    if (isSelectionMode) {
                                                        cancelTableAction();
                                                    } else {
                                                        startTableAction(slot.relicId);
                                                    }
                                                }}
                                                style={{
                                                    left: '50%',
                                                    top: '50%',
                                                    transform: `translate(calc(-50% + ${slotOffset}px), -50%)`
                                                }}
                                            />
                                        );
                                    })}
                                </div>
                                <div className={styles.infoTextContainer}>
                                    <div className={`${styles.instructions} ${showSelectionUI && drawnCards.some(c => c !== null) && interactionMode === 'default' ? styles.textVisible : ''}`}>
                                        {getProjectedPlaceCount() - cardsPlacedThisTurn > 1 ? `PLACE ${getProjectedPlaceCount() - cardsPlacedThisTurn} CARDS` : 'PLACE CARD'}
                                    </div>
                                    {activeActionPrompt && (
                                        <div
                                            className={`${styles.instructions} ${interactionMode !== 'default' ? styles.textVisible : ''}`}
                                            style={{ color: activeActionColor || '#ffd700' }}
                                        >
                                            {activeActionPrompt}
                                        </div>
                                    )}
                                    <div className={`${styles.clickAnywhere} ${canDrawNow ? styles.textVisible : ''}`}>
                                        Click Anywhere
                                    </div>
                                </div>
                            </div>
                        </div>

                    <div className={styles.playerZone} style={{ opacity: areHandsVisible ? 1 : 0, transition: 'opacity 0.5s', pointerEvents: areHandsVisible ? 'auto' : 'none' }}>
                            <div id="player-hands-zone" className={styles.playerHandsContainer}>
                                {playerHands.map((hand, idx) => {
                                    const isHandActionMode = interactionMode === 'select_hand' && activeTableActionId !== null;
                                    const isAssignMode = interactionMode === 'default' && showSelectionUI && drawnCards.length > 0;
                                    const canSelectForAction = (() => {
                                        if (!isHandActionMode || !activeTableActionId) return false;
                                        if (activeTableActionId === 'double_down' || activeTableActionId === 'surrender') {
                                            return !hand.isBust && !hand.isHeld && hand.blackjackValue !== 21 && hand.cards.length > 0;
                                        }
                                        if (activeTableActionId === 'hold') {
                                            return !hand.isBust && !hand.isHeld && hand.blackjackValue !== 21;
                                        }
                                        return false;
                                    })();
                                    const canSelectHand = isAssignMode || canSelectForAction;
                                    const selectableCardIds = (interactionMode === 'select_card' && activeTableActionId && (activeTableActionId === 'discard' || activeTableActionId === 'switch') && !hand.isBust && hand.blackjackValue !== 21)
                                        ? hand.cards.map(card => card.id)
                                        : undefined;
                                    return (
                                        <Hand
                                            key={`${hand.id}-${round}`}
                                            hand={hand}
                                            canSelect={canSelectHand}
                                            isSelected={false}
                                            onSelect={() => handleHandClick(idx)}
                                            baseDelay={idx === 1 ? 0 : 0.3}
                                            isScoringFocus={idx === scoringHandIndex}
                                            isEnlarged={allWinnersEnlarged && hand.outcome === 'win'}
                                            id={`player-hand-${idx}`}
                                            onCardDealSound={handleCardDealSound}
                                            onCardFlipSound={handleCardFlipSound}
                                            onCardDiscardSound={handleCardDiscardSound}
                                            selectableCardIds={selectableCardIds}
                                            onCardSelect={(cardId) => handleCardSelect('player', idx, cardId)}
                                            tableActionColor={interactionMode === 'select_card' ? activeActionColor : undefined}
                                            hiddenCardIds={hiddenCardIds}
                                        />
                                    );
                                })}


                            </div>




                        </div>

                        <div className={styles.actionButtonContainer}>
                            {((phase === 'playing' && !isInitialDeal) || phase === 'scoring') ? (
                                <button
                                    className={styles.standButton}
                                    id="stand-button"
                                    ref={standButtonRef}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const tutorialManager = TutorialManager.getInstance();
                                        const standContext = {
                                            phase,
                                            isInitialDeal,
                                            isDealerPlaying,
                                            interactionMode,
                                            playerHands,
                                            drawnCards
                                        };

                                        if (tutorialManager.areSessionTutorialsEnabled() && !tutorialManager.isCompleted(STAND_TUTORIAL_ID)) {
                                            if (!shouldPromptStandNow(standContext)) {
                                                showStandWarning();
                                                return;
                                            }
                                        }

                                        if (tutorialManager.getActiveStep()?.id === STAND_TUTORIAL_ID) {
                                            tutorialManager.completeStep(STAND_TUTORIAL_ID);
                                        }
                                        holdReturns(false);
                                    }}
                                    disabled={!canHold}
                                >
                                    Stand
                                </button>
                            ) : (phase === 'round_over' || phase === 'entering_casino' || (phase === 'playing' && isInitialDeal)) ? (
                                <button
                                    className={styles.nextRoundButton}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (phase === 'entering_casino') {
                                            dealFirstHand();
                                        } else if (totalScore >= targetScore && isLastCasino) {
                                            winGame();
                                        } else {
                                            nextRound();
                                        }
                                    }}
                                    disabled={phase === 'playing' && isInitialDeal}
                                    style={phase === 'round_over' && totalScore < targetScore && handsRemaining <= 0 ? { color: '#ff4444', borderColor: '#ff4444' } : {}}
                                >
                                    {phase === 'entering_casino' || (phase === 'playing' && isInitialDeal) ? 'Deal' : (
                                        totalScore >= targetScore ? (isLastCasino ? 'Victory' : 'Next Casino') :
                                            (handsRemaining <= 0 ? 'Game Over' : 'Deal')
                                    )}
                                </button>
                            ) : (phase === 'gift_shop') ? (
                                <button
                                    className={styles.nextRoundButton}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (isLastCasino) {
                                            winGame();
                                        } else {
                                            leaveShop();
                                        }
                                    }}
                                >
                                    {isLastCasino ? 'Victory' : 'Next Casino'}
                                </button>
                            ) : (
                                <div className={styles.actionPlaceholder} />
                            )}
                        </div>

                    </div>
                </div>


            </div>

            {showDeck && (
                <DeckView
                    remainingDeck={[...deck, ...((!dealer.isRevealed && dealer.cards.length > 0) ? [dealer.cards[0]] : [])]}
                    activeCards={activeCards}

                    onClose={() => {
                        playClick();
                        setShowDeck(false);
                        setIsRemovingCards(false);
                        setIsSelectingDebugCard(false);
                        setIsEnhancingCards(false);
                    }}
                    mode={isRemovingCards ? 'remove' : isEnhancingCards ? 'enhance' : 'view'}
                    onRemoveCard={isRemovingCards ? (id) => removeCard(id) : undefined}
                    onEnhanceCard={isEnhancingCards ? (id, effect) => enhanceCard(id, effect) : undefined}
                    onSelectCard={isSelectingDebugCard ? (cardId) => {
                        drawSpecificCard(cardId);
                        setIsSelectingDebugCard(false);
                    } : undefined}
                />
            )}

            {/* showHandRankings block removed */}

            {showCasinoListing && (
                <CasinoListingView
                    currentRound={round}
                    onClose={() => {
                        playClick();
                        setShowCasinoListing(false);
                    }}
                />
            )}

            {phase === 'gift_shop' && (
                <GiftShop />
            )}
            {showCompsWindow && (
                <CompsWindow
                    onClose={() => setShowCompsWindow(false)}
                />
            )}

            {showRelicStore && (
                <RelicStore
                    onClose={() => setShowRelicStore(false)}
                    filterCategory={relicStoreFilter}
                />
            )}

            {swapAnimation && (
                <div className={styles.swapOverlay}>
                    {swapAnimation.items.map(item => (
                        <div
                            key={item.key}
                            className={styles.swapCard}
                            style={{
                                left: item.from.x,
                                top: item.from.y,
                                width: item.from.width,
                                height: item.from.height,
                                // @ts-ignore
                                '--path': item.path,
                                animationDuration: `${swapAnimation.durationMs}ms`
                            }}
                        >
                            <PlayingCard
                                card={item.card}
                                origin="none"
                                suppressEnterAnimation
                                style={{ width: '100%', height: '100%' }}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* FinalScoreOverlay removed */}

            <TutorialOverlay />
            
            <div id="tooltip-portal-root" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3000 }} />
        </div>
    );
}
