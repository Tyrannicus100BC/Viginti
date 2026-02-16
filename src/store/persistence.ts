export type PersistedState = {
    version: 1;
    debugEnabled: boolean;
    selectedCityId: string;
    selectedGamblerId: string;
    unlockedCityIds: string[];
    unlockedGamblerIds: string[];
    clearedCityIds: string[];
    globalTutorialCompletedIds: string[];
    skipAtlanticTutorials: boolean;
    musicVolume: number;
    sfxVolume: number;
    musicMuted: boolean;
    sfxMuted: boolean;
};

const STORAGE_KEY = 'viginti_persisted_state_v1';

const DEFAULT_STATE: PersistedState = {
    version: 1,
    debugEnabled: false,
    selectedCityId: 'atlantic_city',
    selectedGamblerId: 'newbie',
    unlockedCityIds: ['atlantic_city'],
    unlockedGamblerIds: ['newbie'],
    clearedCityIds: [],
    globalTutorialCompletedIds: [],
    skipAtlanticTutorials: false,
    musicVolume: 0.6,
    sfxVolume: 0.8,
    musicMuted: false,
    sfxMuted: false
};

let cachedState: PersistedState | null = null;

const unique = (values: string[]) => Array.from(new Set(values));

const normalizeState = (state: Partial<PersistedState>): PersistedState => {
    const merged: PersistedState = {
        version: 1,
        debugEnabled: state.debugEnabled ?? DEFAULT_STATE.debugEnabled,
        selectedCityId: state.selectedCityId || DEFAULT_STATE.selectedCityId,
        selectedGamblerId: state.selectedGamblerId || DEFAULT_STATE.selectedGamblerId,
        unlockedCityIds: state.unlockedCityIds ?? DEFAULT_STATE.unlockedCityIds,
        unlockedGamblerIds: state.unlockedGamblerIds ?? DEFAULT_STATE.unlockedGamblerIds,
        clearedCityIds: state.clearedCityIds ?? DEFAULT_STATE.clearedCityIds,
        globalTutorialCompletedIds: state.globalTutorialCompletedIds ?? DEFAULT_STATE.globalTutorialCompletedIds,
        skipAtlanticTutorials: state.skipAtlanticTutorials ?? DEFAULT_STATE.skipAtlanticTutorials,
        musicVolume: typeof state.musicVolume === 'number' ? state.musicVolume : DEFAULT_STATE.musicVolume,
        sfxVolume: typeof state.sfxVolume === 'number' ? state.sfxVolume : DEFAULT_STATE.sfxVolume,
        musicMuted: state.musicMuted ?? DEFAULT_STATE.musicMuted,
        sfxMuted: state.sfxMuted ?? DEFAULT_STATE.sfxMuted
    };

    merged.unlockedCityIds = unique([...DEFAULT_STATE.unlockedCityIds, ...(merged.unlockedCityIds || [])]);
    merged.unlockedGamblerIds = unique([...DEFAULT_STATE.unlockedGamblerIds, ...(merged.unlockedGamblerIds || [])]);
    merged.clearedCityIds = unique(merged.clearedCityIds || []);
    merged.globalTutorialCompletedIds = unique(merged.globalTutorialCompletedIds || []);

    if (!merged.selectedCityId) {
        merged.selectedCityId = DEFAULT_STATE.selectedCityId;
    }

    if (!merged.selectedGamblerId) {
        merged.selectedGamblerId = DEFAULT_STATE.selectedGamblerId;
    }

    return merged;
};

const isLocalStorageAvailable = typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function';

const migrateLegacyState = (): Partial<PersistedState> | null => {
    if (!isLocalStorageAvailable) return null;

    try {
        const hasLegacy =
            localStorage.getItem('viginti_debug') !== null ||
            localStorage.getItem('viginti_gambler') !== null ||
            localStorage.getItem('viginti_city') !== null ||
            localStorage.getItem('viginti_tutorials_completed') !== null;

        if (!hasLegacy) return null;

        return {
            debugEnabled: localStorage.getItem('viginti_debug') === 'true',
            selectedGamblerId: localStorage.getItem('viginti_gambler') || DEFAULT_STATE.selectedGamblerId,
            selectedCityId: localStorage.getItem('viginti_city') || DEFAULT_STATE.selectedCityId
        };
    } catch (error) {
        console.error('Failed to migrate legacy state', error);
        return null;
    }
};

const loadState = (): PersistedState => {
    if (cachedState) return cachedState;

    if (!isLocalStorageAvailable) {
        cachedState = { ...DEFAULT_STATE };
        return cachedState;
    }

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            cachedState = normalizeState(JSON.parse(raw));
            return cachedState;
        }

        const legacyState = migrateLegacyState();
        cachedState = normalizeState(legacyState || {});
        persistState(cachedState);
        return cachedState;
    } catch (error) {
        console.error('Failed to load persisted state', error);
        cachedState = { ...DEFAULT_STATE };
        return cachedState;
    }
};

const persistState = (state: PersistedState) => {
    if (!isLocalStorageAvailable) return;

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.error('Failed to save persisted state', error);
    }
};

const updateState = (updater: (prev: PersistedState) => PersistedState) => {
    const next = normalizeState(updater(loadState()));
    cachedState = next;
    persistState(next);
};

export const getPersistedState = (): PersistedState => {
    return loadState();
};

export const resetPersistedState = (options?: { preserveDebug?: boolean }) => {
    const preserveDebug = options?.preserveDebug ?? false;
    const debugEnabled = preserveDebug ? loadState().debugEnabled : DEFAULT_STATE.debugEnabled;
    cachedState = { ...DEFAULT_STATE, debugEnabled };
    persistState(cachedState);
};

export const getDebugSettingsEnabled = () => loadState().debugEnabled;
export const setDebugSettingsEnabled = (enabled: boolean) => {
    updateState(state => ({ ...state, debugEnabled: enabled }));
};

export const getSelectedCityId = () => loadState().selectedCityId;
export const setSelectedCityId = (id: string) => {
    updateState(state => ({ ...state, selectedCityId: id }));
};

export const getSelectedGamblerId = () => loadState().selectedGamblerId;
export const setSelectedGamblerId = (id: string) => {
    updateState(state => ({ ...state, selectedGamblerId: id }));
};

const clampVolume = (value: number) => Math.min(1, Math.max(0, value));

export const getMusicVolume = () => loadState().musicVolume;
export const setMusicVolume = (value: number) => {
    updateState(state => ({ ...state, musicVolume: clampVolume(value) }));
};

export const getSfxVolume = () => loadState().sfxVolume;
export const setSfxVolume = (value: number) => {
    updateState(state => ({ ...state, sfxVolume: clampVolume(value) }));
};

export const getMusicMuted = () => loadState().musicMuted;
export const setMusicMuted = (value: boolean) => {
    updateState(state => ({ ...state, musicMuted: value }));
};

export const getSfxMuted = () => loadState().sfxMuted;
export const setSfxMuted = (value: boolean) => {
    updateState(state => ({ ...state, sfxMuted: value }));
};

export const getUnlockedCityIds = () => loadState().unlockedCityIds;
export const isCityUnlocked = (id: string) => loadState().unlockedCityIds.includes(id);
export const unlockCity = (id: string) => {
    updateState(state => ({ ...state, unlockedCityIds: unique([...state.unlockedCityIds, id]) }));
};

export const isCasinoUnlocked = (id: string) => isCityUnlocked(id);
export const unlockCasino = (id: string) => unlockCity(id);

export const getUnlockedGamblerIds = () => loadState().unlockedGamblerIds;
export const isGamblerUnlocked = (id: string) => loadState().unlockedGamblerIds.includes(id);
export const unlockGambler = (id: string) => {
    updateState(state => ({ ...state, unlockedGamblerIds: unique([...state.unlockedGamblerIds, id]) }));
};

export const getClearedCityIds = () => loadState().clearedCityIds;
export const isCityCleared = (id: string) => loadState().clearedCityIds.includes(id);
export const markCityCleared = (id: string) => {
    updateState(state => ({ ...state, clearedCityIds: unique([...state.clearedCityIds, id]) }));
};

export const getGlobalTutorialsCompleted = () => loadState().globalTutorialCompletedIds;
export const setGlobalTutorialsCompleted = (stepIds: string[]) => {
    updateState(state => ({ ...state, globalTutorialCompletedIds: unique(stepIds) }));
};
export const resetGlobalTutorialsCompleted = () => {
    updateState(state => ({ ...state, globalTutorialCompletedIds: [] }));
};

export const getSkipAtlanticTutorials = () => loadState().skipAtlanticTutorials;
export const setSkipAtlanticTutorials = (value: boolean) => {
    updateState(state => ({ ...state, skipAtlanticTutorials: value }));
};

export const unlockEverything = (cityIds: string[], gamblerIds: string[]) => {
    updateState(state => ({
        ...state,
        unlockedCityIds: unique([...state.unlockedCityIds, ...cityIds]),
        unlockedGamblerIds: unique([...state.unlockedGamblerIds, ...gamblerIds])
    }));
};
