# Viginti

A high-stakes blackjack-inspired roguelike game built with React, TypeScript, and Vite.

## Project Overview

Viginti is a continuous blackjack table where you manage up to three hands and buy upgrades with your winnings.

- Start with 10 comp tickets and $100 cash. The cash ante starts at $50, and each deal starts only the center hand. Opening either side hand costs one comp ticket, including placement through Hold; further cards in that hand and drawing are free. The HUD shows Ante and Increase (completed deals until the next increase).
- Win and Viginti each earn one additional comp ticket, shown as purple £1 before cash in Hand Scores. In the scoring rows above the cards, Win stays purple and Viginti uses the same highlight color as its name and cash. A run ends when settled cash cannot pay the next ante, or shop spending leaves it unaffordable when returning to the table. Cash scoring and upgrade effects remain in place; cash is a separate spendable balance from the run score, and losses cannot reduce cash below $0.
- Between deals, **Gift Shop** opens the shop; **Back to Table** returns to the completed deal without charging an ante or resetting table actions.
- Stock persists between visits, including sold items. After every five completed deals, the ante increases by $10 and shop stock refreshes immediately. An `ante_increased` event presents a brief “Ante Increase” popup after the final score. Paid restocks cost $30, $60, $120, and so on, without delaying the free restock. The free restock resets the next paid fee to $30.
- **Hand Scores**, beside Deck Info, shows the five always-active scoring types: Win, Lose, Pair, Straight, and Flush. Win starts at $10 ($25 on 21), Lose at −$10 (−$20 on bust), and each pattern pays its matching card values. Every deal starts at 1×; scoring contributions add cash and multiplier to the deal totals.
- **Raise Packs** cost $40 and reveal three random offers; choose one permanent Raise for the current run. Common / Uncommon / Rare Raises have one / two / three modifiers. Hand names are blue and effects show signed cash or × values. Some multi-effect Raises trade a smaller penalty on another hand for a stronger primary benefit. Raises stack without relic slots or resale. Opened packs disappear from the shop. During selection the shop hides and **Hand Scores** stays available, so you can inspect existing payouts before choosing. A new run resets them.
- **Relics** share four starting slots. Acquisition order alternates upper left, upper right, left, right; unlocked unused slots appear as empty circles. Relic effects can change play or award conditional scoring bonuses. The shop’s **+ Slot** button buys one more slot for $40, then $60, $80, and so on.
- Shop stock contains four relics stacked on the left and two Raise Packs stacked on the right. Relics cost $40/$70/$100 by rarity; selling pays $20/$40/$60. Card enhancements cost $10/$30/$50/$70. These are prototype tuning values. Imported older runs retain earned Raises and equipped relics, with sufficient slots for the existing inventory.
- Former per-casino table actions recharge with each ante increase. Casino targets, clear rewards, and forced shop visits no longer govern play.

Shared economy tuning lives in `src/engine/economy.ts`.

The project is structured with a strict separation between game logic and visual presentation, allowing for complex animations and robust game simulation.

## Documentation

For a detailed understanding of how the game is built, please refer to the following documentation:

- [**Architecture Overview**](./ARCHITECTURE.md) - Explains the separation between the Core Engine and the Presentation Layer.

## Development

### Getting Started

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Run the development server:
    ```bash
    npm run dev
    ```

3.  Running the CLI simulator:
    ```bash
    npx ts-node src/engine/cli.ts
    ```

### Project Structure

- `src/engine`: Pure game logic and state management.
- `src/logic`: Game content definitions (relics, cities, gamblers, etc.).
- `src/components`: React UI components.
- `src/store`: State management and event-driven animation bridge.
- `public`: Static assets (images, sounds).

## Tech Stack

- **Framework**: React 18
- **Language**: TypeScript
- **State Management**: Zustand
- **Build Tool**: Vite
- **Styling**: Vanilla CSS (Modules)
