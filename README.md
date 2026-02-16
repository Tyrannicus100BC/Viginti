# Viginti

A high-stakes blackjack-inspired roguelike game built with React, TypeScript, and Vite.

## Project Overview

Viginti features a deep, strategic gameplay loop where players manage multiple hands, collect relics (Charms and Angles), and navigate through various casinos in different cities.

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

