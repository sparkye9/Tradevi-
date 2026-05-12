'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataSourceBanner, type DataSource } from '@/components/ui/DataSourceBanner';
import { OptionsChainTable } from '@/components/options/OptionsChainTable';
import { fetchOptionsChain, fetchQuote, type OptionsChainResponse } from '@/lib/apiClient';
import { safeMoney, safePercent } from '@/lib/formatters';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const QUICK_SYMBOLS = ['SPY', 'QQQ', 'TSLA', 'NVDA', 'AAPL', 'AMD', 'META'];

function formatDateLabel(expiry: string) {
  return new Date(expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function summaryCard(label: string, value: string, hint?: string) {
  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      {hint ? <p className="text-xs text-gray-400 mt-2">{hint}</p> : null}
    </div>
  );
}

export default function OptionsChainPage() {
  const [symbol, setSymbol] = useState('SPY');
  const [customSymbol, setCustomSymbol] = useState('');
  const [chainData, setChainData] = useState<OptionsChainResponse | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [stockPrice, setStockPrice] = useState(0);
  const [activeTab, setActiveTab] = useState<'calls' | 'puts' | 'both'>('both');
  const [minDTE, setMinDTE] = useState(0);
  const [nearMoneyOnly, setNearMoneyOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dataSource, setDataSource] = useState<DataSource>(null);

  const loadChain = useCallback(async (symbolToLoad: string, expiry?: string) => {
    setLoading(true);
    setError('');

    try {
      const [chain, quote] = await Promise.all([
        fetchOptionsChain(symbolToLoad, expiry),
        fetchQuote(symbolToLoad).catch(() => null),
      ]);

      setChainData(chain);
      setDataSource((chain.meta?.dataSource as DataSource) ?? 'yahoo_delayed');
      const dates = chain.expirationDates ?? chain.expirations ?? [];
      if (!expiry && dates.length) {
        setSelectedExpiry(dates[0]);
      } else if (expiry) {
        setSelectedExpiry(expiry);
      }
      setStockPrice(quote?.price ?? chain.underlyingPrice ?? 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load options chain');
      setDataSource(null);
      setChainData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChain(symbol);
  }, [symbol, loadChain]);

  const filteredContracts = useMemo(() => {
    if (!chainData) return [];

    const contracts = activeTab === 'calls'
      ? chainData.calls
      : activeTab === 'puts'
      ? chainData.puts
      : [...chainData.calls, ...chainData.puts];

    return contracts
      .filter(c => c.dte >= minDTE)
      .filter(c => !nearMoneyOnly || Math.abs((c.strike - stockPrice) / stockPrice) <= 0.05)
      .sort((a, b) => {
        if (activeTab === 'both') {
          return b.estimatedGainPercent - a.estimatedGainPercent;
        }
        return Math.abs(a.strike - stockPrice) - Math.abs(b.strike - stockPrice);
      });
  }, [chainData, activeTab, minDTE, nearMoneyOnly, stockPrice]);

  const summary = useMemo(() => {
    if (!chainData) return null;
    return {
      underlying: safeMoney(chainData.underlyingPrice, 2),
      ivAtm: chainData.ivAtm != null ? safePercent(chainData.ivAtm, 0) : '--',
      expectedMove: chainData.expectedMove != null ? safeMoney(chainData.expectedMove, 2) : '--',
      putCallRatio: chainData.putCallRatio != null ? chainData.putCallRatio.toFixed(2) : '--',
      dte: chainData.dte != null ? `${chainData.dte}d` : '--',
      ivRank: chainData.ivRank != null ? `${chainData.ivRank.toFixed(0)}%` : '--',
    };
  }, [chainData]);

  const handleLoadCustom = () => {
    if (!customSymbol.trim()) return;
    setSymbol(customSymbol.trim().toUpperCase());
    setCustomSymbol('');
  };

  return (
    <AppShell title="Options Chain">
      <DataSourceBanner dataSource={dataSource} fetchedAt={chainData?.meta.fetchedAt ?? null} className="mb-4" />

      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">Options Chain Analytics</span>
                <Badge variant="purple">Professional</Badge>
              </div>
              <p className="text-sm text-gray-500 max-w-2xl">
                Analyze expiries, filter by DTE and moneyness, and compare calls and puts with contract-level signal clarity.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {QUICK_SYMBOLS.map((quick) => (
                <button
                  key={quick}
                  type="button"
                  onClick={() => setSymbol(quick)}
                  className={`px-3 py-2 rounded-full text-xs font-semibold border transition ${symbol === quick ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'}`}
                >
                  {quick}
                </button>
              ))}
              <Button size="sm" onClick={() => loadChain(symbol, selectedExpiry)} loading={loading}>
                <RefreshCw size={14} className="mr-2" /> Refresh
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-4">
            {summary && summaryCard('Underlying', summary.underlying, 'Current stock price')}
            {summary && summaryCard('ATM IV', summary.ivAtm, 'Nearest implied volatility')}
            {summary && summaryCard('Expected Move', summary.expectedMove, '1σ price move')}
            {summary && summaryCard('Put/Call', summary.putCallRatio, 'Volume ratio')}
          </div>
        </Card>

        <Card className="p-6">
          <div className="grid gap-4 xl:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Custom symbol</label>
              <div className="mt-2 flex gap-2">
                <input
                  value={customSymbol}
                  onChange={(event) => setCustomSymbol(event.target.value.toUpperCase())}
                  onKeyDown={(event) => event.key === 'Enter' && handleLoadCustom()}
                  placeholder="Enter ticker"
                  className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
                <Button size="sm" onClick={handleLoadCustom}>Load</Button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Expiry</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(chainData?.expirationDates ?? []).slice(0, 8).map((expiry) => (
                  <button
                    key={expiry}
                    type="button"
                    onClick={() => loadChain(symbol, expiry)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium border transition ${selectedExpiry === expiry ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'}`}
                  >
                    {formatDateLabel(expiry)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Min DTE</label>
                <input
                  type="number"
                  min={0}
                  value={minDTE}
                  onChange={(event) => setMinDTE(Number(event.target.value))}
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
              </div>
              <div className="flex flex-col justify-end">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Near-money</label>
                <button
                  type="button"
                  onClick={() => setNearMoneyOnly((value) => !value)}
                  className={`mt-2 inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold border transition ${nearMoneyOnly ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'}`}
                >
                  {nearMoneyOnly ? 'Enabled' : 'Off'}
                </button>
              </div>
            </div>
          </div>
        </Card>

        {error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            <div className="font-semibold mb-2">Options chain unavailable</div>
            <p>{error}</p>
          </div>
        ) : null}

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{symbol} Options</p>
              <p className="text-sm text-gray-700">{filteredContracts.length} contracts showing</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span>{activeTab === 'both' ? 'Calls + Puts' : activeTab === 'calls' ? 'Calls only' : 'Puts only'}</span>
              <span>•</span>
              <span>{selectedExpiry ? formatDateLabel(selectedExpiry) : 'Select expiry'}</span>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {(['both', 'calls', 'puts'] as const).map((tab) => (
              <button
                type="button"
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition ${activeTab === tab ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'}`}
              >
                {tab === 'both' ? 'Calls + Puts' : tab === 'calls' ? 'Calls' : 'Puts'}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-500">
              <div className="inline-flex flex-col items-center gap-3">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
                <p>Loading options contracts…</p>
              </div>
            </div>
          ) : filteredContracts.length > 0 ? (
            <OptionsChainTable contracts={filteredContracts} type={activeTab === 'puts' ? 'put' : 'call'} stockPrice={stockPrice} />
          ) : (
            <div className="text-center py-16 text-gray-500">
              <p>No options contracts available for the current filters. Try a different expiry or widen DTE.</p>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
