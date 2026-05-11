'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { WifiOff, Zap } from 'lucide-react';
import type { ChartResponse } from '@/lib/apiClient';
import { fetchChart } from '@/lib/apiClient';
import { useTickerPrice } from '@/lib/wsClient';
import { DataSourceBadge, type DataSource } from '@/components/ui/DataSourceBanner';
import { ChartToolbar } from './ChartToolbar';
import { TimeframeSelector } from './TimeframeSelector';
import { SignalSummaryBar } from './SignalSummaryBar';
import { IndicatorPanel } from './IndicatorPanel';
import { RiskRewardPanel } from './RiskRewardPanel';
import type { CoreChartHandle } from './CoreChart';
import type { SubPanelHandle } from './SubPanel';
import {
  INDICATOR_DEFAULTS, TIMEFRAME_MAP, DEFAULT_RR,
  type Timeframe, type ChartTheme, type IndicatorConfig, type RRSetup,
} from './chartTypes';

// Dynamic imports for chart components (canvas-based, SSR incompatible)
const CoreChart = dynamic(() => import('./CoreChart').then(m => ({ default: m.CoreChart })), { ssr: false });
const SubPanel  = dynamic(() => import('./SubPanel').then(m => ({ default: m.SubPanel })), { ssr: false });

interface Props {
  symbol: string;
}

export function ChartContainer({ symbol }: Props) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [timeframe, setTimeframe]             = useState<Timeframe>('1D');
  const [theme, setTheme]                     = useState<ChartTheme>('light');
  const [indicators, setIndicators]           = useState<IndicatorConfig[]>(INDICATOR_DEFAULTS);
  const [showGrid, setShowGrid]               = useState(true);
  const [beginnerMode, setBeginnerMode]       = useState(false);
  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false);
  const [showRR, setShowRR]                   = useState(false);
  const [rrSetup, setRrSetup]                 = useState<RRSetup | null>(null);
  const [fullscreen, setFullscreen]           = useState(false);
  const [chartData, setChartData]             = useState<ChartResponse | null>(null);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');
  const [dataSource, setDataSource]           = useState<DataSource>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const coreRef   = useRef<CoreChartHandle>(null);
  const rsiRef    = useRef<SubPanelHandle>(null);
  const macdRef   = useRef<SubPanelHandle>(null);
  const atrRef    = useRef<SubPanelHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const syncingRef   = useRef(false);

  // ── Live price ────────────────────────────────────────────────────────────
  const { price: livePrice, connected: wsConnected } = useTickerPrice({ symbol });

  // ── Data fetching ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const tf  = TIMEFRAME_MAP[timeframe];
      const data = await fetchChart(symbol, tf.period, tf.interval);
      setChartData(data);
      setDataSource((data.meta.dataSource as DataSource) ?? 'yahoo_delayed');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load chart data');
      setDataSource(null);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  useEffect(() => { load(); }, [load]);

  // ── Time scale synchronization ────────────────────────────────────────────
  // CoreChart → SubPanels
  useEffect(() => {
    if (!coreRef.current) return;
    const unsub = coreRef.current.subscribeLogicalRangeChange((range) => {
      if (syncingRef.current || !range) return;
      syncingRef.current = true;
      rsiRef.current?.setLogicalRange(range);
      macdRef.current?.setLogicalRange(range);
      atrRef.current?.setLogicalRange(range);
      syncingRef.current = false;
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData]); // re-subscribe when data changes (chart re-mounts)

  const handleSubPanelRangeChange = useCallback((range: { from: number; to: number } | null) => {
    if (syncingRef.current || !range) return;
    syncingRef.current = true;
    coreRef.current?.setLogicalRange(range);
    rsiRef.current?.setLogicalRange(range);
    macdRef.current?.setLogicalRange(range);
    atrRef.current?.setLogicalRange(range);
    syncingRef.current = false;
  }, []);

  // ── R/R tool ──────────────────────────────────────────────────────────────
  const handleRRToggle = () => {
    if (showRR) {
      setShowRR(false);
      setRrSetup(null);
    } else {
      const price = livePrice ?? chartData?.candles?.at(-1)?.close ?? 100;
      setRrSetup({
        ...DEFAULT_RR,
        entry: parseFloat(price.toFixed(2)),
        stop: parseFloat((price * 0.98).toFixed(2)),
        target: parseFloat((price * 1.04).toFixed(2)),
      });
      setShowRR(true);
    }
  };

  // ── Fullscreen ────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const handleFullscreen = async () => {
    if (!fullscreen) {
      try { await containerRef.current?.requestFullscreen(); setFullscreen(true); } catch {}
    } else {
      try { await document.exitFullscreen(); } catch {}
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const candles   = chartData?.candles   ?? [];
  const analysis  = chartData?.analysis  ?? null;
  const displayPrice = livePrice ?? candles.at(-1)?.close ?? null;
  const prevClose = candles.at(-2)?.close ?? null;
  const priceChange = displayPrice && prevClose ? displayPrice - prevClose : null;
  const pricePct    = priceChange && prevClose ? (priceChange / prevClose) * 100 : null;

  const activeSubPanels = (['rsi', 'macd', 'atr'] as const).filter(
    id => indicators.find(i => i.id === id)?.enabled
  );

  return (
    <div
      ref={containerRef}
      className={`flex flex-col rounded-xl overflow-hidden border ${
        theme === 'dark' ? 'bg-[#0f1117] border-[#2b3040]' : 'bg-white border-gray-200'
      } ${fullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}
    >
      {/* ── Top bar: symbol price + toolbar ─────────────────────────────── */}
      <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b ${
        theme === 'dark' ? 'border-[#2b3040]' : 'border-gray-100'
      }`}>
        {/* Price info */}
        <div className="flex items-center gap-3">
          <span className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            {symbol}
          </span>
          {displayPrice && (
            <span className={`text-lg font-semibold ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
              ${displayPrice.toFixed(2)}
            </span>
          )}
          {pricePct !== null && (
            <span className={`text-sm font-medium ${pricePct >= 0 ? 'text-green-500' : 'text-red-400'}`}>
              {pricePct >= 0 ? '+' : ''}{pricePct.toFixed(2)}%
            </span>
          )}
          {wsConnected && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
              <Zap size={9} /> Live
            </span>
          )}
        </div>

        {/* Toolbar */}
        <ChartToolbar
          theme={theme}
          onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          onResetView={() => { coreRef.current?.fitContent(); load(); }}
          onRefresh={load}
          loading={loading}
          fullscreen={fullscreen}
          onFullscreenToggle={handleFullscreen}
          showGrid={showGrid}
          onGridToggle={() => setShowGrid(v => !v)}
          showRR={showRR}
          onRRToggle={handleRRToggle}
          beginnerMode={beginnerMode}
          onBeginnerToggle={() => setBeginnerMode(v => !v)}
          showIndicatorPanel={showIndicatorPanel}
          onIndicatorPanelToggle={() => setShowIndicatorPanel(v => !v)}
        />
      </div>

      {/* ── Timeframe selector ───────────────────────────────────────────── */}
      <div className={`flex items-center justify-between px-4 py-2 border-b ${
        theme === 'dark' ? 'border-[#2b3040]' : 'border-gray-100'
      }`}>
        <TimeframeSelector value={timeframe} onChange={setTimeframe} disabled={loading} />

        {/* Data source badge */}
        <DataSourceBadge dataSource={dataSource} />
      </div>

      {/* ── Signal summary bar ───────────────────────────────────────────── */}
      {analysis && (
        <div className={`px-4 border-b ${theme === 'dark' ? 'border-[#2b3040]' : 'border-gray-100'}`}>
          <SignalSummaryBar analysis={analysis} beginnerMode={beginnerMode} price={displayPrice} />
        </div>
      )}

      {/* ── Error state ──────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 mx-4 my-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <WifiOff size={15} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Chart area with optional side panels ────────────────────────── */}
      <div className="flex-1 relative min-h-0">
        {/* Main chart + sub-panels */}
        <div className={`flex-1 ${showIndicatorPanel ? 'mr-72' : ''} transition-all`}>
          {/* Loading overlay */}
          {loading && candles.length === 0 && (
            <div className={`flex items-center justify-center h-64 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-400'
            }`}>
              <div className="flex flex-col items-center gap-2">
                <span className="block w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Loading chart data…</span>
              </div>
            </div>
          )}

          {candles.length > 0 && (
            <>
              <CoreChart
                ref={coreRef}
                candles={candles}
                analysis={analysis}
                indicators={indicators}
                theme={theme}
                showGrid={showGrid}
                rrSetup={rrSetup}
                livePrice={livePrice}
                height={fullscreen ? Math.max(window.innerHeight - 300, 400) : 460}
              />
              {activeSubPanels.includes('rsi') && (
                <SubPanel
                  ref={rsiRef}
                  candles={candles}
                  analysis={analysis}
                  indicators={indicators}
                  theme={theme}
                  panelType="rsi"
                  onRangeChange={handleSubPanelRangeChange}
                />
              )}
              {activeSubPanels.includes('macd') && (
                <SubPanel
                  ref={macdRef}
                  candles={candles}
                  analysis={analysis}
                  indicators={indicators}
                  theme={theme}
                  panelType="macd"
                  onRangeChange={handleSubPanelRangeChange}
                />
              )}
              {activeSubPanels.includes('atr') && (
                <SubPanel
                  ref={atrRef}
                  candles={candles}
                  analysis={analysis}
                  indicators={indicators}
                  theme={theme}
                  panelType="atr"
                  onRangeChange={handleSubPanelRangeChange}
                />
              )}
            </>
          )}
        </div>

        {/* Indicator side panel */}
        {showIndicatorPanel && (
          <IndicatorPanel
            indicators={indicators}
            onChange={setIndicators}
            onClose={() => setShowIndicatorPanel(false)}
            beginnerMode={beginnerMode}
          />
        )}

        {/* R/R calculator panel (floating, top-right of chart) */}
        {showRR && rrSetup && (
          <div className="absolute top-3 right-3 z-30">
            <RiskRewardPanel
              setup={rrSetup}
              onChange={setRrSetup}
              onClose={handleRRToggle}
              currentPrice={displayPrice}
            />
          </div>
        )}
      </div>
    </div>
  );
}
