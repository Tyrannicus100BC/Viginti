
export function formatHandChips(chips: number, chipCards: boolean = false, useMarkdown: boolean = false, chipRun?: number): string {
    let parts: string[] = [];

    if (chipCards) {
        parts.push(useMarkdown ? '<Cards>' : 'Cards');
    }

    if (chips > 0) {
        parts.push(`$${chips}`);
    } else if (chipCards && parts.length === 0) {
        // Should not happen if chipCards is true, but safe fallback
        parts.push(useMarkdown ? '<Cards>' : 'Cards');
    }

    // Join base parts with " + " if both exist
    let base = parts.join(' + ');
    
    // If we have chips via chipCards but chips param is 0, we still have "<Cards>"
    // If we have just chips, we have "$chips"
    // If we have nothing (chips=0, chipCards=false), string is empty so far.

    if (chipRun && chipRun > 0) {
        const runStr = useMarkdown 
            ? `<$${chipRun} / additional card>` 
            : `$${chipRun} / additional card`;
        
        if (base) {
            return `${base} + ${runStr}`;
        }
        return runStr;
    }

    if (base) return base;
    return ''; // chips 0, no cards, no run
}

export function formatHandMult(mult: number, multRun?: number, useMarkdown: boolean = false): string {
    let base = '';
    if (mult > 0 && !(mult === 1 && multRun)) { 
        // Hide x1 if we have a run component, to keep it clean like internal descriptions? 
        // Or should we show x1?
        // User's example "Longest [Rank Run] earns {x${per_card_mult} / additional card}" did not show x1.
        // So let's hide x1 if multRun is present.
        const val = Number.isInteger(mult) ? mult.toString() : mult.toFixed(1).replace(/\.0$/, '');
        base = `x${val}`;
    }

    if (multRun && multRun > 0) {
        const val = Number.isInteger(multRun) ? multRun.toString() : multRun.toFixed(1).replace(/\.0$/, '');
        const runStr = `x${val} / additional card`;
        const formattedRun = useMarkdown ? `{${runStr}}` : runStr;

        if (base) {
            return `${base} + ${formattedRun}`;
        }
        return formattedRun;
    }

    if (base) return base;
    return '';
}

export function formatHandScore(chips: number, mult: number, chipCards: boolean = false, separator: string = '\u00a0\u00a0', useMarkdown: boolean = false, chipRun?: number, multRun?: number): string {
    const chipStr = formatHandChips(chips, chipCards, useMarkdown, chipRun);
    const multStr = formatHandMult(mult, multRun, useMarkdown);

    if (chipStr && multStr) {
        return `${chipStr}${separator}${multStr}`;
    }
    return chipStr || multStr;
}
