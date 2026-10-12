import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeededRNG } from '../rng';
import { RelicManager } from '../../logic/relics/manager';
import { pickRandomRelic } from '../../logic/relics/selection';
import { generateRelicPackChoices } from '../../logic/relicPacks';
import { generateShopItems } from '../../logic/rewards/generator';
import { createInitialState, processAction } from '../engine';
import { getPackDefinition } from '../../logic/packs';

afterEach(() => vi.restoreAllMocks());

const allRelics = RelicManager.getAllRelics();
const generators = {
    pack: (rng: SeededRNG, count: number, owned: string[] = [], excluded: string[] = []) =>
        generateRelicPackChoices(rng, count, owned.map(id => ({ id, state: {} })), excluded),
    shop: (rng: SeededRNG, count: number, owned: string[] = [], excluded: string[] = []) =>
        generateShopItems([{ type: 'Relic', count }], owned.map(id => ({ id, state: {} })), undefined, rng, excluded).map(item => item.id),
};

describe.each(Object.entries(generators))('%s relic rarity selection', (_, generate) => {
    it.each([
        [0, 'Common'], [0.699999, 'Common'],
        [0.7, 'Uncommon'], [0.949999, 'Uncommon'],
        [0.95, 'Rare'], [0.999999, 'Rare'],
    ] as const)('rolls %s as %s before selecting a matching relic', (roll, rarity) => {
        const rng = new SeededRNG(42);
        const next = vi.spyOn(rng, 'next').mockReturnValueOnce(roll).mockReturnValueOnce(0.999999);
        const matching = allRelics.filter(relic => relic.rarity === rarity);
        expect(generate(rng, 1)).toEqual([matching[matching.length - 1].id]);
        expect(next).toHaveBeenCalledTimes(2);
    });

    it('excludes owned and unavailable relics and exhausts remaining stock without duplicates', () => {
        const rng = new SeededRNG(42);
        vi.spyOn(rng, 'next').mockReturnValue(0);
        const owned = allRelics[0].id;
        const excluded = allRelics[1].id;
        const offers = generate(rng, allRelics.length + 5, [owned], [excluded]);
        expect(offers).toHaveLength(allRelics.length - 2);
        expect(new Set(offers).size).toBe(offers.length);
        expect(offers).not.toContain(owned);
        expect(offers).not.toContain(excluded);
    });

    it('preserves seeded reproducibility', () => {
        expect(generate(new SeededRNG(42), 5)).toEqual(generate(new SeededRNG(42), 5));
    });
});

describe('relic pack shop exclusions', () => {
    it.each(['relic_basic', 'relic_jumbo', 'relic_mega'] as const)('%s excludes relics currently for sale when purchased', packId => {
        const pack = getPackDefinition(packId);
        const inventory = [{ id: allRelics[0].id, state: {} }];
        // Stock relics that this seed would otherwise put in the pack.
        const shelfIds = generateRelicPackChoices(new SeededRNG(42), 2, inventory);
        const state = {
            ...createInitialState(), phase: 'gift_shop' as const, cash: 1000, rngState: 42, inventory,
            shopItems: [
                ...shelfIds.map(id => ({ id, type: 'Relic' as const, cost: 40 })),
                { id: 'pack', type: 'RelicPack' as const, packId, cost: pack.cost },
            ],
        };
        const opened = processAction(state, { type: 'buy_shop_item', itemId: 'pack' }).nextState;
        expect(opened.pendingPackChoices).toHaveLength(pack.offerCount);
        expect(new Set(opened.pendingPackChoices).size).toBe(pack.offerCount);
        for (const id of [...shelfIds, inventory[0].id]) expect(opened.pendingPackChoices).not.toContain(id);
        expect(opened.cash).toBe(1000 - pack.cost);
        expect(opened.pendingPack?.picksRemaining).toBe(pack.pickCount);
        expect(processAction(state, { type: 'buy_shop_item', itemId: 'pack' }).nextState).toEqual(opened);
    });

    it('keeps sold shelf relics eligible when no longer owned', () => {
        const [forSale, sold, ...owned] = allRelics;
        const state = {
            ...createInitialState(), phase: 'gift_shop' as const, cash: 1000,
            inventory: owned.map(relic => ({ id: relic.id, state: {} })),
            shopItems: [
                { id: forSale.id, type: 'Relic' as const, cost: 40 },
                { id: sold.id, type: 'Relic' as const, cost: 40, purchased: true },
                { id: 'pack', type: 'RelicPack' as const, packId: 'relic_basic' as const, cost: 40 },
            ],
        };
        expect(processAction(state, { type: 'buy_shop_item', itemId: 'pack' }).nextState.pendingPackChoices).toEqual([sold.id]);
    });
});

describe('rarity pool weights', () => {
    it('allocates 70/25/5 rolls even with uneven numbers of relics per rarity', () => {
        const candidates = [
            ...allRelics.filter(relic => relic.rarity === 'Common').slice(0, 2),
            allRelics.find(relic => relic.rarity === 'Uncommon')!,
            allRelics.find(relic => relic.rarity === 'Rare')!,
        ];
        const counts = { Common: 0, Uncommon: 0, Rare: 0 };
        for (let ticket = 0; ticket < 100; ticket++) {
            const random = vi.fn().mockReturnValueOnce((ticket + 0.5) / 100).mockReturnValueOnce(0);
            counts[pickRandomRelic(candidates, random)!.rarity]++;
        }
        expect(counts).toEqual({ Common: 70, Uncommon: 25, Rare: 5 });
    });

    it('redistributes an empty common pool proportionally across uncommon and rare', () => {
        const candidates = allRelics.filter(relic => relic.rarity !== 'Common');
        for (const [roll, rarity] of [[0, 'Uncommon'], [5 / 6 - 0.000001, 'Uncommon'], [5 / 6, 'Rare'], [0.999999, 'Rare']] as const) {
            const random = vi.fn().mockReturnValueOnce(roll).mockReturnValueOnce(0);
            expect(pickRandomRelic(candidates, random)?.rarity).toBe(rarity);
        }
    });

    it('returns no relic without consuming randomness when all pools are empty', () => {
        const random = vi.fn();
        expect(pickRandomRelic([], random)).toBeUndefined();
        expect(random).not.toHaveBeenCalled();
    });
});
