'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { MainChart } from '@/components/dashboard/MainChart';
import { BiasCard } from '@/components/dashboard/BiasCard';
import { KeyLevels } from '@/components/dashboard/KeyLevels';
import { BiblePanel } from '@/components/dashboard/BiblePanel';
import { FocusTimer } from '@/components/dashboard/FocusTimer';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { StockQuote, StockAnalysis, CandleData, NewsItem } from '@/lib/types';
import { RefreshCw, TrendingUp, TrendingDown, Newspaper, Search } from 'lucide-react';
import Link from 'next/link';

const SYMBOLS = ['SPY', 'QQQ', 'TSLA', 'NVDA', 'AAPL'];
const PERIODS = ['1d', '5d', '1mo', '3mo', '1y'] as const;

export default function DashboardPage() {
  const [selectedSymbol, setSelectedSymbol] = useState('SPY');
  const [selectedPeriod, setSelectedPeriod] = useState<'1d' | '5d' | '1mo' | '3mo' | '1y'>('3mo');
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [quoteRes, chartRes, newsRes] = await Promise.all([
        fetch(`/api/quote?symbol=${selectedSymbol}`),
        fetch(`/api/chart?symbol=${selectedSymbol}&period=${selectedPeriod}&interval=${selectedPeriod === '1d' ? '5m' : '1d'}`),
        fetch(`/api/news?symbol=${selectedSymbol}`),
      ]);
      const quoteData = await quoteRes.json();
      const chartData = await chartRes.json();
      const newsData = await newsRes.json();
      setQuote(quoteData.quote);
      setAnalysis(quoteData.analysis);
      setCandles(chartData.candles ?? []);
      setNews(newsData.news ?? []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch { /* handled by mock fallback */ }
    setLoading(false);
  }, [selectedSymbol, selectedPeriod]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <AppShell title="Dashboard">
      {/* Symbol selector + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap gap-2">
          {SYMBOLS.map(sym => (
            <button
              key={sym}
              onClick={() => setSelectedSymbol(sym)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                selectedSymbol === sym
                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:text-purple-700'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => setSelectedPeriod(p)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  selectedPeriod === p ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={fetchData} loading={loading}>
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      {/* Quote stats */}
      {quote && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Price"
            value={`$${quote.price.toFixed(2)}`}
            change={quote.changePercent}
            changeLabel="today"
            color={quote.changePercent >= 0 ? 'green' : 'red'}
          />
          <StatCard label="Day High" value={`$${(quote.regularMarketDayHigh ?? quote.price).toFixed(2)}`} />
          <StatCard label="Day Low" value={`$${(quote.regularMarketDayLow ?? quote.price).toFixed(2)}`} />
          <StatCard label="Volume" value={`${((quote.volume ?? 0) / 1000000).toFixed(1)}M`} />
        </div>
      )}

      {/* Main chart */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-gray-900">{selectedSymbol}</h2>
            {quote && (
              <p className="text-xs text-gray-500">
                {quote.shortName} • Updated {lastUpdated}
              </p>
            )}
          </div>
          {quote && (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-900">${quote.price.toFixed(2)}</span>
              <span className={`flex items-center gap-1 text-sm font-medium ${quote.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {quote.changePercent >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
        <MainChart candles={candles} analysis={analysis} period={selectedPeriod} />
      </div>

      {/* Grid: Bias + Key Levels + Bible + Timer */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <BiasCard analysis={analysis} symbol={selectedSymbol} />
        <KeyLevels analysis={analysis} />
        <BiblePanel />
        <FocusTimer />
      </div>

      {/* News + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* News */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title={`${selectedSymbol} News`} icon={<Newspaper size={16} />} />
            {news.length === 0 ? (
              <p className="text-sm text-gray-400">Loading news...</p>
            ) : (
              <div className="space-y-3">
                {news.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-start gap-3 pb-3 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <a href={item.link} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-medium text-gray-800 hover:text-purple-700 line-clamp-2 transition-colors">
                        {item.title}
                      </a>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.publisher} • {new Date(item.publishedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader title="Quick Actions" />
          <div className="space-y-2">
            <Link href="/scanner">
              <Button variant="primary" size="md" className="w-full justify-start">
                <Search size={14} className="mr-2" /> Run Opportunity Scanner
              </Button>
            </Link>
            <Link href="/options-chain">
              <Button variant="secondary" size="md" className="w-full justify-start mt-2">
                View Options Chain
              </Button>
            </Link>
            <Link href="/alerts">
              <Button variant="outline" size="md" className="w-full justify-start mt-2">
                Trade Alerts
              </Button>
            </Link>
            <Link href="/risk">
              <Button variant="outline" size="md" className="w-full justify-start mt-2">
                Risk Calculator
              </Button>
            </Link>
          </div>
          <div className="mt-4 p-3 bg-amber-50 rounded-lg text-xs text-amber-800 leading-relaxed">
            <p className="font-bold mb-1">⚠️ Remember:</p>
            <p>This app does NOT place trades. Every trade must be manually confirmed in Robinhood.</p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
