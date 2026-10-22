# Viginti

A high-stakes blackjack-inspired roguelike game built with React, TypeScript, and Vite.

## Project Overview

Viginti is a continuous blackjack table where you manage three hands and build your run through free packs.

- Start with $100 cash and a free Major Pack. Each round costs a cash ante, starting at $50; both side hands are free to play.
- Only survival advances the ante: complete four rounds, collect rewards, then raise the ante to `current ante × 1.5 + $25`, rounded to the nearest $5 ($50 → $100 → $175 → $290 → $460). Earnings do not advance the ante.
- Each ante starts with one side challenge. Completing it immediately generates another, so later hands and rounds can progress a second challenge before the ante changes. Side rewards do not reset survival progress. Extra challenges acquired from packs carry across ante changes until completed.
- Rewards open directly. Major Packs offer six options: three Raises, two passive relics, and one randomly selected Deck Pack or Challenge Pack. Choose one reward; choosing a targeted pack opens three options of that type, from which you choose one. Minor Packs offer three independently random Raise, deck, or passive relic upgrades, with one pick and no challenges.
- Every third ante (3, 6, 9, …) is a boss encounter. A seeded boss registry supplies hooks for rules that last the entire four-round encounter. The first boss, **High Limit**, raises the player and dealer bust limit to 25; exactly 21 keeps its usual scoring bonus.
- Defeating a boss grants the normal Major Pack plus a separate choice of two unowned table actions. Table actions only come from boss rewards and do not occupy the six passive relic slots.
- Full passive relic inventories block further passive relic selections; other reward types and skipping remain available. Exhausted relic pools fall back to Raises. Hand Scores and Deck remain available during rewards.
- Cash is separate from lifetime run winnings and cannot fall below $0. A run ends when you request a deal without enough cash for its ante. Rewards cost nothing, even when cash is low.
- Debug Packs retain legacy family, size, and quality variants for testing and saved-run compatibility. The debug Cash button adds one current ante.
- Debug exports preserve boss identity, challenge progress, queued rewards, nested pack selections, earned upgrades, and RNG progress. Older imports drop the retired main earnings goal while retaining upgrades.

Shared economy tuning lives in `src/engine/economy.ts`.

For browser testing, add `?quickstart=1` to the Enmanner-managed app URL to skip
the title screen and start a fresh run at its opening Major Pack. The plain URL
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
