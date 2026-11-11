import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './RewardRowTooltip.module.css';

/** A short explanation for a reward row, separate from the reference panels. */
export function RewardRowTooltip({ description, className, children }: {
    description: string;
    className: string;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ left: 0, top: 0 });
    const row = useRef<HTMLSpanElement>(null);
    const popup = useRef<HTMLSpanElement>(null);
    const id = useId();

    useEffect(() => {
        const button = row.current?.closest('button');
        if (!button) return;
        const focus = () => {
            if (button.querySelector('[data-reward-tooltip], [data-reward-effect]') === row.current) setOpen(true);
        };
        const blur = () => setOpen(false);
        const mouseover = (event: MouseEvent) => {
            if (event.target instanceof Node && !row.current?.contains(event.target)) setOpen(false);
        };
        button.addEventListener('focus', focus);
        button.addEventListener('blur', blur);
        button.addEventListener('mouseover', mouseover);
        return () => {
            button.removeEventListener('focus', focus);
            button.removeEventListener('blur', blur);
            button.removeEventListener('mouseover', mouseover);
        };
    }, []);

    useLayoutEffect(() => {
        if (!open || !row.current || !popup.current) return;
        const reposition = () => {
            if (!row.current || !popup.current) return;
            const anchor = row.current.getBoundingClientRect();
            const tip = popup.current.getBoundingClientRect();
            setPosition({
                left: Math.max(8, Math.min(anchor.left, window.innerWidth - tip.width - 8)),
                top: Math.max(8, anchor.bottom + tip.height + 16 <= window.innerHeight
                    ? anchor.bottom + 8 : anchor.top - tip.height - 8),
            });
        };
        reposition();
        const close = () => setOpen(false);
        const keydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                close();
            }
        };
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('keydown', keydown, true);
        return () => {
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('keydown', keydown, true);
        };
    }, [open, description]);

    return <>
        <span ref={row} className={`${className} ${styles.row}`} data-reward-tooltip={description}
            aria-description={description} aria-describedby={open ? id : undefined}
            onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
            {children}
        </span>
        {open && createPortal(<span ref={popup} id={id} role="tooltip" className={styles.tooltip}
            style={position}>{description}</span>, document.body)}
    </>;
}
