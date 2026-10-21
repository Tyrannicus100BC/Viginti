# Balance Lab

Open `/balance` on the URL reported by `./.enmanner/scripts/runtime-status --json`.
The title screen also links to the lab when Debug Mode is enabled. The lab uses
the existing frontend and runs finite experiments in a dedicated Web Worker.
It does not mount the game, play animations, select packs, or change tuning.

## Experiments

- **Raises:** Play one baseline round per trial. Rescore its exact scoring state
  with each category's current small chip or multiplier upgrade. Includes Win/21
  and Lose/Bust inheritance. Every settlement uses `processAction(score_round)`.
- **Relics:** Add one passive relic in a free slot and replay 1–20 rounds per
  trial. Effects carry between rounds, including decay and expiry. Exclude
  relics already in the baseline. Active abilities are not evaluated.
- **Deck:** Apply one of the eleven Common “more” probability changes through
  `applyPackCard`, then replay the same trial structure. Both player and dealer
  draw from the modified distribution, matching production behavior.

Build presets are explicitly synthetic fixtures, not snapshots claimed to be
typical of any particular round. Optional passive relics form a shared baseline
loadout. Trials reset the fixture; rounds within a trial preserve its state.
The existing fixture amounts stay fixed (+$5 / +5 percentage points per fixture
Raise), so changing treatment tuning does not also change the comparison baseline.

## Small upgrade tuning

`src/logic/upgradeTuning.ts` is the shared source for production Raise affixes
and lab treatments. These whole-number units target roughly +$9 in the reference
run, with rounding differences and build-dependent value. Lose/Bust upgrades
are deliberately half-strength to preserve the cost of failure:

| Hand | Chips | Multiplier percentage points |
| --- | ---: | ---: |
| Win | 3 | 3 |
| Lose | 3 | 3 |
| Pair | 4 | 3 |
| Straight | 4 | 3 |
| Flush | 3 | 2 |

Simple affixes use one unit, double affixes use three, and tradeoffs use three
positive units plus one negative unit in the drawback's own category. New pack
offers use `raise_v5` IDs. Older `raise_v3` and `raise_v4` offers and earned upgrades retain
their original amounts, including the fixed laboratory fixtures. Base hand
payouts and relic tuning are separate from this table.

Earlier reports keep their recorded labels and statistics when imported.
Single-target version-three/four report settings rerun the corresponding current
unit. Pin comparisons match categories across versions and show the pinned
upgrade label when its amount differs from the current row.

The score-aware bot chooses among all visible drawn cards and playable hands,
using estimated shared-pot scoring, a bust penalty, and a stand threshold.
The alternative bot places into the lowest total. Policies receive an explicit
observation without hidden dealer cards or RNG state. These are inexpensive
heuristics, not an optimal-play solver. Full-run survival, pack selection,
active abilities, and automated synergy searches are future experiments.

## Reading results

All values are gross scoring payouts before the ante. Mean delta compares each
treatment against its paired baseline. Percentiles and histograms describe
the distribution across trials. For multi-round trials each observation is
the trial's mean round payout. 95% intervals use `1.96 × sample SD / sqrt(n)`
on those independent observations. They do not measure uncertainty in bot
quality or tell you whether an upgrade is good game design.

Separate deterministic streams align trial, round, draw number, and dealer
resolution. Extra draws and altered probabilities can produce different cards
within a round; later rounds do not shift because of an earlier extra draw.
The seed and settings reproduce results on the same engine version. Exported
examples use local card IDs so earlier jobs do not change replay records.
Action-limit failures stop with an error rather than counting partial games.

The page supports sorting, filtering, payout histograms, first/largest/smallest
effect examples, full scoring rows, bot decision traces, and multi-round
inspection. Pin one result before rerunning to compare contexts in the table.
Exports include CSV metrics or JSON settings, statistics, and retained traces.
Use **Load report** to explore a full JSON export from either the page or CLI.
Results and pins stay in memory for the current tab; there is no report database.

## Headless execution

The browser and CLI share `runExperiment`. The CLI bundles the TypeScript
runner in memory using the esbuild dependency already shipped with Vite:

```sh
npm run --silent simulate -- --experiment raises --trials 100000 --seed 42 --summary
npm run --silent simulate -- --experiment relics --target faded_bill --horizon 10 --trials 1000 --summary
npm run --silent simulate -- --experiment deck --preset balanced --trials 1000 > report.json
```

Use `--help` for all options. Remove `--summary` to obtain the full JSON report.
No server is started. There is no separate scoring implementation in the CLI.

Run `npm test -- src/simulation/__tests__/runner.test.ts` to check reproducibility,
hidden-information isolation, real settlement, paired statistics, and relic decay.
