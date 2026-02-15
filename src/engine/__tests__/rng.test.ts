import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../rng';

describe('SeededRNG', () => {
    it('produces deterministic sequences from the same seed', () => {
        const rng1 = new SeededRNG(42);
        const rng2 = new SeededRNG(42);

        const seq1 = Array.from({ length: 10 }, () => rng1.next());
        const seq2 = Array.from({ length: 10 }, () => rng2.next());

        expect(seq1).toEqual(seq2);
    });

    it('produces different sequences from different seeds', () => {
        const rng1 = new SeededRNG(42);
        const rng2 = new SeededRNG(99);

        const seq1 = Array.from({ length: 10 }, () => rng1.next());
        const seq2 = Array.from({ length: 10 }, () => rng2.next());

        expect(seq1).not.toEqual(seq2);
    });

    it('next() returns values in [0, 1)', () => {
        const rng = new SeededRNG(12345);

        for (let i = 0; i < 1000; i++) {
            const val = rng.next();
            expect(val).toBeGreaterThanOrEqual(0);
            expect(val).toBeLessThan(1);
        }
    });

    it('roll(n) returns values in [0, n)', () => {
        const rng = new SeededRNG(54321);

        for (let i = 0; i < 100; i++) {
            const val = rng.roll(6);
            expect(val).toBeGreaterThanOrEqual(0);
            expect(val).toBeLessThan(6);
            expect(Number.isInteger(val)).toBe(true);
        }
    });

    it('shuffle produces different orderings', () => {
        const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const rng = new SeededRNG(42);
        const shuffled = rng.shuffle(arr);

        // Original unchanged
        expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        // Shuffled has same elements
        expect([...shuffled].sort((a, b) => a - b)).toEqual(arr);
        // Shuffled is (very likely) in different order
        expect(shuffled).not.toEqual(arr);
    });

    it('shuffle is deterministic', () => {
        const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const rng1 = new SeededRNG(42);
        const rng2 = new SeededRNG(42);

        expect(rng1.shuffle(arr)).toEqual(rng2.shuffle(arr));
    });

    it('clone preserves state', () => {
        const rng = new SeededRNG(42);
        rng.next();
        rng.next();
        rng.next();

        const clone = rng.clone();

        const seq1 = Array.from({ length: 5 }, () => rng.next());
        const seq2 = Array.from({ length: 5 }, () => clone.next());

        expect(seq1).toEqual(seq2);
    });

    it('pick returns elements from the array', () => {
        const rng = new SeededRNG(42);
        const arr = ['a', 'b', 'c', 'd'];

        for (let i = 0; i < 50; i++) {
            expect(arr).toContain(rng.pick(arr));
        }
    });
});
