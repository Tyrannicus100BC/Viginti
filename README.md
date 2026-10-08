# Viginti

A high-stakes blackjack-inspired roguelike game built with React, TypeScript, and Vite.

## Project Overview

Viginti is a continuous blackjack table where you manage up to three hands and buy upgrades with your winnings.

- Start with 5 comp tickets and $100 cash. The cash ante starts at $50, and each deal starts only the center hand. Opening either side hand costs one comp ticket, including placement through Hold; further cards in that hand and drawing are free. The HUD shows Ante and Increase (completed deals until the next increase).
- Win and Viginti each earn one additional comp ticket, shown as purple £1 before cash in Hand Scores. Tickets enter the HUD as their scoring row appears, while cash and multiplier contributions build the running pot. In the scoring rows above the cards, Win stays purple and Viginti uses the same highlight color as its name and cash. A run ends when settled cash cannot pay the next ante, or shop spending leaves it unaffordable when returning to the table. Cash scoring and upgrade effects remain in place; cash is a separate spendable balance from the run score, and losses cannot reduce cash below $0.
- Between deals, **Gift Shop** opens the shop; **Back to Table** returns to the completed deal without charging an ante or resetting table actions.
- Stock persists between visits, including sold items. After every four completed deals, the ante increases by 25%, rounded to the nearest $5 ($50 → $65 → $80 → $100 → $125), and shop stock refreshes immediately. Gift Shop gets a NEW badge after each increase; it stays until the first visit to the refreshed shop and is absent on fresh runs. An `ante_increased` event presents an “Ante Increase” popup after the final score; play resumes when the player clicks to continue. Paid restocks cost $30, $60, $120, and so on, without delaying the free restock. The free restock resets the next paid fee to $30.
- **Hand Scores**, beside Deck Info, shows the five always-active scoring types: Win, Lose, Pair, Straight, and Flush. Win starts at $10; Viginti (21) pays $20 and adds 0.1×. Lose pays −$10; Bust pays −$20 and subtracts 0.1×. Patterns pay their matching card values, with Pair adding 0.1× and Straight adding $10. Every deal starts at 1×; scoring contributions add cash and multiplier to the deal totals. Hover or focus a Hand Scores row to see each relevant Raise modifier separately, including repeated bonuses and penalties. Win Raises also affect Viginti, and Lose Raises also affect Bust.
- **Raise Packs** come in Basic/Common ($40, 3 choose 1), Jumbo/Uncommon ($60, 5 choose 1), and Mega/Rare ($80, 5 choose 2) tiers, stocked with 60% / 30% / 10% availability. Pack rarity describes the tier; every tier uses the same random Raise rarity distribution. The shared catalog in `src/logic/packs.ts` holds family, tier, price, offer count, selection count, and stock weight for future pack families. The purchased pack grows into the center as the shop fades away, shakes, and bursts into floating cards with separate Choose buttons; either a card or its button selects that Raise. Each selected card flies to **Hand Scores**, matching its height and fading as it approaches while the button pulses. Mega packs keep the remaining offers in place for the second choice; after the final choice the other offers and title fade, and the shop fades back in without replaying its entrance. Raises stack without relic slots or resale. Opened packs disappear from the shop. **Hand Scores** stays available during selection, so you can inspect existing payouts before choosing. Reduced-motion settings shorten the reveal and replace the flight with a fade. A new run resets them.
- **Raise affixes** use one / two / three slots for Common / Uncommon / Rare cards (card rarities roll at 60% / 30% / 10%). A simple affix costs one slot and grants $5 or x0.1. A strong tradeoff costs one slot and grants $15 or x0.3, paired with a $5 or x0.1 decrease to another hand type. A clean strong affix grants the same $15 or x0.3 for two slots. Each affix roll weights eligible simple / tradeoff / clean-strong kinds at 60 / 25 / 15; two-slot affixes require two remaining slots, and tradeoffs stop after the first penalty. There are no standalone negative affixes, so Common tradeoffs still contain a strong benefit. A Rare card can show four effect rows from three affix slots. Bonus rows sort by chip increases, multiplier increases, chip decreases, then multiplier decreases; ties use the Hand Scores order. Values show $15, x0.3, −$5, and −x0.1, with no plus signs. Versioned composition IDs preserve generated affixes across import/export; existing Raise IDs keep their earlier effects.
- **Relics** share four starting slots. Acquisition order alternates upper left, upper right, left, right; unlocked unused slots appear as empty circles. Relic effects can change play or award conditional scoring bonuses. The shop’s **+ Slot** button buys one more slot for $40, then $60, $80, and so on.
- Shop stock contains four relics stacked on the left and two Raise Packs stacked on the right. Paid Restock replaces only the relics, avoids the previous relic selection, and preserves pack tiers and sold status. New packs arrive only with the initial shop stock or an ante increase. Restock is the leftmost bottom action beneath the relics, followed by Sell and + Slot. Relics cost $40/$70/$100 by rarity; selling pays $20/$40/$60. Card enhancements cost $10/$30/$50/$70. These are prototype tuning values. Imported older runs retain earned Raises and equipped relics, with sufficient slots for the existing inventory; packs without tier metadata keep the Basic rules, including an unfinished selection.
- Former per-casino table actions recharge with each ante increase, every four completed deals. Casino targets, clear rewards, and forced shop visits no longer govern play.

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
