'use client';

import { useState } from 'react';

interface FairEntry {
  ticker: string;
  cents: string;
}

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

interface OrderResult {
  placed: number;
  live: boolean;
  orders?: { ticker: string; status: string; detail?: string }[];
  would_place?: Pick[];
  message?: string;
}

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export default function KalshiPage() {
  const [entries, setEntries] = useState<FairEntry[]>([{ ticker: '', cents: '' }]);
  const [bankroll, setBankroll] = useState('5');
  const [maxPos, setMaxPos] = useState('3');
  const [edgeMin, setEdgeMin] = useState('3');

  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');

  const [placing, setPlacing] = useState(false);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);

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

  async function scan() {
    setError('');
    setResult(null);
    setOrderResult(null);
    const fv = fairValues();
    if (!Object.keys(fv).length) {
      setError('Add at least one ticker and fair value before scanning.');
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
      setResult(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }

  async function placeOrders(live: boolean) {
    setError('');
    setOrderResult(null);
    setPlacing(true);
    try {
      const res = await fetch(`${BACKEND}/api/kalshi/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fair_values: fairValues(),
          bankroll: parseFloat(bankroll),
          max_positions: parseInt(maxPos),
          live,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? `HTTP ${res.status}`);
      }
      setOrderResult(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Order request failed');
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-2">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Kalshi Edge Scanner</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Enter your fair values (devigged probabilities). The scanner finds markets where Kalshi's
          ask is below your fair — and sizes positions across your bankroll.
        </p>
      </div>

      {/* Fair Values */}
      <section className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">Fair Values</h2>
          <span className="text-[10px] text-gray-600">ticker → fair YES probability (0–100 cents)</span>
        </div>

        {entries.map((row, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              className="flex-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-emerald-500/50"
              placeholder="e.g. KXMLBGAME-26JUL19NYYLAD-NYY"
              value={row.ticker}
              onChange={e => updateRow(i, 'ticker', e.target.value)}
            />
            <input
              className="w-20 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-emerald-500/50 text-center"
              placeholder="55"
              value={row.cents}
              onChange={e => updateRow(i, 'cents', e.target.value)}
              type="number"
              min="1"
              max="99"
            />
            <span className="text-[10px] text-gray-600">¢</span>
            {entries.length > 1 && (
              <button
                onClick={() => removeRow(i)}
                className="text-gray-700 hover:text-red-400 text-sm px-1 transition-colors"
              >
                ×
              </button>
            )}
          </div>
        ))}

        <button
          onClick={addRow}
          className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          + Add ticker
        </button>

        <div className="pt-1 border-t border-[#1e1e1e]">
          <p className="text-[10px] text-gray-600">
            Get fair values: use the devig formula. e.g. -130 / +110 → 54¢ / 46¢
          </p>
          <p className="text-[10px] text-gray-600 mt-0.5">
            Formula: implied(-130) = 130/230 = 56.5%, implied(+110) = 100/210 = 47.6% → devig → 54¢
          </p>
        </div>
      </section>

      {/* Settings */}
      <section className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Scanner Settings</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Bankroll ($)', val: bankroll, set: setBankroll, min: '1', max: '500' },
            { label: 'Max Positions', val: maxPos, set: setMaxPos, min: '1', max: '10' },
            { label: 'Min Edge (¢)', val: edgeMin, set: setEdgeMin, min: '1', max: '20' },
          ].map(({ label, val, set, min, max }) => (
            <div key={label}>
              <label className="text-[10px] text-gray-600 block mb-1">{label}</label>
              <input
                type="number"
                min={min}
                max={max}
                value={val}
                onChange={e => set(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50 text-center"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Scan button */}
      <button
        onClick={scan}
        disabled={scanning}
        className="w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-all bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white"
      >
        {scanning ? 'Scanning…' : 'Scan for Edges'}
      </button>

      {/* Error */}
      {error && (
        <div className="bg-red-950/40 border border-red-800/40 rounded-xl p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <section className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{result.scan_time_et}</span>
            <span>{result.markets_found} markets scanned</span>
          </div>

          {result.picks.length === 0 ? (
            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5 text-center text-sm text-gray-500">
              {result.message}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {result.picks.map(p => (
                  <div key={p.ticker} className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-mono text-gray-500">{p.ticker}</span>
                        <p className="text-sm font-semibold text-white mt-0.5">{p.title}</p>
                      </div>
                      <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                        p.side === 'yes'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-red-500/15 text-red-400'
                      }`}>
                        BUY {p.side.toUpperCase()}
                      </span>
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
                      <span>Closes {new Date(p.close_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Order buttons */}
              {!orderResult && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => placeOrders(false)}
                    disabled={placing}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-gray-600 transition-all disabled:opacity-40"
                  >
                    {placing ? '…' : 'Preview Orders'}
                  </button>
                  <button
                    onClick={() => placeOrders(true)}
                    disabled={placing}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-all disabled:opacity-40"
                  >
                    {placing ? 'Placing…' : '⚡ Place Live Orders'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Order result */}
      {orderResult && (
        <section className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">
              {orderResult.live ? `${orderResult.placed} Order(s) Placed` : 'Order Preview'}
            </h2>
            <button
              onClick={() => setOrderResult(null)}
              className="text-xs text-gray-600 hover:text-gray-400"
            >
              dismiss
            </button>
          </div>

          {orderResult.message && (
            <p className="text-xs text-gray-500">{orderResult.message}</p>
          )}

          {orderResult.orders?.map((o, i) => (
            <div key={i} className={`flex items-center justify-between text-xs rounded-lg px-3 py-2 ${
              o.status === 'placed' ? 'bg-emerald-950/30 text-emerald-400' : 'bg-red-950/30 text-red-400'
            }`}>
              <span className="font-mono">{o.ticker}</span>
              <span>{o.status === 'placed' ? '✓ placed' : `✗ ${o.detail}`}</span>
            </div>
          ))}

          {orderResult.would_place?.map((p, i) => (
            <div key={i} className="flex items-center justify-between text-xs bg-[#0a0a0a] rounded-lg px-3 py-2 text-gray-400">
              <span className="font-mono">{p.ticker}</span>
              <span>BUY {p.side.toUpperCase()} ×{p.contracts} @ {p.ask_cents}¢ · ${p.cost_dollars.toFixed(2)}</span>
            </div>
          ))}

          <button
            onClick={() => { setOrderResult(null); scan(); }}
            className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
          >
            ↺ Re-scan
          </button>
        </section>
      )}

      {/* Disclaimer */}
      <p className="text-[10px] text-gray-700 pb-6">
        This scanner never invents probabilities. You supply the fair values; it only compares them
        against Kalshi asks and sizes positions mechanically. All trading involves risk.
      </p>
    </div>
  );
}
