import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PACKS, type PackId } from '../logic/packs';
import { getRelicRarityFrameColor } from '../logic/relics/rarity';
import { useGameBridge } from '../store/gameBridge';
import { RaisePackArt } from './RaisePackArt';
import styles from './DebugPacks.module.css';

export function DebugPacks({ onClose }: { onClose: () => void }) {
    const processing = useGameBridge(state => state.isProcessingEvents);
    const [error, setError] = useState<string | null>(null);
    const selecting = useRef(false);
    const dialog = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
        return () => previous?.focus({ preventScroll: true });
    }, []);

    const open = async (packId: PackId) => {
        if (selecting.current || processing) return;
        selecting.current = true;
        setError(null);
        try {
            await useGameBridge.getState().dispatch({ type: 'debug_open_pack', packId });
            if (useGameBridge.getState().gameState.debugPackReturn) onClose();
            else setError('Finish the current pack or animation before opening another.');
        } catch {
            setError('The pack could not be opened. Try again.');
        } finally {
            selecting.current = false;
        }
    };

    return <div className={styles.overlay} onClick={event => { event.stopPropagation(); onClose(); }}>
        <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true"
            aria-labelledby="debug-packs-title" aria-describedby="debug-packs-description"
            onClick={event => event.stopPropagation()}
            onKeyDown={event => {
                if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
                if (event.key !== 'Tab') return;
                const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
                const first = buttons[0], last = buttons[buttons.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }}>
            <header className={styles.header}>
                <div>
                    <h2 id="debug-packs-title">Packs <span>(Debug)</span></h2>
                    <p id="debug-packs-description">Open any pack, then return to your current round.</p>
                </div>
                <button className={styles.close} aria-label="Close debug packs" onClick={onClose}>×</button>
            </header>
            <div className={styles.families}>
                {(['raise', 'deck', 'relic'] as const).map(family => <section key={family}>
                    <h3>{family === 'raise' ? 'Raises' : family === 'deck' ? 'Deck Upgrades' : 'Relics'}</h3>
                    <div className={styles.packs}>
                        {PACKS.filter(pack => pack.family === family).map(pack => <button
                            key={pack.id} type="button" disabled={processing}
                            className={styles.pack} aria-label={`Open ${pack.name} (debug)`}
                            style={{ '--pack-color': getRelicRarityFrameColor(pack.rarity) } as CSSProperties}
                            onClick={() => void open(pack.id)}>
                            <RaisePackArt family={family} />
                            <strong>{pack.name}</strong>
                            <span>Choose {pack.pickCount} of {pack.offerCount}</span>
                        </button>)}
                    </div>
                </section>)}
            </div>
            {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
    </div>;
}
