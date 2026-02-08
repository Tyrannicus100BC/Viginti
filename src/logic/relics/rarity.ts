import type { RelicRarity } from './types';

export const RELIC_RARITY_STYLES: Record<RelicRarity, { frame: string; text: string }> = {
    Common: {
        frame: '#ffffff',
        text: '#ffffff'
    },
    Uncommon: {
        frame: 'rgba(255, 215, 0, 0.6)',
        text: '#ffd700'
    },
    Rare: {
        frame: 'rgba(155, 89, 182, 0.8)',
        text: '#9b59b6'
    }
};

export const getRelicRarityFrameColor = (rarity: RelicRarity) => RELIC_RARITY_STYLES[rarity].frame;
export const getRelicRarityTextColor = (rarity: RelicRarity) => RELIC_RARITY_STYLES[rarity].text;
