'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { Area, ComposedChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import LearnBox from '@/components/ui/LearnBox';
import CrashSubnav from '@/components/crash/CrashSubnav';
import { DirectionTag, Meter, Pill, RegimeBadge, SectionTitle, Stat, TONE_TEXT, fmtDate, pctFmt, riskTone, scoreTone, usd } from '@/components/crash/ui';
import HistoricalHunter, { type SelectedContract } from '@/components/crash/sim/HistoricalHunter';
import PerformancePanel, { DEFAULT_EVAL_PARAMS, type EvalParams } from '@/components/crash/sim/PerformancePanel';
import StrategyLab, { DEFAULT_LAB_PARAMS, type LabParamsUi } from '@/components/crash/sim/StrategyLab';
import RunsPanel, { saveRun, type SavedRun } from '@/components/crash/sim/RunsPanel';
import { SIM_SYMBOLS, historyPost, storageGet, storageSet, type EvaluateData, type LabData, type ReplayData, type RevealData, type ScanData, type StatusData, type TradeData } from '@/components/crash/sim/api';
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/lib/crash/config';
import { BIG_SHORT_SYMBOLS } from '@/lib/crash/history/events';

type Decision = 'Buy put' | 'Watch' | 'Wait' | 'Avoid';
interface JournalEntry {
  date: string;
  symbol: string;
  decision: Decision;
  contract: string;
  entryPrice: string;
  holdDays: string;
  profitTarget: string;
  maxLoss: string;
  reason: string;
  recordedAt: string;
}
const JOURNAL_KEY = 'tradevi.crash.sim.journal.v1';
const SPEEDS = [{ ms: 1500, label: 'Slow' }, { ms: 700, label: 'Normal' }, { ms: 250, label: 'Fast' }];

export default function CrashSimulatorPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [windowId, setWindowId] = useState('gfc');
  const [date, setDate] = useState('2007-06-01');
  const [mode, setMode] = useState<'close' | 'open'>('close');
  const [symbol, setSymbol] = useState('SPY');
  const [compare, setCompare] = useState<string[]>(['SPY', 'QQQ']);
  const [noHindsight, setNoHindsight] = useState(true);
  const [bigShort, setBigShort] = useState(false);
  const [data, setData] = useState<ReplayData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(700);
  const [selected, setSelected] = useState<SelectedContract | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [draft, setDraft] = useState<Omit<JournalEntry, 'date' | 'symbol' | 'recordedAt'>>({ decision: 'Watch', contract: '', entryPrice: '', holdDays: '', profitTarget: '', maxLoss: '', reason: '' });
  const [revealed, setRevealed] = useState<RevealData | null>(null);
  const [evalParams, setEvalParams] = useState<EvalParams>(DEFAULT_EVAL_PARAMS);
  const [labParams, setLabParams] = useState<LabParamsUi>(DEFAULT_LAB_PARAMS);
  const [lastEval, setLastEval] = useState<EvaluateData | null>(null);
  const [lastLab, setLastLab] = useState<LabData | null>(null);
  const [lastTrade, setLastTrade] = useState<TradeData | null>(null);
  const [scan, setScan] = useState<ScanData | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const playRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setJournal(storageGet<JournalEntry[]>(JOURNAL_KEY, []));
    fetch('/api/crash/history')
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || j.error) throw new Error(j.error ?? `HTTP ${r.status}`);
        setStatus(j);
      })
      .catch((e) => setStatusErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const load = useCallback(
    async (d: string) => {
      setLoading(true);
      setErr(null);
      try {
        const r = await historyPost<ReplayData>({ action: 'replay', date: d, mode, symbols: Array.from(new Set([symbol, ...compare])), noHindsight });
        setData(r);
        if (r.date !== d) setDate(r.date);
        return r;
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        setPlaying(false);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [mode, symbol, compare, noHindsight],
  );

  useEffect(() => {
    load(date);
    setRevealed(null);
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, mode, symbol, noHindsight, compare.join(',')]);

  // Playback: one trading day per tick.
  useEffect(() => {
    if (!playing || loading || !data) return;
    if (!data.nextSession) {
      setPlaying(false);
      return;
    }
    playRef.current = setTimeout(() => setDate(data.nextSession as string), speed);
    return () => {
      if (playRef.current) clearTimeout(playRef.current);
    };
  }, [playing, loading, data, speed]);

  const windows = status?.windows ?? data?.windows ?? [];
  const win = windows.find((w) => w.id === windowId);
  const recorded = journal.find((j) => j.date === date && j.symbol === symbol) ?? null;
  const canSeeFuture = !noHindsight || !!recorded;

  function chooseWindow(id: string) {
    const w = windows.find((x) => x.id === id);
    setWindowId(id);
    if (w) setDate(w.start);
  }
  function jumpWindow(dir: 1 | -1) {
    const sorted = [...windows].sort((a, b) => (a.start < b.start ? -1 : 1));
    const next = dir === 1 ? sorted.find((w) => w.start > date) : [...sorted].reverse().find((w) => w.start < date && !(date >= w.start && date <= w.end));
    if (next) {
      setWindowId(next.id);
      setDate(next.start);
    }
  }
  function enterBigShort() {
    setBigShort(true);
    setWindowId('gfc');
    setDate('2007-06-01');
    setSymbol('XLF');
    setCompare(BIG_SHORT_SYMBOLS);
  }
  function recordDecision() {
    const e: JournalEntry = { ...draft, contract: draft.contract || (selected ? `${selected.symbol} ${selected.strike}P ${selected.expiration}${selected.kind === 'theoretical' ? ' (theoretical)' : ''}` : ''), date, symbol, recordedAt: new Date().toISOString() };
    const next = [e, ...journal.filter((j) => !(j.date === date && j.symbol === symbol))].slice(0, 200);
    setJournal(next);
    storageSet(JOURNAL_KEY, next);
  }
  async function doReveal() {
    try {
      setRevealed(await historyPost<RevealData>({ action: 'reveal', date, symbols: Array.from(new Set([symbol, ...compare])), sessionsAhead: 250, decline: evalParams.decline }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  async function runScan() {
    if (!win) return;
    setScanBusy(true);
    try {
      setScan(await historyPost<ScanData>({ action: 'scan', symbol, from: win.start, to: noHindsight ? date : win.end, horizon: 'short', step: 5, theoretical: true }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setScanBusy(false);
    }
  }

  const tl = data?.timeline ?? [];
  const cat = (id: string) => data?.score.categories.find((c) => c.id === id) ?? null;

  // 2008 BIG SHORT answers from the point-in-time timeline (only up to the replay date in No Hindsight Mode).
  const bigShortAnswers = useMemo(() => {
    if (!bigShort || !win) return null;
    const inWin = tl.filter((t) => t.date >= win.start && t.date <= win.end && (!noHindsight || t.date <= date));
    const first = (f: (t: (typeof tl)[number]) => boolean) => inWin.find((t) => !t.insufficient && f(t))?.date ?? null;
    return {
      credit: first((t) => (t.categories.credit ?? 0) >= 0.45),
      equity: first((t) => (t.categories.technical ?? 0) >= 0.45),
      broad: first((t) => (t.score ?? 0) >= 40),
      vol: first((t) => t.regime === 'VOLATILITY EXPANSION' || t.regime === 'PANIC / LATE ENTRY'),
      early: first((t) => t.regime !== 'NORMAL'),
    };
  }, [bigShort, win, tl, noHindsight, date]);

  const optionsLoaded = (status?.options ?? []).some((o) => o.dates > 0);
  const criteria = [
    { n: 1, text: 'Select a historical date', state: 'met' as const, note: '' },
    { n: 2, text: 'Replay one trading day at a time', state: 'met' as const, note: '' },
    { n: 3, text: 'See the indicators actually available on that date', state: 'met' as const, note: 'Revised series without vintages are flagged.' },
    { n: 4, text: "See Tradevi's historical Crash Risk Score", state: 'met' as const, note: '' },
    { n: 5, text: 'Identify when the first warning appeared', state: 'met' as const, note: '' },
    { n: 6, text: 'See whether Put Hunter would have found qualifying puts', state: optionsLoaded ? ('met' as const) : ('theoretical' as const), note: optionsLoaded ? 'For dates with loaded chains.' : 'Liquidity filters need actual chains.' },
    { n: 7, text: 'Inspect actual historical contract data', state: optionsLoaded ? ('met' as const) : ('unmet' as const), note: optionsLoaded ? 'Covered dates only.' : 'No licensed historical chain loaded.' },
    { n: 8, text: 'Simulate entering and exiting a historical trade', state: optionsLoaded ? ('met' as const) : ('theoretical' as const), note: '' },
    { n: 9, text: 'Calculate realistic capital at risk', state: optionsLoaded ? ('met' as const) : ('theoretical' as const), note: 'Premium at the ask plus fees.' },
    { n: 10, text: 'Reveal what happened after a hypothetical decision', state: 'met' as const, note: '' },
    { n: 11, text: 'Compare alternative options strategies', state: optionsLoaded ? ('met' as const) : ('theoretical' as const), note: '' },
    { n: 12, text: 'See false alarms and missed opportunities', state: 'met' as const, note: '' },
    { n: 13, text: 'Export historical simulation results', state: 'met' as const, note: '' },
    { n: 14, text: 'Reproduce a previous backtest from saved parameters', state: 'met' as const, note: 'Fingerprints flag vendor revisions.' },
    { n: 15, text: 'No future information influences historical signals', state: 'met' as const, note: 'Point-in-time guard, verified by automated checks.' },
  ];

  function save(kind: 'evaluate' | 'lab' | 'trade') {
    const m = kind === 'evaluate' ? lastEval?.manifest : kind === 'lab' ? lastLab?.manifest : lastTrade && 'manifest' in lastTrade ? lastTrade.manifest : null;
    if (!m) return;
    const params = kind === 'evaluate' ? (evalParams as unknown as Record<string, unknown>) : kind === 'lab' ? (labParams as unknown as Record<string, unknown>) : (m.params as Record<string, unknown>);
    const summary =
      kind === 'evaluate' && lastEval
        ? `${lastEval.report.stats.warned}/${lastEval.report.stats.declines} declines warned, ${lastEval.report.stats.falseAlarms} false alarms`
        : kind === 'lab' && lastLab
          ? lastLab.reports.map((r) => `${r.def.id} ${Math.round(r.stats.net)}`).join(' · ')
          : lastTrade && 'result' in lastTrade
            ? `net ${Math.round(lastTrade.result?.net ?? 0)}`
            : '';
    const r: SavedRun = { id: `${Date.now()}`, name: `${kind === 'evaluate' ? 'Signal report' : kind === 'lab' ? 'Strategy lab' : 'Trade'} ${new Date().toLocaleDateString()}`, savedAt: new Date().toISOString(), action: kind, params, manifest: m, summary };
    saveRun(r);
  }
  function loadRun(r: SavedRun) {
    if (r.action === 'evaluate') setEvalParams(r.params as unknown as EvalParams);
    if (r.action === 'lab') setLabParams(r.params as unknown as LabParamsUi);
  }

  return (
    <div className="space-y-4 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Historical Crash Simulator</h1>
          <p className="text-sm text-tv-muted">Would Tradevi have seen it, using only what was known at the time?</p>
        </div>
        <CrashSubnav />
      </div>
      <LearnBox
        summary="Travel back to a date, see only what was known then, decide, then reveal what happened."
        items={[
          { term: 'Point in time', text: 'Each date is scored with the same engine as the live dashboard, using only data published by that date. Weekly Fed indexes appear on their release day; revised values without a first-release vintage are flagged.' },
          { term: 'No Hindsight Mode', text: 'Hides every later price, signal, headline and outcome. Record a decision first; only then can you reveal what happened and simulate the trade.' },
          { term: 'Options data', text: 'Where no licensed historical chain is loaded the page says HISTORICAL OPTIONS DATA UNAVAILABLE. A theoretical reconstruction from historical prices and Cboe volatility indexes can be shown, always labelled THEORETICAL.' },
          { term: 'Not a probability', text: 'The risk score counts accumulated warning signs. It is not the chance of a crash, and past behaviour does not promise future results.' },
        ]}
      />
      {statusErr && <div className="card p-4 text-sm text-tv-red">Historical data could not be loaded: {statusErr}</div>}

      {/* ── Controls ── */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-tv-muted">Research window
            <select className="input mt-0.5 block" value={windowId} onChange={(e) => chooseWindow(e.target.value)}>
              {windows.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
              <option value="custom">Custom date</option>
            </select>
          </label>
          <label className="text-[11px] text-tv-muted">Date
            <input type="date" className="input mt-0.5 block" value={date} min={status?.firstSession ?? undefined} max={status?.lastSession ?? undefined} onChange={(e) => { setWindowId('custom'); if (e.target.value) setDate(e.target.value); }} />
          </label>
          <div className="flex gap-1">
            <button className="btn" title="Previous event" onClick={() => jumpWindow(-1)}><SkipBack size={14} /></button>
            <button className="btn" title="Back one trading day" disabled={!data?.prevSession} onClick={() => data?.prevSession && setDate(data.prevSession)}><ChevronLeft size={14} /></button>
            <button className="btn btn-primary" title={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
            <button className="btn" title="Forward one trading day" disabled={!data?.nextSession} onClick={() => data?.nextSession && setDate(data.nextSession)}><ChevronRight size={14} /></button>
            <button className="btn" title="Next event" onClick={() => jumpWindow(1)}><SkipForward size={14} /></button>
            <button className="btn" title="Reset to the window start" onClick={() => { setPlaying(false); setDate(win?.start ?? '2007-06-01'); }}><RotateCcw size={14} /></button>
          </div>
          <label className="text-[11px] text-tv-muted">Speed
            <select className="input mt-0.5 block" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{SPEEDS.map((s) => <option key={s.ms} value={s.ms}>{s.label}</option>)}</select>
          </label>
          <label className="text-[11px] text-tv-muted">Underlying
            <select className="input mt-0.5 block" value={symbol} onChange={(e) => setSymbol(e.target.value)}>{SIM_SYMBOLS.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <label className="text-[11px] text-tv-muted">Data as of
            <select className="input mt-0.5 block" value={mode} onChange={(e) => setMode(e.target.value as 'close' | 'open')}><option value="close">After the close</option><option value="open">Before the open (prior close)</option></select>
          </label>
          <button className={`btn ${noHindsight ? 'btn-primary' : ''}`} onClick={() => setNoHindsight((v) => !v)}>{noHindsight ? <EyeOff size={14} /> : <Eye size={14} />}<span className="ml-1">No Hindsight {noHindsight ? 'ON' : 'OFF'}</span></button>
          <button className={`btn ${bigShort ? 'btn-primary' : ''}`} onClick={() => (bigShort ? setBigShort(false) : enterBigShort())}>2008 BIG SHORT MODE</button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-tv-muted">Compare:</span>
          {SIM_SYMBOLS.map((s) => (
            <button key={s} className={`rounded-full border px-2 py-0.5 ${compare.includes(s) ? 'border-tv-purple/50 text-tv-purple' : 'border-tv-border text-tv-muted'}`} onClick={() => setCompare(compare.includes(s) ? compare.filter((x) => x !== s) : [...compare, s])}>{s}</button>
          ))}
          {data && <span className="ml-auto text-tv-muted">Showing {fmtDate(data.date)} {mode === 'close' ? 'after the close' : 'before the open'}{loading ? ' · loading…' : ''}</span>}
        </div>
        {win && <p className="text-[11px] text-tv-muted">{win.label}: {fmtDate(win.start)} – {fmtDate(win.end)} · focus: {win.focus.join(', ')}. A research window, not a pre-labelled signal.</p>}
      </div>

      {err && <div className="card p-3 text-sm text-tv-red">{err}</div>}
      {!data && !err && <div className="skeleton h-48 rounded-2xl" />}

      {data && (
        <>
          {/* ── Market conditions ── */}
          <div className="card p-4">
            <SectionTitle title="Market conditions on this date" subtitle={`Score coverage ${pctFmt(data.score.coverage, 0)} · confidence ${data.score.confidence}`} right={<RegimeBadge regime={data.regime.regime} insufficient={data.regime.insufficient} large />} />
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <Stat label="Crash Risk Score" value={data.score.score != null ? Math.round(data.score.score) : '—'} tone={scoreTone(data.score.score)} sub={data.score.band ?? 'insufficient data'} />
              {data.conditions.filter((c) => ['SPY', 'QQQ'].includes(c.symbol)).map((c) => <Stat key={c.symbol} label={c.symbol} value={c.close != null ? usd(c.close) : '—'} sub={c.date ? `close ${fmtDate(c.date)}` : 'no data'} />)}
              <Stat label="VIX" value={data.vix ? data.vix.value.toFixed(2) : '—'} sub={data.vix ? fmtDate(data.vix.date) : 'no data'} />
              {['breadth', 'credit', 'volatility'].map((id) => {
                const c = cat(id);
                return <Stat key={id} label={CATEGORY_LABEL[id as keyof typeof CATEGORY_LABEL]} value={c?.risk != null ? Math.round(c.risk * 100) : '—'} tone={riskTone(c?.risk)} sub={c?.insufficient ? 'insufficient data' : <DirectionTag d={c?.direction5 ?? null} />} />;
              })}
            </div>
            {data.regime.why.length > 0 && <p className="text-xs text-tv-muted mt-2">Why: {data.regime.why.join(' · ')}</p>}
            <p className="text-[11px] text-tv-muted mt-1">The score measures accumulated risk signals. It is not a probability of a crash.</p>
          </div>

          {/* ── Historical intelligence ── */}
          <div className="card p-4 space-y-3">
            <SectionTitle title="Historical intelligence" subtitle={noHindsight ? 'Score history up to this date only.' : 'Score history around this date (hindsight on: later values visible).'} />
            <div className="h-60">
              <ResponsiveContainer>
                <ComposedChart data={tl} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#ffffff10" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} minTickGap={40} />
                  <YAxis yAxisId="s" domain={[0, 100]} tick={{ fontSize: 10, fill: '#888' }} width={30} />
                  <YAxis yAxisId="p" orientation="right" tick={{ fontSize: 10, fill: '#888' }} width={40} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }} formatter={(v: number, n: string) => [typeof v === 'number' ? v.toFixed(1) : v, n]} />
                  <Area yAxisId="s" dataKey="score" name="Risk score" stroke="#a78bfa" fill="#a78bfa33" dot={false} isAnimationActive={false} />
                  <Line yAxisId="p" dataKey="spy" name="SPY" stroke="#94a3b8" dot={false} isAnimationActive={false} />
                  <ReferenceLine yAxisId="s" x={data.date} stroke="#f59e0b" strokeDasharray="4 3" />
                  {data.milestones.filter((m) => tl.length && m.date >= tl[0].date && m.date <= tl[tl.length - 1].date).map((m) => <ReferenceLine key={m.date} yAxisId="s" x={m.date} stroke="#ffffff30" />)}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="grid lg:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-tv-muted mb-1">First appearance of each classification in this window{noHindsight ? ' (so far)' : ''}</div>
                {data.regimeFirst ? (
                  <ul className="space-y-0.5">
                    {Object.entries(data.regimeFirst).map(([r, d]) => <li key={r} className="flex justify-between"><span>{r}</span><span className="font-mono">{fmtDate(d)}{d ? ` · ${Math.round((Date.parse(data.date) - Date.parse(d)) / 86_400_000)} days ago` : ''}</span></li>)}
                  </ul>
                ) : <p className="text-tv-muted">Pick a research window to see first-appearance dates.</p>}
              </div>
              <div>
                <div className="text-tv-muted mb-1">Headlines known by this date</div>
                <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                  {data.milestones.filter((m) => !noHindsight || m.date <= data.date).map((m) => <li key={m.date + m.text}><span className="font-mono text-tv-muted">{fmtDate(m.date)}</span> {m.text}{m.date > data.date && <span className="text-tv-amber"> (later)</span>}</li>)}
                </ul>
              </div>
            </div>
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-white">Indicators on this date ({data.score.indicators.filter((i) => i.status === 'ok').length} of {data.score.indicators.length} available)</summary>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-xs">
                  <thead className="text-tv-muted text-left"><tr><th className="py-1 pr-2">Indicator</th><th className="pr-2">Reading</th><th className="pr-2 w-24">Risk</th><th className="pr-2">5d / 20d</th><th className="pr-2">Interpretation</th><th className="pr-2">Data as of</th><th>Source</th></tr></thead>
                  <tbody>
                    {CATEGORY_ORDER.flatMap((cid) => data.score.indicators.filter((i) => i.category === cid)).map((i) => (
                      <tr key={i.id} className="border-t border-white/[0.04]">
                        <td className="py-1 pr-2 text-white">{i.label}<div className="text-[10px] text-tv-muted">{CATEGORY_LABEL[i.category]}</div></td>
                        <td className="pr-2 font-mono">{i.display}</td>
                        <td className="pr-2"><Meter value={i.risk} tone={riskTone(i.risk)} /></td>
                        <td className="pr-2 whitespace-nowrap"><DirectionTag d={i.direction5} /> <DirectionTag d={i.direction20} /></td>
                        <td className={`pr-2 ${i.status === 'ok' ? 'text-gray-300' : 'text-tv-muted'}`}>{i.interpretation}</td>
                        <td className="pr-2 whitespace-nowrap">{fmtDate(i.asOf)}{i.revisable && <span className="text-tv-amber" title="Revised values, no first-release vintage"> *</span>}</td>
                        <td className="text-tv-muted">{i.source ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-tv-muted mt-1">* revised values: today&apos;s version of a revisable series, not the first release. Not strict point-in-time.</p>
              </div>
            </details>
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-white">Data availability on this date</summary>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-xs">
                  <thead className="text-tv-muted text-left"><tr><th className="py-1 pr-2">Series</th><th className="pr-2">Last observation</th><th className="pr-2">Available to a trader on</th><th className="pr-2">Source</th><th>Point-in-time</th></tr></thead>
                  <tbody>
                    {data.availability.map((a) => (
                      <tr key={a.id} className="border-t border-white/[0.04]">
                        <td className="py-1 pr-2 text-white">{a.id}</td>
                        <td className="pr-2">{a.lastObservation ? fmtDate(a.lastObservation) : <span className="text-tv-muted">{a.note}</span>}</td>
                        <td className="pr-2">{a.availableOn ? fmtDate(a.availableOn) : '—'}</td>
                        <td className="pr-2 text-tv-muted">{a.source}</td>
                        <td>{a.strictPointInTime ? <Pill tone="green">strict</Pill> : <Pill tone="amber">revised values</Pill>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>

          {bigShort && bigShortAnswers && (
            <div className="card p-4 space-y-3 border-tv-red/30">
              <SectionTitle title="2008 BIG SHORT MODE" subtitle="Looking for mispriced downside risk from an investor's chair in 2007–2009, with financial-sector focus (XLF, KRE) next to SPY, QQQ and IWM." />
              <p className="text-xs text-tv-amber">The investors made famous by the crisis mainly used credit default swaps and other credit instruments, not index puts. This mode borrows their analytical questions; buying SPY or XLF puts would not have replicated their trades.</p>
              <ol className="grid md:grid-cols-2 gap-x-6 gap-y-1 text-xs list-decimal list-inside">
                <li>Financial stress first visible (credit category ≥ 45): <b className="text-white">{fmtDate(bigShortAnswers.credit) === '—' ? 'not yet' : fmtDate(bigShortAnswers.credit)}</b></li>
                <li>Equity weakness apparent (price structure ≥ 45): <b className="text-white">{bigShortAnswers.equity ? fmtDate(bigShortAnswers.equity) : 'not yet'}</b></li>
                <li>Broad-market risk increased (score ≥ 40): <b className="text-white">{bigShortAnswers.broad ? fmtDate(bigShortAnswers.broad) : 'not yet'}</b></li>
                <li>Implied volatility repricing (VOLATILITY EXPANSION or PANIC): <b className="text-white">{bigShortAnswers.vol ? fmtDate(bigShortAnswers.vol) : 'not yet'}</b></li>
                <li>First early warning (any non-normal regime): <b className="text-white">{bigShortAnswers.early ? fmtDate(bigShortAnswers.early) : 'not yet'}</b></li>
                <li>Put Hunter&apos;s first WATCH-or-better contract on {symbol}: <b className="text-white">{scan ? (scan.firstQualifying ? `${fmtDate(scan.firstQualifying.date)} (THEORETICAL unless chains loaded)` : 'none found') : 'run the scan'}</b></li>
                <li>What it would have cost: <b className="text-white">{scan?.firstQualifying?.best ? `${usd(scan.firstQualifying.best.ask)} per share, ${usd((scan.firstQualifying.best.ask ?? 0) * 100)} per contract` : '—'}</b></li>
                <li>What happened to its value: <b className="text-white">{canSeeFuture ? 'select it below and run the trade simulation' : 'hidden until you record a decision'}</b></li>
                <li>Capital required: <b className="text-white">{scan?.firstQualifying?.best ? `${usd((scan.firstQualifying.best.ask ?? 0) * 100 + 0.65)} for one contract with fees` : '—'}</b></li>
                <li>Most it could lose if the timing was wrong: <b className="text-white">{scan?.firstQualifying?.best ? `the full premium, ${usd((scan.firstQualifying.best.ask ?? 0) * 100 + 0.65)} per contract` : '—'}</b></li>
              </ol>
              <button className="btn" disabled={scanBusy} onClick={runScan}>{scanBusy ? 'Scanning weekly…' : `Scan Put Hunter weekly through the window${noHindsight ? ' (up to this date)' : ''}`}</button>
              {scan && (
                <div className="h-40">
                  <ResponsiveContainer>
                    <LineChart data={scan.rows} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#ffffff10" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} minTickGap={40} />
                      <YAxis tick={{ fontSize: 10, fill: '#888' }} width={30} />
                      <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }} />
                      <Line dataKey="aligned" name="WATCH-or-better contracts" stroke="#22c55e" dot={false} />
                      <Line dataKey="passing" name="Passed filters" stroke="#a78bfa" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          <HistoricalHunter date={data.date} symbol={symbol} canSeeFuture={canSeeFuture} selected={selected} onSelect={setSelected} onTrade={setLastTrade} />

          {/* ── Decision journal and reveal ── */}
          <div className="card p-4 space-y-3">
            <SectionTitle title="Your decision" subtitle="Record what you would have done on this date, with only what you can see, then reveal what happened." right={lastTrade && 'manifest' in lastTrade ? <button className="btn text-xs" onClick={() => save('trade')}>Save trade run</button> : undefined} />
            {recorded ? (
              <div className="text-xs space-y-1">
                <div><Pill tone="green">Recorded {new Date(recorded.recordedAt).toLocaleString()}</Pill> <b className="text-white ml-1">{recorded.decision}</b> {recorded.contract && `· ${recorded.contract}`}</div>
                <div className="text-tv-muted">Entry {recorded.entryPrice || '—'} · hold {recorded.holdDays || '—'} days · target {recorded.profitTarget || '—'} · max loss {recorded.maxLoss || '—'}</div>
                {recorded.reason && <div className="text-gray-300">“{recorded.reason}”</div>}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-[11px] text-tv-muted">
                <div className="flex gap-1 col-span-2 sm:col-span-4 lg:col-span-7">
                  {(['Buy put', 'Watch', 'Wait', 'Avoid'] as Decision[]).map((d) => <button key={d} className={`btn text-xs ${draft.decision === d ? 'btn-primary' : ''}`} onClick={() => setDraft({ ...draft, decision: d })}>{d}</button>)}
                </div>
                <label>Contract<input className="input w-full mt-0.5" placeholder={selected ? `${selected.strike}P ${selected.expiration}` : 'select above'} value={draft.contract} onChange={(e) => setDraft({ ...draft, contract: e.target.value })} /></label>
                <label>Entry price<input className="input w-full mt-0.5" placeholder={selected?.ask != null ? String(selected.ask) : ''} value={draft.entryPrice} onChange={(e) => setDraft({ ...draft, entryPrice: e.target.value })} /></label>
                <label>Expected hold (days)<input className="input w-full mt-0.5" value={draft.holdDays} onChange={(e) => setDraft({ ...draft, holdDays: e.target.value })} /></label>
                <label>Profit target<input className="input w-full mt-0.5" placeholder="+100%" value={draft.profitTarget} onChange={(e) => setDraft({ ...draft, profitTarget: e.target.value })} /></label>
                <label>Max acceptable loss<input className="input w-full mt-0.5" placeholder="−50%" value={draft.maxLoss} onChange={(e) => setDraft({ ...draft, maxLoss: e.target.value })} /></label>
                <label className="col-span-2">Reason<input className="input w-full mt-0.5" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} /></label>
                <button className="btn btn-primary self-end" onClick={recordDecision}>Record decision</button>
              </div>
            )}
            <button className="btn" disabled={!canSeeFuture} onClick={doReveal}>Reveal what happened next</button>
            {!canSeeFuture && <p className="text-xs text-tv-amber">Locked: record a decision first. Nothing after {fmtDate(data.date)} has been sent to this page.</p>}
            {revealed && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  {revealed.paths.map((p) => <Pill key={p.symbol} tone={(p.worst ?? 0) <= -0.1 ? 'red' : 'gray'}>{p.symbol}: worst {pctFmt(p.worst, 1, true)} ({fmtDate(p.worstDate)}), end {p.start && p.end ? pctFmt(p.end / p.start - 1, 1, true) : '—'}</Pill>)}
                  {revealed.activeDecline && <Pill tone="red">Already inside a decline that began {fmtDate(revealed.activeDecline.peakDate)}</Pill>}
                  {revealed.nextDecline && <Pill tone="amber">Next major decline: from {fmtDate(revealed.nextDecline.peakDate)}, crossed {fmtDate(revealed.nextDecline.crossDate)}, −{pctFmt(revealed.nextDecline.maxDrawdown, 0)}</Pill>}
                </div>
                <div className="h-56">
                  <ResponsiveContainer>
                    <LineChart margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#ffffff10" />
                      <XAxis dataKey="date" type="category" allowDuplicatedCategory={false} tick={{ fontSize: 10, fill: '#888' }} minTickGap={40} />
                      <YAxis tick={{ fontSize: 10, fill: '#888' }} width={40} domain={['auto', 'auto']} />
                      <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }} />
                      {revealed.paths.map((p, i) => (
                        <Line key={p.symbol} data={p.path.map((x) => ({ date: x.date, [p.symbol]: p.start ? Math.round((x.close / p.start) * 1000) / 10 : null }))} dataKey={p.symbol} stroke={['#a78bfa', '#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#e879f9'][i % 6]} dot={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] text-tv-muted">Indexed to 100 on {fmtDate(revealed.date)}, next {revealed.paths[0]?.path.length ?? 0} sessions.</p>
                {revealed.milestones.length > 0 && <ul className="text-xs space-y-0.5">{revealed.milestones.map((m) => <li key={m.date}><span className="font-mono text-tv-muted">{fmtDate(m.date)}</span> {m.text}</li>)}</ul>}
              </div>
            )}
          </div>
        </>
      )}

      <PerformancePanel params={evalParams} setParams={setEvalParams} onResult={setLastEval} noHindsight={noHindsight && !recorded} />
      {lastEval && <div className="-mt-2 flex justify-end"><button className="btn text-xs" onClick={() => save('evaluate')}>Save this report</button></div>}
      <StrategyLab params={labParams} setParams={setLabParams} onResult={setLastLab} noHindsight={noHindsight && !recorded} />
      {lastLab && <div className="-mt-2 flex justify-end"><button className="btn text-xs" onClick={() => save('lab')}>Save this lab run</button></div>}
      <RunsPanel status={status} criteria={criteria} onLoad={loadRun} />
      <p className={`text-[11px] ${TONE_TEXT.gray}`}>Research and education only. Tradevi never places orders. Historical and theoretical results do not predict future results.</p>
    </div>
  );
}
