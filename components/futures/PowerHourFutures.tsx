'use client';
import { useCallback, useEffect, useState } from 'react';
import { Notice, Stat } from '@/components/ui/Form';
import { useWorkspaceStore, DEFAULT_PH_ENTRY, DEFAULT_PH_EXIT } from '@/store/workspaceStore';
import type { PowerHourResult } from '@/lib/powerHourEngine';

type Payload = PowerHourResult & { window: string; source: string; errors: string[]; updated_at: string; error?: string };

const INSTRUMENTS = ['MNQ', 'MES', 'MYM', 'M2K', 'MGC'];
const RANGE_RE = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;

const STATUS_STYLE: Record<string, string> = {
  'NO TRADE': 'border-tv-red/50 bg-tv-red/10 text-tv-red',
  'NO DATA': 'border-gray-600 bg-white/5 text-gray-300',
  CANDIDATE: 'border-tv-amber/50 bg-tv-amber/10 text-tv-amber',
  CONFIRMED: 'border-tv-green/50 bg-tv-green/10 text-tv-green',
};

function countdown(min: number | null) {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  return h ? `${h}h ${min % 60}m` : `${min}m`;
}

/** Futures Power Hour dashboard (your 2:38–2:45 / 3:15–3:20 ET window by default). */
export default function PowerHourFutures() {
  const { phEntry, phExit, phInstrument, setPowerHour } = useWorkspaceStore();
  const [entryDraft, setEntryDraft] = useState(phEntry);
  const [exitDraft, setExitDraft] = useState(phExit);
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/power-hour?instrument=${phInstrument}&entry=${encodeURIComponent(phEntry)}&exit=${encodeURIComponent(phExit)}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setData(null);
    }
    setLoading(false);
  }, [phInstrument, phEntry, phExit]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const applyWindow = () => {
    if (RANGE_RE.test(entryDraft) && RANGE_RE.test(exitDraft)) setPowerHour({ phEntry: entryDraft, phExit: exitDraft });
  };

  return (
    <section className="card space-y-4" aria-labelledby="ph-futures">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="ph-futures" className="text-lg font-bold text-white">Futures Power Hour</h2>
        <div className="flex gap-1">
          {INSTRUMENTS.map((i) => (
            <button key={i} className={`btn ${phInstrument === i ? 'btn-primary' : ''}`} aria-pressed={phInstrument === i} onClick={() => setPowerHour({ phInstrument: i })}>{i}</button>
          ))}
        </div>
        <button className="btn ml-auto" onClick={load} disabled={loading}>{loading ? '…' : 'Refresh'}</button>
      </div>

      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="space-y-1"><span className="label">Entry window (ET)</span><input className="input w-32" value={entryDraft} onChange={(e) => setEntryDraft(e.target.value)} placeholder="14:38-14:45" /></label>
        <label className="space-y-1"><span className="label">Exit window (ET)</span><input className="input w-32" value={exitDraft} onChange={(e) => setExitDraft(e.target.value)} placeholder="15:15-15:20" /></label>
        <button className="btn" onClick={applyWindow}>Apply</button>
        <button className="btn" onClick={() => { setEntryDraft(DEFAULT_PH_ENTRY); setExitDraft(DEFAULT_PH_EXIT); setPowerHour({ phEntry: DEFAULT_PH_ENTRY, phExit: DEFAULT_PH_EXIT }); }}>Reset</button>
        <span className="text-gray-600">24-hour HH:MM-HH:MM. The window arriving is never a reason to trade by itself.</span>
      </div>

      {err && <Notice tone="bad">Power Hour data unavailable: {err}. Status is unknown — treat as NO TRADE.</Notice>}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-xl border px-4 py-2 text-xl font-black tracking-wide ${STATUS_STYLE[data.status]}`}>{data.status}</span>
            <div className="text-xs text-gray-400 space-y-0.5">
              <div>{data.window}</div>
              <div>
                {data.phase === 'before' && <>Entry window in <b className="text-white">{countdown(data.minutesToEntry)}</b> · exit planning in {countdown(data.minutesToExit)}</>}
                {data.phase === 'entry' && <b className="text-tv-amber">Entry observation window is open</b>}
                {data.phase === 'between' && <>Managing — exit window in <b className="text-white">{countdown(data.minutesToExit)}</b></>}
                {data.phase === 'exit' && <b className="text-tv-amber">Exit planning window is open</b>}
                {data.phase === 'after' && <>Today&apos;s window has passed</>}
                {data.phase === 'closed' && <>Market closed</>}
              </div>
              <div className="text-gray-600">{data.source} · last 5m bar {data.lastBarTime ? new Date(data.lastBarTime).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET' : '—'}{data.dataAgeMin != null ? ` (${data.dataAgeMin} min old)` : ''}</div>
            </div>
          </div>

          {data.status === 'NO TRADE' && (
            <Notice tone="bad">
              <b>Why NO TRADE:</b>
              <ul className="list-disc pl-5 mt-1">{data.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </Notice>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Last price" value={data.lastPrice?.toLocaleString() ?? '—'} />
            <Stat label="VWAP (RTH)" value={data.vwap?.toLocaleString() ?? 'n/a'} sub={data.vwapRelation ? `price ${data.vwapRelation}` : undefined} />
            <Stat label="5m / 15m trend" value={`${data.trend5m ?? '—'} / ${data.trend15m ?? '—'}`} tone={data.trend5m === 'bullish' ? 'good' : data.trend5m === 'bearish' ? 'bad' : 'muted'} sub={data.lastEvent5m ?? undefined} />
            <Stat label="Volume (last 30m)" value={data.volume?.ratio != null ? `${data.volume.ratio}× normal` : 'n/a'} />
            <Stat label="Prior RTH H / L" value={data.prevSession ? `${data.prevSession.high} / ${data.prevSession.low}` : '—'} sub={data.prevSession ? `close ${data.prevSession.close}` : undefined} />
            <Stat label="Today H / L" value={data.today ? `${data.today.high} / ${data.today.low}` : '—'} />
            <Stat label="Range vs normal" value={data.volatility.ratio != null ? `${data.volatility.ratio}×` : 'n/a'} sub={data.volatility.atr5m != null ? `5m ATR ${data.volatility.atr5m}` : undefined} />
            <Stat label="Direction" value={data.direction ?? 'none'} tone={data.direction === 'long' ? 'good' : data.direction === 'short' ? 'bad' : 'muted'} />
          </div>

          {data.plan && (
            <div className="rounded-xl border border-tv-border p-3 text-xs font-mono grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div><div className="label">Entry zone</div>{data.plan.entryZone[0]} – {data.plan.entryZone[1]}</div>
              <div><div className="label">Invalidation</div>{data.plan.invalidation}</div>
              <div><div className="label">Stop</div><span className="text-tv-red">{data.plan.stop}</span></div>
              <div><div className="label">Target</div><span className="text-tv-green">{data.plan.target}</span> <span className="text-gray-500">{data.plan.targetName}</span></div>
              <div><div className="label">R:R</div>{data.plan.rr}</div>
              <p className="col-span-full text-gray-400 font-sans"><b className="text-gray-200">Confirmation:</b> {data.confirmation}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <div className="label mb-1">Liquidity above</div>
              {data.liquidityAbove.length ? data.liquidityAbove.map((l) => <div key={l.name + l.price} className="flex justify-between font-mono"><span className="text-gray-400">{l.name}</span><span>{l.price.toFixed(2)}</span></div>) : <span className="text-gray-600">none</span>}
            </div>
            <div>
              <div className="label mb-1">Liquidity below</div>
              {data.liquidityBelow.length ? data.liquidityBelow.map((l) => <div key={l.name + l.price} className="flex justify-between font-mono"><span className="text-gray-400">{l.name}</span><span>{l.price.toFixed(2)}</span></div>) : <span className="text-gray-600">none</span>}
            </div>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-gray-500 hover:text-gray-300">All rules ({data.rules.filter((r) => r.passed).length}/{data.rules.length} pass)</summary>
            <ul className="mt-2 space-y-1">
              {data.rules.map((r) => (
                <li key={r.key} className="flex gap-2">
                  <span className={r.passed ? 'text-tv-green' : r.passed === false ? 'text-tv-red' : 'text-gray-500'}>{r.passed ? '✓' : r.passed === false ? '✗' : '?'}</span>
                  <span className="text-gray-300">{r.label}</span>
                  <span className="text-gray-500">— {r.detail}</span>
                </li>
              ))}
            </ul>
          </details>
          {data.notes.map((n) => <p key={n} className="text-[10px] text-gray-600">{n}</p>)}
        </>
      )}
    </section>
  );
}
