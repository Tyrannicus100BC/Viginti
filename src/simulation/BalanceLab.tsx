import { useEffect, useRef, useState } from 'react';
import { BUILD_PRESETS, DEFAULT_CONFIG, type Comparison, type Distribution, type Example, type LabConfig, type LabReport, type RoundView, type WorkerReply } from './model';
import { currentRaiseTarget, getTreatments, PASSIVE_RELICS, validateConfig } from './runner';
import { HAND_TYPES } from '../logic/handScoring';
import { SMALL_UPGRADE_UNITS } from '../logic/upgradeTuning';
import { parseReport } from './reports';
import styles from './BalanceLab.module.css';

const money = (value: number, signed = false) => `${value < 0 ? '−' : signed && value > 0 ? '+' : ''}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

function Histogram({ distribution, label }: { distribution: Distribution; label: string }) {
    const peak = Math.max(1, ...distribution.histogram.map(bin => bin.count));
    return <div className={styles.histogram}>
        <div className={styles.chartLabel}>{label}<span>{number(distribution.count)} trials</span></div>
        <svg viewBox="0 0 600 136" role="img" aria-label={`${label}, from ${money(distribution.min)} to ${money(distribution.max)}`}>
            {[32, 64, 96, 128].map(y => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="currentColor" opacity=".08" />)}
            {distribution.histogram.map((bin, index, bins) => {
                const height = bin.count / peak * 116;
                return <rect key={index} x={index * 600 / bins.length + 2} y={128 - height} width={600 / bins.length - 4} height={Math.max(height, 1)} rx="3">
                    <title>{money(bin.low)} to {money(bin.high)}: {bin.count} trials</title>
                </rect>;
            })}
        </svg>
        <div className={styles.chartAxis}><span>{money(distribution.min)}</span><span>Median {money(distribution.median)}</span><span>{money(distribution.max)}</span></div>
    </div>;
}

function MiniCards({ cards }: { cards: RoundView['dealer'] }) {
    return <div className={styles.cards}>{cards.length ? cards.map(card => <span key={card.id} className={`${styles.card} ${card.suit === 'hearts' || card.suit === 'diamonds' ? styles.redCard : ''}`}>
        {card.type === 'chip' ? `$${card.chips}` : card.type === 'mult' ? `${(card.mult ?? 0) * 100}%` : card.type === 'score' ? `−${card.chips}`
            : <>{card.rank}<small>{{ hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[card.suit]}</small></>}
    </span>) : <span className={styles.muted}>Empty</span>}</div>;
}

function RoundDetail({ round, title }: { round: RoundView; title: string }) {
    return <div className={styles.round}>
        <div className={styles.roundTitle}><span>{title}</span><strong>{money(round.payout)}</strong></div>
        <div className={styles.pot}>{money(round.chips)} <span>×</span> {percent(round.mult)}</div>
        <div className={styles.dealer}><span>Dealer</span><MiniCards cards={round.dealer} /></div>
        {round.hands.map((hand, index) => <div className={styles.hand} key={index}>
            <div className={styles.handHeading}><span>{['Left', 'Center', 'Right'][index]} · {hand.value}</span><b className={hand.outcome === 'win' ? styles.positive : hand.outcome === 'bust' || hand.outcome === 'loss' ? styles.negative : ''}>{hand.outcome}</b></div>
            <MiniCards cards={hand.cards} />
            {hand.criteria.map((criterion, row) => <div key={row} className={styles.criterion}><span>{criterion.name}</span><span className={criterion.chips < 0 || criterion.mult < 0 ? styles.negative : ''}>{money(criterion.chips, true)} <i> / </i> {criterion.mult >= 0 ? '+' : '−'}{percent(Math.abs(criterion.mult))}</span></div>)}
        </div>)}
        <details className={styles.decisions}><summary>Bot decisions ({round.decisions.length})</summary><ol>{round.decisions.map((decision, index) => <li key={index}>{decision}</li>)}</ol></details>
    </div>;
}

function ExampleInspector({ comparison }: { comparison: Comparison }) {
    const [kind, setKind] = useState<keyof Comparison['examples']>('first');
    const [roundIndex, setRoundIndex] = useState(0);
    const example: Example = comparison.examples[kind];
    const index = Math.min(roundIndex, example.baseline.length - 1);
    return <div className={styles.inspector}>
        <div className={styles.sectionHeader}><div><h3>Inspect a trial</h3><p>Trial {example.trial} · mean round difference <strong>{money(example.delta, true)}</strong></p></div>
            <div className={styles.segmented}>{(['first', 'best', 'worst'] as const).map(value => <button key={value} aria-pressed={value === kind} onClick={() => { setKind(value); setRoundIndex(0); }}>{value === 'first' ? 'First' : value === 'best' ? 'Largest lift' : 'Smallest lift'}</button>)}</div>
        </div>
        {example.baseline.length > 1 && <label className={styles.roundSelect}>Round <select value={index} onChange={event => setRoundIndex(Number(event.target.value))}>{example.baseline.map((_, i) => <option key={i} value={i}>{i + 1} of {example.baseline.length}</option>)}</select><span>Relic state carries between rounds.</span></label>}
        <div className={styles.roundPair}><RoundDetail round={example.baseline[index]} title="Baseline" /><RoundDetail round={example.treatment[index]} title={comparison.name} /></div>
    </div>;
}

function download(report: LabReport, format: 'json' | 'csv') {
    const csvCell = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
    const contents = format === 'json' ? JSON.stringify(report, null, 2) : [
        ['Upgrade', 'Experiment', 'Build', 'Bot', 'Seed', 'Trials', 'Horizon', 'Baseline mean', 'Payout mean', 'Mean delta', 'Delta 95% half-width', 'Delta p10', 'Delta median', 'Delta p90', 'Triggers per round', 'Value per trigger'],
        ...report.comparisons.map(row => [row.name, report.config.experiment, report.config.preset, report.config.bot, report.config.seed, report.config.trials,
            report.config.experiment === 'raises' ? 1 : report.config.horizon, report.baseline.mean, row.payout.mean, row.delta.mean, row.delta.ci95, row.delta.p10, row.delta.median, row.delta.p90, row.triggerRate ?? '', row.perTrigger ?? '']),
    ].map(row => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([contents], { type: format === 'json' ? 'application/json' : 'text/csv' }));
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = `viginti-${report.config.experiment}-seed-${report.config.seed}.${format}`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ResultView({ report, pinned, onPin }: { report: LabReport; pinned: LabReport | null; onPin: () => void }) {
    const [selected, setSelected] = useState(report.comparisons[0].id);
    const [sort, setSort] = useState('value');
    const [query, setQuery] = useState('');
    const rows = report.comparisons.filter(row => row.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) =>
        sort === 'name' ? a.name.localeCompare(b.name) : sort === 'frequency' ? (b.triggerRate ?? b.betterRate) - (a.triggerRate ?? a.betterRate) : b.delta.mean - a.delta.mean);
    const comparison = report.comparisons.find(row => row.id === selected) ?? rows[0];
    const matchedPinned = pinned?.config.experiment === report.config.experiment ? pinned : null;
    const preset = BUILD_PRESETS.find(build => build.id === report.config.preset)!;
    const isRaises = report.config.experiment === 'raises';
    return <>
        <div className={styles.resultHeading}><div><span className={styles.eyebrow}>COMPLETED EXPERIMENT</span><h2>{isRaises ? 'What is a Raise worth?' : report.config.experiment === 'relics' ? 'The value of a relic' : 'A different kind of deck'}</h2>
            <p>{number(report.config.trials)} matched trials · {preset.name} · seed {report.config.seed} · {(report.elapsedMs / 1000).toFixed(1)}s</p></div>
            <div className={styles.exportButtons}><button onClick={onPin}>{pinned === report ? '✓ Pinned' : 'Pin result'}</button><button onClick={() => download(report, 'csv')}>CSV ↓</button><button onClick={() => download(report, 'json')}>JSON ↓</button></div>
        </div>
        <div className={styles.metrics}>
            <div><span>Baseline payout / round</span><strong>{money(report.baseline.mean)}</strong><small>95% CI ±{money(report.baseline.ci95)}</small></div>
            <div><span>Chips before multiplier</span><strong>{money(report.meanChips)}</strong><small>Mean baseline round</small></div>
            <div><span>Round multiplier</span><strong>{percent(report.meanMult)}</strong><small>Includes the base 100%</small></div>
            <div><span>Hand bust rate</span><strong>{percent(report.bustRate)}</strong><small>{number(report.roundsPlayed)} rounds played in total</small></div>
        </div>
        <div className={styles.methodNote}><b>{isRaises ? 'Same hands. One extra Raise.' : `${report.config.horizon} rounds per trial. Strategy can adapt.`}</b> {isRaises
            ? 'Each completed round is rescored through the game engine. Decisions and cards stay fixed; this isolates direct scoring value.'
            : 'Each upgrade gets the same starting build and matched random streams. Relic state carries across rounds. Rewards and ante progression are held out.'}</div>
        {matchedPinned && pinned !== report && <div className={styles.pinNote}>Comparing with pinned {BUILD_PRESETS.find(build => build.id === matchedPinned.config.preset)?.name} · seed {matchedPinned.config.seed} · {number(matchedPinned.config.trials)} trials. The “Pinned Δ” column shows its measured lift; different builds and bots are separate contexts.</div>}
        <div className={styles.exploration}>
            <section className={styles.panel}>
                <div className={styles.tableToolbar}><h3>Upgrade comparison <span>{rows.length}</span></h3><div><input aria-label="Find an upgrade" placeholder="Find an upgrade…" value={query} onChange={event => setQuery(event.target.value)} /><select aria-label="Sort comparisons" value={sort} onChange={event => setSort(event.target.value)}><option value="value">Highest value</option><option value="name">Name</option><option value="frequency">Most frequent</option></select></div></div>
                <div className={styles.tableWrap}><table><thead><tr><th>Upgrade</th><th>Mean Δ / round</th><th>95% CI</th><th>{isRaises ? 'Triggers / round' : 'Trials improved'}</th>{matchedPinned && pinned !== report && <th>Pinned Δ</th>}</tr></thead><tbody>
                    {rows.map(row => {
                        const old = matchedPinned?.comparisons.find(item => isRaises
                            ? currentRaiseTarget(item.id) === currentRaiseTarget(row.id) : item.id === row.id);
                        return <tr key={row.id} className={row.id === comparison?.id ? styles.selectedRow : ''}>
                            <td><button onClick={() => setSelected(row.id)} aria-pressed={row.id === comparison?.id}><span className={`${styles.dot} ${row.stat === 'mult' ? styles.multDot : ''}`} />{row.name}</button></td>
                            <td className={row.delta.mean >= 0 ? styles.positive : styles.negative}>{money(row.delta.mean, true)}</td>
                            <td className={styles.muted}>±{money(row.delta.ci95)}</td><td>{isRaises ? number(row.triggerRate!) : percent(row.betterRate)}</td>
                            {matchedPinned && pinned !== report && <td className={styles.muted}>{old ? <>{money(old.delta.mean, true)}{old.name !== row.name && <small style={{ display: 'block' }}>{old.name}</small>}</> : '—'}</td>}
                        </tr>;
                    })}
                    {!rows.length && <tr><td colSpan={5}>No upgrades match this search.</td></tr>}
                </tbody></table></div>
                <p className={styles.tableFootnote}>Δ is the paired difference from baseline. Confidence intervals describe the mean; they are not the spread of individual outcomes.</p>
            </section>
            {comparison && <section className={`${styles.panel} ${styles.detailPanel}`}>
                <span className={styles.eyebrow}>SELECTED UPGRADE</span><h3>{comparison.name}</h3><p>{comparison.description}</p>
                <strong className={`${styles.bigDelta} ${comparison.delta.mean >= 0 ? styles.positive : styles.negative}`}>{money(comparison.delta.mean, true)}<small>per round</small></strong>
                <div className={styles.detailStats}><div><span>10th percentile Δ</span><b>{money(comparison.delta.p10, true)}</b></div><div><span>Median Δ</span><b>{money(comparison.delta.median, true)}</b></div><div><span>90th percentile Δ</span><b>{money(comparison.delta.p90, true)}</b></div>{comparison.perTrigger !== null && <div><span>Value per trigger</span><b>{money(comparison.perTrigger)}</b></div>}</div>
                <Histogram distribution={comparison.delta} label="Distribution of payout differences" />
                {isRaises && <p className={styles.detailNote}>{comparison.stat === 'cash' ? 'Chip bonuses become more valuable as the round multiplier grows.' : 'Multiplier bonuses become more valuable as the round’s chip total grows. Negative chip totals can make added multiplier harmful.'}</p>}
            </section>}
        </div>
        <section className={styles.panel}><Histogram distribution={report.baseline} label={isRaises ? 'Baseline round payouts' : `Baseline mean round payout across ${report.config.horizon}-round trials`} /></section>
        {comparison && <section className={styles.panel}><ExampleInspector key={comparison.id} comparison={comparison} /></section>}
        <p className={styles.footerNote}>Build presets are synthetic test fixtures. {isRaises ? 'Direct scoring effects do not include changes in play or progression.' : 'This measures local scoring value, not full-run survival.'} Both bots are heuristics; active table-action relics are excluded. Export JSON to retain settings, summaries, and traces; use Load report to explore it later.</p>
    </>;
}

export default function BalanceLab() {
    const [config, setConfig] = useState<LabConfig>({ ...DEFAULT_CONFIG, relicIds: [] });
    const [report, setReport] = useState<LabReport | null>(null);
    const [pinned, setPinned] = useState<LabReport | null>(null);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const worker = useRef<Worker | null>(null);
    const fileInput = useRef<HTMLInputElement | null>(null);
    useEffect(() => { document.title = 'Balance Lab · Viginti'; return () => worker.current?.terminate(); }, []);
    const update = <K extends keyof LabConfig>(key: K, value: LabConfig[K]) => setConfig(previous => ({ ...previous, [key]: value }));
    const start = () => {
        try { validateConfig(config); } catch (reason) { setError(String(reason instanceof Error ? reason.message : reason)); return; }
        worker.current?.terminate(); setError(''); setStatus(''); setProgress(0); setRunning(true);
        try {
            const job = new Worker(new URL('./lab.worker.ts', import.meta.url), { type: 'module' });
            worker.current = job;
            job.onmessage = (event: MessageEvent<WorkerReply>) => {
                if (event.data.type === 'progress') setProgress(event.data.progress.completed / event.data.progress.total);
                else {
                    if (event.data.type === 'complete') { setReport(event.data.report); setProgress(1); }
                    else setError(event.data.message);
                    setRunning(false); job.terminate(); worker.current = null;
                }
            };
            job.onerror = event => { setError(event.message || 'Simulation worker failed.'); setRunning(false); job.terminate(); worker.current = null; };
            job.postMessage(config);
        } catch (reason) { setError(String(reason)); setRunning(false); }
    };
    const maxRelics = config.experiment === 'relics' ? 5 : 6;
    return <div className={styles.lab}>
        <header className={styles.header}><a href="/" className={styles.brand}><span>V</span> VIGINTI <i>/</i> <b>Balance Lab</b></a><div><span className={styles.engineBadge}><i />Shared game engine</span>
            <button disabled={running} onClick={() => fileInput.current?.click()}>Load report</button>
            <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Load a Balance Lab JSON report" onChange={async event => {
                const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
                try {
                    if (file.size > 10 * 1024 * 1024) throw new Error('Choose a report smaller than 10 MB.');
                    const imported = parseReport(await file.text()); setReport(imported);
                    setConfig({ ...imported.config, target: imported.config.experiment === 'raises' ? currentRaiseTarget(imported.config.target) : imported.config.target });
                    setError(''); setStatus(`Loaded ${file.name}.`);
                } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
            }} /><a href="/">Back to game ↗</a></div></header>
        <div className={styles.workspace}>
            <aside className={styles.sidebar}>
                <span className={styles.eyebrow}>EXPERIMENT SETUP</span><h1>A closer look<br />at the numbers.</h1><p>Measure an upgrade’s value in the context of a build.</p>
                <fieldset disabled={running}>
                    <label>Experiment<select value={config.experiment} onChange={event => setConfig(previous => ({ ...previous, experiment: event.target.value as LabConfig['experiment'], target: 'all', relicIds: previous.relicIds.slice(0, event.target.value === 'relics' ? 5 : 6) }))}><option value="raises">Raises · fixed hands</option><option value="relics">Relics · replayed rounds</option><option value="deck">Deck · replayed rounds</option></select></label>
                    <label>Starting build<select value={config.preset} onChange={event => update('preset', event.target.value as LabConfig['preset'])}>{BUILD_PRESETS.map(build => <option key={build.id} value={build.id}>{build.name}</option>)}</select><small>{BUILD_PRESETS.find(build => build.id === config.preset)?.description}</small></label>
                    <label>Card-play strategy<select value={config.bot} onChange={event => update('bot', event.target.value as LabConfig['bot'])}><option value="score">Score-aware</option><option value="simple">Lowest-hand baseline</option></select><small>{config.bot === 'score' ? 'Values patterns and the shared pot. Stands at 17; uses revealed dealer totals.' : 'Places into the lowest total. Stands when all live hands reach 17.'}</small></label>
                    <label>Compare<select value={config.target} onChange={event => update('target', event.target.value)}><option value="all">All available upgrades</option>{getTreatments(config.experiment).filter(item => !config.relicIds.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                    <div className={styles.inputPair}><label>Trials<input type="number" min={10} max={100000} step={10} value={config.trials} onChange={event => update('trials', Number(event.target.value))} /></label><label>Seed<input type="number" min={0} max={4294967295} step={1} value={config.seed} onChange={event => update('seed', Number(event.target.value))} /></label></div>
                    <div className={styles.presets}>{[1000, 10000, 100000].map(count => <button key={count} type="button" aria-pressed={config.trials === count} onClick={() => update('trials', count)}>{count / 1000}k</button>)}</div>
                    {config.experiment !== 'raises' && <label>Rounds per trial<select value={config.horizon} onChange={event => update('horizon', Number(event.target.value))}>{[1, 5, 10, 20].map(value => <option key={value} value={value}>{value} {value === 1 ? 'round' : 'rounds'}</option>)}</select><small>Captures decay and effects that carry across rounds. Trials restart the build.</small></label>}
                    <details className={styles.relicPicker}><summary>Starting relics <span>{config.relicIds.length}/{maxRelics}</span></summary><p>Optional shared loadout. Active abilities are outside this first experiment suite.</p>{PASSIVE_RELICS.map(relic => <label key={relic.id}><input type="checkbox" checked={config.relicIds.includes(relic.id)} disabled={!config.relicIds.includes(relic.id) && config.relicIds.length >= maxRelics} onChange={event => setConfig(previous => ({ ...previous, target: previous.target === relic.id ? 'all' : previous.target, relicIds: event.target.checked ? [...previous.relicIds, relic.id] : previous.relicIds.filter(id => id !== relic.id) }))} />{relic.name}</label>)}</details>
                </fieldset>
                {running ? <button className={styles.runButton} onClick={() => { worker.current?.terminate(); worker.current = null; setRunning(false); setStatus('Experiment cancelled. The previous result is still available.'); }}>Stop experiment <span>■</span></button>
                    : <button className={styles.runButton} onClick={start}>Run experiment <span>→</span></button>}
                {running && <div className={styles.progress} role="status"><div><span>Running in background</span><b>{Math.floor(progress * 100)}%</b></div><progress max={1} value={progress} /></div>}
                {error && <p className={styles.error} role="alert">{error}</p>}{status && <p className={styles.status} role="status">{status}</p>}
                <p className={styles.setupNote}>Same seed + settings reproduces the experiment on this version of the game. No packs are selected and no tuning values are changed.</p>
            </aside>
            <main className={styles.main}>
                {report ? <ResultView key={report.createdAt} report={report} pinned={pinned} onPin={() => setPinned(report)} /> : <div className={styles.empty}>
                    <div className={styles.emptyGraphic}><span>$</span><i>↔</i><span>%</span></div>
                    <span className={styles.eyebrow}>BETTER QUESTIONS. MEASURABLE ANSWERS.</span><h2>Find out what<br />your upgrades really do.</h2><p>Start with the same hands and compare a chip Raise with a multiplier Raise. Then explore how relics and deck changes behave across different builds.</p>
                    <div className={styles.emptySteps}><div><b>01</b><span>Choose a context<small>Fresh, specialized, or stacked</small></span></div><div><b>02</b><span>Run matched trials<small>Seeded and reproducible</small></span></div><div><b>03</b><span>Inspect the difference<small>Distributions, uncertainty, and hands</small></span></div></div>
                    <p className={styles.emptyHint}>{running ? `Running your first experiment… ${Math.floor(progress * 100)}%` : 'Choose your setup on the left, then run an experiment.'}</p>
                </div>}
                <details className={styles.methodology}><summary>Current small upgrade values</summary><div>
                    <p>Most units target roughly +$9 per round in the reference run. Lose/Bust upgrades are deliberately weaker to preserve their penalties. Values use whole dollars and percentage points. Baseline build presets keep their fixed amounts when this table changes.</p>
                    <div className={styles.tableWrap}><table><thead><tr><th>Hand type</th><th>Chips</th><th>Multiplier</th></tr></thead><tbody>{HAND_TYPES.map(hand => <tr key={hand.id}><td>{hand.name}</td><td>+${SMALL_UPGRADE_UNITS[hand.id].cash}</td><td>+{SMALL_UPGRADE_UNITS[hand.id].multPercent}%</td></tr>)}</tbody></table></div>
                </div></details>
                <details className={styles.methodology}><summary>How to read these experiments</summary><div><p><b>Raises:</b> A baseline bot plays each round. We rescore those exact hands with one additional small upgrade, using the current category-specific tuning. “pp” means percentage points, added to the shared round multiplier. Loss Raises also apply to Bust rows.</p><p><b>Relics and deck:</b> Each treatment replays a sequence from the same initial build. Independent random streams align trial, round, draw number, and dealer resolution. Extra draws can change cards and decisions within a round; the comparison does not force identical final hands.</p><p><b>Limits:</b> Payout is measured before the ante. Trials have unlimited test cash, no pack rewards, and a fixed horizon. They measure scoring, not survival. The score-aware bot uses a simple estimated dealer distribution, a bust penalty, and a stand threshold; it is not optimal play. Active abilities and multi-step upgrade combinations are not ranked in this version.</p><p><b>Uncertainty:</b> 95% intervals use the standard error across independent trials. For multi-round experiments, each trial contributes its mean payout, preserving within-trial dependence. A small interval measures sampling precision, not bot quality or design quality.</p></div></details>
            </main>
        </div>
    </div>;
}
