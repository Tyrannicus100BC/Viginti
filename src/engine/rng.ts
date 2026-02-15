/**
 * Seeded pseudo-random number generator using the Mulberry32 algorithm.
 * Deterministic: same seed → same sequence of numbers.
 * Used throughout the game engine to replace Math.random() for reproducibility.
 */
export class SeededRNG {
    private state: number;

    constructor(seed: number) {
        // Ensure seed is a 32-bit integer
        this.state = seed | 0;
    }

    /** Returns a float in [0, 1) */
    next(): number {
        // Mulberry32
        let t = (this.state += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** Returns an integer in [0, n) */
    roll(n: number): number {
        return Math.floor(this.next() * n);
    }

    /** Returns a random element from the array */
    pick<T>(array: readonly T[]): T {
        return array[this.roll(array.length)];
    }

    /** Fisher-Yates shuffle (returns a new array) */
    shuffle<T>(array: readonly T[]): T[] {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = this.roll(i + 1);
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    /** Returns the current internal state (can be used to save/restore) */
    getState(): number {
        return this.state;
    }

    /** Creates a copy of this RNG at its current state */
    clone(): SeededRNG {
        const rng = new SeededRNG(0);
        rng.state = this.state;
        return rng;
    }

    /** Create an RNG with a random seed (for starting new games without a specified seed) */
    static random(): SeededRNG {
        return new SeededRNG(Math.floor(Math.random() * 2147483647));
    }
}
