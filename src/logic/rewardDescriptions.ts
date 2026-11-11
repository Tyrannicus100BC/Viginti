import { formatRaiseCash, formatRaiseMult, type RaiseHandTypeId, type RaiseModifier } from './handScoring';
import type { PackBenefit } from './packCards';

const RAISE_CONDITIONS: Record<RaiseHandTypeId, string> = {
    win: 'Beat the dealer without busting.',
    viginti: 'Win with exactly 21.',
    loss: 'Lose without busting.',
    bust: 'Exceed your bust limit.',
    pair: 'Two cards of the same rank.',
    straight: 'Two or more consecutive ranks.',
    flush: 'Two or more cards of the same suit.',
};

export function describeRaiseReward(effect: RaiseModifier): string {
    const amount = effect.chips || effect.mult;
    const value = effect.chips ? formatRaiseCash(Math.abs(amount)) : formatRaiseMult(Math.abs(amount));
    const unit = effect.handTypeId === 'pair' ? ' per pair'
        : effect.handTypeId === 'straight' || effect.handTypeId === 'flush' ? ' per card after the first' : '';
    return `${RAISE_CONDITIONS[effect.handTypeId]} ${amount < 0 ? 'Subtracts' : 'Adds'} ${value}${effect.chips ? '' : ' multiplier'}${unit} this run.`;
}

export function describeDeckReward(benefit: PackBenefit): string {
    const frequency = benefit.change.endsWith('fewer') ? 'less' : 'more';
    if (benefit.kind === 'special') {
        const details = {
            chip: 'Cash cards add cash when scored.',
            mult: 'Mult cards add to the round multiplier when scored.',
            score: 'Value cards lower your hand total toward 21.',
        };
        return `${details[benefit.type]} Draw them ${frequency} often this run.`;
    }
    const target = benefit.kind === 'suit' ? benefit.target : {
        ace: 'Aces (1 or 11)', face: '10s, Jacks, Queens, and Kings', upper: '6s, 7s, 8s, and 9s', lower: '2s, 3s, 4s, and 5s',
    }[benefit.target];
    return `Draw ${target} ${frequency} often for the rest of this run.`;
}
