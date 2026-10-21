import type { HandTypeId } from './handScoring';

/** One small upgrade, calibrated to roughly +$9 per round in the reference run.
 * Lose/Bust upgrades are deliberately weaker to preserve the downside of failure.
 * Store multiplier units as whole percentage points to keep all pack values integral.
 */
export const SMALL_UPGRADE_UNITS: Readonly<Record<HandTypeId, { readonly cash: number; readonly multPercent: number }>> = {
    win: { cash: 3, multPercent: 3 },
    loss: { cash: 3, multPercent: 3 },
    pair: { cash: 4, multPercent: 3 },
    straight: { cash: 4, multPercent: 3 },
    flush: { cash: 3, multPercent: 2 },
};
