'use client';
/**
 * Historical Put Hunter, volatility scenarios and the trade simulator for
 * one replay date. Actual chains are used where loaded; otherwise the page
 * shows HISTORICAL OPTIONS DATA UNAVAILABLE and offers the separately
 * labelled THEORETICAL reconstruction.
 */
import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LEAPS_FILTERS, LONG_TERM_FILTERS, SHORT_TERM_FILTERS, type ScreenFilters } from '@/lib/crash/config';
import { runScenarios, smileFromChain } from '@/lib/crash/scenarios';
import type { FunnelRow } from '@/lib/crash/history/funnel';
import { DEFAULT_EXITS, type EntryMethod, type ExitRules } from '@/lib/crash/history/trade';
import { THEORETICAL_MODEL, type TheoreticalModel } from '@/lib/crash/history/theoretical';
import { LabelBadge, Pill, SectionTitle, Stat, TONE_TEXT, fmtDate, pctFmt, qualityTone, usd } from '../ui';
import { historyPost, type ChainData, type TradeData } from './api';

type Horizon = 'short' | 'long' | 'leaps';
const HFILTERS: Record<Horizon, ScreenFilters> = { short: SHORT_TERM_FILTERS, long: LONG_TERM_FILTERS, leaps: LEAPS_FILTERS };
const FIELDS: { key: keyof ScreenFilters; label: string; step: number; pct?: boolean }[] = [
  { key: 'minPremium', label: 'Min premium', step: 0.01 },
  { key: 'maxPremium', label: 'Max premium', step: 0.01 },
  { key: 'minDte', label: 'Min DTE', step: 1 },
  { key: 'maxDte', label: 'Max DTE', step: 1 },
  { key: 'minAbsDelta', label: 'Min |Δ|', step: 0.01 },
  { key: 'maxAbsDelta', label: 'Max |Δ|', step: 0.01 },
  { key: 'minOpenInterest', label: 'Min OI', step: 10 },
  { key: 'minVolume', label: 'Min volume', step: 1 },
  { key: 'maxSpreadPct', label: 'Max spread %', step: 1, pct: true },
];
const TARGETS = [0.25, 0.5, 1, 2, 3, 5];
const LOSSES = [0.25, 0.5, 0.75, 1];

export interface SelectedContract {
  symbol: string;
  optionSymbol: string;
  strike: number;
  expiration: string;
  kind: 'actual' | 'theoretical';
  ask: number | null;
  mid: number | null;
}

export default function HistoricalHunter({
  date,
  symbol,
  canSeeFuture,
  onSelect,
  selected,
  onTrade,
}: {
  date: string;
  symbol: string;
  canSeeFuture: boolean;
  onSelect: (c: SelectedContract | null) => void;
  selected: SelectedContract | null;
  onTrade?: (t: TradeData) => void;
}) {
  const [horizon, setHorizon] = useState<Horizon>('short');
  const [filters, setFilters] = useState<ScreenFilters>(SHORT_TERM_FILTERS);
  const [theoretical, setTheoretical] = useState(false);
  const [model, setModel] = useState<TheoreticalModel>(THEORETICAL_MODEL);
  const [data, setData] = useState<ChainData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  async function load(f = filters, h = horizon, theo = theoretical, m = model) {
    setLoading(true);
    setErr(null);
    try {
      setData(await historyPost<ChainData>({ action: 'chain', symbol, date, horizon: h, filters: f, theoretical: theo, model: m }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, symbol, horizon, theoretical]);

  const funnel = data?.funnel ?? null;
  const theo = funnel?.kind === 'theoretical';
  const rows = funnel?.rows ?? [];
  const selRow = rows.find((r) => r.ev.contract.symbol === selected?.optionSymbol) ?? null;
  const pickName: Record<string, string> = { cheapest: 'Cheapest', highestQuality: 'Highest quality', highestVega: 'Most vega', highestGamma: 'Most gamma', bestLiquidity: 'Best liquidity', lowestTheta: 'Lowest theta/day', bestScenario: 'Best −10% / +5 IV scenario' };

  function choose(r: FunnelRow) {
    const c = r.ev.contract;
    onSelect({ symbol, optionSymbol: c.symbol, strike: c.strike, expiration: c.expiration, kind: theo ? 'theoretical' : 'actual', ask: c.ask, mid: r.ev.mid });
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle
          title="Historical Put Hunter"
          subtitle={`What Put Hunter would have shown for ${symbol} on ${fmtDate(date)}, with the live filters and scoring.`}
          right={
            <div className="flex flex-wrap gap-1.5">
              {(['short', 'long', 'leaps'] as Horizon[]).map((h) => (
                <button key={h} className={`btn text-xs ${horizon === h ? 'btn-primary' : ''}`} onClick={() => { setHorizon(h); setFilters(HFILTERS[h]); }}>
                  {h === 'short' ? '14–60 DTE' : h === 'long' ? '60–120 DTE' : 'LEAPS 120+'}
                </button>
              ))}
              <button className="btn text-xs" onClick={() => setShowFilters((v) => !v)}>Filters</button>
            </div>
          }
        />
        {showFilters && (
          <form className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3" onSubmit={(e) => { e.preventDefault(); load(); }}>
            {FIELDS.map((f) => (
              <label key={f.key} className="text-[11px] text-tv-muted">
                {f.label}
                <input type="number" className="input w-full mt-0.5" step={f.step} value={f.pct ? Math.round((filters[f.key] ?? 0) * 100) : (filters[f.key] ?? '')} onChange={(e) => setFilters({ ...filters, [f.key]: f.pct ? Number(e.target.value) / 100 : Number(e.target.value) })} />
              </label>
            ))}
            <button className="btn btn-primary self-end" type="submit">Apply</button>
          </form>
        )}

        {data?.status === 'ACTUAL' ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <Pill tone="green">ACTUAL HISTORICAL CHAIN</Pill>
            <span className="text-tv-muted">{data.source}</span>
          </div>
        ) : (
          <div className="mb-3 rounded-xl border border-tv-amber/30 bg-tv-amber/[0.06] p-3 text-xs space-y-1.5">
            <div className="font-bold text-tv-amber tracking-wide">HISTORICAL OPTIONS DATA UNAVAILABLE</div>
            <p className="text-gray-300">
              No licensed historical chain is loaded for {symbol} on this date
              {data?.coverage?.dates ? ` (loaded: ${data.coverage.dates} dates, ${fmtDate(data.coverage.first)} – ${fmtDate(data.coverage.last)})` : ''}. Actual bids, asks, open interest and volume can't be shown, and criteria that need them stay unmet. Import a vendor file with
              <code className="mx-1 text-tv-purple">scripts/import-historical-options.ts</code>or let the daily recorder build history from today on.
            </p>
            <label className="inline-flex items-center gap-2 text-gray-200">
              <input type="checkbox" checked={theoretical} onChange={(e) => setTheoretical(e.target.checked)} />
              Show a THEORETICAL reconstruction (model prices from historical closes and Cboe volatility indexes, never actual quotes)
            </label>
          </div>
        )}

        {theo && (
          <div className="mb-3 rounded-xl border border-tv-border p-3 text-[11px] text-tv-muted space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="amber">THEORETICAL</Pill>
              <span>{data?.source}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <label>ATM IV = index ×<input type="number" step={0.01} className="input w-full mt-0.5" value={model.atmFactor} onChange={(e) => setModel({ ...model, atmFactor: Number(e.target.value) })} /></label>
              <label>Skew, vol pts per 10% OTM<input type="number" step={0.5} className="input w-full mt-0.5" value={model.skewPtsPer10Pct} onChange={(e) => setModel({ ...model, skewPtsPer10Pct: Number(e.target.value) })} /></label>
              <label>Assumed spread % of value<input type="number" step={1} className="input w-full mt-0.5" value={Math.round(model.spreadPct * 100)} onChange={(e) => setModel({ ...model, spreadPct: Number(e.target.value) / 100 })} /></label>
              <button className="btn self-end" onClick={() => load(filters, horizon, theoretical, model)}>Re-price</button>
            </div>
            <p>Monthly expirations only; $1 strikes; ticks of the day; open interest and volume unknown, so liquidity filters can't be applied. Skew scaled by the Cboe SKEW index when published that day.</p>
          </div>
        )}

        {loading && <div className="skeleton h-24 rounded-xl" />}
        {err && <p className="text-sm text-tv-red">{err}</p>}
        {data && 'error' in data && data.error && <p className="text-sm text-tv-amber">{data.error}</p>}

        {funnel && !loading && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
              {funnel.stages.map((s) => (
                <div key={s.id} className="rounded-lg border border-tv-border p-2">
                  <div className="text-[10px] text-tv-muted leading-tight">{s.label}</div>
                  <div className="font-mono font-bold text-white">{s.count}</div>
                  {s.note && <div className="text-[10px] text-tv-amber leading-tight mt-0.5">{s.note}</div>}
                </div>
              ))}
            </div>
            {Object.keys(funnel.rejectionCounts).length > 0 && (
              <details className="mb-3 text-xs">
                <summary className="cursor-pointer text-tv-muted">Why contracts were rejected</summary>
                <ul className="mt-1 grid sm:grid-cols-2 gap-x-4">
                  {Object.entries(funnel.rejectionCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                    <li key={k} className="flex justify-between gap-2 text-gray-400"><span>{k.replace(/#/g, '…')}</span><span className="font-mono">{n}</span></li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {Object.entries(funnel.picks).map(([k, v]) => {
                const r = rows.find((x) => x.ev.contract.symbol === v);
                return (
                  <button key={k} disabled={!r} onClick={() => r && choose(r)} className="rounded-full border border-tv-border px-2 py-0.5 text-[11px] text-gray-300 disabled:opacity-40">
                    {pickName[k]}: {r ? `${r.ev.contract.strike}P ${r.ev.contract.expiration.slice(5)}` : k === 'bestLiquidity' && theo ? 'not knowable' : '—'}
                  </button>
                );
              })}
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-tv-muted">No contract passed the filters on this date.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-tv-muted text-left">
                    <tr>
                      <th className="py-1 pr-2">Label</th><th className="pr-2">Contract</th><th className="pr-2 text-right">Bid / ask</th><th className="pr-2 text-right">Cost</th><th className="pr-2 text-right">Δ</th>
                      <th className="pr-2 text-right hidden md:table-cell">Γ</th><th className="pr-2 text-right hidden md:table-cell">Vega</th><th className="pr-2 text-right">Θ/day</th><th className="pr-2 text-right">IV</th>
                      <th className="pr-2 text-right hidden lg:table-cell">OI / vol</th><th className="pr-2 text-right">Quality</th><th className="text-right">Setup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const c = r.ev.contract;
                      const sel = selected?.optionSymbol === c.symbol;
                      return (
                        <tr key={c.symbol} onClick={() => choose(r)} className={`border-t border-white/[0.04] cursor-pointer ${sel ? 'bg-tv-purple/10' : 'hover:bg-white/[0.03]'}`}>
                          <td className="py-1.5 pr-2"><LabelBadge label={r.setup.label} /></td>
                          <td className="pr-2 font-mono text-white whitespace-nowrap">{c.strike}P {fmtDate(c.expiration)}<div className="text-[10px] text-tv-muted font-sans">{c.dte} DTE{theo ? ' · THEORETICAL' : ''}</div></td>
                          <td className="pr-2 font-mono text-right whitespace-nowrap">{usd(c.bid)} / {usd(c.ask)}</td>
                          <td className="pr-2 font-mono text-right">{usd(r.ev.costAtAsk)}</td>
                          <td className="pr-2 font-mono text-right">{c.delta?.toFixed(2)}</td>
                          <td className="pr-2 font-mono text-right hidden md:table-cell">{c.gamma?.toFixed(4)}</td>
                          <td className="pr-2 font-mono text-right hidden md:table-cell">{c.vega?.toFixed(3)}</td>
                          <td className="pr-2 font-mono text-right">{pctFmt(r.ev.thetaPctPerDay)}</td>
                          <td className="pr-2 font-mono text-right">{pctFmt(c.iv)}</td>
                          <td className="pr-2 font-mono text-right hidden lg:table-cell">{theo ? 'n/a' : `${c.openInterest ?? '—'} / ${c.volume ?? '—'}`}</td>
                          <td className={`pr-2 font-mono text-right font-bold ${TONE_TEXT[qualityTone(r.ev.quality)]}`}>{r.ev.quality ?? '—'}</td>
                          <td className={`font-mono text-right font-bold ${TONE_TEXT[qualityTone(r.setup.setup)]}`}>{r.setup.setup ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {selRow && funnel && <VolPanel row={selRow} rows={rows} S={funnel.underlyingPrice} theo={!!theo} />}
      {selected && <TradePanel date={date} symbol={symbol} sel={selected} canSeeFuture={canSeeFuture} model={model} onTrade={onTrade} />}
    </div>
  );
}

function VolPanel({ row, rows, S, theo }: { row: FunnelRow; rows: FunnelRow[]; S: number; theo: boolean }) {
  const c = row.ev.contract;
  const res = useMemo(() => {
    if (c.ask == null || c.iv == null) return null;
    const smile = smileFromChain(rows.filter((r) => r.ev.contract.expiration === c.expiration).map((r) => ({ strike: r.ev.contract.strike, iv: r.ev.contract.iv, type: 'put' as const })), S);
    return runScenarios({ type: 'put', S, K: c.strike, dte: c.dte, entry: c.ask, mid: row.ev.mid, iv: c.iv, r: 0.03, q: 0.012, smile, holdDays: Math.min(10, c.dte - 1), steps: 100 }, [-0.02, -0.05, -0.1], [-3, 0, 5, 10]);
  }, [c, rows, row.ev.mid, S]);
  if (!res) return null;
  return (
    <div className="card p-4">
      <SectionTitle title="Volatility can make or break a correct call" subtitle={`${c.strike}P ${fmtDate(c.expiration)} bought at ${usd(c.ask)} with ${S.toFixed(2)} underlying and ${(res.baseIv * 100).toFixed(1)}% IV. Value after ${res.holdDays} days.`} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-tv-muted"><tr><th className="text-left py-1">Underlying</th>{[-3, 0, 5, 10].map((v) => <th key={v} className="text-right">IV {v >= 0 ? '+' : ''}{v} pts</th>)}</tr></thead>
          <tbody>
            {[-0.02, -0.05, -0.1].map((ps) => (
              <tr key={ps} className="border-t border-white/[0.04]">
                <td className="py-1.5 font-mono">{(S * (1 + ps)).toFixed(2)} ({(ps * 100).toFixed(0)}%)</td>
                {[-3, 0, 5, 10].map((v) => {
                  const cell = res.hold.find((x) => x.priceShock === ps && x.ivShock === v)!;
                  return <td key={v} className={`text-right font-mono ${cell.pnl >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{usd(cell.value)}<div className="text-[10px]">{cell.pnl >= 0 ? '+' : ''}{Math.round(cell.pnlPct * 100)}%</div></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-tv-muted mt-2">
        Skew: {res.skewModel === 'sticky-moneyness' ? 'shocks follow the put smile, so this strike moves more or less than ATM' : 'flat (no smile available)'}. A small fall with falling IV can still lose money. {theo ? 'THEORETICAL model values.' : 'Model values from the actual quote.'} Estimates only.
      </p>
    </div>
  );
}

function TradePanel({ date, symbol, sel, canSeeFuture, model, onTrade }: { date: string; symbol: string; sel: SelectedContract; canSeeFuture: boolean; model: TheoreticalModel; onTrade?: (t: TradeData) => void }) {
  const [method, setMethod] = useState<EntryMethod>('ask');
  const [price, setPrice] = useState<number>(sel.mid ?? sel.ask ?? 0);
  const [contracts, setContracts] = useState(1);
  const [fee, setFee] = useState(0.65);
  const [exitFill, setExitFill] = useState<'bid' | 'mid'>('bid');
  const [exits, setExits] = useState<ExitRules>(DEFAULT_EXITS);
  const [res, setRes] = useState<TradeData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setRes(null);
    setPrice(sel.mid ?? sel.ask ?? 0);
  }, [sel.optionSymbol, sel.mid, sel.ask]);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const t = await historyPost<TradeData>({ action: 'trade', symbol, date, optionSymbol: sel.optionSymbol, strike: sel.strike, expiration: sel.expiration, kind: sel.kind, entry: { method, price, limitDays: 3 }, exitFill, contracts, feePerContract: fee, exits, model });
      setRes(t);
      onTrade?.(t);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const r = 'result' in (res ?? {}) ? (res as Extract<TradeData, { result: unknown }>).result : null;
  const capital = (sel.ask ?? 0) * 100 * contracts + fee * contracts;
  const num = (v: number | null, f: (x: number) => void) => (
    <input type="number" className="input w-full mt-0.5" value={v ?? ''} placeholder="off" onChange={(e) => f(e.target.value === '' ? NaN : Number(e.target.value))} />
  );
  return (
    <div className="card p-4 space-y-3">
      <SectionTitle title="Trade simulation" subtitle={`${sel.strike}P ${fmtDate(sel.expiration)} · ${sel.kind === 'theoretical' ? 'THEORETICAL prices' : 'actual historical quotes'} · capital at risk ≈ ${usd(capital)}`} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-tv-muted">
        <label>Entry
          <select className="input w-full mt-0.5" value={method} onChange={(e) => setMethod(e.target.value as EntryMethod)}>
            <option value="ask">Buy at ask</option><option value="mid">Buy at midpoint</option><option value="limit">Limit order</option><option value="custom">User-defined premium</option>
          </select>
        </label>
        {(method === 'limit' || method === 'custom') && <label>Limit / premium $<input type="number" step={0.01} className="input w-full mt-0.5" value={price} onChange={(e) => setPrice(Number(e.target.value))} /></label>}
        <label>Contracts<input type="number" min={1} className="input w-full mt-0.5" value={contracts} onChange={(e) => setContracts(Math.max(1, Number(e.target.value)))} /></label>
        <label>Fee / contract $<input type="number" step={0.05} className="input w-full mt-0.5" value={fee} onChange={(e) => setFee(Number(e.target.value))} /></label>
        <label>Exit fill
          <select className="input w-full mt-0.5" value={exitFill} onChange={(e) => setExitFill(e.target.value as 'bid' | 'mid')}><option value="bid">Sell at bid</option><option value="mid">Sell at midpoint (optimistic)</option></select>
        </label>
        <label>Profit target
          <select className="input w-full mt-0.5" value={exits.profitTarget ?? ''} onChange={(e) => setExits({ ...exits, profitTarget: e.target.value === '' ? null : Number(e.target.value) })}>
            <option value="">None</option>{TARGETS.map((t) => <option key={t} value={t}>+{t * 100}%</option>)}
          </select>
        </label>
        <label>Max loss
          <select className="input w-full mt-0.5" value={exits.maxLoss ?? ''} onChange={(e) => setExits({ ...exits, maxLoss: e.target.value === '' ? null : Number(e.target.value) })}>
            <option value="">None</option>{LOSSES.map((t) => <option key={t} value={t}>−{t * 100}%</option>)}
          </select>
        </label>
        <label>Exit if underlying ≤ ${num(exits.underlyingTarget, (v) => setExits({ ...exits, underlyingTarget: Number.isFinite(v) ? v : null }))}</label>
        <label>Exit if VIX ≥{num(exits.vixAbove, (v) => setExits({ ...exits, vixAbove: Number.isFinite(v) ? v : null }))}</label>
        <label>Max hold (days){num(exits.maxHoldDays, (v) => setExits({ ...exits, maxHoldDays: Number.isFinite(v) ? v : null }))}</label>
        <label>Sell N days before expiry{num(exits.exitDaysBeforeExpiry, (v) => setExits({ ...exits, exitDaysBeforeExpiry: Number.isFinite(v) ? v : null }))}</label>
        <label>Manual exit date<input type="date" className="input w-full mt-0.5" value={exits.manualExit ?? ''} onChange={(e) => setExits({ ...exits, manualExit: e.target.value || null })} /></label>
        <label className="flex items-center gap-2 mt-4"><input type="checkbox" checked={exits.onBreakdown} onChange={(e) => setExits({ ...exits, onBreakdown: e.target.checked })} />Exit on technical breakdown</label>
      </div>
      <p className="text-[11px] text-tv-muted">Targets and stops are simulation settings checked at each daily close, not guaranteed fills: a move past them fills at the next close that is actually available. Midpoint and limit orders fill only when that day's ask reached the limit.</p>
      <button className="btn btn-primary" disabled={!canSeeFuture || busy} onClick={run}>{busy ? 'Simulating…' : 'Simulate trade'}</button>
      {!canSeeFuture && <p className="text-xs text-tv-amber">No Hindsight Mode: record your decision first. The simulation uses prices after this date, so it stays locked until then.</p>}
      {err && <p className="text-sm text-tv-red">{err}</p>}
      {res && 'error' in res && <p className="text-sm text-tv-amber">{String((res as { error: string }).error)}</p>}
      {r && !r.filled && <p className="text-sm text-tv-amber">Not filled: {r.unfilledReason}</p>}
      {r && r.filled && (
        <>
          <div className="flex flex-wrap gap-2">
            <Pill tone={r.kind === 'theoretical' ? 'amber' : 'green'}>{r.kind === 'theoretical' ? 'THEORETICAL RESULT' : 'ACTUAL QUOTES'}</Pill>
            {r.gapThrough && <Pill tone="red">Filled past the threshold (gap-through)</Pill>}
            {r.fillWarnings.map((w) => <Pill key={w} tone="amber">{w}</Pill>)}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <Stat label="Entry" value={usd(r.entryPremium)} sub={`${fmtDate(r.entryDate)} · S ${r.entryS?.toFixed(2)} · IV ${pctFmt(r.entryIv)}`} />
            <Stat label="Exit" value={usd(r.exitPremium)} sub={`${fmtDate(r.exitDate)} · ${r.exitReason}`} />
            <Stat label="Capital deployed" value={usd(r.capital)} />
            <Stat label="Net P/L" value={usd(r.net)} tone={(r.net ?? 0) >= 0 ? 'green' : 'red'} sub={`gross ${usd(r.gross)} · fees ${usd(r.fees)}`} />
            <Stat label="Return" value={pctFmt(r.returnPct, 0, true)} tone={(r.returnPct ?? 0) >= 0 ? 'green' : 'red'} sub={`${r.holdingDays} days held`} />
            <Stat label="MFE / MAE" value={`${usd(r.mfe, 0)} / ${usd(r.mae, 0)}`} sub={`max drawdown ${pctFmt(r.maxDrawdown, 0)}`} />
            <Stat label="Held to expiry" value={r.holdToExpiry?.net != null ? usd(r.holdToExpiry.net) : 'n/a'} sub={r.holdToExpiry?.returnPct != null ? pctFmt(r.holdToExpiry.returnPct, 0, true) : 'expiry beyond available data'} />
            <Stat label="Capital efficiency" value={r.capitalEfficiency != null ? pctFmt(r.capitalEfficiency, 0, true) : '—'} sub="net return per 30 days held" />
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={r.path} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#ffffff10" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} minTickGap={30} />
                <YAxis yAxisId="v" tick={{ fontSize: 10, fill: '#888' }} width={45} />
                <YAxis yAxisId="s" orientation="right" tick={{ fontSize: 10, fill: '#888' }} width={45} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }} />
                <Line yAxisId="v" dataKey="mark" name="Option mark $" stroke="#a78bfa" dot={false} strokeWidth={2} />
                <Line yAxisId="v" dataKey="exitValue" name="Exit value $" stroke="#f59e0b" dot={false} strokeDasharray="4 3" />
                <Line yAxisId="s" dataKey="S" name={`${symbol} close`} stroke="#94a3b8" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
