
// Mock localStorage
const localStorageMock = {
    getItem: (key: string) => null,
    setItem: (key: string, value: string) => { },
    removeItem: (key: string) => { },
    clear: () => { }
};
(global as any).localStorage = localStorageMock;

async function run() {
    // Dynamic import to prevent hoisting
    const { useGameStore } = await import('./store/gameStore');

    console.log("Loading store...");
    const store = useGameStore.getState();

    console.log("Initial Phase:", store.phase);

    try {
        console.log("Calling startGame('default')...");
        store.startGame('default');
        console.log("startGame returned. New Phase:", useGameStore.getState().phase);

        // Check if phase is entering_casino
        if (useGameStore.getState().phase === 'entering_casino') {
            console.log("SUCCESS: Phase transition successful.");
        } else {
            console.error("FAILURE: Phase did not change.");
        }
    } catch (e) {
        console.error("CRASH during startGame:", e);
        // Print stack trace
        console.error(e);
    }
}

run().catch(e => console.error("Script Error:", e));
