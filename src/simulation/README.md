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

`src/logic/upgradeTuning.ts` defines the inclusive whole-number ranges for new
production Raise cards. Values are dollars or multiplier percentage points:

| Hand | Regular cash | Strong cash | Regular mult | Strong mult |
| --- | ---: | ---: | ---: | ---: |
| Win | 2–5 | 6–10 | 1–4 | 5–9 |
| Viginti | 2–5 | 6–10 | 1–4 | 5–9 |
| Pair | 2–5 | 8–12 | 1–4 | 6–10 |
| Straight | 2–5 | 7–11 | 1–4 | 5–9 |
| Flush | 1–4 | 4–8 | 1–3 | 3–7 |

Simple affixes use the regular range (one slot). Double affixes use the strong
range (two slots). Tradeoffs use the same strong range with a regular-range
penalty to another category (one slot). Tradeoff drawbacks target Lose 25%,
Bust 25%, and other categories 50%. Lose and Bust each use $4–7 or 2–6 percentage points; Lose/Bust never appear as benefits. Rarities
supply one, two and three slots. A card has at most one penalty and cannot repeat
a hand/stat combination. New `raise_v10` IDs encode each rolled amount so save/load
preserves it. Previous versions, including v6's narrower ranges and weaker
Lose/Bust penalties, retain their original earned/pending amounts.

New Win, Viginti, Lose and Bust effects apply only to their named outcome.
Viginti is available as both a bonus and a drawback, with the same ranges as Win.
Older Win/Lose Raises still apply to Viginti/Bust as they did before the split.
Pair benefits are reduced by $1 / 1 percentage point at both strengths in v10.
Pair drawbacks retain the previous $3–6 / 2–5 percentage-point ranges.

Each added extreme has 16% probability. Four-value ranges use 16/34/34/16 percent;
five-value ranges use 16/20/28/20/16 percent. Lose/Bust core penalties are increased
by 50%, rounded to whole units, then widened by one at either end. Regular Flush multipliers exclude zero:
1/2/3 percentage points have 42/42/16 percent odds, respectively. The same
nonzero distribution applies to Flush multiplier drawbacks. Previously saved
v7/v8 cards retain their encoded amounts.

The existing single-upgrade lab treatments intentionally retain their fixed v5
reference values ($3/3pp Win and Lose, $4/3pp Pair and Straight, $3/2pp Flush).
These include historical positive Lose treatments for comparison; they are not
production card rolls. Use `/raises` to inspect nine actual new cards of any
rarity. Base hand payouts and relic tuning are separate from these ranges.

Earlier reports keep their recorded labels and statistics when imported.
Single-target version-three/four report settings rerun the corresponding current
unit. Pin comparisons match categories across versions and show the pinned
upgrade label when its amount differs from the current row.

The score-aware bot chooses among all visible drawn cards and playable hands,
using estimated shared-pot scoring, a bust penalty, and a stand threshold.
The alternative bot places into the lowest total. Policies receive an explicit
observation without hidden dealer cards or RNG state. These are inexpensive
heuristics, not an optimal-play solver. The browser's local experiments do not
test progression. Raise-focused full runs are available through the separate
headless experiments below; active abilities remain outside their scope.

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

## Raise stacking and full-run experiments

```sh
npm run --silent simulate:raises -- --trials 100 --seed 42 --max-rounds 80 --summary
npm run --silent simulate:raises -- --trials 100 --seed 42 --play score --summary
npm run --silent simulate:raises -- --trials 200 --strategies pair,straight,flush,pair-straight --sweep 0,4,8,16,32 --summary
npm run --silent simulate:raises -- --trials 200 --strategies pair,straight,flush,pair-straight --sweep 0,4,8,16 --sweep-rarity Uncommon --summary
```

Natural runs start with the actual opening pack and $100, pay every ante, collect
earned packs, and continue through bosses until bankruptcy or the round horizon.
They acquire only actual offered Raise cards, including their current rolled
amounts and drawbacks. All relics, deck upgrades, challenge packs and boss actions
are skipped to isolate Raise progression. Trials do not insert cash or upgrades.
Horizon completion is censored survival, not a victory. Invalid actions and
action limits fail the job instead of being counted as bankruptcies.

The six reward strategies are random among Raises, Pair, Straight, Flush,
Pair+Straight, and adaptive reinforcement of the leading pattern bonuses. The
selector projects marginal shared-pot value, including chip/mult synergy and
every drawback. It updates estimated trigger counts from scored rounds, with a
minimum prior frequency, and increases projected frequency for its focus. This
is a heuristic, not a future-run solver. Harmful offers may be skipped.

Pattern-aware play integrates all 52 ordinary card probabilities and the dealer's
possible hidden card/hits. Placement considers immediate payout and 70% of the
positive expected gain from one optional further draw. Draw/stand uses a one-draw
expectation with best placement. There is no hard 17 threshold or flat bust
penalty: it can chase upgraded patterns even when they bust. It responds to the
actual earned payout table; it does not artificially reward a focus label while
playing. This policy is deliberately restricted to ordinary cards and no relics.
`--play score` retains the old heuristic as a control with identical reward
strategies. Neither policy sees hidden ranks or the production RNG. Policy
randomness has a separate stream; natural runs preserve the production RNG across
all draws and rewards. Identical initial seeds do not imply identical later cards
or offers once play diverges.

Reports show survival, per-ante payouts/ante and bankroll/ante distributions,
sample counts, acquired Raises, pattern triggers, patterns paid on busts, and
draws after every live hand reaches 17. Per-ante metrics are conditional on
survival and rounds are correlated; their intervals are not independent-run
confidence intervals. Full JSON retains shortest/median/longest run examples,
reward offers, decisions and final builds. A same-final-hands/no-Raises rescore
isolates direct scoring lift, not the total causal value of acquiring Raises.
CLI exports record the git revision, dirty status and exact executed bundle hash.
These reports are separate from the browser's local-comparison report format.

The **synthetic sweep** instead gives independent rounds equal total budgets of
0/4/8/16/32 current Common simple Raises. It splits each budget between cash and
mult; Pair+Straight splits the same budget across both patterns. Values use the
midpoint of each production range, rounded down, and cards are obtained from the
production generator. `--sweep-rarity Uncommon` instead uses no-drawback Double
affixes with strong amounts at the same card budgets. These builds have no drawbacks and may be very unlikely to
acquire naturally. Unlimited cash is used only here. This measures the scoring
growth and play adaptation of an accumulated build, not survival or acquisition
probability. Compare both play policies at the same budgets and seed.

Run `npm test -- src/simulation/__tests__/raiseRuns.test.ts` for deterministic
progression, real cash/reward accounting, production scoring agreement,
specialized placement, drawing past 17, drawback evaluation and hidden-card
isolation.
