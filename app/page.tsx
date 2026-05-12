'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { BiasCard } from '@/components/dashboard/BiasCard';
import { KeyLevels } from '@/components/dashboard/KeyLevels';
import { BiblePanel } from '@/components/dashboard/BiblePanel';
import { FocusTimer } from '@/components/dashboard/FocusTimer';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataSourceBanner, DataSourceBadge, type DataSource } from '@/components/ui/DataSourceBanner';
import { RefreshCw, TrendingUp, TrendingDown, Newspaper, Search, WifiOff, Zap } from 'lucide-react';
import { fetchChart, fetchQuote, fetchNews, type ChartResponse, type QuoteData } from '@/lib/apiClient';
import { useTickerPrice } from '@/lib/wsClient';
import { ChartErrorBoundary } from '@/components/charts/ChartErrorBoundary';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const TradingViewChart = dynamic(() => import('@/components/charts/TradingViewChart'), { ssr: false });

const SYMBOLS = ['SPY', 'QQQ', 'SQQQ', 'TQQQ', 'TSLA', 'NVDA', 'AAPL', 'AMD', 'PLTR'];
const PERIODS = ['1d', '5d', '1mo', '3mo', '1y'] as const;

export default function DashboardPage() {
  const [selectedSymbol, setSelectedSymbol] = useState('SPY');
  const [selectedPeriod, setSelectedPeriod] = useState<(typeof PERIODS)[number]>('3mo');
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [chartData, setChartData] = useState<ChartResponse | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [dataSource, setDataSource] = useState<DataSource>(null);

  // Live price from WebSocket (updates last candle)
  const { price: livePrice, connected: wsConnected } = useTickerPrice({
    symbol: selectedSymbol,
    enabled: true,
  });

  const displayPrice = livePrice ?? quote?.price ?? null;

  const loadData = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const [chart, newsData] = await Promise.all([
        fetchChart(selectedSymbol, selectedPeriod),
        fetchNews(selectedSymbol).catch(() => ({ news: [] })),
      ]);
      setChartData(chart);
      setNews(newsData.news ?? []);
      setDataSource((chart.meta.dataSource as DataSource) ?? 'yahoo_delayed');

      // Also fetch quote for stats
      const q = await fetchQuote(selectedSymbol).catch(() => null);
      if (q) setQuote(q);
    } catch (err: any) {
      setFetchError(err?.message ?? 'Failed to load data. Check connection and API keys.');
      setDataSource(null);
    }
    setLoading(false);
  }, [selectedSymbol, selectedPeriod]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  const analysis = chartData?.analysis ?? null;

  return (
    <AppShell title="Dashboard">
      {/* Data freshness banner */}
      <DataSourceBanner dataSource={dataSource} fetchedAt={chartData?.meta.fetchedAt ?? null} className="mb-4" />

      {/* Error state */}
      {fetchError && (
        <div className="flex items-start gap-3 p-4 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
          <WifiOff size={16} className="flex-shrink-0 mt-0.5 text-red-600" />
          <div>
            <p className="font-bold">Data unavailable</p>
            <p className="text-xs mt-0.5">{fetchError}</p>
            <p className="text-xs mt-1 text-red-600">Configure API keys in backend/.env to enable live data.</p>
          </div>
        </div>
      )}

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
          <Button size="sm" variant="outline" onClick={loadData} loading={loading}>
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      {/* Quote stats */}
      {quote && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Price"
            value={`$${(displayPrice ?? quote.price).toFixed(2)}`}
            change={quote.changePercent}
            changeLabel="today"
            color={quote.changePercent >= 0 ? 'green' : 'red'}
          />
          <StatCard label="Day High" value={`$${quote.high.toFixed(2)}`} />
          <StatCard label="Day Low" value={`$${quote.low.toFixed(2)}`} />
          <StatCard label="Prev Close" value={`$${quote.prevClose.toFixed(2)}`} />
        </div>
      )}

      {/* Main chart */}
      <div className="bg-[#0f1117] rounded-xl border border-gray-800 shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-white">{selectedSymbol}</h2>
              <DataSourceBadge dataSource={dataSource} />
              {wsConnected && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-900 text-green-300 border border-green-700">
                  <Zap size={9} /> Live
                </span>
              )}
            </div>
            {quote && (
              <p className="text-xs text-gray-400">
                {dataSource === 'yahoo_delayed' ? '~15–20min delayed' : 'Real-time via Finnhub'}
              </p>
            )}
          </div>
          {displayPrice && (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white">${displayPrice.toFixed(2)}</span>
              {quote && (
                <span className={`flex items-center gap-1 text-sm font-medium ${quote.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {quote.changePercent >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%
                </span>
              )}
            </div>
          )}
        </div>
        <ChartErrorBoundary onReset={() => loadData()}>
          <TradingViewChart
            candles={chartData?.candles ?? []}
            analysis={analysis}
            livePrice={livePrice}
          />
        </ChartErrorBoundary>
      </div>

      {/* Grid: Bias + Key Levels + Bible + Timer */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <BiasCard analysis={analysis as any} symbol={selectedSymbol} />
        <KeyLevels analysis={analysis as any} />
        <BiblePanel />
        <FocusTimer />
      </div>

      {/* News + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title={`${selectedSymbol} News`} icon={<Newspaper size={16} />} />
            {news.length === 0 ? (
              <p className="text-sm text-gray-400">
                {fetchError ? 'News unavailable — configure FINNHUB_API_KEY.' : 'Loading news…'}
              </p>
            ) : (
              <div className="space-y-3">
                {news.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-start gap-3 pb-3 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-gray-800 hover:text-purple-700 line-clamp-2 transition-colors"
                      >
                        {item.title}
                      </a>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.publisher} •{' '}
                        {new Date(item.publishedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

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
            <Link href="/market-analysis">
              <Button variant="primary" size="md" className="w-full justify-start mt-2">
                <TrendingUp size={14} className="mr-2" /> Market Analysis
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
            <p>This app does NOT place trades. Every trade must be manually confirmed in your broker.</p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
