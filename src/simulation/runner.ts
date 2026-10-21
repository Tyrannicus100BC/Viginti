import { getValidActions, processAction } from '../engine/engine';
import type { GameState } from '../engine/GameState';
import type { GameEvent } from '../engine/GameEvent';
import { TUTORIAL_STEPS } from '../engine/tutorial/definitions';
import { HAND_TYPES, getSmallRaiseId, type HandTypeId, type HandUpgrades } from '../logic/handScoring';
import { SMALL_UPGRADE_UNITS } from '../logic/upgradeTuning';
import { applyPackCard, getPackCard } from '../logic/packCards';
import { RELIC_REGISTRY } from '../logic/relics/manager';
import { chooseAction, observe } from './bot';
import { BUILD_PRESETS, type Distribution, type Example, type LabConfig, type LabProgress, type LabReport, type RoundView } from './model';

export const PASSIVE_RELICS = Object.values(RELIC_REGISTRY).filter(relic => !relic.tableAction);

export interface Treatment {
    id: string;
    name: string;
    description: string;
    category?: HandTypeId;
    stat?: 'cash' | 'mult';
    apply: (state: GameState) => GameState;
}

export function raiseId(category: HandTypeId, stat: 'cash' | 'mult'): string {
    return getSmallRaiseId(category, stat);
}

// Accept saved single-target reports from before the calibration. Their recorded
// results remain untouched; rerunning compares the current unit for that category.
export function currentRaiseTarget(target: string): string {
    const match = /^raise_v[34]_0_simple_(win|loss|pair|straight|flush)_(cash|mult)$/.exec(target);
    return match ? getSmallRaiseId(match[1] as HandTypeId, match[2] as 'cash' | 'mult') : target;
}

export function addRaise(upgrades: HandUpgrades, id: string, count = 1): HandUpgrades {
    return { ...upgrades, [id]: (upgrades[id] ?? 0) + count };
}

export function getTreatments(experiment: LabConfig['experiment']): Treatment[] {
    if (experiment === 'raises') return HAND_TYPES.flatMap(hand => (['cash', 'mult'] as const).map(stat => ({
        id: raiseId(hand.id, stat), name: `${hand.name} ${stat === 'cash' ? `+$${SMALL_UPGRADE_UNITS[hand.id].cash}` : `+${SMALL_UPGRADE_UNITS[hand.id].multPercent} pp`}`,
        description: `One small upgrade: ${stat === 'cash' ? `+$${SMALL_UPGRADE_UNITS[hand.id].cash} chips` : `+${SMALL_UPGRADE_UNITS[hand.id].multPercent} percentage points of multiplier`} per ${hand.name} scoring row.`,
        category: hand.id, stat,
        apply: (state: GameState) => ({ ...state, handUpgrades: addRaise(state.handUpgrades, raiseId(hand.id, stat)) }),
    })));
    if (experiment === 'relics') return PASSIVE_RELICS.map(relic => ({
        id: relic.id, name: relic.name, description: `${relic.rarity} relic · added in a free slot, with its initial state.`,
        apply: (state: GameState) => ({ ...state, inventory: [...state.inventory,
            { id: relic.id, state: structuredClone(relic.properties ?? {}) }] }),
    }));
    return ['Hearts', 'Diamonds', 'Clubs', 'Spades', 'Aces', '10–K', '6–9', '2–5', 'Cash Bonus', 'Mult Bonus', 'Value Reduction']
        .map((name, index) => {
            const card = getPackCard(`deck_v3_0_${index * 4}`)!;
            return { id: card.id, name: `More ${name}`, description: 'One Common deck upgrade, using the production probability adjustment.',
                apply: (state: GameState) => ({ ...state, deckProbabilities: applyPackCard(state.deckProbabilities, card) }) };
        });
}

// Independent streams per trial / round / draw / dealer phase. Branches share
// exogenous starting randomness, without one extra draw shifting later rounds.
export function streamSeed(seed: number, trial: number, round: number, stream = 0): number {
    let value = (seed | 0) ^ Math.imul(trial + 1, 0x9e3779b9) ^ Math.imul(round + 1, 0x85ebca6b) ^ Math.imul(stream + 1, 0xc2b2ae35);
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
    return (value ^ (value >>> 15)) >>> 0;
}

export function validateConfig(config: LabConfig): void {
    if (!['raises', 'relics', 'deck'].includes(config.experiment)) throw new Error('Unknown experiment.');
    if (!Number.isInteger(config.trials) || config.trials < 10 || config.trials > 100000) throw new Error('Choose between 10 and 100,000 trials.');
    if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff) throw new Error('Seed must be an integer from 0 to 4,294,967,295.');
    if (!Number.isInteger(config.horizon) || config.horizon < 1 || config.horizon > 20) throw new Error('Choose a horizon between 1 and 20 rounds.');
    if (!BUILD_PRESETS.some(preset => preset.id === config.preset)) throw new Error('Unknown build preset.');
    if (!['simple', 'score'].includes(config.bot)) throw new Error('Unknown bot.');
    if (config.relicIds.length > (config.experiment === 'relics' ? 5 : 6)) throw new Error('Leave one free relic slot for relic comparisons.');
    if (new Set(config.relicIds).size !== config.relicIds.length || config.relicIds.some(id => !PASSIVE_RELICS.some(relic => relic.id === id))) throw new Error('Select distinct passive relics.');
    if (config.target !== 'all' && !getTreatments(config.experiment).some(treatment => treatment.id === (config.experiment === 'raises' ? currentRaiseTarget(config.target) : config.target))) throw new Error('Unknown comparison.');
    if (config.experiment === 'relics' && config.relicIds.includes(config.target)) throw new Error('This relic is already in the starting build.');
}

export function createLabState(config: LabConfig): GameState {
    let state = processAction({ phase: 'init' } as GameState, {
        type: 'start_game', cityId: 'las_vegas', gamblerId: 'default', seed: config.seed,
        globalTutorialsCompleted: TUTORIAL_STEPS.map(step => step.id),
    }).nextState;
    state = processAction(state, { type: 'open_pack', packId: state.offeredPacks[0] }).nextState;
    state = processAction(state, { type: 'skip_pack' }).nextState;
    state = processAction(state, { type: 'finish_pack' }).nextState;
    let handUpgrades: HandUpgrades = {};
    // These synthetic fixture amounts stay fixed across tuning changes, so a
    // before/after comparison changes only the treatment, not its starting build.
    const fixtureRaiseId = (id: HandTypeId, stat: 'cash' | 'mult') => `raise_v3_0_simple_${id}_${stat}`;
    for (const hand of HAND_TYPES) {
        if (config.preset === 'chips') handUpgrades = addRaise(handUpgrades, fixtureRaiseId(hand.id, 'cash'), 3);
        if (config.preset === 'mult') handUpgrades = addRaise(handUpgrades, fixtureRaiseId(hand.id, 'mult'), 3);
        if (config.preset === 'balanced') for (const stat of ['cash', 'mult'] as const) handUpgrades = addRaise(handUpgrades, fixtureRaiseId(hand.id, stat));
    }
    if (config.preset === 'pairs') for (const stat of ['cash', 'mult'] as const) handUpgrades = addRaise(handUpgrades, fixtureRaiseId('pair', stat), 3);
    return { ...state, handUpgrades, inventory: config.relicIds.map(id => ({ id, state: structuredClone(RELIC_REGISTRY[id].properties ?? {}) })) };
}

function cardText(card: RoundView['dealer'][number]): string {
    return card.type === 'chip' ? `$${card.chips}` : card.type === 'mult' ? `${(card.mult ?? 0) * 100}%`
        : card.type === 'score' ? `−${card.chips} value` : `${card.rank}${({ hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' })[card.suit]}`;
}

export function settleRound(state: GameState) {
    const result = processAction(structuredClone(state), { type: 'score_round' });
    const scoring = result.events.find((event): event is Extract<GameEvent, { type: 'deal_scoring_complete' }> => event.type === 'deal_scoring_complete');
    if (!scoring || !Number.isFinite(scoring.finalScore)) throw new Error('Round did not produce a finite payout.');
    return { state: result.nextState, scoring };
}

export function playRound(initial: GameState, config: LabConfig, trial: number, round: number) {
    const seed = streamSeed(config.seed, trial, round);
    let state = processAction({ ...structuredClone(initial), phase: 'deal_over', cash: 1e9,
        challengeRewards: [], challenges: [], rngState: seed }, { type: 'deal' }).nextState;
    const decisions = [`Dealt ${cardText(state.playerHands[1].cards[0])} to center.`];
    let draw = 0;
    for (let actionCount = 0; actionCount < 256; actionCount++) {
        if (state.phase === 'scoring') {
            const scoringState = state;
            const settled = settleRound(state);
            const view = roundView(settled.state, state.dealer.cards, seed, round, decisions);
            return { ...settled, scoringState, view };
        }
        const action = state.phase === 'playing' ? chooseAction(observe(state), config.bot) : getValidActions(state)[0];
        if (!action) throw new Error(`No legal action in trial ${trial + 1}, round ${round + 1}.`);
        if (action.type === 'draw') state = { ...state, rngState: streamSeed(config.seed, trial, round, ++draw) };
        if (action.type === 'resolve_dealer_turn') state = { ...state, rngState: streamSeed(config.seed, trial, round, 10000) };
        if (action.type === 'place_card') decisions.push(`Place ${cardText(state.drawnCards[state.selectedDrawIndex!]!)} → ${['left', 'center', 'right'][action.handIndex]}.`);
        if (action.type === 'stand') decisions.push('Stand.');
        state = processAction(state, action).nextState;
    }
    throw new Error(`Action limit reached in trial ${trial + 1}, round ${round + 1}; no result was counted. Try a different build.`);
}

function roundView(state: GameState, dealer: GameState['dealer']['cards'], seed: number, round: number, decisions: string[]): RoundView {
    // Stable, local identities keep exported examples reproducible across jobs.
    const cards = (values: RoundView['dealer'], prefix: string) => values.map((card, index) => ({ ...card, id: `${prefix}-${index}` }));
    return { seed, round: round + 1, dealer: cards(dealer.map(card => ({ ...card, isFaceUp: true })), 'dealer'),
        hands: state.playerHands.map((hand, index) => ({ cards: cards(hand.cards, `hand-${index}`), value: hand.blackjackValue,
            outcome: hand.outcome ?? 'empty', criteria: (hand.finalScore?.criteria ?? []).map(row => ({ name: row.name, chips: row.chips, mult: row.multiplier })) })),
        chips: state.runningSummary!.chips, mult: state.runningSummary!.mult,
        payout: Math.floor(Number((state.runningSummary!.chips * state.runningSummary!.mult).toFixed(8))), decisions: [...decisions] };
}

export function summarize(values: number[]): Distribution {
    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const mean = sorted.reduce((total, value) => total + value, 0) / count;
    const variance = count > 1 ? sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / (count - 1) : 0;
    const quantile = (p: number) => { const index = (count - 1) * p; const low = Math.floor(index); return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low); };
    const min = sorted[0]; const max = sorted[count - 1];
    const width = max === min ? 1 : (max - min) / 20;
    const histogram = Array.from({ length: max === min ? 1 : 20 }, (_, index) => ({ low: min + index * width, high: min + (index + 1) * width, count: 0 }));
    for (const value of sorted) histogram[Math.min(histogram.length - 1, Math.floor((value - min) / width))].count++;
    return { count, mean, median: quantile(.5), p10: quantile(.1), p90: quantile(.9), min, max,
        ci95: 1.96 * Math.sqrt(variance / count), histogram };
}

/** Finite, synchronous generator usable both by a browser worker and headless tools. */
export function* runExperiment(config: LabConfig): Generator<LabProgress, LabReport> {
    validateConfig(config);
    const started = performance.now();
    const base = createLabState(config);
    const treatments = getTreatments(config.experiment).filter(treatment =>
        (config.target === 'all' || (config.experiment === 'raises' ? currentRaiseTarget(config.target) : config.target) === treatment.id) && !(config.experiment === 'relics' && config.relicIds.includes(treatment.id)));
    if (!treatments.length) throw new Error('No available upgrades to compare.');
    const horizon = config.experiment === 'raises' ? 1 : config.horizon;
    const baseline: number[] = [];
    const data = treatments.map(() => ({ payouts: [] as number[], deltas: [] as number[], triggers: 0, better: 0,
        examples: null as { first: Example; best: Example; worst: Example } | null }));
    let chips = 0; let mult = 0; let busts = 0; let hands = 0; let roundsPlayed = 0;
    for (let trial = 0; trial < config.trials; trial++) {
        let baseState = base;
        const baseRounds = [];
        let basePayout = 0;
        for (let round = 0; round < horizon; round++) {
            const result = playRound(baseState, config, trial, round);
            baseRounds.push(result);
            baseState = result.state;
            basePayout += result.scoring.finalScore / horizon;
            chips += result.scoring.totalChips; mult += result.scoring.totalMult;
            for (const hand of baseState.playerHands) if (hand.cards.length) { hands++; if (hand.isBust) busts++; }
            roundsPlayed++;
        }
        baseline.push(basePayout);
        for (let index = 0; index < treatments.length; index++) {
            const treatment = treatments[index]; const item = data[index];
            let treatmentState = treatment.apply(structuredClone(base));
            let payout = 0;
            const treatmentRounds: RoundView[] = [];
            if (config.experiment === 'raises') {
                const original = baseRounds[0];
                const result = settleRound(treatment.apply(original.scoringState));
                payout = result.scoring.finalScore;
                treatmentRounds.push(roundView(result.state, original.view.dealer, original.view.seed, 0, original.view.decisions));
                for (const hand of original.state.playerHands) item.triggers += hand.finalScore?.criteria.filter(row =>
                    row.id === treatment.category || (treatment.category === 'win' && row.id === 'viginti') || (treatment.category === 'loss' && row.id === 'bust')).length ?? 0;
            } else {
                for (let round = 0; round < horizon; round++) {
                    const result = playRound(treatmentState, config, trial, round);
                    treatmentState = result.state;
                    payout += result.scoring.finalScore / horizon;
                    treatmentRounds.push(result.view);
                    roundsPlayed++;
                }
            }
            const delta = payout - basePayout;
            item.payouts.push(payout); item.deltas.push(delta); if (delta > 0) item.better++;
            // Retain first / largest / smallest effects, not hundreds of thousands of traces.
            if (!item.examples || delta > item.examples.best.delta || delta < item.examples.worst.delta) {
                const example: Example = { trial: trial + 1, delta, baseline: baseRounds.map(result => result.view), treatment: treatmentRounds };
                if (!item.examples) item.examples = { first: example, best: example, worst: example };
                if (delta > item.examples.best.delta) item.examples.best = example;
                if (delta < item.examples.worst.delta) item.examples.worst = example;
            }
        }
        if ((trial + 1) % 10 === 0 || trial === config.trials - 1) yield { completed: trial + 1, total: config.trials };
    }
    return {
        version: 1, createdAt: new Date().toISOString(), config: structuredClone(config), elapsedMs: performance.now() - started,
        roundsPlayed, baseline: summarize(baseline), meanChips: chips / (config.trials * horizon), meanMult: mult / (config.trials * horizon), bustRate: hands ? busts / hands : 0,
        comparisons: treatments.map((treatment, index) => {
            const item = data[index];
            return { id: treatment.id, name: treatment.name, description: treatment.description, category: treatment.category, stat: treatment.stat,
                payout: summarize(item.payouts), delta: summarize(item.deltas), triggerRate: config.experiment === 'raises' ? item.triggers / config.trials : null,
                perTrigger: config.experiment === 'raises' && item.triggers ? item.deltas.reduce((total, value) => total + value, 0) / item.triggers : null,
                betterRate: item.better / config.trials, examples: item.examples! };
        }),
    };
}
