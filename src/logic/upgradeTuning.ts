import type { HandTypeId, RaiseHandTypeId } from './handScoring';

/** Fixed v5 units retained for saved cards and historical Balance Lab comparisons. */
export const SMALL_UPGRADE_UNITS: Readonly<Record<HandTypeId, { readonly cash: number; readonly multPercent: number }>> = {
    win: { cash: 3, multPercent: 3 },
    loss: { cash: 3, multPercent: 3 },
    pair: { cash: 4, multPercent: 3 },
    straight: { cash: 4, multPercent: 3 },
    flush: { cash: 3, multPercent: 2 },
};

export type RaiseRange = readonly [min: number, max: number];
export interface RaiseStatRanges { readonly cash: RaiseRange; readonly multPercent: RaiseRange }
export type RaiseBenefitHand = Exclude<RaiseHandTypeId, 'loss' | 'bust'>;
type LegacyRaiseBenefitHand = Exclude<HandTypeId, 'loss'>;

/** Inclusive whole dollars / percentage points. Strong rolls are shared by Double and Tradeoff. */
export const V6_RAISE_BONUS_RANGES: Readonly<Record<LegacyRaiseBenefitHand, {
    readonly regular: RaiseStatRanges; readonly strong: RaiseStatRanges;
}>> = {
    win: { regular: { cash: [3, 4], multPercent: [2, 3] }, strong: { cash: [7, 9], multPercent: [6, 8] } },
    pair: { regular: { cash: [4, 5], multPercent: [3, 4] }, strong: { cash: [10, 12], multPercent: [8, 10] } },
    straight: { regular: { cash: [3, 4], multPercent: [2, 3] }, strong: { cash: [8, 10], multPercent: [6, 8] } },
    flush: { regular: { cash: [2, 3], multPercent: [1, 2] }, strong: { cash: [5, 7], multPercent: [4, 6] } },
};
export const V6_RAISE_LOSS_PENALTY_RANGES: RaiseStatRanges = { cash: [3, 4], multPercent: [2, 3] };
export const RAISE_PENALTY_WEIGHTS = { loss: 25, bust: 25, other: 50 } as const;

/** v7 extends each bonus range by one at either end. Keep v6 above immutable for saved cards. */
export const V7_RAISE_BONUS_RANGES: typeof V6_RAISE_BONUS_RANGES = {
    win: { regular: { cash: [2, 5], multPercent: [1, 4] }, strong: { cash: [6, 10], multPercent: [5, 9] } },
    pair: { regular: { cash: [3, 6], multPercent: [2, 5] }, strong: { cash: [9, 13], multPercent: [7, 11] } },
    straight: { regular: { cash: [2, 5], multPercent: [1, 4] }, strong: { cash: [7, 11], multPercent: [5, 9] } },
    flush: { regular: { cash: [1, 4], multPercent: [0, 3] }, strong: { cash: [4, 8], multPercent: [3, 7] } },
};
// Scale the former core penalties by 1.5, round to whole units ($5–6 / 3–5pp),
// then add the same one-unit extremes as the bonus ranges.
export const RAISE_LOSS_PENALTY_RANGES: RaiseStatRanges = { cash: [4, 7], multPercent: [2, 6] };

/** Percentages from lowest to highest. Three-value ranges redistribute the removed zero roll. */
export const RAISE_VALUE_WEIGHTS: Readonly<Record<number, readonly number[]>> = {
    3: [42, 42, 16],
    4: [16, 34, 34, 16],
    5: [16, 20, 28, 20, 16],
};

/** v8 gives Viginti its own rolls, initially using the same ranges as Win. */
export const V8_RAISE_BONUS_RANGES: Readonly<Record<RaiseBenefitHand, {
    readonly regular: RaiseStatRanges; readonly strong: RaiseStatRanges;
}>> = { ...V7_RAISE_BONUS_RANGES, viginti: V7_RAISE_BONUS_RANGES.win };

/** v9 removes zero-strength Flush rolls; the removed 16% is split between 1 and 2. */
export const V9_RAISE_BONUS_RANGES: typeof V8_RAISE_BONUS_RANGES = {
    ...V8_RAISE_BONUS_RANGES,
    flush: { ...V8_RAISE_BONUS_RANGES.flush, regular: { cash: [1, 4], multPercent: [1, 3] } },
};

/** v10 trims Pair benefits by one dollar / percentage point at both strengths. */
export const RAISE_BONUS_RANGES: typeof V9_RAISE_BONUS_RANGES = {
    ...V9_RAISE_BONUS_RANGES,
    pair: { regular: { cash: [2, 5], multPercent: [1, 4] }, strong: { cash: [8, 12], multPercent: [6, 10] } },
};
