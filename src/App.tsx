import { canPlayHand } from './engine/economy';
import React, { useState, useRef, useEffect } from 'react';
import styles from './App.module.css';
import { useGameStore } from './store/gameStore';
import { fireConfetti } from './utils/confetti';
import { PlayingCard } from './components/PlayingCard';
import { Hand } from './components/Hand';
import { HandScores } from './components/HandScores';
import { DeckView } from './components/DeckView';
import { ChooseCardView } from './components/ChooseCardView';
import { PhysicsPot } from './components/PhysicsPot';
import { TitlePhysics } from './components/TitlePhysics';
import titleStyles from './components/TitlePhysics.module.css';
import { GamblerSelect } from './components/GamblerSelect';
import { CitySelect } from './components/CitySelect';

import { PackReward } from './components/PackReward';
import { ChallengeBoard } from './components/ChallengeBoard';
import { RelicInventory } from './components/RelicInventory';

import { RelicStore } from './components/RelicStore';
import { DebugPacks } from './components/DebugPacks';
import { TableActionButton } from './components/TableActionButton';

import type { PlayerHand, Card } from './types';
import { useLayout } from './components/ResponsiveLayout';
import { DeckButton, HandScoresButton } from './components/HeaderButtons';
import { CITY_DEFINITIONS } from './logic/cities/definitions';
import { RelicManager } from './logic/relics/manager';
import { AudioControls } from './components/AudioControls';
import { AnteIncreasePopup } from './components/AnteIncreasePopup';
import { sfxEngine } from './utils/sfxEngine';
import { DebugLogOverlay } from './components/DebugLogOverlay';
import { DebugLoadDialog } from './components/DebugLoadDialog';
import debugStyles from './components/DebugOverlays.module.css';

import { TutorialOverlay } from './components/TutorialOverlay';
import { TutorialManager } from './logic/tutorials/tutorials';
import {
    getPersistedState,
    getSelectedCityId,
    getSelectedGamblerId,
    getUnlockedCityIds,
    getUnlockedGamblerIds,
    isCityUnlocked,
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
    setSfxMuted as setPersistedSfxMuted
} from './store/persistence';
import { ensureUnlocksUpToDate, unlockAllContent } from './logic/progression';
import { NEXT_CASINO_TUTORIAL_ID, STAND_TUTORIAL_ID, TUTORIAL_STEPS, shouldPromptStandNow } from './logic/tutorials/definitions';

// Constants for layout
const POT_TOP_Y = 380; // Anchor pots to this Y value
const MUSIC_FADE_IN_MS = 0;
const MUSIC_SWITCH_FADE_OUT_MS = 800;
const MUSIC_VOLUME_SCALE = 0.5;
const MENU_MUSIC = '/sounds/Music-Menu.mp3';
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

type HoldPickupAnimation = {
    card: Card;
    drawIndex: number;
    left: number;
    top: number;
    width: number;
    height: number;
    dx: number;
    dy: number;
    fromScale: number;
    toScale: number;
};

const HOLD_PICKUP_DURATION_MS = 360;
const HOLD_PLACE_SOURCE_Y = -275;

export default function App() {
    const {
        dealer,
        playerHands,
        phase,
        deal,
        nextDeal,
        scoringHandIndex,
        isInitialDeal,
        isCollectingChips,
        runningSummary,

        totalScore,
        cash,
        ante,
        anteIncrease,
        continueAnteIncrease,

        isShaking,

        dealerMessage,
        dealerMessageExiting,
        drawnCards,
        selectedDrawIndex,
        redrawDiscard,
        isRedrawAnimating,
        selectDrawnCard,
        dealsTaken,

        startGame,
        dealFirstHand,
        drawCard,
        assignCard,
        holdReturns,

        setAnimationSpeed,
        setSfx,
        animationSpeed,
        modifiers,
        inventory,
        relicSlots,
        dealSummary,
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
        debugPackReturn,
        isProcessingEvents,
        pendingPack,
        challengeRewards,
        toggleDebug,
        triggerDebugChips,
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
        selectedCityId: storeCityId,

        // Tutorial Actions
        checkTutorials,
        isTutorialInputLocked,
        onTutorialContinue,
        onInitialDealAnimationsComplete,

        signalTotalWinningsAnimationComplete,
        drawTutorialReady,
        handUpgrades,
        deckProbabilities,
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
    const [showHandScores, setShowHandScores] = useState(false);
    const [showDebugLog, setShowDebugLog] = useState(false);
    const [showDebugLoad, setShowDebugLoad] = useState(false);
    const [isSelectingDebugCard, setIsSelectingDebugCard] = useState(false);
    const [swapAnimation, setSwapAnimation] = useState<SwapAnimation | null>(null);
    const [holdPickupAnimation, setHoldPickupAnimation] = useState<HoldPickupAnimation | null>(null);
    const [hiddenDrawCardIds, setHiddenDrawCardIds] = useState<string[]>([]);
    const [entryAnimationOverrides, setEntryAnimationOverrides] = useState<Record<string, { xOffset: number; yOffset: number; scale: number }>>({});
    const [hiddenCardIds, setHiddenCardIds] = useState<string[]>([]);
    // showHandRankings removed
    const [showRelicStore, setShowRelicStore] = useState(false);
    const [showDebugPacks, setShowDebugPacks] = useState(false);
    const [overlayComplete] = useState(true);
    // scoreAnimate removed

    const [hasClickedWin, setHasClickedWin] = useState(false);
    const [standWarningMessage, setStandWarningMessage] = useState<string | null>(null);
    const [standWarningStyle, setStandWarningStyle] = useState<React.CSSProperties | null>(null);
    const standWarningTimeoutRef = useRef<number | null>(null);
    const standButtonRef = useRef<HTMLButtonElement | null>(null);
    const gameWrapperRef = useRef<HTMLDivElement | null>(null);
    const swapTimeoutRef = useRef<number | null>(null);
    const holdPickupTimeoutRef = useRef<number | null>(null);
    const holdPlaceOverrideTimeoutsRef = useRef<number[]>([]);

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
    const musicFadesRef = useRef<Map<HTMLAudioElement, number>>(new Map());
    const outgoingAudiosRef = useRef<Set<HTMLAudioElement>>(new Set());
    const isMenuMusic = phase === 'init';
    const [gameMusicTrackIndex, setGameMusicTrackIndex] = useState(0);
    const musicVolumeRef = useRef(musicVolume);
    const musicMutedRef = useRef(musicMuted);
    const vigintiSoundKey = useGameStore(state => state.vigintiSoundKey);
    const lastVigintiKey = useRef(vigintiSoundKey);

    const [selectedGamblerId, setSelectedGamblerId] = useState(() => getSelectedGamblerId());

    useEffect(() => {
        setPersistedGamblerId(selectedGamblerId);
    }, [selectedGamblerId]);

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

    useEffect(() => {
        if (phase !== 'init') return;
        const persisted = getPersistedState();

        setSelectedCityId(current =>
            current === persisted.selectedCityId ? current : persisted.selectedCityId
        );
        setSelectedGamblerId(current =>
            current === persisted.selectedGamblerId ? current : persisted.selectedGamblerId
        );
    }, [phase]);

    const stopMusicFade = (audio: HTMLAudioElement) => {
        const rafId = musicFadesRef.current.get(audio);
        if (rafId !== undefined) {
            cancelAnimationFrame(rafId);
            musicFadesRef.current.delete(audio);
        }
    };

    const playMusic = (audio: HTMLAudioElement) => {
        if (!audio.src) return;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {
                // Ignore autoplay errors; playback is retried on user gesture.
            });
        }
    };

    const setMusicOutputVolume = (audio: HTMLAudioElement, volume: number) => {
        audio.volume = Math.max(0, Math.min(1, volume));
    };

    const fadeMusicTo = (
        audio: HTMLAudioElement,
        from: number,
        to: number,
        durationMs: number,
        onComplete?: () => void
    ) => {
        stopMusicFade(audio);
        if (durationMs <= 0) {
            setMusicOutputVolume(audio, to);
            onComplete?.();
            return;
        }
        const start = performance.now();
        const tick = (now: number) => {
            const progress = Math.min(1, (now - start) / durationMs);
            const nextVolume = from + (to - from) * progress;
            setMusicOutputVolume(audio, nextVolume);
            if (progress < 1) {
                musicFadesRef.current.set(audio, requestAnimationFrame(tick));
            } else {
                musicFadesRef.current.delete(audio);
                onComplete?.();
            }
        };
        musicFadesRef.current.set(audio, requestAnimationFrame(tick));
    };

    const getScaledMusicVolume = (rawVolume: number, isMuted: boolean) => {
        if (isMuted) return 0;
        return Math.max(0, Math.min(1, rawVolume * MUSIC_VOLUME_SCALE));
    };

    const isAudioOnTrack = (audio: HTMLAudioElement, track: string) => {
        if (!audio.src) return false;
        try {
            const srcPath = new URL(audio.src, window.location.href).pathname;
            return srcPath.endsWith(track);
        } catch {
            return audio.src.endsWith(track);
        }
    };

    useEffect(() => {
        musicVolumeRef.current = musicVolume;
    }, [musicVolume]);

    useEffect(() => {
        musicMutedRef.current = musicMuted;
    }, [musicMuted]);

    useEffect(() => {
        const music = new Audio();
        music.loop = true;
        music.preload = 'auto';
        setMusicOutputVolume(music, 0);
        musicRef.current = music;

        let hasResumed = false;

        const resumeOnGesture = () => {
            if (hasResumed) return;
            hasResumed = true;
            setAudioUnlocked(true);
            void sfxEngine.resume();

            const currentMusic = musicRef.current;
            if (!currentMusic) return;

            const desiredVolume = getScaledMusicVolume(musicVolumeRef.current, musicMutedRef.current);
            
            if (desiredVolume <= 0) {
                return;
            }

            if (currentMusic.paused) {
                setMusicOutputVolume(currentMusic, 0);
                playMusic(currentMusic);
                fadeMusicTo(currentMusic, 0, desiredVolume, MUSIC_FADE_IN_MS);
            } else {
                setMusicOutputVolume(currentMusic, desiredVolume);
            }
        };

        const gestureEvents: Array<keyof WindowEventMap> = ['pointerdown', 'click', 'keydown', 'touchstart'];
        gestureEvents.forEach(eventName => {
            window.addEventListener(eventName, resumeOnGesture, { passive: true });
        });
        void sfxEngine.preloadAll();

        return () => {
            gestureEvents.forEach(eventName => {
                window.removeEventListener(eventName, resumeOnGesture);
            });
            const allAudios = [musicRef.current, ...Array.from(outgoingAudiosRef.current)];
            allAudios.forEach(audio => {
                if (audio) {
                    stopMusicFade(audio);
                    audio.pause();
                    audio.src = '';
                }
            });
            outgoingAudiosRef.current.clear();
            musicTrackRef.current = null;
        };
    }, []);

    useEffect(() => {
        const currentMusic = musicRef.current;
        if (!currentMusic) return;

        const desiredTrack = isMenuMusic ? MENU_MUSIC : GAME_MUSIC_TRACKS[gameMusicTrackIndex];
        const desiredVolume = getScaledMusicVolume(musicVolume, musicMuted);
        const hasDesiredTrackLoaded = isAudioOnTrack(currentMusic, desiredTrack);

        const startNext = () => {
            const nextMusic = new Audio();
            nextMusic.loop = isMenuMusic;
            nextMusic.onended = () => {
                if (musicRef.current !== nextMusic || isMenuMusic) return;
                setGameMusicTrackIndex(index => (index + 1) % GAME_MUSIC_TRACKS.length);
            };
            nextMusic.preload = 'auto';
            nextMusic.src = desiredTrack;
            nextMusic.currentTime = 0;
            musicRef.current = nextMusic;
            musicTrackRef.current = desiredTrack;

            if (audioUnlocked && desiredVolume > 0) {
                // No fade up for incoming tracks per request
                setMusicOutputVolume(nextMusic, desiredVolume);
                playMusic(nextMusic);
            }
        };

        const createAndPlayNextTrack = () => {
            if (currentMusic.src && !currentMusic.paused) {
                const outgoing = currentMusic;
                outgoingAudiosRef.current.add(outgoing);
                
                // Fade down to 0, but trigger next track at the 50% mark (400ms)
                fadeMusicTo(outgoing, outgoing.volume, 0, MUSIC_SWITCH_FADE_OUT_MS, () => {
                    outgoing.pause();
                    outgoing.src = '';
                    outgoingAudiosRef.current.delete(outgoing);
                });

                // Start next track after 50% of the fade-out duration
                setTimeout(startNext, MUSIC_SWITCH_FADE_OUT_MS / 2);
            } else {
                startNext();
            }
        };

        // Same track logic
        if (musicTrackRef.current === desiredTrack && (hasDesiredTrackLoaded || !currentMusic.src)) {
            if (!audioUnlocked || desiredVolume === 0) {
                stopMusicFade(currentMusic);
                setMusicOutputVolume(currentMusic, 0);
                if (!currentMusic.paused) currentMusic.pause();
                return;
            }
            if (currentMusic.paused) {
                setMusicOutputVolume(currentMusic, 0);
                playMusic(currentMusic);
                fadeMusicTo(currentMusic, 0, desiredVolume, MUSIC_FADE_IN_MS);
                return;
            }
            // Just update volume for current track
            fadeMusicTo(currentMusic, currentMusic.volume, desiredVolume, MUSIC_FADE_IN_MS);
            return;
        }

        // Different track - Crossfade
        createAndPlayNextTrack();
    }, [isMenuMusic, gameMusicTrackIndex, audioUnlocked, musicMuted, musicVolume]);

    useEffect(() => {
        sfxEngine.setSfxVolume(sfxVolume);
        sfxEngine.setSfxMuted(sfxMuted);
    }, [sfxVolume, sfxMuted]);

    useEffect(() => {
        setSfx(sfxEngine);
    }, [setSfx]);

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

    const playClickDown = React.useCallback(() => {
        if (sfxMuted || sfxVolume <= 0) return;
        sfxEngine.play('clickDown');
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
            const gameWrapper = gameWrapperRef.current;
            if (!button || !gameWrapper) return;

            const rect = button.getBoundingClientRect();
            const gameWrapperRect = gameWrapper.getBoundingClientRect();
            const left = (rect.left - gameWrapperRect.left) / scale + rect.width / scale / 2;
            // Keep tutorial warning clearly above the STAND button across responsive scales.
            const verticalClearance = Math.max(18, rect.height * 0.22);
            const top = (rect.top - gameWrapperRect.top) / scale - verticalClearance;

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
        if (phase === 'entering_casino' && deal === 1) {
            if (debugEnabled) {
                setHasSettledFirstOverlay(true);
                return;
            }
            const timer = setTimeout(() => setHasSettledFirstOverlay(true), 100);
            return () => clearTimeout(timer);
        } else if (phase === 'init') {
            setHasSettledFirstOverlay(false);
        }
    }, [phase, deal, debugEnabled]);

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
        playCardPlace();
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
    }, [redrawDiscard, drawnCards.length, playCardPlace]);

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

        if ((phase === 'deal_over' || dealSummary || isCollectingChips) && runningSummary && runningSummary.chips > 0 && !confettiFiredRef.current) {
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
    }, [isCollectingChips, phase, !!runningSummary, dealSummary]);



    const isOverlayMode = phase === 'entering_casino' && !overlayComplete;

    const isStandTutorialPending = () => {
        const tutorialManager = TutorialManager.getInstance();
        return tutorialManager.areSessionTutorialsEnabled() && !tutorialManager.isCompleted(STAND_TUTORIAL_ID);
    };

    const shouldBlockForStandTutorial = () => {
        if (!isStandTutorialPending()) return false;
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

    const getTableActionSlotOffset = (relicId: string) => {
        const slotIndex = tableActionSlots.findIndex(slot => slot.relicId === relicId);
        if (slotIndex === -1) return null;
        return slotIndex === 0 ? buttonOffset : -buttonOffset;
    };

    const handleHoldDrawSelection = (drawIndex: number, card: Card) => {
        if (holdPickupAnimation) return;
        const sourceCardEl = document.querySelector(`[data-card-id="${card.id}"]`) as HTMLElement | null;
        const holdAnchorEl = document.getElementById('hold-card-anchor');
        const wrapperEl = document.getElementById('game-scale-wrapper');
        if (!sourceCardEl || !holdAnchorEl || !wrapperEl) {
            selectTableActionDrawCard(drawIndex);
            return;
        }

        const sourceRect = sourceCardEl.getBoundingClientRect();
        const targetRect = holdAnchorEl.getBoundingClientRect();
        const wrapperRect = wrapperEl.getBoundingClientRect();
        const toWrapperSpace = (rect: DOMRect) => ({
            left: (rect.left - wrapperRect.left) / scale,
            top: (rect.top - wrapperRect.top) / scale,
            width: rect.width / scale,
            height: rect.height / scale
        });

        const source = toWrapperSpace(sourceRect);
        const target = toWrapperSpace(targetRect);
        const sourceCenterX = source.left + source.width / 2;
        const sourceCenterY = source.top + source.height / 2;
        const targetCenterX = target.left + target.width / 2;
        const targetCenterY = target.top + target.height / 2;

        setHiddenDrawCardIds(prev => [...prev, card.id]);
        setHoldPickupAnimation({
            card,
            drawIndex,
            left: source.left,
            top: source.top,
            width: source.width,
            height: source.height,
            dx: targetCenterX - sourceCenterX,
            dy: targetCenterY - sourceCenterY,
            fromScale: 1,
            toScale: 0.6
        });

        if (holdPickupTimeoutRef.current !== null) {
            window.clearTimeout(holdPickupTimeoutRef.current);
        }
        holdPickupTimeoutRef.current = window.setTimeout(() => {
            setHoldPickupAnimation(current => {
                if (!current || current.card.id !== card.id) return current;
                setHiddenDrawCardIds(prev => prev.filter(id => id !== card.id));
                selectTableActionDrawCard(current.drawIndex);
                holdPickupTimeoutRef.current = null;
                return null;
            });
        }, HOLD_PICKUP_DURATION_MS + 240);
    };

    const handleHandClick = (index: number) => {
        if (interactionMode === 'select_hand' && activeTableActionId) {
            if (activeTableActionId === 'hold') {
                const heldCard = tableActionHeldCards[activeTableActionId];
                const slotOffset = getTableActionSlotOffset(activeTableActionId);
                if (heldCard && slotOffset !== null) {
                    setEntryAnimationOverrides(prev => ({
                        ...prev,
                        [heldCard.id]: {
                            xOffset: slotOffset,
                            yOffset: HOLD_PLACE_SOURCE_Y,
                            scale: 0.6
                        }
                    }));
                    const timeoutId = window.setTimeout(() => {
                        setEntryAnimationOverrides(prev => {
                            if (!prev[heldCard.id]) return prev;
                            const next = { ...prev };
                            delete next[heldCard.id];
                            return next;
                        });
                    }, 900);
                    holdPlaceOverrideTimeoutsRef.current.push(timeoutId);
                }
            }
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

    const areAllHandsUnplayable = Array.isArray(playerHands) && playerHands.every(h => h && !canPlayHand(h));
    const hasDrawnCards = drawnCards.some(c => c !== null);
    const isDrawAreaClear = !hasDrawnCards;
    const canDraw = phase === 'playing' && isDrawAreaClear && !isDealerPlaying && !isInitialDeal && interactionMode === 'default' && !areAllHandsUnplayable && !isRedrawAnimating;
    const canDrawNow = canDraw && !shouldBlockForStandTutorial();
    const canHold = phase === 'playing' && isDrawAreaClear && !isDealerPlaying && !isInitialDeal && interactionMode === 'default' && (!areAllHandsUnplayable || isStandTutorialPending()) && !isRedrawAnimating;
    const isDrawAreaVisible = phase === 'playing' && !isDealerPlaying && !isInitialDeal && (interactionMode === 'default' || interactionMode === 'select_draw' || hasDrawnCards);
    const showTableActions = phase === 'playing' && !dealer.isRevealed && !isInitialDeal;
    const hasDealerFaceUpCard = dealer.cards.some(card => card.isFaceUp);
    const hasPlayableHandForActions = playerHands.some(h => !h.isBust && !h.isHeld && h.blackjackValue !== 21 && h.cards.length > 0);
    const hasSurrenderTarget = playerHands.some(h => !h.isBust && !h.isHeld && h.blackjackValue !== 21 && h.cards.length > 0);
    const hasDiscardPlayerTargets = playerHands.some(h => !h.isBust && h.blackjackValue !== 21 && h.cards.length > 0);
    const hasDiscardDealerTargets = hasDealerFaceUpCard && dealer.blackjackValue < 21;
    const hasHoldPlacementTargets = playerHands.some(h => canPlayHand(h));
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

    const areHandsVisible = phase !== 'pack_choice' && phase !== 'casino_payout';

    const showStandWarning = () => {
        if (standWarningTimeoutRef.current !== null) {
            window.clearTimeout(standWarningTimeoutRef.current);
        }
        setStandWarningMessage('You should keep drawing');
        if (!sfxMuted && sfxVolume > 0) {
            sfxEngine.play('tutorial');
        }
        standWarningTimeoutRef.current = window.setTimeout(() => {
            setStandWarningMessage(null);
            standWarningTimeoutRef.current = null;
        }, 1100);
    };

    useEffect(() => {
        if (phase === 'deal_over' || phase === 'init' || phase === 'pack_choice' || phase === 'victory' || phase === 'game_over') {
            setAnimationSpeed(1);
        }
    }, [phase, setAnimationSpeed]);

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
            if (holdPickupTimeoutRef.current !== null) {
                window.clearTimeout(holdPickupTimeoutRef.current);
                holdPickupTimeoutRef.current = null;
            }
            holdPlaceOverrideTimeoutsRef.current.forEach(timeoutId => window.clearTimeout(timeoutId));
            holdPlaceOverrideTimeoutsRef.current = [];
        };
    }, []);

    const activeCards = [
        ...dealer.cards.filter((_, idx) => idx !== 0 || dealer.isRevealed),
        ...playerHands.flatMap(h => h.cards),
        ...drawnCards.filter((c): c is Card => c !== null),
        ...Object.values(tableActionHeldCards).filter((card): card is Card => !!card)
    ];

    useEffect(() => {
        onTutorialContinue('deal_first_hand', async () => {
            dealFirstHand();
        });
    }, [onTutorialContinue, dealFirstHand]);

    useEffect(() => {
        checkTutorials();
    }, [phase, deal, isInitialDeal, isDealerPlaying, interactionMode, dealer.cards.length, playerHands, drawnCards, checkTutorials]);

    useEffect(() => {
        if (phase === 'deal_over') return;
        const tutorialManager = TutorialManager.getInstance();
        if (tutorialManager.getActiveStep()?.id === NEXT_CASINO_TUTORIAL_ID) {
            tutorialManager.completeStep(NEXT_CASINO_TUTORIAL_ID);
        }
    }, [phase]);

    useEffect(() => {
        if (!drawTutorialReady || !canDraw) return;
        TutorialManager.getInstance().signalEvent('draw_available_after_debt');
    }, [drawTutorialReady, canDraw]);

    const isTotalWinningsVisible = (phase === 'scoring' || phase === 'deal_over') && !!dealSummary && runningSummary && runningSummary.chips > 0;
    const showPotLabels = (phase === 'scoring' || phase === 'deal_over') && runningSummary !== null;
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
        signalTotalWinningsAnimationComplete?.();
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

    const handleDealAdvanceAction = React.useCallback(() => {
        if (isProcessingEvents) return;
        if (phase === 'entering_casino') dealFirstHand();
        else nextDeal();
    }, [phase, dealFirstHand, nextDeal, isProcessingEvents]);

    if (phase === 'init') {
        // const canStartRun = isCityUnlocked(selectedCityId) && isGamblerUnlocked(selectedGamblerId);

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
                            startGame('default', 'las_vegas', { skipAtlanticTutorials: true });
                        }}
                        title={'Start Run'}
                    >
                        Start Run
                    </button>
                    {debugEnabled && (
                        <a href="/balance" target="_blank" rel="noreferrer" className={styles.debugMenuButton} style={{ marginTop: 10 }}>
                            Balance Lab ↗
                        </a>
                    )}
                    {debugEnabled && (
                        <button
                            className={styles.debugMenuButton}
                            onClick={(e) => { e.stopPropagation(); setShowDebugLoad(true); }}
                            style={{ marginTop: 10, alignSelf: 'center' }}
                        >
                            Load State
                        </button>
                    )}
                </div>

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
                                    const persisted = getPersistedState();
                                    setSelectedCityId(persisted.selectedCityId);
                                    setSelectedGamblerId(persisted.selectedGamblerId);
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
                {showDebugLog && <DebugLogOverlay onClose={() => setShowDebugLog(false)} />}
                {showDebugLoad && <DebugLoadDialog onClose={() => setShowDebugLoad(false)} />}
            </div>
        );
    }

    if (phase === 'game_over') {
        return (
            <div className={styles.container} style={{ justifyContent: 'center' }}>
                <h1 style={{ fontSize: '3rem', color: '#ff4444', marginBottom: 20 }}>GAME OVER</h1>
                <p style={{ fontSize: '1.5rem', color: '#fff', marginBottom: 10 }}>
                    You cannot afford the next cash ante.
                </p>
                <p style={{ fontSize: '1.2rem', color: '#aaa', marginBottom: 40 }}>
                    Total Winnings: ${totalScore.toLocaleString()} · {dealsTaken} deals played
                </p>
                <button className={styles.button} onClick={goToTitle}>Back to Title</button>
                {showDebugLog && <DebugLogOverlay onClose={() => setShowDebugLog(false)} />}
                {showDebugLoad && <DebugLoadDialog onClose={() => setShowDebugLoad(false)} />}
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
                {showDebugLog && <DebugLogOverlay onClose={() => setShowDebugLog(false)} />}
                {showDebugLoad && <DebugLoadDialog onClose={() => setShowDebugLoad(false)} />}
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

    // Click anywhere to draw a card or advance to next deal
    const handleGlobalClick = (e: React.MouseEvent) => {
        if (showDeck || showHandScores || showRelicStore || showDebugPacks) return;
        if (isTutorialInputLocked()) return;

        // Ignore clicks on buttons or interactive elements
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;

        // Speed up animations if dealer is revealed (Dealer Turn OR Scoring Phase)
        // or during the entering_casino interstitial
        // and the round is not yet over.
        const isDealerTurnPhase = phase === 'dealer_turn' || phase === 'resolving_outcomes' || phase === 'scoring';
        const canSpeedUp = (dealer.isRevealed && isDealerTurnPhase) || (phase === 'entering_casino' && !overlayComplete);

        if (canSpeedUp && animationSpeed === 1) {
            setAnimationSpeed(4);
            // If we just sped up the interstitial, consume this click so they don't accidentally start the deal instantly
            if (phase === 'entering_casino') return;
        }

        if (canDrawNow) {
            handleDraw();
        } else if (phase === 'deal_over') {
            handleDealAdvanceAction();
        } else if (phase === 'entering_casino') {
            // Allow global click to start dealing 
            handleDealAdvanceAction();
        }
    };

    // Keep the score components inside the board and below the final total.
    const boardWidth = 800;
    const defaultOffset = boardWidth / 6;
    const scoringOffset = 150;

    // Apply the offset based on whether total winnings are displayed
    // Match PhysicsPot's visibility threshold, including the smallest 5% bonus.
    const hasMult = !!runningSummary && runningSummary.mult > 1;
    const currentPotOffset = hasMult ? (isTotalWinningsVisible ? scoringOffset : defaultOffset) : 0;
    const currentPotY = POT_TOP_Y + (isTotalWinningsVisible ? 80 : 0);

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

    return (
        <div
            className={`${styles.container} ${isShaking ? 'shake-screen red-tint' : ''}`}
            onClick={handleGlobalClick}
            style={{
                '--header-transition-duration': `${0.8 / animationSpeed}s`
            } as React.CSSProperties}
        >
            <div className={styles.topNavContainer}>

                <HandScoresButton onClick={() => {
                        playClick();
                        setShowHandScores(true);
                    }} />


                <header
                    id="hud-bar"
                    className={`${styles.header} ${isOverlayMode ? styles.headerCentered : ''} ${(isOverlayMode && deal === 1 && !hasSettledFirstOverlay) ? styles.noTransition : ''}`}
                    style={isOverlayMode ? { top: 460 } : {}}
                >
                    <div id="hud-round" className={styles.stat}>
                        <span className={styles.statLabel}>Round</span>
                        <span className={styles.statValue}>
                            {dealsTaken.toLocaleString()}
                        </span>
                    </div>
                    <div id="hud-cash" className={styles.stat}>
                        <span className={styles.statLabel}>
                            {debugEnabled && !isOverlayMode ? <button
                                className={`${styles.manageDebugBtn} ${styles.cashDebugButton}`}
                                aria-label="Debug: add one third of the cash challenge target" title="Add ⅓ of the cash goal, rounded up (debug)"
                                onClick={event => { event.stopPropagation(); triggerDebugChips(); }}
                            >Cash</button> : 'Cash'}
                        </span>
                        <span className={styles.statValue}>${cash.toLocaleString()}</span>
                    </div>
                    <div id="hud-ante" className={styles.stat}>
                        <span className={styles.statLabel}>Ante</span>
                        <span className={styles.statValue}>${ante.toLocaleString()}</span>
                    </div>
                </header>

                <div className={styles.rightButtons}>
                    <DeckButton 
                        onClick={() => {
                            playClick();
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

            {showPotLabels && (
                <PhysicsPot
                    key={`chips-${deal}`}
                    totalValue={runningSummary?.chips ?? 0}
                    variant="chips"
                    isCollecting={isCollectingChips}
                    center={{ x: centerX - currentPotOffset, y: currentPotY }}
                    isFinalScore={!!isTotalWinningsVisible}
                    labelId="total-winnings"
                    onCollectionComplete={() => { }}
                    onItemArrived={() => { }}
                    labelPrefix="$"
                    forceHide={isTotalWinningsVisible && !hasMult}
                />
            )}

            {/* RelicInventory moved to sidebar */}

            {showPotLabels && (
                <PhysicsPot
                    key={`mult-${deal}`}
                    totalValue={runningSummary?.mult ?? 0}
                    variant="multiplier"
                    isCollecting={isCollectingChips}
                    center={{ x: centerX + currentPotOffset, y: currentPotY }}
                    isFinalScore={!!isTotalWinningsVisible}
                    onCollectionComplete={() => { }}
                    onItemArrived={() => { }}
                    labelPrefix="x"
                />
            )}

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

            <div className={styles.gameWrapper} ref={gameWrapperRef}>
                <div className={styles.sidebarsContainer}>
                    <div className={styles.leftSidebar}>
                        <div className={styles.sidebarHeading}>
                            {debugEnabled ? <button type="button"
                                className={`${styles.zoneLabel} ${styles.manageDebugBtn} ${styles.headingDebugButton}`}
                                aria-label={`Manage relics, ${inventory.length} of ${relicSlots}`}
                                onClick={event => { event.stopPropagation(); setShowRelicStore(true); }}
                            >Relics {inventory.length} of {relicSlots}</button> :
                                <span className={styles.zoneLabel}>Relics {inventory.length} of {relicSlots}</span>}
                        </div>
                        <RelicInventory inventoryKind="left" />
                    </div>
                    <div className={styles.sidebar}>
                        <div className={`${styles.sidebarHeading} ${styles.sidebarHeadingRight}`}>
                            {debugEnabled ? <button type="button"
                                className={`${styles.zoneLabel} ${styles.manageDebugBtn} ${styles.headingDebugButton}`}
                                id="challenges-label" aria-label="Debug packs"
                                disabled={isProcessingEvents || !!pendingPack || !!debugPackReturn ||
                                    !['entering_casino', 'deal_over', 'playing', 'pack_choice'].includes(phase)}
                                onClick={event => { event.stopPropagation(); setShowDebugPacks(true); }}
                            >Challenges</button> : <span id="challenges-label" className={styles.zoneLabel}>Challenges</span>}
                        </div>
                        <ChallengeBoard />
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
                        <div id="dealer-hand-zone" className={`${styles.dealerZone} ${!areHandsVisible || !dealerVisible ? styles.dealerZoneHidden : ''}`}>
                            <div className={styles.dealerHeading}>
                                {debugEnabled && (
                                    <button 
                                        className={styles.subtleDebugBtn} 
                                        style={{ width: 'auto', padding: '2px 8px', fontSize: '0.6rem' }}
                                        onClick={() => setShowDebugLog(true)}
                                    >
                                        Log
                                    </button>
                                )}
                                <div className={styles.zoneLabel} style={{ marginBottom: 0 }}>Dealer</div>
                                {debugEnabled && (
                                    <button 
                                        className={styles.subtleDebugBtn} 
                                        style={{ width: 'auto', padding: '2px 8px', fontSize: '0.6rem' }}
                                        onClick={() => setShowDebugLoad(true)}
                                    >
                                        Load
                                    </button>
                                )}
                            </div>
                            <div className={styles.dealerHandWrapper} style={{ pointerEvents: areHandsVisible && dealerVisible && dealerSelectableCardIds && dealerSelectableCardIds.length > 0 ? 'auto' : 'none', position: 'relative' }}>
                                <Hand
                                    key={`dealer-${dealerHandProps.id}-${deal}-${dealsTaken}`}
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
                                    <div className={styles.drawSpotAnchor} id="draw-spot-anchor" />
                                    {/* Render dynamic draw spots */}
                                    {Array.from({ length: Math.max(drawnCards.length, visualDrawCount) }).map((_, idx) => {
                                        // Calculate Offset
                                        const count = Math.max(drawnCards.length, visualDrawCount);
                                        const spacing = 120;
                                        const offset = (idx - (count - 1) / 2) * spacing;

                                        const card = drawnCards[idx];
                                        const isHiddenForHoldPickup = !!card && hiddenDrawCardIds.includes(card.id);
                                        const isSelected = idx === selectedDrawIndex;
                                        const showDrawText = !card && canDrawNow;
                                        const isMultiple = drawnCards.length > 1;
                                        const isPrimaryDrawSpot = showDrawText && idx === Math.floor(count / 2);

                                        return (
                                            <div
                                                key={`draw-spot-${idx}`}
                                                id={
                                                    isSelected && card
                                                        ? 'selected-drawn-card'
                                                        : isPrimaryDrawSpot
                                                            ? 'draw-spot'
                                                            : `draw-card-spot-${idx}`
                                                }
                                                className={`
                                                ${styles.drawnCardSpot} 
                                                ${showDrawText ? styles.drawSpot : ''} 
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
                                                    if (holdPickupAnimation) return;
                                                    if (interactionMode === 'select_draw' && activeTableActionId) {
                                                        if (card) {
                                                            if (activeTableActionId === 'hold') {
                                                                handleHoldDrawSelection(idx, card);
                                                            } else {
                                                                selectTableActionDrawCard(idx);
                                                            }
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
                                                {card && !isHiddenForHoldPickup ? (
                                                    <PlayingCard
                                                        card={card}
                                                        isDrawn
                                                        origin={card.origin}
                                                        onEnterAnimationEnd={handleDrawAnimationEnd}
                                                        onDealSound={handleCardDealSound}
                                                        onFlipSound={handleCardFlipSound}
                                                    />
                                                ) : (
                                                    showDrawText && <span className={styles.hitText} style={{ opacity: 1, position: 'relative', transform: 'none', left: 'auto', top: 'auto' }}>DRAW</span>
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
                                                tableActionId={slot.relicId}
                                                heldCardAnchorId={slot.relicId === 'hold' ? 'hold-card-anchor' : undefined}
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
                                            return canPlayHand(hand);
                                        }
                                        return false;
                                    })();
                                    const canSelectHand = (isAssignMode && canPlayHand(hand)) || canSelectForAction;
                                    const selectableCardIds = (interactionMode === 'select_card' && activeTableActionId && (activeTableActionId === 'discard' || activeTableActionId === 'switch') && !hand.isBust && hand.blackjackValue !== 21)
                                        ? hand.cards.map(card => card.id)
                                        : undefined;
                                    return (
                                        <Hand
                                            key={`${hand.id}-${deal}`}
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
                                            entryAnimationOverrides={entryAnimationOverrides}
                                        />
                                    );
                                })}


                            </div>




                        </div>

                        <div className={styles.actionButtonContainer}>
                            {((phase === 'playing' && !isInitialDeal) || phase === 'scoring' || phase === 'dealer_turn' || phase === 'resolving_outcomes') ? (
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

                                        const standTutorialPending = isStandTutorialPending();
                                        if (standTutorialPending && !areAllHandsUnplayable) {
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
                            ) : (phase === 'deal_over' || phase === 'entering_casino' || (phase === 'playing' && isInitialDeal)) ? (
                                <div className={styles.dealActions}>
                                    <button
                                        id="deal-button"
                                        className={styles.nextDealButton}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDealAdvanceAction();
                                        }}
                                        disabled={isInitialDeal || isProcessingEvents}
                                    >
                                        {(phase === 'deal_over' || phase === 'entering_casino') && challengeRewards.length
                                            ? `Open ${challengeRewards.length === 1 ? 'Pack' : `Packs (${challengeRewards.length})`}`
                                            : `Deal $${ante}`}
                                    </button>
                                </div>
                            ) : (
                                <div className={styles.actionPlaceholder} />
                            )}
                        </div>

                    </div>
                </div>


            </div>

            {showDeck && (
                isSelectingDebugCard ? (
                    <ChooseCardView
                        onClose={() => {
                            playClickDown();
                            setShowDeck(false);
                            setIsSelectingDebugCard(false);
                        }}
                        onSelectCard={(cardId) => {
                            drawSpecificCard(cardId);
                            setShowDeck(false);
                            setIsSelectingDebugCard(false);
                        }}
                    />
                ) : (
                    <DeckView
                        probabilities={deckProbabilities}
                        activeCards={activeCards}
                        onClose={() => {
                            playClickDown();
                            setShowDeck(false);
                        }}
                    />
                )
            )}

            {phase === 'pack_choice' && <PackReward key={debugPackReturn ? 'debug-pack' : challengeRewards[0]?.id ?? 'opening-pack'} />}
            {showHandScores && <HandScores upgrades={handUpgrades} onClose={() => { playClickDown(); setShowHandScores(false); }} />}

            {showDebugPacks && <DebugPacks onClose={() => setShowDebugPacks(false)} />}

            {showRelicStore && (
                <RelicStore
                    onClose={() => setShowRelicStore(false)}
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

            {holdPickupAnimation && (
                <div className={styles.holdPickupOverlay}>
                    <div
                        className={styles.holdPickupCard}
                        onAnimationEnd={(e) => {
                            if (e.currentTarget !== e.target) return;
                            setHoldPickupAnimation(current => {
                                if (!current) return current;
                                if (holdPickupTimeoutRef.current !== null) {
                                    window.clearTimeout(holdPickupTimeoutRef.current);
                                    holdPickupTimeoutRef.current = null;
                                }
                                setHiddenDrawCardIds(prev => prev.filter(id => id !== current.card.id));
                                selectTableActionDrawCard(current.drawIndex);
                                return null;
                            });
                        }}
                        style={{
                            left: holdPickupAnimation.left,
                            top: holdPickupAnimation.top,
                            width: holdPickupAnimation.width,
                            height: holdPickupAnimation.height,
                            // @ts-ignore
                            '--hold-dx': `${holdPickupAnimation.dx}px`,
                            // @ts-ignore
                            '--hold-dy': `${holdPickupAnimation.dy}px`,
                            // @ts-ignore
                            '--hold-from-scale': `${holdPickupAnimation.fromScale}`,
                            // @ts-ignore
                            '--hold-to-scale': `${holdPickupAnimation.toScale}`,
                            animationDuration: `${HOLD_PICKUP_DURATION_MS}ms`
                        } as React.CSSProperties}
                    >
                        <PlayingCard
                            card={holdPickupAnimation.card}
                            origin="none"
                            suppressEnterAnimation
                            style={{ width: '100%', height: '100%' }}
                        />
                    </div>
                </div>
            )}

            {anteIncrease && <AnteIncreasePopup
                key={`${anteIncrease.previousAnte}-${anteIncrease.ante}`}
                previousAnte={anteIncrease.previousAnte}
                ante={anteIncrease.ante}
                onContinue={continueAnteIncrease}
            />}

            <TutorialOverlay />
            
            <div id="tooltip-portal-root" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3000 }} />
            {showDebugLog && <DebugLogOverlay onClose={() => setShowDebugLog(false)} />}
            {showDebugLoad && <DebugLoadDialog onClose={() => setShowDebugLoad(false)} />}
        </div>
    );
}
