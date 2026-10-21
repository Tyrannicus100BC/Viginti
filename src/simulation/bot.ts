import type { GameState } from '../engine/GameState';
import type { PlayerAction } from '../engine/PlayerAction';
import { canPlayHand } from '../engine/economy';
import { evaluateHandScore, getBlackjackScore } from '../logic/scoring';
import type { Bot } from './model';

// An explicit information boundary: policies never receive the RNG or face-down cards.
export type BotObservation = Pick<GameState, 'playerHands' | 'drawnCards' | 'inventory' | 'handUpgrades' | 'selectedDrawIndex'> & {
    dealerCards: GameState['dealer']['cards'];
};

export function observe(state: GameState): BotObservation {
    return {
        playerHands: state.playerHands, drawnCards: state.drawnCards, inventory: state.inventory,
        handUpgrades: state.handUpgrades, selectedDrawIndex: state.selectedDrawIndex,
        dealerCards: state.dealer.cards.filter(card => card.isFaceUp),
    };
}

// Deliberately inexpensive heuristic, not an optimal-play solver. Estimates the
// shared round pot under several possible dealer totals, preserving correlation
// between hands. Actual settlement always uses the production engine.
function placementValue(observation: BotObservation, drawIndex: number, handIndex: number): number {
    const inventory = structuredClone([...observation.inventory]);
    const card = observation.drawnCards[drawIndex]!;
    const hands = observation.playerHands.map((hand, index) => {
        const cards = index === handIndex ? [...hand.cards, card] : hand.cards;
        return { ...hand, cards, blackjackValue: getBlackjackScore(cards, inventory) };
    });
    const visible = getBlackjackScore(observation.dealerCards, inventory, true);
    const known = observation.dealerCards.length >= 2;
    const scenarios = known && visible >= 17
        ? [{ value: visible, weight: 1 }]
        : [{ value: 17, weight: .14 }, { value: 18, weight: .14 }, { value: 19, weight: .13 },
            { value: 20, weight: .18 }, { value: 21, weight: .10 }, { value: 22, weight: .31 }];
    let expected = 0;
    for (const dealer of scenarios) {
        let chips = 0;
        let mult = 1;
        for (const hand of hands) {
            if (!hand.cards.length) continue;
            const bust = hand.blackjackValue > 21;
            const win = !bust && (dealer.value > 21 || hand.blackjackValue >= dealer.value);
            const score = evaluateHandScore(hand.cards, win, false, inventory, 1, undefined,
                bust ? 'bust' : win ? 'win' : 'loss', observation.handUpgrades);
            chips += score.totalChips;
            mult += score.totalMultiplier;
        }
        expected += chips * mult * dealer.weight;
    }
    // Preserve useful live hands; prevent immediate pattern bonuses from making
    // the baseline bot casually throw away a strong hand with future potential.
    const placed = hands[handIndex];
    if (placed.blackjackValue > 21) expected -= 35;
    else expected += Math.min(placed.blackjackValue, 17) * .7;
    return expected;
}

export function chooseAction(observation: BotObservation, bot: Bot): PlayerAction {
    const playable = observation.playerHands.filter(canPlayHand);
    const available = observation.drawnCards.flatMap((card, index) => card ? [index] : []);
    if (available.length) {
        let drawIndex = available.includes(observation.selectedDrawIndex ?? -1) ? observation.selectedDrawIndex! : available[0];
        let handIndex = playable[0]?.id;
        if (handIndex === undefined) throw new Error('Drawn card has no legal placement.');
        if (bot === 'simple') {
            handIndex = [...playable].sort((a, b) => a.blackjackValue - b.blackjackValue)[0].id;
        } else {
            let best = -Infinity;
            for (const index of available) for (const hand of playable) {
                const value = placementValue(observation, index, hand.id);
                if (value > best) { best = value; drawIndex = index; handIndex = hand.id; }
            }
        }
        return observation.selectedDrawIndex !== drawIndex
            ? { type: 'select_drawn_card', drawIndex }
            : { type: 'place_card', handIndex };
    }
    const dealerValue = getBlackjackScore(observation.dealerCards, structuredClone([...observation.inventory]), true);
    if (bot === 'score' && observation.dealerCards.length >= 2 && dealerValue > 21) return { type: 'stand' };
    const threshold = bot === 'score' && observation.dealerCards.length >= 2 && dealerValue >= 17
        ? Math.min(21, dealerValue) : 17;
    return playable.some(hand => hand.blackjackValue < threshold) ? { type: 'draw' } : { type: 'stand' };
}
