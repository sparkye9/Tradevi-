'use client';
import { useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ScannerFiltersPanel } from '@/components/scanner/ScannerFilters';
import { OpportunityCard } from '@/components/scanner/OpportunityCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { ScannerFilters, Opportunity } from '@/lib/types';
import { runScanner } from '@/lib/apiClient';
import { Search, AlertTriangle, Plus, X } from 'lucide-react';
import { DataSourceBanner, type DataSource } from '@/components/ui/DataSourceBanner';

const SCANNER_SYMBOLS = [
  'SPY', 'QQQ', 'IWM', 'TSLA', 'NVDA', 'AAPL', 'AMD',
  'META', 'MSFT', 'F', 'SQQQ', 'TQQQ', 'SOFI', 'PLTR', 'USO', 'XLE',
];

const defaultFilters: ScannerFilters = {
  maxPremium: 200,
  optionType: 'both',
  tradeType: 'swing',
  minVolume: 10,
  minOpenInterest: 50,
  minOpportunityScore: 40,
  minDelta: 0.15,
  maxDelta: 0.70,
  minDTE: 7,
  maxDTE: 45,
  includeLottery: false,
  biasFilter: 'both',
  symbols: SCANNER_SYMBOLS,
};

export default function ScannerPage() {
  const [filters, setFilters] = useState<ScannerFilters>(defaultFilters);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [symbolsScanned, setSymbolsScanned] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'cost' | 'gain'>('score');
  const [newSymbol, setNewSymbol] = useState('');
  const [dataSource, setDataSource] = useState<DataSource>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const addSymbol = () => {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym || filters.symbols.includes(sym)) { setNewSymbol(''); return; }
    setFilters(f => ({ ...f, symbols: [...f.symbols, sym] }));
    setNewSymbol('');
  };

  const removeSymbol = (sym: string) =>
    setFilters(f => ({ ...f, symbols: f.symbols.filter(s => s !== sym) }));

  const resetSymbols = () => setFilters(f => ({ ...f, symbols: SCANNER_SYMBOLS }));

  const doScan = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await runScanner(filters as any);
      setOpportunities((data.opportunities as Opportunity[]) ?? []);
      setScannedAt(data.scannedAt);
      setSymbolsScanned(data.symbolsScanned);
      setDataSource(((data.meta as any)?.dataSource as DataSource) ?? 'yahoo_delayed');
      setFetchedAt(((data.meta as any)?.fetchedAt) ?? new Date().toISOString());
    } catch (err: any) {
      setError(err?.message ?? 'Scanner failed. Check API keys and connection.');
    }
    setLoading(false);
  }, [filters]);

  const sorted = opportunities.slice().sort((a, b) => {
    if (sortBy === 'cost') return a.costPerContract - b.costPerContract;
    if (sortBy === 'gain') return b.estimatedGainPercent - a.estimatedGainPercent;
    return b.opportunityScore - a.opportunityScore;
  });

  const groups = [
    { label: '🔥 Ultra Cheap — Under $25',  badge: 'LOTTERY RISK', items: sorted.filter(o => o.costPerContract <= 25) },
    { label: '💡 Affordable — $25–$50',      badge: '',             items: sorted.filter(o => o.costPerContract > 25 && o.costPerContract <= 50) },
    { label: '📊 Standard — $50–$100',       badge: '',             items: sorted.filter(o => o.costPerContract > 50 && o.costPerContract <= 100) },
    { label: '💰 Premium — $100+',           badge: '',             items: sorted.filter(o => o.costPerContract > 100) },
  ];

  return (
    <AppShell title="Opportunities Scanner">
      {dataSource && <DataSourceBanner dataSource={dataSource} fetchedAt={fetchedAt} className="mb-4" />}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Filters sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <ScannerFiltersPanel
            filters={filters}
            onChange={(updates) => setFilters(f => ({ ...f, ...updates }))}
            onScan={doScan}
            loading={loading}
          />

          {/* Custom symbol manager */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-800">Scan Symbols</p>
              <button onClick={resetSymbols} className="text-xs text-purple-600 hover:underline">Reset defaults</button>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                value={newSymbol}
                onChange={e => setNewSymbol(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && addSymbol()}
                placeholder="Add ticker (e.g. AMZN)"
                className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
              />
              <Button size="xs" onClick={addSymbol}><Plus size={12} /></Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filters.symbols.map(sym => (
                <span key={sym} className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-xs font-medium rounded-full border border-purple-100">
                  {sym}
                  <button onClick={() => removeSymbol(sym)} className="hover:text-red-500 transition-colors ml-0.5">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">{filters.symbols.length} symbols will be scanned</p>
          </div>

          <div className="p-3 bg-blue-50 rounded-xl text-xs text-blue-800 space-y-1">
            <p className="font-semibold">📊 How the scanner works:</p>
            <p>Fetches real data from Polygon.io (options) + Yahoo Finance (candles), calculates RSI/ATR/trend, then scores every contract on 10 factors.</p>
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-3">
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-bold">Opportunities are for analysis only.</p>
              <p>100%+ potential does not mean likely. Cheap options expire worthless most of the time.
              Always confirm in your broker and complete the risk checklist before entering any trade.</p>
            </div>
          </div>

          {scannedAt && (
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="text-xs text-gray-500">
                {opportunities.length} opportunities across {symbolsScanned} symbols
                • Scanned {new Date(scannedAt).toLocaleTimeString()}
              </div>
              <div className="flex gap-1">
                {(['score', 'cost', 'gain'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${
                      sortBy === s ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {s === 'score' ? 'Best Score' : s === 'cost' ? 'Cheapest' : 'Best Gain'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="text-center py-16">
              <div className="inline-flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                <p className="text-gray-600 font-medium">Scanning {filters.symbols.length} symbols…</p>
                <p className="text-xs text-gray-400">Fetching live options data from Polygon.io + Yahoo Finance</p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertTriangle size={18} className="flex-shrink-0 text-red-500 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800 text-sm">Scanner unavailable</p>
                <p className="text-red-700 text-xs mt-1">
                  {error.length > 120 ? 'Market data temporarily unavailable. Please try again in a moment.' : error}
                </p>
              </div>
            </div>
          )}

          {!loading && !scannedAt && !error && (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Search size={28} className="text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-800 mb-2">Ready to Scan</h3>
              <p className="text-gray-500 text-sm mb-4 max-w-md mx-auto">
                Configure your filters and click "Run Scanner" to find options with 100%+ potential.
              </p>
              <p className="text-xs text-gray-400">Scanning: {filters.symbols.join(', ')}</p>
            </div>
          )}

          {!loading && scannedAt && sorted.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No opportunities matched your filters. Try relaxing the criteria or adding more symbols.</p>
            </div>
          )}

          {!loading && sorted.length > 0 && groups.map(({ label, badge, items }) => {
            if (!items.length) return null;
            return (
              <div key={label} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-semibold text-gray-800">{label}</h3>
                  {badge && <Badge variant="purple" size="sm">{badge}</Badge>}
                  <span className="text-xs text-gray-400">{items.length} opportunities</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {items.map(opp => <OpportunityCard key={opp.id} opp={opp} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
