# Viginti

A high-stakes blackjack-inspired roguelike game built with React, TypeScript, and Vite.

## Project Overview

Viginti is a continuous blackjack table where you manage three hands and build your run through free packs.

- Start with $100 cash and choose one of three free packs before the first deal. Each reward offers a Raise, Deck, and Relic pack, with the size of each rolled independently.
- Each round costs a cash ante, starting at $50. The first card goes to the center hand; both side hands are always free to play. There are no comp tickets.
- Every four completed rounds, the ante rises by 50%, rounded to the nearest $5 ($50 → $75 → $115 → $175 → $265). After collecting the round’s winnings and acknowledging the ante increase, the table fades out for another three-pack choice. Choose and open exactly one, then return to the table.
- Packs are the only upgrade source. Basic packs offer 3 cards, choose 1; Jumbo packs offer 5, choose 1; Mega packs offer 5, choose 2. Pack sizes retain their 60% / 30% / 10% distribution. You can skip unwanted contents or remaining picks. Choosing or skipping contents consumes that reward; there is no reroll or additional pack purchase.
- Raise cards permanently upgrade hand payouts for the current run. Deck cards change draw probabilities. Relic packs grant relics with their usual effects and full initial table-action charges. Hand Scores and Deck remain available during rewards.
- Six relic slots are permanently available, three on each side. Acquisition order alternates left and right. Full relic inventories block additional relic selections; you can skip the pack to continue.
- Cash scoring and upgrade effects remain in place. Cash is a separate balance from lifetime run winnings, and losses cannot reduce cash below $0. A run ends when you request a deal without enough cash for its ante. Pack rewards cost nothing, even when cash is low.
- Debug mode provides **Relics** beneath the left slots and **Packs** beneath the right slots. The pack picker lists all nine packs and uses the usual reveal and selection flow, retaining upgrades before returning to the current round or waiting reward. The debug **Cash** button replaces the Cash label and adds $100.
- Debug exports preserve pack offers, unfinished selections, earned upgrades, and RNG progress. Imported older shop snapshots convert to the pack flow, and side hands become free.

Shared economy tuning lives in `src/engine/economy.ts`.

For browser testing, add `?quickstart=1` to the Enmanner-managed app URL to skip
the title screen and start a fresh run at its opening pack choice. The plain URL
continues to show the title screen.
For mechanics testing, use `?quickstart=1&skippack=1` to bypass the opening pack
as well and begin an already-dealt first round. The usual ante is paid, no pack
upgrade is granted, and later pack rewards remain enabled.

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
