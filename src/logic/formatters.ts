
/** Visual values use color for negatives; signed text is for parsing and plain text. */
export function formatCash(value: number, includeNegativeSign = false): string {
    return `${includeNegativeSign && value < 0 ? '−' : ''}$${Math.abs(value).toLocaleString()}`;
}

/** Display a scoring multiplier as a percentage without floating-point noise. */
export function formatMultPercent(value: number, includeNegativeSign = false): string {
    return `${includeNegativeSign && value < 0 ? '−' : ''}${Number((Math.abs(value) * 100).toFixed(6))}%`;
}

export function formatChipMultiplier(value: number, includeNegativeSign = false): string {
    return formatMultPercent(value, includeNegativeSign);
}

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
        // Omit the base 100% when only the per-card bonus is relevant.
        base = formatChipMultiplier(mult);
    }

    if (multRun && multRun > 0) {
        const runStr = `${formatChipMultiplier(multRun)} / additional card`;
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
