'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  RefreshCw, ExternalLink, TrendingUp, TrendingDown,
  Minus, Filter, Zap, AlertTriangle, ArrowUpDown, Building2,
} from 'lucide-react';
import type { FinvizStock } from '@/app/api/finviz-screener/route';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScreenerData {
  stocks: FinvizStock[];
  cached: boolean;
  elite: boolean;
  fetchedAt: string;
  error?: string;
}

type SortField = 'volume' | 'changePct' | 'price' | 'avgVolume';
type SortDir   = 'asc' | 'desc';

// ─── Presets ──────────────────────────────────────────────────────────────────

const PRICE_PRESETS = [
  { label: 'All Under $50', maxPrice: 50, minVol: '1000' },
  { label: 'Under $20',     maxPrice: 20, minVol: '1000' },
  { label: 'Under $10',     maxPrice: 10, minVol: '500'  },
  { label: 'Under $5',      maxPrice: 5,  minVol: '200'  },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtVol = (v: number) =>
  v >= 1_000_000_000 ? `${(v / 1_000_000_000).toFixed(2)}B`
  : v >= 1_000_000   ? `${(v / 1_000_000).toFixed(2)}M`
  : v >= 1_000       ? `${(v / 1_000).toFixed(0)}K`
  : String(v);

const pctColor = (v: number) =>
  v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-500' : 'text-gray-500';

const pctBg = (v: number) =>
  v > 0 ? 'bg-emerald-50 border-emerald-200' : v < 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200';

// ─── Stock Card ────────────────────────────────────────────────────────────────

function StockCard({ s, rank }: { s: FinvizStock; rank: number }) {
  const url     = `https://finviz.com/quote.ashx?t=${s.symbol}`;
  const sc_url  = `https://stockcharts.com/h-sc/ui?s=${s.symbol}`;
  const volRatio = s.avgVolume > 0 ? s.volume / s.avgVolume : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all">
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-center text-xs font-bold text-blue-600">
            {rank}
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-gray-900 text-sm">{s.symbol}</span>
              <a href={url} target="_blank" rel="noopener noreferrer" title="FINviz quote">
                <ExternalLink size={11} className="text-gray-300 hover:text-blue-500" />
              </a>
              <a href={sc_url} target="_blank" rel="noopener noreferrer" title="StockCharts">
                <ExternalLink size={11} className="text-gray-300 hover:text-purple-500" />
              </a>
            </div>
            <p className="text-xs text-gray-400 truncate max-w-[160px]">{s.company}</p>
          </div>
        </div>

        {/* Change badge */}
        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${pctColor(s.changePct)} ${pctBg(s.changePct)}`}>
          {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <p className="text-gray-400">Price</p>
          <p className="font-semibold text-gray-900">${s.price.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-gray-400">Volume</p>
          <p className="font-semibold text-gray-900">{fmtVol(s.volume)}</p>
        </div>
        <div>
          <p className="text-gray-400">Avg Vol</p>
          <p className="font-medium text-gray-700">{fmtVol(s.avgVolume)}</p>
        </div>
        <div>
          <p className="text-gray-400">Vol / Avg</p>
          <p className={`font-semibold ${volRatio >= 2 ? 'text-orange-600' : volRatio >= 1.5 ? 'text-yellow-600' : 'text-gray-700'}`}>
            {volRatio > 0 ? `${volRatio.toFixed(1)}x` : '—'}
          </p>
        </div>
        <div>
          <p className="text-gray-400">Sector</p>
          <p className="font-medium text-gray-700 truncate">{s.sector || '—'}</p>
        </div>
        <div>
          <p className="text-gray-400">Mkt Cap</p>
          <p className="font-medium text-gray-700">{s.marketCap || '—'}</p>
        </div>
      </div>

      {/* Volume bar */}
      {volRatio > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Volume vs average</span>
            <span className={volRatio >= 2 ? 'text-orange-600 font-medium' : ''}>
              {volRatio.toFixed(1)}x
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                volRatio >= 2 ? 'bg-orange-500' : volRatio >= 1.5 ? 'bg-yellow-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(100, (volRatio / 3) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinvizScannerPage() {
  const [data, setData]           = useState<ScreenerData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [preset, setPreset]       = useState(1); // Under $20
  const [sortField, setSortField] = useState<SortField>('volume');
  const [sortDir, setSortDir]     = useState<SortDir>('desc');
  const [sectorFilter, setSector] = useState('');

  const fetchData = useCallback(async (bust = false) => {
    setLoading(true);
    try {
      const p   = PRICE_PRESETS[preset];
      const url = `/api/finviz-screener?maxPrice=${p.maxPrice}&minVol=${p.minVol}${bust ? '&bust=1' : ''}`;
      const r   = await fetch(url, { cache: 'no-store' });
      setData(await r.json());
    } catch {
      setData({ stocks: [], cached: false, elite: false, fetchedAt: '', error: 'Failed to fetch' });
    }
    setLoading(false);
  }, [preset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  };

  // Sectors
  const sectors = Array.from(new Set(data?.stocks.map(s => s.sector).filter(Boolean) ?? [])).sort();

  // Filtered + sorted stocks
  const stocks = (data?.stocks ?? [])
    .filter(s => !sectorFilter || s.sector === sectorFilter)
    .sort((a, b) => {
      const v = sortDir === 'desc' ? -1 : 1;
      return (a[sortField] - b[sortField]) * v;
    });

  const p = PRICE_PRESETS[preset];

  return (
    <AppShell title="FINviz Scanner">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <h1 className="text-lg font-bold text-gray-900">FINviz High-Volume Scanner</h1>
            {data?.elite && (
              <span className="text-xs bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                ⚡ Elite · Real-time
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            High-volume stocks under {p.label.toLowerCase()} — sorted by today's volume
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <a
            href={`https://finviz.com/screener.ashx?v=111&f=sh_avgvol_o${p.minVol},sh_price_u${p.maxPrice}&o=-volume`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ExternalLink size={12} />
            Open FINviz
          </a>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5 p-3 bg-white border border-gray-200 rounded-xl">
        {/* Price presets */}
        <div className="flex items-center gap-1">
          <Filter size={13} className="text-gray-400 mr-1" />
          {PRICE_PRESETS.map((pr, i) => (
            <button
              key={i}
              onClick={() => setPreset(i)}
              className={`px-2.5 py-1 text-xs rounded border font-medium transition-colors ${
                preset === i
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              {pr.label}
            </button>
          ))}
        </div>

        {/* Sector filter */}
        {sectors.length > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            <Building2 size={13} className="text-gray-400" />
            <select
              value={sectorFilter}
              onChange={e => setSector(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
            >
              <option value="">All sectors</option>
              {sectors.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        {/* Sort controls */}
        <div className="flex items-center gap-1">
          <ArrowUpDown size={13} className="text-gray-400" />
          {(['volume', 'changePct', 'price', 'avgVolume'] as SortField[]).map(f => (
            <button
              key={f}
              onClick={() => toggleSort(f)}
              className={`px-2 py-1 text-xs rounded border transition-colors ${
                sortField === f
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              {f === 'volume' ? 'Vol' : f === 'changePct' ? 'Chg%' : f === 'price' ? 'Price' : 'Avg Vol'}
              {sortField === f && (sortDir === 'desc' ? ' ↓' : ' ↑')}
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      {data?.fetchedAt && (
        <p className="text-xs text-gray-400 mb-3">
          {stocks.length} stocks · Last updated {new Date(data.fetchedAt).toLocaleTimeString()}
          {data.cached && ' · (cached)'}
        </p>
      )}

      {/* Error */}
      {data?.error && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4 text-xs text-amber-800">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{data.error}</p>
            <p className="text-amber-700 mt-0.5">
              Add <code className="bg-amber-100 px-1 rounded">FINVIZ_EMAIL</code> and{' '}
              <code className="bg-amber-100 px-1 rounded">FINVIZ_PASSWORD</code> to your <code>.env.local</code> for Elite real-time data.
            </p>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data?.stocks.length && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-24 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-36 mb-4" />
              <div className="grid grid-cols-2 gap-2">
                {[...Array(6)].map((_, j) => <div key={j} className="h-3 bg-gray-100 rounded" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stock grid */}
      {stocks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {stocks.map((s, i) => (
            <StockCard key={s.symbol} s={s} rank={i + 1} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && data && !stocks.length && !data.error && (
        <div className="text-center py-16 text-gray-400">
          <Zap size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No stocks matched the current filter.</p>
        </div>
      )}

      {/* Disclaimer */}
      <div className="mt-6 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-800">
        <AlertTriangle size={13} className="flex-shrink-0 mt-0.5 text-amber-600" />
        <p>
          <strong>Screener results are for research only.</strong> High volume does not guarantee a profitable trade.
          Always confirm setup, risk level, and entry conditions before trading.
        </p>
      </div>
    </AppShell>
  );
}
