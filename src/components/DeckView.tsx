import React from 'react';
import type { Card as CardType, Suit, Rank } from '../types';
import type { DeckProbabilities } from '../engine/GameState';
import styles from './DeckView.module.css';

interface DeckViewProps {
  probabilities: DeckProbabilities;
  activeCards: CardType[];
  onClose: () => void;
  mode?: 'view' | 'remove' | 'enhance';
  onRemoveCard?: (cardId: string) => void;
  onDeductRemovalCost?: () => void;
  onEnhanceCard?: (cardId: string, effect: { type: 'chip' | 'mult' | 'score', value: number }) => void;
  removalCount?: number;
  comps?: number;
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
    comps = 0 
}) => {
    
    const [selectedEnhancement, setSelectedEnhancement] = React.useState<{ type: 'chip' | 'mult' | 'score', value: number } | null>(null);
    const [destroyingIds, setDestroyingIds] = React.useState<Set<string>>(new Set());

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
            return 2 + (removalCount * 2);
        }
        if (mode === 'enhance' && selectedEnhancement) {
            let level = 0;
            if (selectedEnhancement.type === 'score') level = [-1, -2, -3, -4].indexOf(-selectedEnhancement.value);
            if (selectedEnhancement.type === 'mult') level = [1, 2, 3, 4].indexOf(selectedEnhancement.value);
            if (selectedEnhancement.type === 'chip') level = [5, 10, 20, 50].indexOf(selectedEnhancement.value);
            return [1, 3, 5, 7][level] || 0;
        }
        return 0;
    }, [mode, removalCount, selectedEnhancement]);
    
    // In the probabilistic system, weights are used. 
    // We'll calculate percentages for display.
    const suitTotal = (probabilities?.suits.hearts ?? 0) + (probabilities?.suits.diamonds ?? 0) + (probabilities?.suits.clubs ?? 0) + (probabilities?.suits.spades ?? 0) || 1;
    const rankTotal = (probabilities?.ranks.ace ?? 0) + (probabilities?.ranks.face ?? 0) + (probabilities?.ranks.upper ?? 0) + (probabilities?.ranks.lower ?? 0) || 1;

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
            content = `$${card.chips}`;
        } else if (card.type === 'mult') {
            style = { color: '#facc15', WebkitTextStroke: '2px #854d0e', paintOrder: 'stroke fill' } as React.CSSProperties;
            content = `x${card.mult}`;
        } else if (card.type === 'score') {
            style = { color: '#c084fc', WebkitTextStroke: '2px #6b21a8', paintOrder: 'stroke fill' } as React.CSSProperties;
            content = `${card.chips}`;
        } else if (card.suit === 'hearts' || card.suit === 'diamonds') {
            style = { color: '#e74c3c' };
        }

        const isDestroying = destroyingIds.has(card.id);
        const isSelectable = (mode === 'remove') || (mode === 'enhance' && selectedEnhancement && comps >= currentCost);

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
                           card.specialEffect.type === 'chip' ? { color: '#4ade80', borderColor: '#166534' } as React.CSSProperties :
                           card.specialEffect.type === 'mult' ? { color: '#facc15', borderColor: '#854d0e' } as React.CSSProperties :
                           card.specialEffect.type === 'score' ? { color: '#c084fc', borderColor: '#6b21a8' } as React.CSSProperties :
                           undefined
                         }
                    >
                        {card.specialEffect.value}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2 className={styles.title}>
                    <div className={styles.titleSpacer} />
                    <span className={styles.titleText}>
                        {mode === 'remove' ? 'Remove In-Play Cards' : 
                         mode === 'enhance' ? 'Enhance Cards' :
                         'Deck Probabilities'}
                    </span>
                    <div className={styles.titleSide}>
                        {mode !== 'view' && (mode === 'remove' || (mode === 'enhance' && selectedEnhancement)) && (
                            <div className={styles.costIndicator} style={comps < currentCost ? { color: '#ff4d4d', borderColor: '#ff4d4d' } : {}}>
                                Cost ₵{currentCost}
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
                        {(probabilities?.specialWeights?.length > 0 || (probabilities?.specialChance ?? 0) > 0) && (
                            <div className={styles.probSection}>
                                <h3 className={styles.sectionHeader}>Special Cards</h3>
                                <div className={styles.probList}>
                                    {probabilities.specialWeights?.map((sw, idx) => {
                                        const label = sw.type === 'chip' ? `$${sw.value}` :
                                                      sw.type === 'mult' ? `x${sw.value}` :
                                                      `Score ${sw.value}`;
                                        const color = sw.type === 'chip' ? '#4ade80' :
                                                      sw.type === 'mult' ? '#facc15' :
                                                      '#c084fc';
                                        return renderProbabilityBar(label, sw.chance * 100, 100, color);
                                    })}
                                    {(probabilities?.specialChance ?? 0) > 0 && 
                                        renderProbabilityBar('Generic', (probabilities?.specialChance ?? 0) * 100, 100, '#9b59b6')
                                    }
                                </div>
                            </div>
                        )}

                        {/* In Play Cards */}
                        {activeCards.length > 0 && (
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
                            {[1, 2, 3, 4].map(val => (
                                <button
                                    key={`mult-${val}`}
                                    className={`${styles.effectButton} ${selectedEnhancement?.type === 'mult' && selectedEnhancement.value === val ? styles.selected : ''}`}
                                    onClick={() => setSelectedEnhancement({ type: 'mult', value: val })}
                                >
                                    x{val}
                                </button>
                            ))}
                        </div>

                        <div className={styles.effectRow}>
                            <div className={styles.effectLabel}>Chips</div>
                            {[5, 10, 20, 50].map(val => (
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

                <button className="close-x-btn" onClick={onClose}>×</button>
            </div>
        </div>
    );
};
