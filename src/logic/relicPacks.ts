import type { PackQuality } from './packs';
import type { SeededRNG } from '../engine/rng';
import { RelicManager } from './relics/manager';
import { pickRandomRelic } from './relics/selection';
import type { RelicInstance } from './relics/types';

export function generateRelicPackChoices(
    rng: SeededRNG,
    count: number,
    inventory: readonly RelicInstance[],
    excludedRelicIds: readonly string[] = [],
    quality: PackQuality = 'average'
): string[] {
    const excludedIds = new Set([...inventory.map(owned => owned.id), ...excludedRelicIds]);
    const available = RelicManager.getAllRelics().filter(relic => !excludedIds.has(relic.id));
    const choices: string[] = [];
    while (choices.length < count && available.length) {
        const relic = pickRandomRelic(available, () => rng.next(), quality);
        if (!relic) break;
        available.splice(available.indexOf(relic), 1);
        choices.push(relic.id);
    }
    return choices;
}
