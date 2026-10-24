import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RaisePreviewCard } from '../RaiseCard';
import { getRaise } from '../../logic/handScoring';

// Pack choices and the gallery share this renderer: outcome-specific rolls must
// retain their own labels and icons rather than appearing as Win/Lose.
describe('outcome-specific Raise cards', () => {
    it.each([
        ['raise_v8_0_simple_viginti_cash~4', 'Viginti', '/hands/viginti.svg'],
        ['raise_v8_0_tradeoff_pair_cash_bust_mult~11~5', 'Bust', '/hands/bust.svg'],
        ['raise_v8_0_tradeoff_pair_cash_viginti_mult~11~3', 'Viginti', '/hands/viginti.svg'],
    ])('renders the outcome label and icon for %s', (id, label, icon) => {
        const markup = renderToStaticMarkup(<RaisePreviewCard raise={getRaise(id)!} />);
        expect(markup).toContain(` ${label}</span>`);
        expect(markup).toContain(`src="${icon}"`);
        expect(markup).toContain(id.includes('simple') ? '$4' : id.includes('bust') ? '5%' : '3%');
    });
});
