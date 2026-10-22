import { useGameBridge } from './gameBridge';
import { getGlobalTutorialsCompleted } from './persistence';

/** Apply the testing shortcut before React renders, so the title never appears. */
export function startRunFromUrl(search: string): boolean {
    const bridge = useGameBridge.getState();
    const params = new URLSearchParams(search);
    if (params.get('quickstart') !== '1' || bridge.gameState.phase !== 'init') {
        return false;
    }
    bridge.dispatchSync({
        type: 'start_game',
        cityId: 'las_vegas',
        gamblerId: 'default',
        seed: Date.now(),
        skipAtlanticTutorials: true,
        globalTutorialsCompleted: getGlobalTutorialsCompleted(),
    });
    if (params.get('skippack') === '1') {
        // Resolve the opening reward before rendering, keeping the ordinary
        // engine rules and giving mechanics tests an already-dealt round.
        bridge.dispatchSync({ type: 'skip_pack' });
        bridge.dispatchSync({ type: 'finish_pack' });
        bridge.dispatchSync({ type: 'deal' });
    }
    return true;
}
