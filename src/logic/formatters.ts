
export function formatHandChips(chips: number, chipCards: boolean = false): string {
    if (chipCards) {
        if (chips > 0) {
            return `Cards + $${chips}`;
        } else {
            return 'Cards';
        }
    } else {
        if (chips > 0) {
            return `+$${chips}`;
        }
        return ''; // Or should it be $0? Usually if it's 0 it might not be shown, or dealt with elsewhere.
    }
}

export function formatHandMult(mult: number): string {
    if (mult === 0) return ''; 
    // Format to remove trailing .0 if integer, but keep decimal if present
    // Actually fixed(1) is standard?
    // Previous code: `x${mult.toFixed(1)}`
    // Let's stick to what was there or make it cleaner (e.g. 1.5, 2)
    // User said: "which should also include the `x` string prefix"
    const val = Number.isInteger(mult) ? mult.toString() : mult.toFixed(1).replace(/\.0$/, '');
    return `x${val}`; 
}

export function formatHandScore(chips: number, mult: number, chipCards: boolean = false, separator: string = ' and '): string {
    const chipStr = formatHandChips(chips, chipCards);
    const multStr = formatHandMult(mult);

    if (chipStr && multStr) {
        return `${chipStr}${separator}${multStr}`;
    }
    return chipStr || multStr;
}
