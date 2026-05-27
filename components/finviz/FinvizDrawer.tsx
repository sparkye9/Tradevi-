'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, RefreshCw, TrendingUp, TrendingDown, ExternalLink, Filter, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import type { FinvizStock } from '@/app/api/finviz-screener/route';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScreenerData {
  stocks: FinvizStock[];
  cached: boolean;
  elite: boolean;
  fetchedAt: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtVol = (v: number) =>
  v >= 1_000_000_000 ? `${(v / 1_000_000_000).toFixed(1)}B`
  : v >= 1_000_000   ? `${(v / 1_000_000).toFixed(1)}M`
  : v >= 1_000       ? `${(v / 1_000).toFixed(0)}K`
  : String(v);

const fmtPrice = (p: number) => `$${p.toFixed(2)}`;

const pctColor = (v: number) =>
  v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-500' : 'text-gray-400';

// ─── Price filter presets ─────────────────────────────────────────────────────

const PRICE_PRESETS = [
  { label: 'Under $5',  maxPrice: 5,  minVol: '500'  },
  { label: 'Under $10', maxPrice: 10, minVol: '1000' },
  { label: 'Under $20', maxPrice: 20, minVol: '1000' },
  { label: 'Under $50', maxPrice: 50, minVol: '2000' },
] as const;

// ─── Individual stock row ─────────────────────────────────────────────────────

function StockRow({ s, rank }: { s: FinvizStock; rank: number }) {
  const url = `https://finviz.com/quote.ashx?t=${s.symbol}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors group"
    >
      {/* Rank */}
      <span className="w-5 text-xs text-gray-400 font-mono text-center flex-shrink-0">{rank}</span>

      {/* Symbol + company */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-xs text-gray-900">{s.symbol}</span>
          <ExternalLink size={9} className="text-gray-300 group-hover:text-purple-400 transition-colors" />
        </div>
        <p className="text-xs text-gray-400 truncate">{s.company || s.sector}</p>
      </div>

      {/* Price + change */}
      <div className="text-right flex-shrink-0">
        <p className="text-xs font-semibold text-gray-900">{fmtPrice(s.price)}</p>
        <p className={`text-xs font-medium ${pctColor(s.changePct)}`}>
          {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
        </p>
      </div>

      {/* Volume */}
      <div className="text-right flex-shrink-0 w-12">
        <p className="text-xs text-gray-500">{fmtVol(s.volume)}</p>
        <p className="text-xs text-gray-300">avg {fmtVol(s.avgVolume)}</p>
      </div>
    </a>
  );
}

// ─── Main drawer ──────────────────────────────────────────────────────────────

interface FinvizDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function FinvizDrawer({ open, onClose }: FinvizDrawerProps) {
  const [data, setData]           = useState<ScreenerData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [preset, setPreset]       = useState(1); // Under $20 default
  const [showFilter, setShowFilter] = useState(false);
  const intervalRef               = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async (bust = false) => {
    setLoading(true);
    try {
      const p   = PRICE_PRESETS[preset];
      const url = `/api/finviz-screener?maxPrice=${p.maxPrice}&minVol=${p.minVol}${bust ? '&bust=1' : ''}`;
      const r   = await fetch(url, { cache: 'no-store' });
      const d   = await r.json() as ScreenerData;
      setData(d);
    } catch {
      setData({ stocks: [], cached: false, elite: false, fetchedAt: '', error: 'Failed to load' });
    }
    setLoading(false);
  }, [preset]);

  // Fetch on open or preset change
  useEffect(() => {
    if (!open) return;
    fetchData();
  }, [open, fetchData]);

  // Auto-refresh every 5 min while open
  useEffect(() => {
    if (!open) { intervalRef.current && clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => fetchData(), 5 * 60 * 1000);
    return () => { intervalRef.current && clearInterval(intervalRef.current); };
  }, [open, fetchData]);

  const p = PRICE_PRESETS[preset];

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:bg-transparent lg:pointer-events-none"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`
          fixed top-0 right-0 h-full w-72 bg-white border-l border-gray-200 shadow-xl z-50
          flex flex-col transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
              <Zap size={12} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900">FINviz Hot Stocks</p>
              <p className="text-xs text-gray-400">
                {data?.elite ? '⚡ Elite · Real-time' : 'Delayed data'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowFilter(v => !v)}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors"
              title="Filter"
            >
              <Filter size={13} />
            </button>
            <button
              onClick={() => fetchData(true)}
              disabled={loading}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilter && (
          <div className="px-4 py-3 border-b border-gray-100 bg-blue-50">
            <p className="text-xs font-medium text-gray-600 mb-2">Price ceiling</p>
            <div className="grid grid-cols-2 gap-1.5">
              {PRICE_PRESETS.map((pr, i) => (
                <button
                  key={i}
                  onClick={() => { setPreset(i); setShowFilter(false); }}
                  className={`text-xs py-1.5 px-2 rounded border transition-colors ${
                    preset === i
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {pr.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active filter chip */}
        <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
          <span className="text-xs text-gray-500">Showing:</span>
          <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
            {p.label} · Vol &gt; {fmtVol(parseInt(p.minVol) * 1000)}
          </span>
        </div>

        {/* Stock list */}
        <div className="flex-1 overflow-y-auto">
          {loading && !data && (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={18} className="animate-spin text-gray-400" />
            </div>
          )}

          {data?.error && !data.stocks.length && (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-gray-400">{data.error}</p>
              <p className="text-xs text-gray-300 mt-1">Check FINVIZ_EMAIL / FINVIZ_PASSWORD in .env</p>
            </div>
          )}

          {data?.stocks.map((s, i) => (
            <StockRow key={s.symbol} s={s} rank={i + 1} />
          ))}

          {data && !data.stocks.length && !data.error && (
            <div className="px-4 py-8 text-center text-xs text-gray-400">
              No stocks matched the filter.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <a
            href={`https://finviz.com/screener.ashx?v=111&f=sh_avgvol_o${p.minVol},sh_price_u${p.maxPrice}&o=-volume`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            Open in FINviz <ExternalLink size={10} />
          </a>
          {data?.fetchedAt && (
            <span className="text-xs text-gray-400">
              {new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
