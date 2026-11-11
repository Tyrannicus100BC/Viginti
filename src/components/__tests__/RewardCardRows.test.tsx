import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RewardCardRows } from '../RewardCardRows';
import { createRewardCard } from '../../logic/rewardCards';
import { RelicManager } from '../../logic/relics/manager';

const passives = RelicManager.getAllRelics().filter(relic => !relic.tableAction);
const inventory = passives.slice(0, 4).map(relic => ({ id: relic.id, state: {} }));

describe('DOM reward cards', () => {
    it.each(['cash', 'mult'])('shows the minus sign for %s drawbacks alongside deck rewards', stat => {
        const card = createRewardCard('Common', [
            { kind: 'raise', raiseId: `raise_v10_0_tradeoff_straight_mult_bust_${stat}~8~5` },
            { kind: 'deck', cardId: 'deck_v3_0_33' },
        ]);
        const markup = renderToStaticMarkup(<RewardCardRows card={card} />);
        expect(markup).toContain('Cash Cards');
        expect(markup).toContain('Far More');
        expect(markup).toMatch(stat === 'cash' ? />-\$5<\/strong>/ : />-5%<\/strong>/);
    });

    it('shows raise, deck, and named effect rows together', () => {
        const effect = passives[4];
        const card = createRewardCard('Uncommon', [
            { kind: 'raise', raiseId: 'raise_v10_0_simple_pair_cash~2' },
            { kind: 'deck', cardId: 'deck_v3_0_0' },
            { kind: 'relic', relicId: effect.id },
        ]);
        const markup = renderToStaticMarkup(<RewardCardRows card={card} />);
        expect(markup).toContain('Pair');
        expect(markup).toContain('$2');
        expect(markup).toContain('Hearts');
        expect(markup).toContain(`data-reward-effect="${effect.id}"`);
        expect(markup).toContain(effect.name);
        expect(markup).not.toContain('Replaces');
    });

    it('warns about exactly the oldest active effect when all four slots are occupied', () => {
        const card = createRewardCard('Common', [
            { kind: 'deck', cardId: 'deck_v3_0_0' },
            { kind: 'relic', relicId: passives[4].id },
        ]);
        const markup = renderToStaticMarkup(<RewardCardRows card={card} inventory={inventory} />);
        expect(markup).toContain(`Replaces ${passives[0].name}`);
        expect(markup).not.toContain(`Replaces ${passives[1].name}`);
    });

    it('does not show a replacement warning for permanent rewards at capacity', () => {
        const card = createRewardCard('Common', [
            { kind: 'raise', raiseId: 'raise_v10_0_simple_pair_cash~2' },
            { kind: 'deck', cardId: 'deck_v3_0_0' },
        ]);
        const markup = renderToStaticMarkup(<RewardCardRows card={card} inventory={inventory} />);
        expect(markup).not.toContain('Replaces');
    });
});
