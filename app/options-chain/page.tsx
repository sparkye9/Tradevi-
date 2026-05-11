'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { OptionsChainTable } from '@/components/options/OptionsChainTable';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataSourceBanner, type DataSource } from '@/components/ui/DataSourceBanner';
import { fetchOptionsChain, fetchQuote, type OptionsChainResponse } from '@/lib/apiClient';
import { BarChart2, RefreshCw } from 'lucide-react';

export default function OptionsChainPage() {
  const [symbol, setSymbol] = useState('SPY');
  const [customSymbol, setCustomSymbol] = useState('');
  const [chainData, setChainData] = useState<OptionsChainResponse | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [stockPrice, setStockPrice] = useState(0);
  const [activeTab, setActiveTab] = useState<'calls' | 'puts'>('calls');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dataSource, setDataSource] = useState<DataSource>(null);

  const load = useCallback(async (sym: string, expiry?: string) => {
    setLoading(true);
    setError('');
    try {
      const [chain, quote] = await Promise.all([
        fetchOptionsChain(sym, expiry),
        fetchQuote(sym).catch(() => null),
      ]);
      setChainData(chain);
      setDataSource((chain.meta.dataSource as DataSource) ?? 'yahoo_delayed');
      if (!expiry && chain.expirationDates.length) setSelectedExpiry(chain.expirationDates[0]);
      if (quote) setStockPrice(quote.price);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load options chain');
      setDataSource(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(symbol); }, [symbol, load]);

  const handleExpiry = (exp: string) => {
    setSelectedExpiry(exp);
    load(symbol, exp);
  };

  return (
    <AppShell title="Options Chain">
      <DataSourceBanner dataSource={dataSource} fetchedAt={chainData?.meta.fetchedAt ?? null} className="mb-4" />

      <div className="mb-6 flex flex-wrap gap-3 items-end">
        {/* Symbol quick select */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Symbol</label>
          <div className="flex flex-wrap gap-1.5">
            {['SPY', 'QQQ', 'TSLA', 'NVDA', 'AAPL', 'AMD', 'PLTR'].map(s => (
              <button
                key={s}
                onClick={() => setSymbol(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  symbol === s ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600 hover:border-purple-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Custom symbol */}
        <div className="flex gap-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Custom Symbol</label>
            <input
              value={customSymbol}
              onChange={e => setCustomSymbol(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && customSymbol && setSymbol(customSymbol)}
              placeholder="e.g. AMZN"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-28 focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => customSymbol && setSymbol(customSymbol)} className="mt-5">
            Load
          </Button>
        </div>

        <Button size="sm" variant="ghost" onClick={() => load(symbol, selectedExpiry)} loading={loading} className="mt-5">
          <RefreshCw size={13} />
        </Button>
      </div>

      {/* Stock price header */}
      {stockPrice > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <h2 className="font-bold text-2xl text-gray-900">{symbol}</h2>
          <span className="text-lg text-gray-600">${stockPrice.toFixed(2)}</span>
          {chainData?.meta.dataSource === 'polygon_realtime' && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
              Real-time · Polygon.io
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 mb-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}

      {/* Expiration dates */}
      {chainData && chainData.expirationDates.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2">Expiration Date</p>
          <div className="flex flex-wrap gap-2">
            {chainData.expirationDates.map(exp => {
              const dte = Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000);
              return (
                <button
                  key={exp}
                  onClick={() => handleExpiry(exp)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    selectedExpiry === exp ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600 hover:border-purple-300'
                  }`}
                >
                  {new Date(exp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  <span className="ml-1 opacity-70">({dte}d)</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Calls / Puts tab */}
      <Card>
        <div className="flex items-center gap-4 mb-4">
          {(['calls', 'puts'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                activeTab === tab ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600 hover:border-purple-300'
              }`}
            >
              {tab === 'calls' ? '📈 Calls' : '📉 Puts'}
            </button>
          ))}
          {loading && (
            <div className="w-4 h-4 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin ml-2" />
          )}
          {chainData && (
            <span className="ml-auto text-xs text-gray-400">
              {activeTab === 'calls' ? chainData.calls.length : chainData.puts.length} contracts
            </span>
          )}
        </div>

        {!loading && chainData && (
          <OptionsChainTable
            contracts={(activeTab === 'calls' ? chainData.calls : chainData.puts) as any}
            type={activeTab === 'calls' ? 'call' : 'put'}
            stockPrice={stockPrice}
          />
        )}

        {!loading && !chainData && !error && (
          <p className="text-sm text-gray-400 py-4 text-center">Select a symbol to load the options chain.</p>
        )}
      </Card>
    </AppShell>
  );
}
