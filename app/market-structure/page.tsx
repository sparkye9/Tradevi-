'use client';
import { useCallback, useEffect, useState } from 'react';
import LearnBox from '@/components/ui/LearnBox';
import { Notice } from '@/components/ui/Form';
import FuturesSetupCard from '@/components/futures/SetupCard';
import type { SetupCandidate } from '@/lib/setupEngine';
import type { MtfAssessment, Liquidity, Trend } from '@/lib/structure';

const INSTRUMENTS = ['MNQ', 'MES', 'MYM', 'M2K', 'MGC', 'SI', 'CL'];
const TFS = ['1D', '4H', '1H', '15m', '5m', '1m'] as const;

interface TfOut {
  trend: Trend;
  externalTrend: Trend;
  lastClose: number | null;
  atr: number | null;
  lastEvent: { type: string; direction: string; level: number; time: number } | null;
  swings: { kind: string; label: string | null; price: number }[];
  fvgs: { direction: string; top: number; bottom: number; state: string; alignedWithTrend: boolean }[];
  fvgCounts: Record<string, number>;
  notes: string[];
}
interface Payload {
  instrument: string;
  dataSymbol: string;
  source: string;
  definitions: Record<string, string>;
  series: Record<string, { state: string; ageMinutes: number | null; bars: number; source: string; error?: string } | null>;
  timeframes: Record<string, TfOut>;
  mtf: MtfAssessment;
  htf: MtfAssessment;
  liquidity: Liquidity | null;
  setups: SetupCandidate[];
  clock: { headline: string; tradesOpen: boolean };
  calendarAvailable: boolean;
  updated_at: string;
  error?: string;
}

const trendColor = (t?: string | null) => (t === 'bullish' ? 'text-tv-green' : t === 'bearish' ? 'text-tv-red' : 'text-gray-400');
const stateColor = (s?: string) => (s === 'fresh' ? 'text-tv-green' : s === 'closed' ? 'text-gray-400' : s === 'stale' ? 'text-tv-amber' : 'text-tv-red');
const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 4 }));

export default function MarketStructurePage() {
  const [instrument, setInstrument] = useState('MNQ');
  const [confirm, setConfirm] = useState<'close' | 'wick'>('close');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/structure?instrument=${instrument}&confirm=${confirm}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setData(null);
    }
    setLoading(false);
  }, [instrument, confirm]);

  useEffect(() => {
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [load]);

  const active = data?.setups.filter((s) => s.status === 'Confirmed' || s.status === 'Watching') ?? [];
  const inactive = data?.setups.filter((s) => s.status === 'Invalidated' || s.status === 'Expired') ?? [];

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Market Structure</h1>
          <p className="text-sm text-gray-500 mt-1">BOS / CHOCH, fair value gaps, liquidity and multi-timeframe bias with explicit rules, plus the setups they produce.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div role="group" aria-label="Instrument" className="flex flex-wrap gap-1">
            {INSTRUMENTS.map((i) => (
              <button key={i} onClick={() => setInstrument(i)} aria-pressed={instrument === i} className={`btn ${instrument === i ? 'btn-primary' : ''}`}>{i}</button>
            ))}
          </div>
          <select aria-label="Break confirmation" className="input font-sans w-auto text-xs" value={confirm} onChange={(e) => setConfirm(e.target.value as 'close' | 'wick')}>
            <option value="close">Break = candle close</option>
            <option value="wick">Break = wick</option>
          </select>
          <button className="btn" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      <LearnBox
        summary="each timeframe's structure, the open gaps and liquidity, and setups built from them."
        items={[
          { term: 'BOS', text: 'Break of structure: price closes beyond the last swing in the trend direction.' },
          { term: 'CHOCH', text: 'Change of character: the first break against the trend. It flips the trend label; it does not guarantee a reversal.' },
          { term: 'FVG', text: 'Fair value gap: a three-candle gap left by a fast move. Price often revisits it — not always.' },
          { term: 'Sweep', text: 'Price runs past a known high or low and closes back inside — stops were taken.' },
        ]}
      />

      {err && <Notice tone="bad">Could not load structure: {err}. No levels are shown rather than guessing.</Notice>}
      {loading && !data && <div className="h-48 skeleton" />}

      {data && (
        <>
          <p className="text-[11px] text-gray-500">{data.source} Updated {new Date(data.updated_at).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit' })} ET · {data.clock.headline}</p>
          {TFS.every((k) => !data.series[k] || data.series[k]!.state === 'missing') && (
            <Notice tone="bad"><b>Market data unavailable.</b> No timeframe returned bars ({data.series['15m']?.error ?? 'feed disconnected'}). Nothing below is computed from guesses — there is simply no analysis until the feed is back.</Notice>
          )}

          <section className="card space-y-3">
            <h2 className="text-sm font-bold text-white">Multi-timeframe</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono min-w-[640px]">
                <thead className="text-gray-500 text-left">
                  <tr><th className="py-1">TF</th><th>Data</th><th>Internal</th><th>External</th><th>Last break</th><th>Recent swings</th><th>Open FVGs</th></tr>
                </thead>
                <tbody>
                  {TFS.map((k) => {
                    const t = data.timeframes[k];
                    const s = data.series[k];
                    return (
                      <tr key={k} className="border-t border-tv-border/60 align-top">
                        <td className="py-1.5 font-bold text-white">{k}</td>
                        <td className={stateColor(s?.state)} title={s?.error ?? s?.source}>{s ? `${s.state}${s.ageMinutes != null ? ` · ${s.ageMinutes}m` : ''}` : '—'}</td>
                        <td className={trendColor(t?.trend)}>{t?.trend ?? '—'}</td>
                        <td className={trendColor(t?.externalTrend)}>{t?.externalTrend ?? '—'}</td>
                        <td className="text-gray-300">{t?.lastEvent ? `${t.lastEvent.type} ${t.lastEvent.direction} @ ${fmt(t.lastEvent.level)}` : '—'}</td>
                        <td className="text-gray-400">{t?.swings.slice(-4).map((x) => x.label ?? (x.kind === 'high' ? 'H' : 'L')).join(' ') || '—'}</td>
                        <td className="text-gray-400">{t ? t.fvgs.map((f) => `${f.direction === 'bullish' ? '▲' : '▼'}${fmt(f.bottom)}–${fmt(f.top)}${f.state === 'partial' ? '*' : ''}`).slice(-2).join(' ') || 'none' : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-sm">
              <span className={`font-bold ${trendColor(data.mtf.bias)}`}>{data.mtf.summary}</span>
            </div>
            {data.mtf.conflicts.map((c) => <Notice key={c}>{c}</Notice>)}
            <p className="text-[10px] text-gray-600">Stale timeframes are excluded from the vote. * = partially mitigated FVG. The forming bar on every timeframe is ignored.</p>
          </section>

          <section className="card space-y-2">
            <h2 className="text-sm font-bold text-white">Liquidity {data.liquidity?.session ? <span className="text-gray-500 font-normal">· session {data.liquidity.session}</span> : null}</h2>
            {!data.liquidity ? <p className="text-xs text-gray-500">No intraday bars.</p> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs font-mono">
                {data.liquidity.levels.map((l) => (
                  <div key={l.name} className="flex justify-between border-b border-tv-border/40 py-1">
                    <span className="text-gray-400">{l.name}</span>
                    <span className={l.swept ? 'text-tv-amber' : l.taken ? 'text-gray-600 line-through' : 'text-white'}>
                      {fmt(l.price)} {l.swept ? '(swept)' : l.taken ? '(taken)' : ''}
                    </span>
                  </div>
                ))}
                {data.liquidity.notes.map((n) => <p key={n} className="text-[10px] text-gray-600 col-span-full">{n}</p>)}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-white">Setup candidates</h2>
            {!data.calendarAvailable && <Notice>Economic calendar unavailable — the news factor scores 0 on every setup.</Notice>}
            {active.length === 0 && <div className="card text-sm text-gray-400"><b className="text-white">No active setup.</b> Nothing meets a setup rule right now — that is a valid answer, not an error.</div>}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{active.map((s) => <FuturesSetupCard key={s.id} s={s} />)}</div>
            {inactive.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs text-gray-500">Invalidated / expired ({inactive.length})</summary>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-2">{inactive.map((s) => <FuturesSetupCard key={s.id} s={s} />)}</div>
              </details>
            )}
            <p className="text-[10px] text-gray-600">Interface examples are generated from delayed data and are not trade signals. Confirm on your own chart and platform.</p>
          </section>

          <details className="card text-xs">
            <summary className="cursor-pointer font-semibold text-gray-300">Definitions used</summary>
            <ul className="mt-2 space-y-1 text-gray-400">{Object.entries(data.definitions).map(([k, v]) => <li key={k}>{v}</li>)}</ul>
          </details>
        </>
      )}
    </div>
  );
}
