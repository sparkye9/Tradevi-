'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, RefreshCw, Monitor, CheckCircle, XCircle, List, ChevronDown } from 'lucide-react';
import type { SCChartList } from '@/app/api/stockcharts-chartlists/route';

// ─── Types ────────────────────────────────────────────────────────────────────

type SCPeriod    = 'D' | 'W' | 'M';
type SCChartType = 'c' | 'b' | 'l';
type SCMonths    = '1' | '3' | '6' | '12' | '24';

interface AuthStatus {
  authenticated: boolean;
  email: string | null;
  cachedUntil: string | null;
}

// ─── URL builders ─────────────────────────────────────────────────────────────

function buildUrl(symbol: string, period: SCPeriod, months: SCMonths, chartType: SCChartType): string {
  return `https://stockcharts.com/c-sc/sc?s=${encodeURIComponent(symbol)}&p=${period}&yr=0&mn=${months}&dy=0&i=0&r=${Date.now()}&o=&l=&z=large&q=${chartType}`;
}

function openUrl(symbol: string): string {
  return `https://stockcharts.com/h-sc/ui?s=${encodeURIComponent(symbol)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface StockChartsEmbedProps {
  symbol: string;
}

export function StockChartsEmbed({ symbol }: StockChartsEmbedProps) {
  const [period, setPeriod]         = useState<SCPeriod>('D');
  const [months, setMonths]         = useState<SCMonths>('6');
  const [chartType, setChartType]   = useState<SCChartType>('c');
  const [key, setKey]               = useState(0);
  const [auth, setAuth]             = useState<AuthStatus | null>(null);
  const [chartLists, setChartLists] = useState<SCChartList[]>([]);
  const [showLists, setShowLists]   = useState(false);

  // Check auth status on mount
  useEffect(() => {
    fetch('/api/stockcharts-auth', { cache: 'no-store' })
      .then(r => r.json())
      .then(setAuth)
      .catch(() => setAuth({ authenticated: false, email: null, cachedUntil: null }));
  }, []);

  // Fetch ChartLists when panel opens
  useEffect(() => {
    if (!showLists || chartLists.length > 0) return;
    fetch('/api/stockcharts-chartlists', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setChartLists(d.lists ?? []))
      .catch(() => {});
  }, [showLists, chartLists.length]);

  const src     = buildUrl(symbol, period, months, chartType);
  const btnBase = 'px-2.5 py-1 text-xs rounded border font-medium transition-colors';
  const active  = `${btnBase} bg-purple-600 text-white border-purple-600`;
  const idle    = `${btnBase} bg-white text-gray-600 border-gray-200 hover:border-purple-300`;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        {/* Branding + auth badge */}
        <div className="flex items-center gap-2 mr-2">
          <Monitor size={13} className="text-blue-600" />
          <span className="text-xs font-semibold text-gray-700">StockCharts</span>
          {auth && (
            auth.authenticated
              ? <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                  <CheckCircle size={11} /> {auth.email}
                </span>
              : <span className="flex items-center gap-1 text-xs text-amber-600">
                  <XCircle size={11} /> Not signed in
                </span>
          )}
        </div>

        {/* Period */}
        <div className="flex gap-1">
          {(['D', 'W', 'M'] as SCPeriod[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={period === p ? active : idle}>
              {p === 'D' ? 'Daily' : p === 'W' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>

        {/* Range */}
        <div className="flex gap-1">
          {(['1', '3', '6', '12', '24'] as SCMonths[]).map(m => (
            <button key={m} onClick={() => setMonths(m)} className={months === m ? active : idle}>
              {m === '1' ? '1M' : m === '3' ? '3M' : m === '6' ? '6M' : m === '12' ? '1Y' : '2Y'}
            </button>
          ))}
        </div>

        {/* Chart type */}
        <div className="flex gap-1">
          {([['c', 'Candles'], ['b', 'Bars'], ['l', 'Line']] as [SCChartType, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setChartType(t)} className={chartType === t ? active : idle}>
              {label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1">
          {/* ChartLists toggle */}
          <button
            onClick={() => setShowLists(v => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded border font-medium transition-colors ${
              showLists
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            <List size={11} /> ChartLists <ChevronDown size={10} className={showLists ? 'rotate-180' : ''} />
          </button>

          <button
            onClick={() => setKey(k => k + 1)}
            className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors"
            title="Reload"
          >
            <RefreshCw size={12} />
          </button>

          <a
            href={openUrl(symbol)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 text-white rounded border border-blue-600 hover:bg-blue-700 transition-colors"
          >
            Open <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {/* ChartLists panel */}
      {showLists && (
        <div className="px-4 py-3 border-b border-gray-100 bg-blue-50">
          {chartLists.length === 0 ? (
            <p className="text-xs text-gray-500">
              {auth?.authenticated
                ? 'No ChartLists found. Create some in your StockCharts account.'
                : 'Sign in to StockCharts to see your saved ChartLists.'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {chartLists.map(list => (
                <a
                  key={list.id}
                  href={list.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2.5 py-1 bg-white border border-blue-200 text-blue-700 rounded-full hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors"
                >
                  {list.name}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chart iframe */}
      <div className="relative w-full" style={{ paddingBottom: '56%' }}>
        <iframe
          key={`${symbol}-${period}-${months}-${chartType}-${key}`}
          src={src}
          className="absolute inset-0 w-full h-full border-0"
          title={`StockCharts: ${symbol}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 flex items-center justify-between">
        <p className="text-xs text-blue-700">
          {auth?.authenticated
            ? `Signed in as ${auth.email} — full account features available.`
            : 'Log in to StockCharts in your browser for full account access.'}
        </p>
        {!auth?.authenticated && (
          <a
            href="https://stockcharts.com/login/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline flex-shrink-0 ml-2"
          >
            Log in →
          </a>
        )}
      </div>
    </div>
  );
}
