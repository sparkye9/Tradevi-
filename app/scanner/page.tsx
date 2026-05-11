'use client';
import { useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ScannerFiltersPanel } from '@/components/scanner/ScannerFilters';
import { OpportunityCard } from '@/components/scanner/OpportunityCard';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { ScannerFilters, ScannerResult, Opportunity } from '@/lib/types';
import { SCANNER_SYMBOLS } from '@/lib/mock';
import { Search, AlertTriangle, TrendingUp } from 'lucide-react';

const defaultFilters: ScannerFilters = {
  maxPremium: 100,
  optionType: 'both',
  tradeType: 'swing',
  minVolume: 10,
  minOpenInterest: 50,
  minOpportunityScore: 40,
  minDelta: 0.15,
  maxDelta: 0.70,
  minDTE: 0,
  maxDTE: 45,
  includeLottery: false,
  biasFilter: 'both',
  symbols: SCANNER_SYMBOLS,
};

export default function ScannerPage() {
  const [filters, setFilters] = useState<ScannerFilters>(defaultFilters);
  const [result, setResult] = useState<ScannerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'cost' | 'gain'>('score');

  const runScan = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      });
      if (!res.ok) throw new Error('Scanner request failed');
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError('Scanner failed. Check your connection and try again.');
    }
    setLoading(false);
  }, [filters]);

  const sorted = (result?.opportunities ?? []).slice().sort((a, b) => {
    if (sortBy === 'cost') return a.costPerContract - b.costPerContract;
    if (sortBy === 'gain') return b.estimatedGainPercent - a.estimatedGainPercent;
    return b.opportunityScore - a.opportunityScore;
  });

  const cheapUnder25 = sorted.filter(o => o.costPerContract <= 25);
  const cheapUnder50 = sorted.filter(o => o.costPerContract > 25 && o.costPerContract <= 50);
  const cheapUnder100 = sorted.filter(o => o.costPerContract > 50 && o.costPerContract <= 100);
  const rest = sorted.filter(o => o.costPerContract > 100);

  const renderGroup = (label: string, opps: Opportunity[], badge?: string) => {
    if (opps.length === 0) return null;
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-semibold text-gray-800">{label}</h3>
          {badge && <Badge variant="purple" size="sm">{badge}</Badge>}
          <span className="text-xs text-gray-400">{opps.length} opportunities</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {opps.map(opp => <OpportunityCard key={opp.id} opp={opp} />)}
        </div>
      </div>
    );
  };

  return (
    <AppShell title="Opportunities Scanner">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters sidebar */}
        <div className="lg:col-span-1">
          <ScannerFiltersPanel
            filters={filters}
            onChange={(updates) => setFilters(f => ({ ...f, ...updates }))}
            onScan={runScan}
            loading={loading}
          />

          {/* Scanner info */}
          <div className="mt-4 p-3 bg-blue-50 rounded-xl text-xs text-blue-800 space-y-1">
            <p className="font-semibold">📊 How the scanner works:</p>
            <p>It fetches real Yahoo Finance data for {SCANNER_SYMBOLS.length} symbols, calculates technical indicators, and scores every options contract on 10 factors to find setups with strong reward potential.</p>
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-3">
          {/* Disclaimer */}
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-bold">Opportunities are for analysis only.</p>
              <p>100%+ potential does not mean likely. Cheap options expire worthless most of the time.
              Always confirm in Robinhood and complete the risk checklist before entering any trade.</p>
            </div>
          </div>

          {result && (
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="text-xs text-gray-500">
                  {result.opportunities.length} opportunities across {result.symbolsScanned} symbols
                  • Scanned {new Date(result.scannedAt).toLocaleTimeString()}
                </div>
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
                <p className="text-gray-600 font-medium">Scanning {SCANNER_SYMBOLS.length} symbols...</p>
                <p className="text-xs text-gray-400">Fetching live options data from Yahoo Finance</p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          {!loading && !result && !error && (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Search size={28} className="text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-800 mb-2">Ready to Scan</h3>
              <p className="text-gray-500 text-sm mb-4 max-w-md mx-auto">
                Configure your filters and click "Run Scanner" to find options with 100%+ potential across {SCANNER_SYMBOLS.length} symbols.
              </p>
              <p className="text-xs text-gray-400">
                Scans: {SCANNER_SYMBOLS.join(', ')}
              </p>
            </div>
          )}

          {!loading && result && sorted.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No opportunities matched your filters. Try relaxing the criteria.</p>
            </div>
          )}

          {!loading && result && sorted.length > 0 && (
            <>
              {renderGroup('🔥 Ultra Cheap — Under $25', cheapUnder25, 'LOTTERY RISK')}
              {renderGroup('💡 Affordable — $25–$50', cheapUnder50)}
              {renderGroup('📊 Standard — $50–$100', cheapUnder100)}
              {renderGroup('💰 Premium — $100+', rest)}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
