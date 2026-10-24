import { formatCash, formatChipMultiplier } from '../logic/formatters';
import { ENHANCE_CASH_COSTS, getRemovalCashCost } from '../engine/economy';
import React from 'react';
import type { Card as CardType, Suit } from '../types';
import type { DeckProbabilities } from '../engine/GameState';
import { getSpecialWeights, SPECIAL_COLORS, SPECIAL_LABELS, SPECIAL_STRENGTHS } from '../logic/specialCards';
import styles from './DeckView.module.css';
import panelStyles from './ReferencePanel.module.css';

interface DeckViewProps {
  probabilities: DeckProbabilities;
  activeCards: CardType[];
  onClose: () => void;
  mode?: 'view' | 'remove' | 'enhance';
  onRemoveCard?: (cardId: string) => void;
  onDeductRemovalCost?: () => void;
  onEnhanceCard?: (cardId: string, effect: { type: 'chip' | 'mult' | 'score', value: number }) => void;
  removalCount?: number;
  cash?: number;
  docked?: boolean;
}

const SUITS_MAP: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
};

const SUIT_ORDER: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

export const DeckView: React.FC<DeckViewProps> = ({ 
    probabilities, 
    activeCards, 
    onClose, 
    mode = 'view', 
    onRemoveCard, 
    onDeductRemovalCost, 
    onEnhanceCard, 
    removalCount = 0, 
    cash = 0,
    docked = false
}) => {
    
    const [selectedEnhancement, setSelectedEnhancement] = React.useState<{ type: 'chip' | 'mult' | 'score', value: number } | null>(null);
    const [destroyingIds, setDestroyingIds] = React.useState<Set<string>>(new Set());
    const isDocked = docked && mode === 'view';

    React.useEffect(() => {
        if (isDocked) return;
        const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', close);
        return () => window.removeEventListener('keydown', close);
    }, [onClose, isDocked]);

    const handleRemove = (id: string) => {
        if (destroyingIds.has(id)) return;
        setDestroyingIds(prev => new Set(prev).add(id));
        onDeductRemovalCost?.();
        setTimeout(() => {
            onRemoveCard?.(id);
            setDestroyingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }, 300);
    };

    const currentCost = React.useMemo(() => {
        if (mode === 'remove') {
            return getRemovalCashCost(removalCount);
        }
        if (mode === 'enhance' && selectedEnhancement) {
            const level = SPECIAL_STRENGTHS[selectedEnhancement.type].indexOf(selectedEnhancement.value);
            return ENHANCE_CASH_COSTS[level] || 0;
        }
        return 0;
    }, [mode, removalCount, selectedEnhancement]);
    
    // In the probabilistic system, weights are used. 
    // We'll calculate percentages for display.
    const suitTotal = (probabilities?.suits.hearts ?? 0) + (probabilities?.suits.diamonds ?? 0) + (probabilities?.suits.clubs ?? 0) + (probabilities?.suits.spades ?? 0) || 1;
    const rankTotal = (probabilities?.ranks.ace ?? 0) + (probabilities?.ranks.face ?? 0) + (probabilities?.ranks.upper ?? 0) + (probabilities?.ranks.lower ?? 0) || 1;
    const specialWeights = getSpecialWeights(probabilities);

    const renderProbabilityBar = (label: string, weight: number, total: number, color?: string, icon?: string) => {
        const percent = Math.round((weight / total) * 100);
        return (
            <div className={styles.probRow} key={label}>
                <div className={styles.probLabel}>
                    {icon && <span className={styles.probIcon} style={{ color }}>{icon}</span>}
                    <span className={styles.probText}>{label}</span>
                </div>
                <div className={styles.probBarContainer}>
                    <div 
                        className={styles.probBar} 
                        style={{ width: `${percent}%`, backgroundColor: color || '#3498db' }}
                    />
                </div>
                <div className={styles.probPercent}>{percent}%</div>
            </div>
        );
    };

    const renderCard = (card: CardType, index: number) => {
        let style: React.CSSProperties = { color: '#2c3e50' };
        let content = `${card.rank}${SUITS_MAP[card.suit] || ''}`;

        if (card.type === 'chip') {
            style = { color: '#4ade80', WebkitTextStroke: '2px #166534', paintOrder: 'stroke fill' } as React.CSSProperties;
            content = formatCash(card.chips ?? 0);
        } else if (card.type === 'mult') {
            style = { color: '#facc15', WebkitTextStroke: '2px #854d0e', paintOrder: 'stroke fill' } as React.CSSProperties;
            content = formatChipMultiplier(card.mult ?? 0);
        } else if (card.type === 'score') {
            style = { color: '#c084fc', WebkitTextStroke: '2px #6b21a8', paintOrder: 'stroke fill' } as React.CSSProperties;
            content = `${card.chips}`;
        } else if (card.suit === 'hearts' || card.suit === 'diamonds') {
            style = { color: '#e74c3c' };
        }

        if (card.type === 'chip' && (card.chips ?? 0) < 0 || card.type === 'mult' && (card.mult ?? 0) < 0) {
            style = { color: '#ff4444', WebkitTextStroke: '2px #7f1d1d', paintOrder: 'stroke fill' } as React.CSSProperties;
        }
        const isDestroying = destroyingIds.has(card.id);
        const isSelectable = (mode === 'remove') || (mode === 'enhance' && selectedEnhancement && cash >= currentCost);

        return (
            <div 
                key={`${card.id}-${index}`}
                className={`${styles.miniCard} ${styles.dealt} ${isSelectable ? styles.selectable : ''} ${mode === 'remove' ? styles.removable : ''} ${isDestroying ? styles.destroying : ''}`}
                style={{ ...style, position: 'relative' }}
                onClick={() => {
                    if (mode === 'remove') {
                        handleRemove(card.id);
                    } else if (mode === 'enhance' && selectedEnhancement) {
                        onEnhanceCard?.(card.id, selectedEnhancement);
                    }
                }}
            >
                <div className={styles.miniCardContent}>
                    <span>{content}</span>
                </div>
                
                {card.specialEffect && (
                    <div 
                         className={styles.specialIndicator}
                         style={
                           card.specialEffect.type !== 'score' && card.specialEffect.value < 0 ? { color: '#ff4444', borderColor: '#7f1d1d' } :
                           card.specialEffect.type === 'chip' ? { color: '#4ade80', borderColor: '#166534' } as React.CSSProperties :
                           card.specialEffect.type === 'mult' ? { color: '#facc15', borderColor: '#854d0e' } as React.CSSProperties :
                           card.specialEffect.type === 'score' ? { color: '#c084fc', borderColor: '#6b21a8' } as React.CSSProperties :
                           undefined
                         }
                    >
                        {card.specialEffect.type === 'mult' ? formatChipMultiplier(card.specialEffect.value) : card.specialEffect.type === 'chip' ? Math.abs(card.specialEffect.value) : card.specialEffect.value}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={`${styles.overlay} ${mode === 'view' ? styles.viewOverlay : ''} ${isDocked ? `${panelStyles.docked} ${panelStyles.right}` : ''}`} onClick={isDocked ? event => event.stopPropagation() : onClose}>
            <section id="deck-probabilities-panel" className={`${styles.modal} ${mode === 'view' ? `${panelStyles.compact} ${styles.compactView}` : ''}`} role={isDocked ? 'complementary' : 'dialog'} aria-modal={isDocked ? undefined : true} aria-labelledby="deck-probabilities-title" onClick={e => e.stopPropagation()}>
                <h2 id="deck-probabilities-title" className={styles.title}>
                    <div className={styles.titleSpacer} />
                    <span className={styles.titleText}>
                        {mode === 'remove' ? 'Remove In-Play Cards' : 
                         mode === 'enhance' ? 'Enhance Cards' :
                         'Deck Probabilities'}
                    </span>
                    <div className={styles.titleSide}>
                        {mode !== 'view' && (mode === 'remove' || (mode === 'enhance' && selectedEnhancement)) && (
                            <div className={styles.costIndicator} style={cash < currentCost ? { color: '#ff4d4d', borderColor: '#ff4d4d' } : {}}>
                                Cost ${currentCost}
                            </div>
                        )}
                    </div>
                </h2>
                
                <div className={styles.scrollContent}>
                    <div className={styles.unifiedGrid}>
                        {/* Suit Probabilities */}
                        <div className={styles.probSection}>
                            <h3 className={styles.sectionHeader}>Suits</h3>
                            <div className={styles.probList}>
                                {SUIT_ORDER.map(suit => renderProbabilityBar(
                                    suit.charAt(0).toUpperCase() + suit.slice(1),
                                    probabilities?.suits[suit] ?? 0,
                                    suitTotal,
                                    (suit === 'hearts' || suit === 'diamonds') ? '#e74c3c' : '#fff',
                                    SUITS_MAP[suit]
                                ))}
                            </div>
                        </div>

                        {/* Rank Probabilities */}
                        <div className={styles.probSection}>
                            <h3 className={styles.sectionHeader}>Ranks</h3>
                            <div className={styles.probList}>
                                {renderProbabilityBar('Aces', probabilities?.ranks.ace ?? 0, rankTotal, '#f1c40f')}
                                {renderProbabilityBar('Face (10-K)', probabilities?.ranks.face ?? 0, rankTotal, '#e67e22')}
                                {renderProbabilityBar('Upper (6-9)', probabilities?.ranks.upper ?? 0, rankTotal, '#3498db')}
                                {renderProbabilityBar('Lower (2-5)', probabilities?.ranks.lower ?? 0, rankTotal, '#95a5a6')}
                            </div>
                        </div>

                        {/* Special Cards */}
                        {specialWeights.length > 0 && (
                            <div className={styles.probSection}>
                                <h3 className={styles.sectionHeader}>Special Cards</h3>
                                <div className={styles.probList}>
                                    {specialWeights.map(weight => renderProbabilityBar(
                                        SPECIAL_LABELS[weight.type], weight.chance * 100, 100, SPECIAL_COLORS[weight.type]
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Card selection is only needed when removing or enhancing cards. */}
                        {mode !== 'view' && activeCards.length > 0 && (
                            <div className={styles.probSection}>
                                <h3 className={styles.sectionHeader}>Currently In Play</h3>
                                <div className={styles.cardList}>
                                    {activeCards.map((card, i) => renderCard(card, i))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {mode === 'enhance' && (
                    <div className={styles.enhancementPanel}>
                        <div className={styles.effectRow}>
                            <div className={styles.effectLabel}>Score</div>
                            {[-1, -2, -3, -4].map(val => (
                                <button
                                    key={`score-${val}`}
                                    className={`${styles.effectButton} ${selectedEnhancement?.type === 'score' && selectedEnhancement.value === Math.abs(val) ? styles.selected : ''}`}
                                    onClick={() => setSelectedEnhancement({ type: 'score', value: Math.abs(val) })}
                                >
                                    {val}
                                </button>
                            ))}
                        </div>

                        <div className={styles.effectRow}>
                            <div className={styles.effectLabel}>Mult</div>
                            {SPECIAL_STRENGTHS.mult.map(val => (
                                <button
                                    key={`mult-${val}`}
                                    className={`${styles.effectButton} ${selectedEnhancement?.type === 'mult' && selectedEnhancement.value === val ? styles.selected : ''}`}
                                    onClick={() => setSelectedEnhancement({ type: 'mult', value: val })}
                                >
                                    {formatChipMultiplier(val)}
                                </button>
                            ))}
                        </div>

                        <div className={styles.effectRow}>
                            <div className={styles.effectLabel}>Chips</div>
                            {SPECIAL_STRENGTHS.chip.map(val => (
                                <button
                                    key={`chip-${val}`}
                                    className={`${styles.effectButton} ${selectedEnhancement?.type === 'chip' && selectedEnhancement.value === val ? styles.selected : ''}`}
                                    onClick={() => setSelectedEnhancement({ type: 'chip', value: val })}
                                >
                                    ${val}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <button className="close-x-btn" aria-label="Close deck probabilities" autoFocus={!isDocked} onClick={onClose}>×</button>
            </section>
        </div>
    );
};
