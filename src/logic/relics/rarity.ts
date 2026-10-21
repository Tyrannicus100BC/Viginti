import type { RelicRarity } from './types';

export const RELIC_RARITY_STYLES: Record<RelicRarity, { frame: string; text: string }> = {
    Common: {
        frame: '#c0c0c0',
        text: '#ffffff'
    },
    Uncommon: {
        frame: 'rgba(255, 215, 0, 0.6)',
        text: '#ffd700'
    },
    Rare: {
        frame: 'rgba(145, 72, 181, 0.8)',
        text: '#9148b5'
    }
};

export const getRelicRarityFrameColor = (rarity: RelicRarity) => RELIC_RARITY_STYLES[rarity].frame;
export const getRelicRarityTextColor = (rarity: RelicRarity) => RELIC_RARITY_STYLES[rarity].text;
