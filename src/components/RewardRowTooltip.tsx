import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './RewardRowTooltip.module.css';
import tooltipStyles from './RelicTooltip.module.css';

/** Shared, viewport-aware popover for every line on a reward card. */
export function RewardRowTooltip({ description, title, icon, subtitle, content, effectId, className, children }: {
    description: string;
    title?: string;
    icon?: ReactNode;
    subtitle?: string;
    content?: ReactNode;
    effectId?: string;
    className: string;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ left: 0, top: 0 });
    const row = useRef<HTMLSpanElement>(null);
    const popup = useRef<HTMLDivElement>(null);
    const id = useId();

    useEffect(() => {
        const button = row.current?.closest<HTMLElement>('button, [data-reward-preview]');
        if (!button) return;
        const focus = () => {
            if (button.matches(':focus-visible') && button.querySelector('[data-reward-tooltip], [data-reward-effect]') === row.current) setOpen(true);
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
                top: Math.max(8, Math.min(window.innerHeight - tip.height - 8,
                    anchor.bottom + tip.height + 16 <= window.innerHeight
                        ? anchor.bottom + 8 : anchor.top - tip.height - 8)),
            });
        };
        reposition();
        const observer = new ResizeObserver(reposition);
        observer.observe(popup.current);
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
            observer.disconnect();
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('keydown', keydown, true);
        };
    }, [open, description]);

    return <>
        <span ref={row} className={`${className} ${styles.row}`} data-reward-tooltip={effectId ? undefined : description} data-reward-effect={effectId}
            aria-description={description} aria-describedby={open ? id : undefined}
            onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
            {children}
        </span>
        {open && createPortal(<div ref={popup} id={id} role="tooltip" className={styles.tooltip}
            style={position}>{content ?? <div className={`${tooltipStyles.container} ${tooltipStyles.flexible}`}>
                <div className={tooltipStyles.header}>
                    <span className={tooltipStyles.iconContainer}>{icon}</span>
                    <div className={tooltipStyles.titleBlock}>
                        <div className={tooltipStyles.title}>{title}</div>
                        <div className={tooltipStyles.rarity}>{subtitle}</div>
                    </div>
                </div>
                <div className={tooltipStyles.content}>
                    <div className={tooltipStyles.description}>{description}</div>
                </div>
            </div>}</div>, document.body)}
    </>;
}
