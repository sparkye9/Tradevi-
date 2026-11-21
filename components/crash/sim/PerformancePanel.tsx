'use client';
/** Signal performance over the whole history: declines, lead times, false alarms, splits, walk-forward. */
import { useState } from 'react';
import { Area, ComposedChart, CartesianGrid, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { REGIME_ORDER, type Regime } from '@/lib/crash/regime';
import type { SignalStats } from '@/lib/crash/history/signals';
import { Pill, SectionTitle, Stat, fmtDate, pctFmt } from '../ui';
import { historyPost, type EvaluateData } from './api';

export interface EvalParams {
  decline: { threshold: number; highWindow: number };
  rule: { kind: 'score'; min: number } | { kind: 'regimes'; regimes: Regime[] };
  eval: { maxLeadDays: number; minLeadDays: number; horizonDays: number; mergeGap: number };
  splitDate: string;
  walkForward: { candidates: number[]; trainYears: number; testYears: number };
}

export const DEFAULT_EVAL_PARAMS: EvalParams = {
  decline: { threshold: 0.1, highWindow: 252 },
  rule: { kind: 'score', min: 40 },
  eval: { maxLeadDays: 120, minLeadDays: 5, horizonDays: 120, mergeGap: 5 },
  splitDate: '2016-01-01',
  walkForward: { candidates: [25, 30, 35, 40, 45, 50, 55, 60], trainYears: 6, testYears: 2 },
};

function StatsBlock({ title, s }: { title: string; s: SignalStats }) {
  return (
    <div className="rounded-xl border border-tv-border p-3">
      <div className="text-xs font-semibold text-white mb-2">{title}</div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Declines" value={s.declines} sub={`${s.warned} warned · ${s.missed} missed`} />
        <Stat label="Identified in advance" value={pctFmt(s.hitRate, 0)} />
        <Stat label="Avg lead" value={s.avgLeadDays != null ? `${Math.round(s.avgLeadDays)} d` : '—'} sub={s.medianLeadDays != null ? `median ${Math.round(s.medianLeadDays)} d` : undefined} />
        <Stat label="Warnings" value={s.episodes} sub={`${s.preceded} preceded a decline`} />
        <Stat label="False alarms" value={s.falseAlarms} tone={s.falseAlarms ? 'amber' : 'gray'} sub={s.falseAlarmRate != null ? `${pctFmt(s.falseAlarmRate, 0)} of resolved warnings` : undefined} />
        <Stat label="Time in warning" value={pctFmt(s.timeOn, 0)} sub={s.avgEpisodeSessions != null ? `avg ${Math.round(s.avgEpisodeSessions)} sessions` : undefined} />
      </div>
    </div>
  );
}

export default function PerformancePanel({ params, setParams, onResult, noHindsight }: { params: EvalParams; setParams: (p: EvalParams) => void; onResult: (r: EvaluateData) => void; noHindsight: boolean }) {
  const [data, setData] = useState<EvaluateData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const r = await historyPost<EvaluateData>({ action: 'evaluate', ...params });
      setData(r);
      onResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const rep = data?.report;
  return (
    <div className="card p-4 space-y-4">
      <SectionTitle title="Performance report: would it have warned?" subtitle="Every major decline in the history, detected mechanically, scored against the point-in-time signal. Declines don't overlap, so one bear market counts once." />
      {noHindsight && <p className="text-xs text-tv-amber">This report shows the whole history, including what happened after your replay date. Turn off No Hindsight Mode, or record your decision, to run it.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-[11px] text-tv-muted">
        <label>Major decline
          <select className="input w-full mt-0.5" value={params.decline.threshold} onChange={(e) => setParams({ ...params, decline: { ...params.decline, threshold: Number(e.target.value) } })}>
            {[0.07, 0.1, 0.15, 0.2, 0.3].map((t) => <option key={t} value={t}>{Math.round(t * 100)}% from the rolling high</option>)}
          </select>
        </label>
        <label>Rolling high (sessions)<input type="number" className="input w-full mt-0.5" value={params.decline.highWindow} onChange={(e) => setParams({ ...params, decline: { ...params.decline, highWindow: Number(e.target.value) } })} /></label>
        <label>Signal
          <select className="input w-full mt-0.5" value={params.rule.kind === 'score' ? `score:${params.rule.min}` : `regime:${params.rule.regimes.join('|')}`} onChange={(e) => {
            const v = e.target.value;
            setParams({ ...params, rule: v.startsWith('score:') ? { kind: 'score', min: Number(v.slice(6)) } : { kind: 'regimes', regimes: v.slice(7).split('|') as Regime[] } });
          }}>
            {[20, 30, 40, 50, 60].map((m) => <option key={m} value={`score:${m}`}>Risk score ≥ {m}</option>)}
            <option value="regime:PRE-CRASH WATCH">PRE-CRASH WATCH</option>
            <option value="regime:EARLY WARNING|ELEVATED RISK|PRE-CRASH WATCH">Early warning or worse (before breakdown)</option>
            <option value="regime:BREAKDOWN CONFIRMED">BREAKDOWN CONFIRMED</option>
            <option value={`regime:${REGIME_ORDER.filter((r) => r !== 'NORMAL').join('|')}`}>Any non-normal regime</option>
          </select>
        </label>
        <label>Lead window (days)<input type="number" className="input w-full mt-0.5" value={params.eval.maxLeadDays} onChange={(e) => setParams({ ...params, eval: { ...params.eval, maxLeadDays: Number(e.target.value) } })} /></label>
        <label>False alarm if no decline within (days)<input type="number" className="input w-full mt-0.5" value={params.eval.horizonDays} onChange={(e) => setParams({ ...params, eval: { ...params.eval, horizonDays: Number(e.target.value) } })} /></label>
        <label>Out-of-sample from<input type="date" className="input w-full mt-0.5" value={params.splitDate} onChange={(e) => setParams({ ...params, splitDate: e.target.value })} /></label>
        <label>Walk-forward train (years)<input type="number" className="input w-full mt-0.5" value={params.walkForward.trainYears} onChange={(e) => setParams({ ...params, walkForward: { ...params.walkForward, trainYears: Number(e.target.value) } })} /></label>
        <label>Walk-forward test (years)<input type="number" className="input w-full mt-0.5" value={params.walkForward.testYears} onChange={(e) => setParams({ ...params, walkForward: { ...params.walkForward, testYears: Number(e.target.value) } })} /></label>
        <button className="btn btn-primary self-end" disabled={busy || noHindsight} onClick={run}>{busy ? 'Running…' : 'Run report'}</button>
      </div>
      {err && <p className="text-sm text-tv-red">{err}</p>}
      {busy && <div className="skeleton h-40 rounded-xl" />}
      {data && rep && !busy && (
        <>
          <div className="grid lg:grid-cols-3 gap-3">
            <StatsBlock title="Whole history" s={rep.stats} />
            <StatsBlock title={`In-sample (before ${fmtDate(data.split.splitDate)})`} s={data.split.inSample} />
            <StatsBlock title={`Out-of-sample (from ${fmtDate(data.split.splitDate)}, unseen when thresholds were set)`} s={data.split.outOfSample} />
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={data.sampled} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#ffffff10" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} minTickGap={40} />
                <YAxis yAxisId="s" domain={[0, 100]} tick={{ fontSize: 10, fill: '#888' }} width={30} />
                <YAxis yAxisId="p" orientation="right" tick={{ fontSize: 10, fill: '#888' }} width={40} domain={['auto', 'auto']} scale="log" />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }} />
                {rep.events.map((e) => <ReferenceArea key={e.event.peakDate} yAxisId="s" x1={e.event.peakDate} x2={e.event.troughDate} fill="#ef4444" fillOpacity={0.12} />)}
                <Area yAxisId="s" dataKey="score" name="Risk score" stroke="#a78bfa" fill="#a78bfa33" dot={false} />
                <Line yAxisId="p" dataKey="spy" name="SPY" stroke="#94a3b8" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-tv-muted">Red bands: declines from peak to trough. Score sampled weekly for the chart; statistics use every session.</p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-tv-muted text-left">
                <tr><th className="py-1 pr-2">Decline</th><th className="pr-2">Became major</th><th className="pr-2 text-right">Max fall</th><th className="pr-2">First warning</th><th className="pr-2 text-right">Lead</th>{[90, 60, 30, 10, 1].map((d) => <th key={d} className="pr-2 text-right">{d}d before</th>)}</tr>
              </thead>
              <tbody>
                {rep.events.map((e) => (
                  <tr key={e.event.crossDate} className="border-t border-white/[0.04]">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{fmtDate(e.event.peakDate)} → {fmtDate(e.event.troughDate)}</td>
                    <td className="pr-2 whitespace-nowrap">{fmtDate(e.event.crossDate)}</td>
                    <td className="pr-2 text-right font-mono text-tv-red">−{pctFmt(e.event.maxDrawdown, 0)}</td>
                    <td className="pr-2 whitespace-nowrap">{e.firstWarning ? fmtDate(e.firstWarning) : <Pill tone="red">MISSED</Pill>}{e.alreadyOn && <span className="text-tv-amber"> (already on)</span>}</td>
                    <td className="pr-2 text-right font-mono">{e.leadDays != null ? `${e.leadDays} d` : '—'}</td>
                    {e.checkpoints.map((c) => (
                      <td key={c.daysBefore} className={`pr-2 text-right font-mono ${c.on ? 'text-tv-red' : 'text-tv-muted'}`} title={c.regime ?? ''}>{c.score != null ? Math.round(c.score) : '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-tv-muted mt-1">Checkpoint cells show the score that day; red means the signal was on.</p>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-white font-semibold">Warnings: {rep.episodes.length} ({rep.stats.falseAlarms} false alarms)</summary>
            <div className="overflow-x-auto mt-2">
              <table className="w-full">
                <thead className="text-tv-muted text-left"><tr><th className="py-1 pr-2">Start</th><th className="pr-2">End</th><th className="pr-2 text-right">Sessions</th><th>Outcome</th></tr></thead>
                <tbody>
                  {rep.episodes.map((x) => (
                    <tr key={x.start} className="border-t border-white/[0.04]">
                      <td className="py-1 pr-2">{fmtDate(x.start)}</td><td className="pr-2">{fmtDate(x.end)}</td><td className="pr-2 text-right font-mono">{x.sessions}</td>
                      <td><Pill tone={x.outcome === 'false alarm' ? 'amber' : x.outcome === 'preceded decline' ? 'green' : 'gray'}>{x.outcome}</Pill>{x.eventCross && <span className="text-tv-muted"> → {fmtDate(x.eventCross)}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <div>
            <div className="text-xs font-semibold text-white mb-1">Walk-forward: threshold chosen on each training window, tested on the next unseen one</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-tv-muted text-left"><tr><th className="py-1 pr-2">Train</th><th className="pr-2">Test</th><th className="pr-2 text-right">Chosen ≥</th><th className="pr-2 text-right">Declines</th><th className="pr-2 text-right">Warned</th><th className="pr-2 text-right">False alarms</th></tr></thead>
                <tbody>
                  {data.walkForward.folds.map((f) => (
                    <tr key={f.testFrom} className="border-t border-white/[0.04]">
                      <td className="py-1 pr-2 whitespace-nowrap">{f.trainFrom.slice(0, 7)} – {f.trainTo.slice(0, 7)}</td>
                      <td className="pr-2 whitespace-nowrap">{f.testFrom.slice(0, 7)} – {f.testTo.slice(0, 7)}</td>
                      <td className="pr-2 text-right font-mono">{f.chosenMin}{f.defaulted && <span className="text-tv-amber" title="No decline in the training window; default kept">*</span>}</td>
                      <td className="pr-2 text-right font-mono">{f.test.declines}</td>
                      <td className="pr-2 text-right font-mono">{f.test.warned}</td>
                      <td className="pr-2 text-right font-mono">{f.test.falseAlarms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-tv-muted mt-1">
              Combined out-of-sample: {data.walkForward.combined.warned} of {data.walkForward.combined.declines} declines warned ({pctFmt(data.walkForward.combined.hitRate, 0)}), {data.walkForward.combined.falseAlarms} false alarms ({pctFmt(data.walkForward.combined.falseAlarmRate, 0)}). * default threshold kept because training had no decline.
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold text-white mb-1">First date each classification appeared, by research window</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-tv-muted text-left"><tr><th className="py-1 pr-2">Window</th>{REGIME_ORDER.filter((r) => r !== 'NORMAL').map((r) => <th key={r} className="pr-2">{r}</th>)}</tr></thead>
                <tbody>
                  {data.windows.map((w) => (
                    <tr key={w.id} className="border-t border-white/[0.04]">
                      <td className="py-1 pr-2 whitespace-nowrap">{w.label}</td>
                      {REGIME_ORDER.filter((r) => r !== 'NORMAL').map((r) => <td key={r} className="pr-2 whitespace-nowrap">{w.first[r] ? fmtDate(w.first[r]) : '—'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
