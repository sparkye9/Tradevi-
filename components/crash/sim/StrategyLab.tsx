'use client';
/** Strategy Comparison Lab: strategies A–F over the same history and execution assumptions. */
import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { STRATEGIES, DEFAULT_LAB, type LabSettings, type StrategyDef } from '@/lib/crash/history/strategies';
import { Pill, SectionTitle, fmtDate, pctFmt, usd } from '../ui';
import { download, historyPost, toCsv, type LabData } from './api';

const COLORS: Record<StrategyDef['id'], string> = { A: '#a78bfa', B: '#38bdf8', C: '#22c55e', D: '#f59e0b', E: '#ef4444', F: '#e879f9' };

export interface LabParamsUi {
  settings: LabSettings;
  strategies: StrategyDef['id'][];
  overrides: Partial<Record<StrategyDef['id'], { entryMin?: number; exits?: { profitTarget?: number | null; maxLoss?: number | null } }>>;
  decline: { threshold: number; highWindow: number };
  preferTheoretical: boolean;
}

export const DEFAULT_LAB_PARAMS: LabParamsUi = {
  settings: { ...DEFAULT_LAB, to: new Date().toISOString().slice(0, 10) },
  strategies: ['A', 'B', 'C', 'D', 'E', 'F'],
  overrides: {},
  decline: { threshold: 0.1, highWindow: 252 },
  preferTheoretical: false,
};

const fmtPf = (x: number | null) => (x == null ? '—' : x.toFixed(2));

export default function StrategyLab({ params, setParams, onResult, noHindsight }: { params: LabParamsUi; setParams: (p: LabParamsUi) => void; onResult: (r: LabData) => void; noHindsight: boolean }) {
  const [data, setData] = useState<LabData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<StrategyDef['id'] | null>(null);
  const s = params.settings;
  const set = (k: keyof LabSettings, v: string | number) => setParams({ ...params, settings: { ...s, [k]: v } });

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const r = await historyPost<LabData>({ action: 'lab', ...params });
      setData(r);
      onResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Merge equity curves on a shared date axis.
  const curve = (() => {
    if (!data) return [];
    const dates = Array.from(new Set(data.reports.flatMap((r) => r.equity.map((e) => e.date)))).sort();
    const last: Record<string, number> = {};
    return dates.map((d) => {
      const row: Record<string, string | number> = { date: d };
      for (const r of data.reports) {
        const hit = r.equity.filter((e) => e.date <= d).pop();
        last[r.def.id] = hit ? hit.equity : s.initialCapital;
        row[r.def.id] = Math.round(last[r.def.id]);
      }
      return row;
    });
  })();

  const anyTheo = data?.reports.some((r) => r.kinds.theoretical > 0);
  const opened = data?.reports.find((r) => r.def.id === open) ?? null;

  return (
    <div className="card p-4 space-y-4">
      <SectionTitle title="Strategy Comparison Lab" subtitle="Six put strategies on the same history, with the same capital, sizing and fills. One position at a time per strategy. No strategy is assumed to win." />
      {noHindsight && <p className="text-xs text-tv-amber">The lab uses the whole history, including what came after your replay date. Turn off No Hindsight Mode, or record your decision, to run it.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-[11px] text-tv-muted">
        <label>Underlying<select className="input w-full mt-0.5" value={s.symbol} onChange={(e) => set('symbol', e.target.value)}>{['SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'KRE'].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>From<input type="date" className="input w-full mt-0.5" value={s.from} onChange={(e) => set('from', e.target.value)} /></label>
        <label>To<input type="date" className="input w-full mt-0.5" value={s.to} onChange={(e) => set('to', e.target.value)} /></label>
        <label>Initial capital $<input type="number" className="input w-full mt-0.5" value={s.initialCapital} onChange={(e) => set('initialCapital', Number(e.target.value))} /></label>
        <label>Risk per trade $<input type="number" className="input w-full mt-0.5" value={s.riskPerTrade} onChange={(e) => set('riskPerTrade', Number(e.target.value))} /></label>
        <label>Fee / contract $<input type="number" step={0.05} className="input w-full mt-0.5" value={s.feePerContract} onChange={(e) => set('feePerContract', Number(e.target.value))} /></label>
        <label>Entry<select className="input w-full mt-0.5" value={s.entryMethod} onChange={(e) => set('entryMethod', e.target.value)}><option value="ask">At ask</option><option value="mid">Midpoint (unverified)</option></select></label>
        <label>Out-of-sample from<input type="date" className="input w-full mt-0.5" value={s.splitDate} onChange={(e) => set('splitDate', e.target.value)} /></label>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {STRATEGIES.map((st) => {
          const on = params.strategies.includes(st.id);
          const o = params.overrides[st.id] ?? {};
          return (
            <div key={st.id} className={`rounded-xl border p-2.5 text-[11px] ${on ? 'border-tv-purple/40' : 'border-tv-border opacity-60'}`}>
              <label className="flex items-center gap-2 text-xs font-semibold text-white">
                <input type="checkbox" checked={on} onChange={(e) => setParams({ ...params, strategies: e.target.checked ? [...params.strategies, st.id] : params.strategies.filter((x) => x !== st.id) })} />
                <span style={{ color: COLORS[st.id] }}>{st.id}</span> {st.name}
              </label>
              <p className="text-tv-muted mt-1">{st.about}</p>
              <p className="text-tv-muted">Entry: {st.entry.kind === 'score' ? `risk score ≥ ${o.entryMin ?? st.entry.min}` : st.entry.regimes.join(' / ')}</p>
              <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                {st.entry.kind === 'score' && (
                  <label>Score ≥<input type="number" className="input w-full" value={o.entryMin ?? st.entry.min} onChange={(e) => setParams({ ...params, overrides: { ...params.overrides, [st.id]: { ...o, entryMin: Number(e.target.value) } } })} /></label>
                )}
                <label>Target %<input type="number" className="input w-full" value={Math.round((o.exits?.profitTarget ?? st.exits.profitTarget ?? 0) * 100)} onChange={(e) => setParams({ ...params, overrides: { ...params.overrides, [st.id]: { ...o, exits: { ...o.exits, profitTarget: Number(e.target.value) / 100 || null } } } })} /></label>
                <label>Stop %<input type="number" className="input w-full" value={Math.round((o.exits?.maxLoss ?? st.exits.maxLoss ?? 0) * 100)} onChange={(e) => setParams({ ...params, overrides: { ...params.overrides, [st.id]: { ...o, exits: { ...o.exits, maxLoss: Number(e.target.value) / 100 || null } } } })} /></label>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={busy || noHindsight || !params.strategies.length} onClick={run}>{busy ? 'Running the lab… (up to a minute)' : 'Run comparison'}</button>
        <label className="text-xs text-tv-muted flex items-center gap-2"><input type="checkbox" checked={params.preferTheoretical} onChange={(e) => setParams({ ...params, preferTheoretical: e.target.checked })} />Use the theoretical model even where actual chains are loaded</label>
      </div>
      {err && <p className="text-sm text-tv-red">{err}</p>}
      {busy && <div className="skeleton h-40 rounded-xl" />}
      {data && !busy && (
        <>
          {anyTheo && (
            <div className="rounded-xl border border-tv-amber/30 bg-tv-amber/[0.06] p-3 text-xs text-gray-300">
              <span className="font-bold text-tv-amber">THEORETICAL RESULTS.</span> Trades priced with the disclosed model where no licensed chain was loaded ({data.reports.reduce((a, r) => a + r.kinds.theoretical, 0)} theoretical, {data.reports.reduce((a, r) => a + r.kinds.actual, 0)} actual). Open interest and volume could not be checked. These are not historical trades and options-performance criteria stay unmet until actual chains are imported.
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="text-tv-muted text-left">
                <tr>
                  <th className="py-1 pr-2">Strategy</th><th className="pr-2 text-right">Trades</th><th className="pr-2 text-right">Won / lost</th><th className="pr-2 text-right">Premium spent</th><th className="pr-2 text-right">Net P/L</th><th className="pr-2 text-right">Avg win / loss</th>
                  <th className="pr-2 text-right">Profit factor</th><th className="pr-2 text-right">Expectancy</th><th className="pr-2 text-right">Max DD</th><th className="pr-2 text-right">Worst streak</th><th className="pr-2 text-right">Avg hold</th><th className="pr-2 text-right">In-sample net</th><th className="pr-2 text-right">Out-of-sample net</th><th className="text-right">Declines caught</th>
                </tr>
              </thead>
              <tbody>
                {data.reports.map((r) => (
                  <tr key={r.def.id} className="border-t border-white/[0.04] cursor-pointer hover:bg-white/[0.03]" onClick={() => setOpen(open === r.def.id ? null : r.def.id)}>
                    <td className="py-1.5 pr-2 whitespace-nowrap"><span style={{ color: COLORS[r.def.id] }} className="font-bold">{r.def.id}</span> {r.def.name}</td>
                    <td className="pr-2 text-right font-mono">{r.stats.trades}</td>
                    <td className="pr-2 text-right font-mono">{r.stats.wins} / {r.stats.losses}</td>
                    <td className="pr-2 text-right font-mono">{usd(r.stats.totalPremium, 0)}</td>
                    <td className={`pr-2 text-right font-mono ${r.stats.net >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{usd(r.stats.net, 0)}</td>
                    <td className="pr-2 text-right font-mono">{pctFmt(r.stats.avgWinPct, 0, true)} / {pctFmt(r.stats.avgLossPct, 0, true)}</td>
                    <td className="pr-2 text-right font-mono">{fmtPf(r.stats.profitFactor)}</td>
                    <td className="pr-2 text-right font-mono">{usd(r.stats.expectancy, 0)}</td>
                    <td className="pr-2 text-right font-mono">{pctFmt(r.stats.maxDrawdown, 0)}</td>
                    <td className="pr-2 text-right font-mono">{r.stats.maxConsecutiveLosses}</td>
                    <td className="pr-2 text-right font-mono">{r.stats.avgHoldDays != null ? `${Math.round(r.stats.avgHoldDays)} d` : '—'}</td>
                    <td className={`pr-2 text-right font-mono ${r.inSample.net >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{usd(r.inSample.net, 0)} <span className="text-tv-muted">({r.inSample.trades})</span></td>
                    <td className={`pr-2 text-right font-mono ${r.outOfSample.net >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{usd(r.outOfSample.net, 0)} <span className="text-tv-muted">({r.outOfSample.trades})</span></td>
                    <td className="text-right font-mono">{r.capturedDeclines.length} / {r.capturedDeclines.length + r.missedDeclines.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-tv-muted mt-1">Click a row for its trade-by-trade history, results by regime and year, and missed declines. Profit factor is blank when there were no losing trades.</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={curve} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#ffffff10" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: '#888' }} width={55} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {data.reports.map((r) => <Line key={r.def.id} type="stepAfter" dataKey={r.def.id} name={`${r.def.id} ${r.def.name}`} stroke={COLORS[r.def.id]} dot={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {opened && (
            <div className="rounded-xl border border-tv-border p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-white">{opened.def.id} · {opened.def.name}: trades</div>
                <button className="btn text-xs" onClick={() => download(`tradevi-strategy-${opened.def.id}.csv`, toCsv(opened.trades.map((t) => ({ signal: t.signalDate, regime: t.regimeAtEntry, score: t.scoreAtEntry, contract: t.contract.symbol, kind: t.result.kind, filled: t.result.filled, entry_date: t.result.entryDate, entry: t.result.entryPremium, contracts: t.result.contracts, exit_date: t.result.exitDate, exit: t.result.exitPremium, reason: t.result.exitReason, gap_through: t.result.gapThrough, net: t.result.net, return_pct: t.result.returnPct, mfe: t.result.mfe, mae: t.result.mae }))), 'text/csv')}>Export CSV</button>
              </div>
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-xs">
                  <thead className="text-tv-muted text-left"><tr><th className="py-1 pr-2">Signal</th><th className="pr-2">Regime</th><th className="pr-2">Contract</th><th className="pr-2 text-right">Entry</th><th className="pr-2 text-right">Exit</th><th className="pr-2">Reason</th><th className="pr-2 text-right">Net</th><th className="text-right">Return</th></tr></thead>
                  <tbody>
                    {opened.trades.map((t) => (
                      <tr key={t.signalDate} className="border-t border-white/[0.04]">
                        <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(t.signalDate)}</td>
                        <td className="pr-2 whitespace-nowrap">{t.regimeAtEntry ?? '—'}</td>
                        <td className="pr-2 font-mono whitespace-nowrap">{t.contract.strike}P {t.contract.expiration} {t.result.kind === 'theoretical' && <Pill tone="amber">THEO</Pill>}</td>
                        <td className="pr-2 text-right font-mono whitespace-nowrap">{t.result.filled ? `${usd(t.result.entryPremium)} × ${t.result.contracts}` : 'unfilled'}</td>
                        <td className="pr-2 text-right font-mono whitespace-nowrap">{t.result.filled ? `${usd(t.result.exitPremium)} ${fmtDate(t.result.exitDate)}` : '—'}</td>
                        <td className="pr-2">{t.result.exitReason ?? t.result.unfilledReason}{t.result.gapThrough ? ' (gap-through)' : ''}</td>
                        <td className={`pr-2 text-right font-mono ${(t.result.net ?? 0) >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{usd(t.result.net, 0)}</td>
                        <td className="text-right font-mono">{pctFmt(t.result.returnPct, 0, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-tv-muted mb-1">By regime at entry</div>
                  {Object.entries(opened.byRegime).map(([k, v]) => <div key={k} className="flex justify-between"><span>{k}</span><span className="font-mono">{v.trades} · {usd(v.net, 0)}</span></div>)}
                </div>
                <div>
                  <div className="text-tv-muted mb-1">By year (losing years included)</div>
                  {Object.entries(opened.byYear).map(([k, v]) => <div key={k} className="flex justify-between"><span>{k}</span><span className={`font-mono ${v.net >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{v.trades} · {usd(v.net, 0)}</span></div>)}
                </div>
                <div>
                  <div className="text-tv-muted mb-1">Missed declines (no position from the lead window to the trough)</div>
                  {opened.missedDeclines.length ? opened.missedDeclines.map((d) => <div key={d}>{fmtDate(d)}</div>) : <div>None</div>}
                  {opened.skipped.length > 0 && <div className="text-tv-muted mt-2">{opened.skipped.length} signals skipped (e.g. {opened.skipped[0].reason})</div>}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
