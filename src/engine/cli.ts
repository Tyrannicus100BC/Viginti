#!/usr/bin/env node
/**
 * Viginti CLI Simulator
 *
 * Plays the game via the pure engine — no browser, no React.
 *
 * Usage:
 *   npx tsx src/engine/cli.ts --interactive       # Human play
 *   npx tsx src/engine/cli.ts --random             # Random strategy
 *   npx tsx src/engine/cli.ts --batch 100          # Win-rate stats
 *   npx tsx src/engine/cli.ts --json               # LLM pipe mode
 */

import { processAction, getValidActions } from './engine';
import type { GameState } from './GameState';
import { TUTORIAL_STEPS } from './tutorial/definitions';
import type { PlayerAction } from './PlayerAction';
import type { GameEvent } from './GameEvent';
import type { Card, PlayerHand } from '../types';
import { RELIC_REGISTRY } from '../logic/relics/manager';
import { CITY_DEFINITIONS } from '../logic/cities/definitions';
import * as readline from 'readline';

// ─── Card & Hand Rendering ─────────────────────────────

const SUIT_SYMBOLS: Record<string, string> = {
    hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
};

export function renderCard(card: Card): string {
    if (!card.isFaceUp) return '??';
    if (card.type === 'chip') return `$${card.chips}`;
    if (card.type === 'mult') return `x${card.mult}`;
    if (card.type === 'score') return `⊖${card.chips}`;
    const suit = SUIT_SYMBOLS[card.suit] ?? card.suit;
    const rank = card.rank === 'none' ? '?' : card.rank;
    let str = `${rank}${suit}`;
    if (card.specialEffect) {
        const eff = card.specialEffect;
        str += eff.type === 'chip' ? `(+$${eff.value})` : eff.type === 'mult' ? `(+x${eff.value})` : `(+★${eff.value})`;
    }
    return str;
}

export function renderHand(hand: PlayerHand, dealerValue: number): string {
    const cards = hand.cards.map(renderCard).join(' ');
    let status = '';
    if (hand.isBust) status = ' BUST';
    else if (hand.isHeld) {
        if (hand.outcome === 'win') status = ' WIN';
        else if (hand.outcome === 'loss') status = ' LOSS';
        else status = ' HELD';
    }
    const val = hand.blackjackValue;
    return `  Hand ${hand.id + 1}: [${cards}] = ${val}${status}`;
}

export function renderDealer(state: GameState): string {
    const cards = state.dealer.cards.map(renderCard).join(' ');
    const val = state.dealer.isRevealed ? ` = ${state.dealer.blackjackValue}` : '';
    return `  Dealer: [${cards}]${val}`;
}

// ─── Full State Renderer ────────────────────────────────

export function renderState(state: GameState): string {
    const lines: string[] = [];
    const cityName = CITY_DEFINITIONS.find(c => c.id === state.selectedCityId)?.name ?? state.selectedCityId ?? '—';

    lines.push('');
    lines.push(`═══════════════════════════════════════════════`);
    lines.push(`  ${cityName}  |  Deal ${state.deal}  |  Phase: ${state.phase}`);
    lines.push(`  Score: ${state.totalScore ?? 0} / ${state.targetScore ?? 0}  |  Comps: ${state.comps ?? 0}  |  Deals: ${state.dealsTaken ?? 0}/${(state.handsRemaining ?? 0) + (state.dealsTaken ?? 0)}`);
    lines.push(`  Deck: ${state.deck?.length ?? 0}  |  Discard: ${state.discardPile?.length ?? 0}`);
    lines.push(`═══════════════════════════════════════════════`);

    // Dealer
    if (state.dealer?.cards?.length > 0) {
        lines.push(renderDealer(state));
        lines.push('');
    }

    // Player hands
    if (state.playerHands?.length > 0) {
        for (const hand of state.playerHands) {
            lines.push(renderHand(hand, state.dealer.blackjackValue));
        }
        lines.push('');
    }

    // Drawn cards
    const activeDrawn = (state.drawnCards ?? []).filter(c => c !== null);
    if (activeDrawn.length > 0) {
        const drawnStr = (state.drawnCards ?? []).map((c, i) => {
            if (!c) return '  _  ';
            const sel = i === state.selectedDrawIndex ? '>' : ' ';
            return `${sel}${renderCard(c)}${sel}`;
        }).join('  ');
        lines.push(`  Draw: ${drawnStr}`);
        lines.push('');
    }

    // Running summary
    if (state.runningSummary) {
        const { chips, mult } = state.runningSummary;
        lines.push(`  Running: $${chips} × ${mult} = ${Math.floor(chips * mult)}`);
        lines.push('');
    }

    // Shop items
    if (state.phase === 'gift_shop' && state.shopItems.length > 0) {
        lines.push('  ┌─── Gift Shop ───────────────────────┐');
        for (const item of state.shopItems) {
            const name = item.nameOverride ?? RELIC_REGISTRY[item.id]?.name ?? item.id;
            const status = item.purchased ? '  SOLD' : `  $${item.cost}`;
            lines.push(`  │ ${item.type.padEnd(12)} ${name.padEnd(20)} ${status}`);
        }
        lines.push(`  │ Restock: $${state.giftShopRestockCost}`);
        lines.push('  └───────────────────────────────────────┘');
        lines.push('');
    }

    // Inventory
    if (state.inventory?.length > 0) {
        const relicNames = state.inventory.map(r => {
            const name = RELIC_REGISTRY[r.id]?.name ?? r.id;
            const charges = state.tableActionCharges[r.id];
            return charges !== undefined ? `${name}(${charges})` : name;
        });
        lines.push(`  Relics: ${relicNames.join(', ')}`);
        lines.push('');
    }

    return lines.join('\n');
}

// ─── Action Descriptions ────────────────────────────────

export function describeAction(action: PlayerAction, state?: GameState): string {
    switch (action.type) {
        case 'start_game':
            return `Start game — ${action.cityId ?? 'default city'}`;
        case 'deal':
            return 'Deal cards';
        case 'draw':
            return 'Draw cards from deck';
        case 'select_drawn_card':
            return `Select drawn card #${action.drawIndex + 1}`;
        case 'place_card':
            return `Place card into Hand ${action.handIndex + 1}`;
        case 'stand':
            return 'Stand (end placement, dealer plays)';
        case 'complete_deal_early':
            return 'Complete deal early';
        case 'enter_gift_shop':
            return 'Enter gift shop';
        case 'buy_shop_item': {
            if (state) {
                const item = state.shopItems.find(i => i.id === action.itemId);
                const name = item?.nameOverride ?? RELIC_REGISTRY[action.itemId]?.name ?? action.itemId;
                return `Buy ${name} ($${item?.cost ?? '?'})`;
            }
            return `Buy ${action.itemId}`;
        }
        case 'restock_shop':
            return `Restock shop ($${state?.giftShopRestockCost ?? '?'})`;
        case 'sell_relic': {
            const name = RELIC_REGISTRY[action.relicId]?.name ?? action.relicId;
            return `Sell ${name}`;
        }
        case 'leave_shop':
            return 'Leave shop → next casino';
        case 'enhance_card':
            return `Enhance card ${action.cardId} (+${action.enhancement.type})`;
        case 'destroy_card':
            return `Destroy card ${action.cardId}`;
        case 'activate_table_action': {
            const name = RELIC_REGISTRY[action.relicId]?.name ?? action.relicId;
            return `Activate ${name}`;
        }
        case 'cancel_table_action':
            return 'Cancel table action';
        case 'select_table_action_hand':
            return `Target Hand ${action.handIndex + 1}`;
        case 'select_table_action_card':
            return `Target card ${action.cardId}`;
        case 'select_table_action_draw_card':
            return `Select draw card #${action.drawIndex + 1}`;
        default:
            return (action as any).type;
    }
}

// ─── Strategies ─────────────────────────────────────────

export type Strategy = (state: GameState, actions: PlayerAction[]) => PlayerAction;

export const randomStrategy: Strategy = (state, actions) => {
    // Modify 'random' to use simple blackjack dealer logic for the draw/stand decision
    if (state.phase === 'playing') {
        const activeHands = state.playerHands.filter(h => !h.isBust && !h.isHeld);
        
        // Dealer logic: Hit if any hand is < 16
        const shouldHit = activeHands.length > 0 && activeHands.some(h => h.blackjackValue < 16);

        if (shouldHit) {
            // Filter out 'stand' to force drawing/placing if valid
            const hitActions = actions.filter(a => a.type !== 'stand');
            if (hitActions.length > 0) {
                return hitActions[Math.floor(Math.random() * hitActions.length)];
            }
        } else {
            // If all hands >= 16 (or none active), prefer standing
            const standAction = actions.find(a => a.type === 'stand');
            // Only force stand if we actually CAN stand (sometimes we must place a drawn card first)
            if (standAction) {
                return standAction;
            }
        }
    }

    return actions[Math.floor(Math.random() * actions.length)];
};

/** Simple greedy: place cards, avoid bust, buy cheapest, stand when all hands >= 17 */
export const greedyStrategy: Strategy = (state, actions) => {
    const actionTypes = new Set(actions.map(a => a.type));

    // Heuristic: if all non-bust hands have value >= 17, prefer standing
    const allHandsHigh = state.playerHands?.length > 0 &&
        state.playerHands.every(h => h.isBust || h.isHeld || h.blackjackValue >= 17);

    if (allHandsHigh && actionTypes.has('stand')) {
        return actions.find(a => a.type === 'stand')!;
    }

    // If we have a selected card, place it first
    if (state.selectedDrawIndex !== null && actionTypes.has('place_card')) {
        const placeActions = actions.filter(a => a.type === 'place_card');
        // Prefer hand with lowest value (less likely to bust)
        placeActions.sort((a, b) => {
            const handA = state.playerHands[a.handIndex];
            const handB = state.playerHands[b.handIndex];
            return (handA?.blackjackValue ?? 0) - (handB?.blackjackValue ?? 0);
        });
        return placeActions[0];
    }

    // Priority order for remaining actions
    const priority = [
        'select_drawn_card', 'draw',
        'deal', 'buy_shop_item', 'leave_shop', 'enter_gift_shop',
        'stand', 'deal', 'complete_deal_early',
    ];

    for (const pType of priority) {
        const match = actions.filter(a => a.type === pType);
        if (match.length > 0) {
            if (pType === 'buy_shop_item') {
                // Buy cheapest
                match.sort((a, b) => {
                    const itemA = state.shopItems.find(i => i.id === a.itemId);
                    const itemB = state.shopItems.find(i => i.id === b.itemId);
                    return (itemA?.cost ?? 0) - (itemB?.cost ?? 0);
                });
            }
            return match[0];
        }
    }

    return actions[0];
};

// ─── Game Runner ────────────────────────────────────────

export interface GameResult {
    won: boolean;
    finalScore: number;
    deal: number;
    phase: string;
    actionCount: number;
}

/** Pretty-print a game event for the CLI logs */
export function formatEvent(event: GameEvent): string {
    switch (event.type) {
        case 'deal_started':
            return `Deal ${event.deal} started (${event.handsRemaining} hands remaining)`;
        case 'cards_dealt':
            return `Dealing initial cards...`;
        case 'card_drawn':
            return `Drawn: ${renderCard(event.card)}`;
        case 'card_placed':
            return `Placed ${renderCard(event.card)} in Hand ${event.handIndex + 1} (New Total: ${event.newBlackjackValue})`;
        case 'hand_outcome':
            return `Hand ${event.handIndex + 1} ${event.outcome.toUpperCase()}! (${event.blackjackValue})`;
        case 'hand_bust':
            return `Hand ${event.handIndex + 1} BUST! (${event.blackjackValue})`;
        case 'relic_activated':
            return `Relic: ${RELIC_REGISTRY[event.relicId]?.name ?? event.relicId}${event.description ? ` - ${event.description}` : ''}`;
        case 'dealer_reveal':
            return `Dealer reveals ${renderCard(event.card)} (Total: ${event.newValue})`;
        case 'dealer_draw':
            return `Dealer draws ${renderCard(event.card)} (Total: ${event.newValue})`;
        case 'dealer_bust':
            return `Dealer BUST! (${event.value})`;
        case 'dealer_stand':
            return `Dealer stands at ${event.value}`;
        case 'target_reached':
            return `🎯 TARGET REACHED: ${event.totalScore}/${event.targetScore}`;
        case 'game_over':
            return `🏁 GAME OVER: ${event.won ? 'VICTORY' : 'LOSS'} (Final Score: ${event.finalScore})`;
        case 'phase_changed':
            return `Phase transitioned to: ${event.to}`;
        case 'item_purchased':
            return `Purchased ${RELIC_REGISTRY[event.itemId]?.name ?? event.itemId}`;
        case 'chip_collection':
            return `Collected ${event.amount} chips (Total Score: ${event.newTotalScore})`;
        case 'deal_scoring_complete':
            return `Deal Scoring: $${event.totalChips} x ${event.totalMult} = ${event.finalScore}`;
        case 'charge_gained':
            return `Relic ${RELIC_REGISTRY[event.relicId]?.name ?? event.relicId} gained charge (Total: ${event.newCharges})`;
        case 'casino_cleared':
            return `🏛️  CLEARED CASINO ${event.deal} (Score: ${event.score})`;
        case 'next_casino_setup':
            return `🏛️  ENTERING CASINO ${event.deal} (Target: ${event.targetScore})`;
        default:
            return event.type;
    }
}

export function runGame(
    strategy: Strategy,
    options: {
        cityId?: string;
        gamblerId?: string;
        seed?: number;
        maxActions?: number;
        verbose?: boolean;
        logActions?: boolean;
        globalTutorialsCompleted?: string[];
    } = {}
) {
    const { 
        cityId = 'atlantic_city', 
        gamblerId = 'default', 
        maxActions = 10000, 
        verbose = false,
        logActions = false,
        globalTutorialsCompleted = TUTORIAL_STEPS.map(s => s.id)
    } = options;
    const seed = options.seed ?? Math.floor(Math.random() * 2147483647);

    let state: GameState = { phase: 'init' } as GameState;
    const startResult = processAction(
        state, 
        { type: 'start_game', cityId, gamblerId, seed, globalTutorialsCompleted }
    );
    state = startResult.nextState;

    if (verbose) {
        process.stdout.write(renderState(state));
    }

    let actionCount = 0;

    while (state.phase !== 'game_over' && state.phase !== 'victory' && actionCount < maxActions) {
        const actions = getValidActions(state);
        if (actions.length === 0) break;

        const action = strategy(state, actions);
        const result = processAction(state, action);
        state = result.nextState;
        actionCount++;

        if (verbose) {
            const desc = describeAction(action, state);
            process.stdout.write(`\n  → ${desc}\n`);
            process.stdout.write(renderState(state));
        } else if (logActions) {
            const desc = describeAction(action, state);
            process.stdout.write(`  → ${desc}\n`);
            for (const event of result.events) {
                // Filter out non-representative events for logs
                if (event.type === 'animation_complete' || event.type === 'initial_deal_complete' || 
                    event.type === 'draw_complete' || event.type === 'placement_complete' ||
                    event.type === 'summary_update') continue;
                process.stdout.write(`    ⚡ ${formatEvent(event)}\n`);
            }
        }
    }

    return {
        won: state.phase === 'victory',
        finalScore: state.totalScore,
        deal: state.deal,
        phase: state.phase,
        actionCount,
    };
}

// ─── Batch Runner ───────────────────────────────────────

export interface BatchStats {
    games: number;
    wins: number;
    losses: number;
    winRate: number;
    avgScore: number;
    avgDeal: number;
    avgActions: number;
    maxScore: number;
    maxDeal: number;
}

export function runBatch(
    count: number,
    strategy: Strategy,
    cityId = 'atlantic_city',
): BatchStats {
    let wins = 0;
    let totalScore = 0;
    let totalDeal = 0;
    let totalActions = 0;
    let maxScore = 0;
    let maxDeal = 0;

    for (let i = 0; i < count; i++) {
        const result = runGame(strategy, { cityId, seed: i + 1 });
        if (result.won) wins++;
        totalScore += result.finalScore;
        totalDeal += result.deal;
        totalActions += result.actionCount;
        maxScore = Math.max(maxScore, result.finalScore);
        maxDeal = Math.max(maxDeal, result.deal);
    }

    return {
        games: count,
        wins,
        losses: count - wins,
        winRate: wins / count,
        avgScore: Math.round(totalScore / count),
        avgDeal: +(totalDeal / count).toFixed(1),
        avgActions: Math.round(totalActions / count),
        maxScore,
        maxDeal,
    };
}

// ─── Interactive Mode ───────────────────────────────────

async function runInteractive(cityId: string) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const prompt = (q: string) => new Promise<string>(resolve => rl.question(q, resolve));

    let state: GameState = { phase: 'init' } as GameState;
    const startResult = processAction(state, { type: 'start_game', cityId, gamblerId: 'default' });
    state = startResult.nextState;

    while (state.phase !== 'game_over' && state.phase !== 'victory') {
        process.stdout.write(renderState(state));

        const actions = getValidActions(state);
        if (actions.length === 0) {
            console.log('  No valid actions. Game stuck.');
            break;
        }

        console.log('  Actions:');
        actions.forEach((a, i) => {
            console.log(`    [${i}] ${describeAction(a, state)}`);
        });

        const input = await prompt('\n  Choose action: ');
        const idx = parseInt(input.trim(), 10);

        if (isNaN(idx) || idx < 0 || idx >= actions.length) {
            console.log('  Invalid choice.');
            continue;
        }

        const result = processAction(state, actions[idx]);
        state = result.nextState;

        // Show events
        for (const event of result.events) {
            if (event.type === 'hand_outcome' || event.type === 'dealer_bust' ||
                event.type === 'target_reached' || event.type === 'game_over') {
                console.log(`  ⚡ ${event.type}: ${JSON.stringify(event)}`);
            }
        }
    }

    process.stdout.write(renderState(state));
    console.log(state.phase === 'victory' ? '\n  🎉 VICTORY!' : '\n  💀 GAME OVER');
    rl.close();
}

// ─── JSON Pipe Mode ─────────────────────────────────────

async function runJsonMode(cityId: string) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const readLine = () => new Promise<string>(resolve => {
        rl.once('line', resolve);
    });

    let state: GameState = { phase: 'init' } as GameState;
    const startResult = processAction(state, { type: 'start_game', cityId, gamblerId: 'default' });
    state = startResult.nextState;

    while (state.phase !== 'game_over' && state.phase !== 'victory') {
        const actions = getValidActions(state);
        if (actions.length === 0) break;

        // Emit state + actions as JSON
        const output = {
            state: {
                phase: state.phase,
                deal: state.deal,
                totalScore: state.totalScore,
                targetScore: state.targetScore,
                comps: state.comps,
                dealsTaken: state.dealsTaken,
                handsRemaining: state.handsRemaining,
                dealer: {
                    cards: state.dealer.cards.map(renderCard),
                    value: state.dealer.isRevealed ? state.dealer.blackjackValue : null,
                },
                hands: state.playerHands.map(h => ({
                    id: h.id,
                    cards: h.cards.map(renderCard),
                    value: h.blackjackValue,
                    isBust: h.isBust,
                    isHeld: h.isHeld,
                    outcome: h.outcome ?? null,
                })),
                drawnCards: state.drawnCards.map(c => c ? renderCard(c) : null),
                selectedDrawIndex: state.selectedDrawIndex,
                inventory: state.inventory.map(r => ({
                    id: r.id,
                    name: RELIC_REGISTRY[r.id]?.name ?? r.id,
                })),
                shopItems: state.phase === 'gift_shop' ? state.shopItems : undefined,
                deckSize: state.deck.length,
            },
            actions: actions.map((a, i) => ({
                index: i,
                action: a,
                description: describeAction(a, state),
            })),
        };

        console.log(JSON.stringify(output));

        // Read action index from stdin
        const line = await readLine();
        const parsed = JSON.parse(line.trim());
        const actionIdx = typeof parsed === 'number' ? parsed : parsed.index ?? 0;

        if (actionIdx < 0 || actionIdx >= actions.length) continue;

        const result = processAction(state, actions[actionIdx]);
        state = result.nextState;
    }

    // Final state
    console.log(JSON.stringify({
        result: state.phase === 'victory' ? 'win' : 'loss',
        finalScore: state.totalScore,
        deal: state.deal,
    }));

    rl.close();
}

// ─── Main ───────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const cityId = args.find(a => !a.startsWith('--')) ?? 'atlantic_city';

    if (args.includes('--interactive') || args.includes('-i')) {
        await runInteractive(cityId);
        return;
    }

    if (args.includes('--json') || args.includes('-j')) {
        await runJsonMode(cityId);
        return;
    }

    if (args.includes('--batch') || args.includes('-b')) {
        const batchIdx = args.indexOf('--batch') >= 0 ? args.indexOf('--batch') : args.indexOf('-b');
        const count = parseInt(args[batchIdx + 1], 10) || 100;
        const stratName = args.includes('--greedy') ? 'greedy' : 'random';
        const strategy = stratName === 'greedy' ? greedyStrategy : randomStrategy;

        console.log(`\nRunning ${count} games with ${stratName} strategy on ${cityId}...\n`);
        const stats = runBatch(count, strategy, cityId);

        console.log(`  Games:      ${stats.games}`);
        console.log(`  Wins:       ${stats.wins}`);
        console.log(`  Losses:     ${stats.losses}`);
        console.log(`  Win Rate:   ${(stats.winRate * 100).toFixed(1)}%`);
        console.log(`  Avg Score:  ${stats.avgScore}`);
        console.log(`  Avg Deal:   ${stats.avgDeal}`);
        console.log(`  Avg Actions: ${stats.avgActions}`);
        console.log(`  Max Score:  ${stats.maxScore}`);
        console.log(`  Max Deal:   ${stats.maxDeal}`);
        console.log('');
        return;
    }

    // Default: single random game with detailed log output
    if (args.includes('--greedy')) {
        console.log('\nPlaying a single game with greedy strategy...\n');
        const result = runGame(greedyStrategy, { cityId, verbose: true });
        console.log(result.won ? '\n  🎉 VICTORY!' : '\n  💀 GAME OVER');
        console.log(`  Score: ${result.finalScore}  Deal: ${result.deal}  Actions: ${result.actionCount}\n`);
    } else {
        console.log('\nPlaying a single game with random strategy...\n');
        const result = runGame(randomStrategy, { cityId, logActions: true });
        console.log(`\n  Result: ${result.won ? 'WIN' : 'LOSS'}  Score: ${result.finalScore}  Casino: ${result.deal}  Actions: ${result.actionCount}\n`);
    }
}

// Run if this is the entry point
const isMainModule = typeof require !== 'undefined'
    ? require.main === module
    : process.argv[1]?.includes('cli');

if (isMainModule) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
