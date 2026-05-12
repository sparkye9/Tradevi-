'use client';

import { useCallback, useMemo, useState } from 'react';
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
    if (!sym || filters.symbols.includes(sym)) {
      setNewSymbol('');
      return;
    }
    setFilters((f) => ({ ...f, symbols: [...f.symbols, sym] }));
    setNewSymbol('');
  };

  const removeSymbol = (sym: string) =>
    setFilters((f) => ({ ...f, symbols: f.symbols.filter((item) => item !== sym) }));

  const resetSymbols = () => setFilters((f) => ({ ...f, symbols: SCANNER_SYMBOLS }));

  const doScan = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await runScanner(filters);
      setOpportunities(result.opportunities as Opportunity[]);
      setSymbolsScanned(result.symbolsScanned);
      setScannedAt(result.scannedAt);
      setFetchedAt(result.scannedAt);
      setDataSource('yahoo_delayed');
      if (result.opportunities.length === 0) {
        setError('No results matched the requested filters. Try a wider DTE range or more symbols.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Scanner failed to fetch market opportunities.');
      setOpportunities([]);
      setScannedAt(null);
      setSymbolsScanned(0);
      setDataSource(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const sorted = useMemo(() => {
    return [...opportunities].sort((a, b) => {
      if (sortBy === 'cost') return a.costPerContract - b.costPerContract;
      if (sortBy === 'gain') return b.estimatedGainPercent - a.estimatedGainPercent;
      return b.opportunityScore - a.opportunityScore;
    });
  }, [opportunities, sortBy]);

  const groups = useMemo(
    () => [
      { label: '🔥 Ultra Cheap — Under $25', badge: 'LOTTERY RISK', items: sorted.filter((o) => o.costPerContract <= 25) },
      { label: '💡 Affordable — $25–$50', badge: '', items: sorted.filter((o) => o.costPerContract > 25 && o.costPerContract <= 50) },
      { label: '📊 Standard — $50–$100', badge: '', items: sorted.filter((o) => o.costPerContract > 50 && o.costPerContract <= 100) },
      { label: '💰 Premium — $100+', badge: '', items: sorted.filter((o) => o.costPerContract > 100) },
    ],
    [sorted]
  );

  return (
    <AppShell title="Opportunities Scanner">
      {dataSource && <DataSourceBanner dataSource={dataSource} fetchedAt={fetchedAt} className="mb-4" />}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <ScannerFiltersPanel
            filters={filters}
            onChange={(updates) => setFilters((f) => ({ ...f, ...updates }))}
            onScan={doScan}
            loading={loading}
          />

          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-800">Scan Symbols</p>
              <button onClick={resetSymbols} className="text-xs text-purple-600 hover:underline">Reset</button>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                value={newSymbol}
                onChange={(event) => setNewSymbol(event.target.value.toUpperCase())}
                onKeyDown={(event) => event.key === 'Enter' && addSymbol()}
                placeholder="Add ticker"
                className="flex-1 border border-gray-200 rounded-2xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
              <Button size="xs" onClick={addSymbol}><Plus size={12} /></Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filters.symbols.map((sym) => (
                <span key={sym} className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-xs font-medium rounded-full border border-purple-100">
                  {sym}
                  <button onClick={() => removeSymbol(sym)} className="hover:text-red-500 transition-colors ml-0.5">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">{filters.symbols.length} tickers will be scanned</p>
          </div>

          <div className="p-3 bg-blue-50 rounded-3xl text-xs text-blue-800 space-y-2">
            <p className="font-semibold">📊 Scanner overview</p>
            <p>Uses internal market data, filters by DTE/open interest/volume, and ranks opportunities across symbols without external scraping.</p>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-3xl flex items-start gap-3 text-xs text-amber-800">
            <AlertTriangle size={18} className="flex-shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold">Opportunities are for analysis only.</p>
              <p>Cheap options can expire worthless. Confirm pricing and risk in your broker before trading.</p>
            </div>
          </div>

          {scannedAt && (
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 text-xs text-gray-500">
              <div>{opportunities.length} opportunities across {symbolsScanned} symbols • scanned {new Date(scannedAt).toLocaleString()}</div>
              <div className="flex gap-1">
                {(['score', 'cost', 'gain'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${sortBy === s ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600'}`}
                  >
                    {s === 'score' ? 'Best Score' : s === 'cost' ? 'Cheapest' : 'Best Gain'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-16">
              <div className="inline-flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                <p className="text-gray-600 font-medium">Scanning {filters.symbols.length} symbols…</p>
                <p className="text-xs text-gray-400">Analyzing options chains and stock momentum internally.</p>
              </div>
            </div>
          ) : null}

          {error && !loading ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-3xl mb-4 text-sm text-red-700">
              <p className="font-semibold">Scanner issue</p>
              <p className="mt-2">{error}</p>
            </div>
          ) : null}

          {!loading && !scannedAt && !error ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-purple-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Search size={28} className="text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-800 mb-2">Ready to scan</h3>
              <p className="text-gray-500 text-sm mb-4 max-w-2xl mx-auto">Configure filters and click Run Scanner to surface option setups that match your criteria.</p>
            </div>
          ) : null}

          {!loading && scannedAt && sorted.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No opportunities matched your filters. Try a wider DTE range or more symbols.</div>
          ) : null}

          {!loading && sorted.length > 0 ? groups.map(({ label, badge, items }) => {
            if (!items.length) return null;
            return (
              <div key={label} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-semibold text-gray-800">{label}</h3>
                  {badge ? <Badge variant="purple" size="sm">{badge}</Badge> : null}
                  <span className="text-xs text-gray-400">{items.length} opportunities</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {items.map((opp) => <OpportunityCard key={opp.id} opp={opp} />)}
                </div>
              </div>
            );
          }) : null}
        </div>
      </div>
    </AppShell>
  );
}
