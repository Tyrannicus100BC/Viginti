# Viginti Architecture

Viginti is built with a strict separation between the **Core Game Engine** and the **Presentation Layer**.

## High-Level Flow

1.  **User Action**: The user interacts with the UI (e.g., clicks "Deal").
2.  **Dispatch**: The UI calls a function on the `gameStore`.
3.  **Bridge**: The `gameStore` (a legacy wrapper) dispatches a `PlayerAction` to the `gameBridge`.
4.  **Engine**: The `gameBridge` passes the current `GameState` and the `PlayerAction` to the pure `processAction()` function in the engine.
5.  **Result**: The engine returns a new `GameState` and a list of `GameEvent`s.
6.  **Animation**: The `gameBridge` uses the `EventPlayer` to process these events one by one, updating the UI state with specific timings and triggering SFX.
7.  **Sync**: Only after the events are finished playing does the bridge sync the final `GameState` back to the store.

---

## 1. Core Game Engine (`src/engine`)

The engine is a **pure state machine**. It has no knowledge of React, timers, or sound.

- **`GameState.ts`**: The source of truth for the game. Contains everything from player hands and deck state to current phase and total score.
- **`PlayerAction.ts`**: Defines the discrete inputs a player can make (e.g., `deal`, `place_card`, `stand`).
- **`GameEvent.ts`**: Defines a structured log of everything that happened as a result of an action (e.g., `card_drawn`, `hand_bust`, `scoring_row_intro`). These events are the "instructions" for the presentation layer.
- **`engine.ts`**: The main orchestrator. It contains the rules of the game and implementations for processing each `PlayerAction`.
- **`relicEngine.ts`**: Specifically handles the complex logic for relics and their effects on the game state.

## 2. Presentation Layer (`src/components`, `src/App.tsx`)

The presentation layer is responsible for rendering the state and providing a rich, animated experience.

- **React Components**: Most UI logic is in `src/components`. `App.tsx` is the main container.
- **`App.module.css`**: Contains many of the core layout and animation styles.
- **Reactive UI**: Components listen to the `gameStore` (or `gameBridge`) and update when the underlying state changes.

## 3. Bridge & Event Processing (`src/store`)

This layer connects the pure engine to the animated UI.

- **`gameBridge.ts`**: A Zustand store that holds the `GameState`. It manages the action queue to ensure that actions aren't processed while animations are still playing.
- **`EventPlayer.ts`**: The "animator". It takes the list of `GameEvent`s from the engine and processes them sequentially. Each event handler in `EventPlayer` updates the UI state (e.g., `isShaking: true`) and waits for a specific duration before moving to the next event.
- **`gameStore.ts`**: A compatibility layer. It wraps the `gameBridge` and provides the API that the legacy components expect.

## 4. Game Logic Data (`src/logic`)

This directory contains the "content" of the game.

- **`cities/`**, **`gamblers/`**: Definitions for different locations and character classes.
- **`relics/`**: Definitions and configurations for all the power-ups (Charms and Angles).
- **`tutorials/`**: Trigger conditions and content for the in-game tutorials.
- **`scoring.ts`**: Logic for calculating hand values (e.g., Flush, Straight, Viginti).

---

## Why this architecture?

- **Testability**: The core engine is pure and can be tested without any UI or DOM.
- **Simulations**: We can run thousands of games in a headless CLI mode (see `src/engine/cli.ts`) to balance the game.
- **Consistency**: The UI only reflects what the engine says happened, ensuring that the visual state and logical state don't diverge.
- **Rich Animations**: By using an event stream, we can create complex, multi-step animations (like a card being drawn, then placed, then triggering a relic, then busting) from a single user click.

---

## Key Concepts & Gotchas

### 1. The "Interpretation of the Click" Problem
Because animations are asynchronous and the engine is pure, the state of the game in the UI might be "behind" the state of the game in the engine if multiple actions are queued. 
- **Solution**: The `gameBridge` maintains an action queue and validates each action against the *current* engine state before processing it. If an action is no longer valid (e.g., you clicked "Place" on a hand that just busted in a preceding event), it is dropped.

### 2. Event-Driven Animation
NEVER update the UI state directly from a component in response to a game action. Always dispatch an action to the engine, and then handle the resulting events in `EventPlayer.ts`. This ensures that sound, timing, and visual transitions are all synchronized.

### 3. Headless Simulation
The `src/engine/cli.ts` provides a way to play the game in the terminal. This is powered by `playEventsSync`, which skips all timers. This is vital for balancing and debugging logic without waiting for animations.

### 4. Relic Table Actions
Relics can have "Table Actions" which are active abilities. These use a multi-step process:
1.  `activate_table_action`: Enter "targeting mode".
2.  `select_table_action_target` or `select_table_action_card`: Finalize the action.
The `interactionMode` in the state helps the UI decide what to show (e.g., highlighting hands vs showing cards).
