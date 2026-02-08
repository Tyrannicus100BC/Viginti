import { CITY_DEFINITIONS } from './cities/definitions';
import { GAMBLER_DEFINITIONS } from './gamblers/definitions';
import {
    isCityCleared,
    isCityUnlocked,
    isGamblerUnlocked,
    markCityCleared,
    unlockCity,
    unlockEverything,
    unlockGambler
} from '../store/persistence';

export type UnlockCondition =
    | { type: 'always' }
    | { type: 'beat_city'; cityId: string };

export const isUnlockConditionMet = (condition: UnlockCondition): boolean => {
    if (condition.type === 'always') return true;
    if (condition.type === 'beat_city') return isCityCleared(condition.cityId);
    return false;
};

export const getUnlockHint = (condition: UnlockCondition): string => {
    if (condition.type === 'always') return 'Unlocked';
    if (condition.type === 'beat_city') {
        const city = CITY_DEFINITIONS.find(c => c.id === condition.cityId);
        return city ? `Beat ${city.name}` : 'Beat required city';
    }
    return 'Complete requirement';
};

export const ensureUnlocksUpToDate = () => {
    CITY_DEFINITIONS.forEach(city => {
        if (isUnlockConditionMet(city.unlockCondition) && !isCityUnlocked(city.id)) {
            unlockCity(city.id);
        }
    });

    GAMBLER_DEFINITIONS.forEach(gambler => {
        if (isUnlockConditionMet(gambler.unlockCondition) && !isGamblerUnlocked(gambler.id)) {
            unlockGambler(gambler.id);
        }
    });
};

export const unlockAllContent = () => {
    unlockEverything(
        CITY_DEFINITIONS.map(city => city.id),
        GAMBLER_DEFINITIONS.map(gambler => gambler.id)
    );
    if (!isCityCleared('atlantic_city')) {
        markCityCleared('atlantic_city');
    }
};

export const recordCityCleared = (cityId: string) => {
    markCityCleared(cityId);
    ensureUnlocksUpToDate();
};
