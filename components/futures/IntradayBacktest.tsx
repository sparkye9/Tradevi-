'use client';
import { useRef, useState } from 'react';
import { Notice, Stat, usd } from '@/components/ui/Form';
import { parseDatabentoCsv, type DatabentoParse } from '@/lib/databentoCsv';
import { backtestPowerHour, type PhBacktestResult } from '@/lib/powerHourBacktest';
import { DEFAULT_POWER_HOUR } from '@/lib/powerHourEngine';
import { useWorkspaceStore } from '@/store/workspaceStore';

const RULE_LABEL: Record<string, string> = {
  session: 'Session / holiday', data: 'Data', news: 'News', structure: '5m not directional', vwap: 'Wrong side of VWAP',
  htf: '15m opposing', volatility: 'Range abnormal', rr: 'R:R too low',
};

function hm(s: string, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

/**
 * Upload a Databento ohlcv-1m CSV and replay the Power Hour rules on it.
 * Everything runs in the browser — the file is never sent to a server.
 */
export default function IntradayBacktest() {
  const { phEntry, phExit } = useWorkspaceStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [instrument, setInstrument] = useState('MNQ');
  const [fees, setFees] = useState('1.24');
  const [slip, setSlip] = useState('1');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [parsed, setParsed] = useState<DatabentoParse | null>(null);
  const [res, setRes] = useState<PhBacktestResult | null>(null);

  async function run(file: File) {
    setBusy(true); setErr(null); setRes(null);
    try {
      if (file.size > 250 * 1024 * 1024) throw new Error('File is over 250 MB — export a shorter range.');
      const text = await file.text();
      // Yield so the "running" state paints before the heavy work.
      await new Promise((r) => setTimeout(r, 30));
      const p = parseDatabentoCsv(text);
      setParsed(p);
      const [es, ee] = phEntry.split('-');
      const [xs, xe] = phExit.split('-');
      const D = DEFAULT_POWER_HOUR;
      setRes(backtestPowerHour({
        instrument,
        bars1m: p.bars,
        cfg: { ...D, entryStart: hm(es ?? '', D.entryStart), entryEnd: hm(ee ?? '', D.entryEnd), exitStart: hm(xs ?? '', D.exitStart), exitEnd: hm(xe ?? '', D.exitEnd) },
        feesRoundTrip: Math.max(0, Number(fees) || 0),
        slippageTicks: Math.max(0, Math.round(Number(slip) || 0)),
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  const count = (o: string) => res?.days.filter((d) => d.outcome === o).length ?? 0;
  const s = res?.stats;

  return (
    <section className="rounded-2xl border border-tv-border bg-[#0b0e14] p-4 space-y-3">
      <div>
        <h2 className="text-lg font-black text-white">Intraday Power Hour backtest</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Upload a Databento <span className="font-mono">ohlcv-1m</span> CSV (from <span className="font-mono">scripts/databento-download.ts</span> or the Databento portal).
          It replays the live Power Hour rules for your window ({phEntry} / {phExit} ET). Runs in your browser — the file is not uploaded.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1"><span className="label">Contract</span>
          <select className="input font-sans w-28" value={instrument} onChange={(e) => setInstrument(e.target.value)}>
            {['MNQ', 'NQ', 'MES', 'ES', 'MYM', 'YM', 'M2K', 'RTY', 'MGC', 'GC'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="space-y-1"><span className="label">Fees RT ($)</span><input className="input w-24" value={fees} onChange={(e) => setFees(e.target.value)} inputMode="decimal" /></label>
        <label className="space-y-1"><span className="label">Slippage (ticks)</span><input className="input w-24" value={slip} onChange={(e) => setSlip(e.target.value)} inputMode="numeric" /></label>
        <button className="btn btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Running…' : 'Choose CSV and run'}</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run(f); }} />
      </div>
      <p className="text-[10px] text-gray-600">Contract sets tick and point value. Use the contract that matches your file (e.g. MNQ for MNQ.v.0).</p>

      {err && <Notice tone="bad">{err}</Notice>}
      {parsed && parsed.warnings.map((w) => <Notice key={w}>{w}</Notice>)}

      {res && s && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400 font-mono">{res.from} → {res.to} · {res.sessions} sessions · {parsed?.bars.length.toLocaleString()} one-minute bars · {parsed?.symbols.join(', ')}</p>
          {res.sampleWarning && <Notice>{res.sampleWarning}</Notice>}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Stat label="Traded days" value={count('traded')} />
            <Stat label="NO TRADE days" value={count('no_trade')} />
            <Stat label="Candidate, never confirmed" value={count('candidate_unconfirmed')} />
            <Stat label="No data" value={count('no_data')} tone="muted" />
            <Stat label="Holiday / early close" value={count('skipped_calendar')} tone="muted" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Win rate" value={`${s.winRate}%`} sub={`${s.wins}W / ${s.losses}L / ${s.scratches} flat`} />
            <Stat label="Expectancy" value={`${s.expectancyR}R`} tone={s.expectancyR > 0 ? 'good' : s.expectancyR < 0 ? 'bad' : undefined} />
            <Stat label="Profit factor" value={s.profitFactor == null ? '∞' : s.profitFactor} />
            <Stat label="Net, 1 contract" value={usd(res.netPerContract)} tone={res.netPerContract >= 0 ? 'good' : 'bad'} />
            <Stat label="Total R" value={`${s.totalR}R`} />
            <Stat label="Max drawdown" value={`-${s.maxDrawdownR}R`} tone="bad" />
            <Stat label="Longest losing streak" value={s.maxConsecutiveLosses} />
            <Stat label="Avg win / loss" value={`${s.avgWinR} / ${s.avgLossR}R`} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Stat label="In-sample (first 70%)" value={`${res.inSample.expectancyR}R / trade`} sub={`${res.inSample.trades} trades · ${res.inSample.winRate}% win`} />
            <Stat label="Out-of-sample (last 30%)" value={`${res.outOfSample.expectancyR}R / trade`} sub={`${res.outOfSample.trades} trades from ${res.splitDate ?? '—'} · ${res.outOfSample.winRate}% win`} />
          </div>
          <div>
            <div className="label mb-1">Why days were NO TRADE (last check of the window)</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(res.ruleFailures).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                <span key={k} className="pill border-tv-border text-gray-300">{RULE_LABEL[k] ?? k}: {n}</span>
              ))}
            </div>
          </div>
          {res.monthly.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-500">Monthly</summary>
              <div className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-1.5 font-mono">
                {res.monthly.map((m) => (
                  <div key={m.month} className="rounded border border-tv-border px-2 py-1">
                    <div className="text-gray-600 text-[10px]">{m.month} · {m.trades}</div>
                    <div className={m.totalR >= 0 ? 'text-tv-green' : 'text-tv-red'}>{m.totalR}R · {usd(m.pnl)}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
          {res.trades.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-500">Trades ({res.trades.length})</summary>
              <div className="overflow-x-auto mt-2">
                <table className="w-full font-mono min-w-[560px]">
                  <thead className="text-gray-500 text-left"><tr><th>Date</th><th>Side</th><th>Entry</th><th>Stop</th><th>Target</th><th>Exit</th><th>Why</th><th className="text-right">R</th><th className="text-right">$/ct</th></tr></thead>
                  <tbody>
                    {res.trades.slice(-200).reverse().map((t) => (
                      <tr key={t.entryTime} className="border-t border-tv-border/50">
                        <td className="py-0.5">{t.date}</td><td className={t.direction === 'long' ? 'text-tv-green' : 'text-tv-red'}>{t.direction}</td>
                        <td>{t.entry}</td><td>{t.stop}</td><td>{t.target}</td><td>{t.exit}</td><td>{t.exitReason}</td>
                        <td className={`text-right ${t.r >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{t.r}</td>
                        <td className="text-right">{t.pnlPerContract}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <ul className="list-disc pl-5 text-[11px] text-gray-500 space-y-0.5">{res.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
