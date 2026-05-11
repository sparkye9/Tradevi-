'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { OptionsChainTable } from '@/components/options/OptionsChainTable';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { OptionContract } from '@/lib/types';
import { SCANNER_SYMBOLS } from '@/lib/mock';
import { BarChart2, RefreshCw } from 'lucide-react';
import { DataSourceBanner, type DataSource } from '@/components/ui/DataSourceBanner';

export default function OptionsChainPage() {
  const [symbol, setSymbol] = useState('SPY');
  const [customSymbol, setCustomSymbol] = useState('');
  const [expirations, setExpirations] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [calls, setCalls] = useState<OptionContract[]>([]);
  const [puts, setPuts] = useState<OptionContract[]>([]);
  const [stockPrice, setStockPrice] = useState(0);
  const [activeTab, setActiveTab] = useState<'calls' | 'puts'>('calls');
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<DataSource>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const fetch = useCallback(async (sym: string, expiry?: string) => {
    setLoading(true);
    try {
      const url = `/api/options-chain?symbol=${sym}${expiry ? `&expiration=${expiry}` : ''}`;
      const res = await window.fetch(url);
      const data = await res.json();
      setExpirations(data.expirationDates ?? []);
      setCalls(data.calls ?? []);
      setPuts(data.puts ?? []);
      setDataSource(data.meta?.dataSource ?? 'mock');
      setFetchedAt(data.meta?.fetchedAt ?? new Date().toISOString());
      if (!expiry && data.expirationDates?.length) setSelectedExpiry(data.expirationDates[0]);
    } catch { setDataSource('mock'); }
    try {
      const qRes = await window.fetch(`/api/quote?symbol=${sym}`);
      const qData = await qRes.json();
      setStockPrice(qData.quote?.price ?? 0);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => { fetch(symbol); }, [symbol, fetch]);

  const handleExpiry = (expiry: string) => {
    setSelectedExpiry(expiry);
    fetch(symbol, expiry);
  };

  return (
    <AppShell title="Options Chain">
      <DataSourceBanner dataSource={dataSource} fetchedAt={fetchedAt} className="mb-4" />
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
        <Button size="sm" variant="ghost" onClick={() => fetch(symbol, selectedExpiry)} loading={loading} className="mt-5">
          <RefreshCw size={13} />
        </Button>
      </div>

      {/* Stock price header */}
      {stockPrice > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <h2 className="font-bold text-2xl text-gray-900">{symbol}</h2>
          <span className="text-lg text-gray-600">${stockPrice.toFixed(2)}</span>
        </div>
      )}

      {/* Expiration dates */}
      {expirations.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2">Expiration Date</p>
          <div className="flex flex-wrap gap-2">
            {expirations.map(exp => {
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
        </div>

        {!loading && (
          <OptionsChainTable
            contracts={activeTab === 'calls' ? calls : puts}
            type={activeTab === 'calls' ? 'call' : 'put'}
            stockPrice={stockPrice}
          />
        )}
      </Card>
    </AppShell>
  );
}
