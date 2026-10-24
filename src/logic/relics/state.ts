import { RelicManager } from './manager';
import type { RelicInstance } from './types';

/** Apply current balance values to an imported relic while retaining its progress. */
export function normalizeRelicInstance(instance: RelicInstance): RelicInstance {
    const config = RelicManager.getRelicConfig(instance.id);
    const properties = config?.properties ?? {};
    const state = { ...properties, ...instance.state };
    for (const key of ['bonus_mult', 'extra_draw', 'extra_draws', 'decay_amount']) {
        if (key in properties && !(key === 'bonus_mult' && config?.categories.includes('Growth'))) state[key] = properties[key];
    }
    if (instance.id === 'faded_tag' || instance.id === 'faded_bill') {
        state.amount = Math.max(0, Math.min(properties.amount, state.amount));
    }
    if (instance.id === 'second_chance') {
        delete state.extra_place;
        delete state.active_bonus;
    }
    if (instance.id === 'safety_net') delete state.bonus_chips;
    return { ...instance, state };
}
