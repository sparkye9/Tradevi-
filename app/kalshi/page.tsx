'use client';

import { useState } from 'react';

interface AutoMarket {
  ticker: string;
  title: string;
  yes_ask: number;
  no_ask: number;
  gap: number;
  is_arb: boolean;
  cheap_side: string;
  cheap_ask: number;
  close_time: string;
  series_ticker: string;
}

interface AutoScanResult {
  count: number;
  min_gap: number;
  markets: AutoMarket[];
}

// Manual scan types
interface Pick {
  ticker: string;
  title: string;
  side: string;
  ask_cents: number;
  fair_cents: number;
  edge_cents: number;
  close_time: string;
  contracts: number;
  cost_dollars: number;
  payout_if_right: number;
}

interface ScanResult {
  scan_time_et: string;
  markets_found: number;
  picks: Pick[];
  message: string;
}

interface FairEntry {
  ticker: string;
  cents: string;
}

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

function formatClose(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function KalshiPage() {
  const [tab, setTab] = useState<'auto' | 'manual'>('auto');

  // ── Auto scan state ──
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoResult, setAutoResult] = useState<AutoScanResult | null>(null);
  const [autoError, setAutoError] = useState('');
  const [minGap, setMinGap] = useState(3);

  // ── Manual scan state ──
  const [entries, setEntries] = useState<FairEntry[]>([{ ticker: '', cents: '' }]);
  const [bankroll, setBankroll] = useState('5');
  const [maxPos, setMaxPos] = useState('3');
  const [edgeMin, setEdgeMin] = useState('3');
  const [scanning, setScanning] = useState(false);
  const [manualResult, setManualResult] = useState<ScanResult | null>(null);
  const [manualError, setManualError] = useState('');

  // ── Auto scan ──
  async function runAutoScan() {
    setAutoError('');
    setAutoResult(null);
    setAutoLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/kalshi/auto-scan?min_gap=${minGap}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? `HTTP ${res.status}`);
      }
      setAutoResult(await res.json());
    } catch (e: unknown) {
      setAutoError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setAutoLoading(false);
    }
  }

  // ── Manual scan ──
  const addRow = () => setEntries(e => [...e, { ticker: '', cents: '' }]);
  const removeRow = (i: number) => setEntries(e => e.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: 'ticker' | 'cents', val: string) =>
    setEntries(e => e.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  const fairValues = () => {
    const out: Record<string, number> = {};
    for (const e of entries) {
      const t = e.ticker.trim();
      const c = parseFloat(e.cents);
      if (t && !isNaN(c)) out[t] = c;
    }
    return out;
  };

  async function runManualScan() {
    setManualError('');
    setManualResult(null);
    const fv = fairValues();
    if (!Object.keys(fv).length) {
      setManualError('Add at least one ticker and fair value before scanning.');
      return;
    }
    setScanning(true);
    try {
      const res = await fetch(`${BACKEND}/api/kalshi/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fair_values: fv,
          bankroll: parseFloat(bankroll),
          max_positions: parseInt(maxPos),
          edge_min_cents: parseInt(edgeMin),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? `HTTP ${res.status}`);
      }
      setManualResult(await res.json());
    } catch (e: unknown) {
      setManualError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 py-2">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Kalshi Edge Scanner</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Find prediction market edges automatically — no manual input required.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl p-1">
        {([['auto', 'Auto Scan'], ['manual', 'Manual (Fair Values)']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === id
                ? 'bg-emerald-600 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── AUTO SCAN ── */}
      {tab === 'auto' && (
        <div className="space-y-4">
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 space-y-3">
            <p className="text-xs text-gray-400">
              Scans <span className="text-white font-semibold">every open Kalshi market</span> and
              finds ones where the math works in your favor — no ticker entry needed.
            </p>
            <div className="bg-[#0a0a0a] rounded-lg p-3 space-y-1 text-xs text-gray-500">
              <p><span className="text-emerald-400 font-semibold">How it works:</span> On Kalshi, YES + NO must sum to 100¢.
              When <span className="text-white">YES ask + NO ask &lt; 100</span>, buying both sides locks in a guaranteed profit.
              The <span className="text-white">gap</span> = free cents per contract pair.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500 shrink-0">Min gap (¢)</label>
              <input
                type="number"
                min={1}
                max={20}
                value={minGap}
                onChange={e => setMinGap(parseInt(e.target.value) || 3)}
                className="w-20 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50 text-center"
              />
              <span className="text-[10px] text-gray-600">lower = more results, higher = only strong edges</span>
            </div>
          </div>

          <button
            onClick={runAutoScan}
            disabled={autoLoading}
            className="w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-all bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white"
          >
            {autoLoading ? 'Scanning all markets…' : '⚡ Auto Scan All Markets'}
          </button>

          {autoError && (
            <div className="bg-red-950/40 border border-red-800/40 rounded-xl p-3 text-xs text-red-400">
              {autoError}
            </div>
          )}

          {autoResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{autoResult.count} opportunities found</span>
                <button onClick={runAutoScan} className="text-emerald-500 hover:text-emerald-400">↺ refresh</button>
              </div>

              {autoResult.markets.length === 0 ? (
                <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 text-center text-sm text-gray-500">
                  No gaps ≥ {autoResult.min_gap}¢ right now. Try lowering the min gap or check back later.
                </div>
              ) : (
                autoResult.markets.map(m => (
                  <div key={m.ticker} className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white leading-snug">{m.title}</p>
                        <p className="text-[10px] font-mono text-gray-600 mt-0.5 truncate">{m.ticker}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`text-base font-bold ${m.gap >= 5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          +{m.gap}¢
                        </div>
                        <div className="text-[9px] text-gray-600">gap</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-[#0a0a0a] rounded-lg p-2">
                        <div className="text-sm font-bold text-white">{m.yes_ask}¢</div>
                        <div className="text-[9px] text-gray-600">YES ask</div>
                      </div>
                      <div className="bg-[#0a0a0a] rounded-lg p-2">
                        <div className="text-sm font-bold text-white">{m.no_ask}¢</div>
                        <div className="text-[9px] text-gray-600">NO ask</div>
                      </div>
                      <div className="bg-[#0a0a0a] rounded-lg p-2">
                        <div className="text-sm font-bold text-white">{m.yes_ask + m.no_ask}¢</div>
                        <div className="text-[9px] text-gray-600">combined</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-semibold ${m.is_arb ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {m.is_arb ? '✓ True arb — buy both sides' : `Buy ${m.cheap_side.toUpperCase()} @ ${m.cheap_ask}¢`}
                      </span>
                      <span className="text-gray-600">closes {formatClose(m.close_time)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MANUAL SCAN ── */}
      {tab === 'manual' && (
        <div className="space-y-4">
          <section className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-300">Fair Values</h2>
              <span className="text-[10px] text-gray-600">ticker → fair YES prob (0–100¢)</span>
            </div>
            {entries.map((row, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className="flex-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-emerald-500/50"
                  placeholder="KXMLBGAME-26JUL19NYYLAD-NYY"
                  value={row.ticker}
                  onChange={e => updateRow(i, 'ticker', e.target.value)}
                />
                <input
                  className="w-20 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-emerald-500/50 text-center"
                  placeholder="55"
                  value={row.cents}
                  onChange={e => updateRow(i, 'cents', e.target.value)}
                  type="number" min="1" max="99"
                />
                <span className="text-[10px] text-gray-600">¢</span>
                {entries.length > 1 && (
                  <button onClick={() => removeRow(i)} className="text-gray-700 hover:text-red-400 text-sm px-1">×</button>
                )}
              </div>
            ))}
            <button onClick={addRow} className="text-xs text-emerald-500 hover:text-emerald-400">+ Add ticker</button>
          </section>

          <section className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">Settings</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Bankroll ($)', val: bankroll, set: setBankroll },
                { label: 'Max Positions', val: maxPos, set: setMaxPos },
                { label: 'Min Edge (¢)', val: edgeMin, set: setEdgeMin },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <label className="text-[10px] text-gray-600 block mb-1">{label}</label>
                  <input
                    type="number" value={val} onChange={e => set(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50 text-center"
                  />
                </div>
              ))}
            </div>
          </section>

          <button
            onClick={runManualScan}
            disabled={scanning}
            className="w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-all bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white"
          >
            {scanning ? 'Scanning…' : 'Scan with Fair Values'}
          </button>

          {manualError && (
            <div className="bg-red-950/40 border border-red-800/40 rounded-xl p-3 text-xs text-red-400">{manualError}</div>
          )}

          {manualResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{manualResult.scan_time_et}</span>
                <span>{manualResult.markets_found} markets scanned</span>
              </div>
              {manualResult.picks.length === 0 ? (
                <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5 text-center text-sm text-gray-500">
                  {manualResult.message}
                </div>
              ) : (
                manualResult.picks.map(p => (
                  <div key={p.ticker} className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-mono text-gray-500">{p.ticker}</span>
                        <p className="text-sm font-semibold text-white mt-0.5">{p.title}</p>
                      </div>
                      <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                        p.side === 'yes' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                      }`}>BUY {p.side.toUpperCase()}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { label: 'Ask', val: `${p.ask_cents}¢` },
                        { label: 'Fair', val: `${p.fair_cents}¢` },
                        { label: 'Edge', val: `+${p.edge_cents}¢`, green: true },
                        { label: 'Contracts', val: `×${p.contracts}` },
                      ].map(({ label, val, green }) => (
                        <div key={label} className="bg-[#0a0a0a] rounded-lg p-2">
                          <div className={`text-sm font-bold ${green ? 'text-emerald-400' : 'text-white'}`}>{val}</div>
                          <div className="text-[9px] text-gray-600 mt-0.5">{label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Cost: <span className="text-white font-semibold">${p.cost_dollars.toFixed(2)}</span></span>
                      <span>Pays: <span className="text-emerald-400 font-semibold">${p.payout_if_right.toFixed(2)}</span> if right</span>
                      <span>Closes {formatClose(p.close_time)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-700 pb-6">
        Auto scan finds mathematical arbitrage edges. Manual scan compares your fair values against
        Kalshi asks — it never invents probabilities. All trading involves risk.
      </p>
    </div>
  );
}
