import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ScoreContribution, ScoringDetail } from '../types';
import { formatCash, formatChipMultiplier } from '../logic/formatters';
import styles from './ScoreBreakdown.module.css';

const SOURCE_ORDER: Record<string, number> = { Base: 0, Raises: 1, 'Card Sum': 3 };

export function ScoreBreakdownDetails({ row }: { row: ScoringDetail }) {
    // Group repeated pair payouts and repeated Raises without losing their sums.
    const grouped = new Map<string, ScoreContribution>();
    const entries = row.breakdown?.length ? row.breakdown : [{ label: 'Recorded score', chips: row.chips, multiplier: row.multiplier }];
    for (const entry of entries) {
        const label = entry.label === 'Card sum' ? 'Card Sum'
            : !entry.sourceRelicId && entry.label.startsWith('Base ') ? 'Base'
            : !entry.sourceRelicId && /Raises?$/.test(entry.label) ? 'Raises' : entry.label;
        const key = JSON.stringify([label, entry.sourceRelicId]);
        const previous = grouped.get(key);
        grouped.set(key, previous ? { ...previous, chips: previous.chips + entry.chips,
            multiplier: Number((previous.multiplier + entry.multiplier).toFixed(8)) }
            : { ...entry, label });
    }
    return <table className={styles.breakdown}>
            <colgroup><col className={styles.nameColumn} /><col className={styles.cashColumn} /><col /></colgroup>
            <thead><tr><th scope="col">Breakdown</th><th scope="col">Cash</th><th scope="col">Mult</th></tr></thead>
            <tbody>{[...grouped.values()]
                .sort((a, b) => (SOURCE_ORDER[a.label] ?? 2) - (SOURCE_ORDER[b.label] ?? 2))
                .map((entry, index) => <tr key={index}>
                <th scope="row">{entry.label + (row.count > 1 && (entry.label === 'Base' || entry.label === 'Raises') ? ` ×${row.count}` : '')}</th>
                <td className={entry.chips < 0 ? styles.negative : styles.cash}>{entry.chips ? formatCash(entry.chips, true) : '—'}</td>
                <td className={entry.multiplier < 0 ? styles.negative : styles.mult}>{entry.multiplier ? formatChipMultiplier(entry.multiplier, true) : '—'}</td>
            </tr>)}</tbody>
        </table>;
}

export function ScoreBreakdown({ row, anchor, id }: {
    row: ScoringDetail; anchor: HTMLElement; id: string;
}) {
    const popup = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ left: 0, top: 0, width: 0 });
    useLayoutEffect(() => {
        const place = () => {
            if (!popup.current) return;
            const rect = anchor.getBoundingClientRect();
            const [name, cash, mult] = [...anchor.children].map(column => column.getBoundingClientRect());
            // The hand is scaled with the game board; the portal uses screen
            // pixels. Copy its actual column bounds rather than estimating ratios.
            const border = getComputedStyle(popup.current);
            popup.current.style.width = `${rect.width}px`;
            popup.current.style.paddingLeft = `${Math.max(0, name.left - rect.left - parseFloat(border.borderLeftWidth))}px`;
            popup.current.style.paddingRight = `${Math.max(0, rect.right - mult.right - parseFloat(border.borderRightWidth))}px`;
            popup.current.style.setProperty('--score-name-width', `${cash.left - name.left}px`);
            popup.current.style.setProperty('--score-cash-width', `${mult.left - cash.left}px`);
            popup.current.style.setProperty('--score-cash-gap', `${mult.left - cash.right}px`);
            const size = popup.current.getBoundingClientRect();
            const gap = 8;
            // Prefer above the row, keeping the contributing cards unobscured.
            let top = rect.top - size.height - gap;
            if (top < gap) top = rect.bottom + gap;
            setPosition({ width: rect.width, left: Math.max(gap, Math.min(rect.left, window.innerWidth - size.width - gap)),
                top: Math.max(gap, Math.min(top, window.innerHeight - size.height - gap)) });
        };
        place();
        const observer = new ResizeObserver(place);
        observer.observe(anchor);
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [anchor, row]);
    return createPortal(<div ref={popup} id={id} role="tooltip" className={styles.tooltip} style={position}>
        <ScoreBreakdownDetails row={row} />
    </div>, document.body);
}
