'use client';
import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import type { CandleData, StockAnalysis } from '@/lib/apiClient';
import type { IndicatorConfig, RRSetup, ChartTheme } from './chartTypes';
import { THEME_COLORS } from './chartTypes';

export interface CoreChartHandle {
  fitContent: () => void;
  setLogicalRange: (range: { from: number; to: number }) => void;
  subscribeLogicalRangeChange: (cb: (range: { from: number; to: number } | null) => void) => () => void;
}

interface CandleTooltip {
  x: number; y: number;
  open: number; high: number; low: number; close: number; volume: number;
  time: number; change: number;
}

interface Props {
  candles: CandleData[];
  analysis: StockAnalysis | null;
  indicators: IndicatorConfig[];
  theme: ChartTheme;
  showGrid: boolean;
  rrSetup: RRSetup | null;
  livePrice?: number | null;
  height?: number;
}

// Keep series refs between renders so we can add/remove selectively
type SeriesMap = Map<string, any>;

export const CoreChart = forwardRef<CoreChartHandle, Props>(function CoreChart(
  { candles, analysis, indicators, theme, showGrid, rrSetup, livePrice, height = 460 },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<any>(null);
  const candleRef    = useRef<any>(null);
  const seriesMapRef = useRef<SeriesMap>(new Map());
  const priceLineRef = useRef<{ entry: any; stop: any; target: any }>({ entry: null, stop: null, target: null });
  const [tooltip, setTooltip] = useState<CandleTooltip | null>(null);
  const rrOverlayRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  useImperativeHandle(ref, () => ({
    fitContent() { chartRef.current?.timeScale().fitContent(); },
    setLogicalRange(range) {
      if (syncing.current) return;
      syncing.current = true;
      chartRef.current?.timeScale().setVisibleLogicalRange(range);
      syncing.current = false;
    },
    subscribeLogicalRangeChange(cb) {
      if (!chartRef.current) return () => {};
      chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(cb);
      return () => chartRef.current?.timeScale().unsubscribeVisibleLogicalRangeChange(cb);
    },
  }));

  // Build/rebuild chart when candles, theme, or grid change
  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;
    let tv: typeof import('lightweight-charts') | null = null;
    let cleanupResize: (() => void) | undefined;

    async function init() {
      tv = await import('lightweight-charts');
      const { createChart, ColorType, CrosshairMode, CandlestickSeries, LineSeries, HistogramSeries } = tv!;
      const colors = THEME_COLORS[theme];

      // Destroy old chart
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
      seriesMapRef.current.clear();

      const el = containerRef.current!;
      const chart = createChart(el, {
        width: el.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: colors.bg },
          textColor: colors.text,
          fontSize: 12,
        },
        grid: {
          vertLines: { color: showGrid ? colors.grid : 'transparent' },
          horzLines: { color: showGrid ? colors.grid : 'transparent' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: colors.crosshair, labelBackgroundColor: colors.panel },
          horzLine: { color: colors.crosshair, labelBackgroundColor: colors.panel },
        },
        rightPriceScale: { borderColor: colors.border },
        timeScale: { borderColor: colors.border, timeVisible: true, secondsVisible: false },
      });
      chartRef.current = chart;

      // ── Candlestick series ──────────────────────────────────────────────────
      const cs = chart.addSeries(CandlestickSeries, {
        upColor: '#26a69a', downColor: '#ef5350',
        borderUpColor: '#26a69a', borderDownColor: '#ef5350',
        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      });
      cs.setData(candles.map(c => ({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close })));
      candleRef.current = cs;

      // ── Volume ──────────────────────────────────────────────────────────────
      const volCfg = indicators.find(i => i.id === 'volume');
      if (volCfg?.enabled) {
        const volSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'vol',
        });
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
        volSeries.setData(candles.map(c => ({
          time: c.time as any,
          value: c.volume,
          color: c.close >= c.open ? '#26a69a55' : '#ef535055',
        })));
        seriesMapRef.current.set('volume', volSeries);
      }

      // ── Indicator overlays ──────────────────────────────────────────────────
      renderOverlays(chart, cs, LineSeries, HistogramSeries, indicators, analysis);

      // ── Crosshair tooltip ───────────────────────────────────────────────────
      chart.subscribeCrosshairMove((params: any) => {
        if (!params?.point) { setTooltip(null); return; }
        const bar = params.seriesData?.get(cs);
        if (!bar) { setTooltip(null); return; }
        const idx = candles.findIndex(c => c.time === (bar.time as any));
        const prev = candles[idx - 1];
        const change = prev ? bar.close - prev.close : 0;
        setTooltip({
          x: params.point.x,
          y: params.point.y,
          open: bar.open, high: bar.high, low: bar.low, close: bar.close,
          volume: candles[idx]?.volume ?? 0,
          time: bar.time as number,
          change,
        });
      });

      chart.timeScale().fitContent();

      // Responsive resize
      const observer = new ResizeObserver(() => {
        if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
      });
      observer.observe(el);
      cleanupResize = () => observer.disconnect();
    }

    init();
    return () => {
      cleanupResize?.();
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, theme, showGrid, height]);

  // Update overlays when indicator state changes (without rebuilding whole chart)
  useEffect(() => {
    if (!chartRef.current || !candleRef.current || candles.length === 0) return;
    import('lightweight-charts').then(({ LineSeries, HistogramSeries }) => {
      updateOverlays(chartRef.current, candleRef.current, LineSeries, HistogramSeries, seriesMapRef.current, indicators, analysis);
      updateVolumeMA(chartRef.current, seriesMapRef.current, indicators, analysis);
    });
  }, [indicators, analysis]);

  // Live price update on last candle
  useEffect(() => {
    if (!livePrice || !candleRef.current || candles.length === 0) return;
    const last = candles[candles.length - 1];
    candleRef.current.update({
      time: last.time as any,
      open: last.open,
      high: Math.max(last.high, livePrice),
      low: Math.min(last.low, livePrice),
      close: livePrice,
    });
  }, [livePrice]);

  // R/R price lines
  useEffect(() => {
    if (!candleRef.current) return;
    const cs = candleRef.current;
    // Remove old price lines
    if (priceLineRef.current.entry) cs.removePriceLine(priceLineRef.current.entry);
    if (priceLineRef.current.stop) cs.removePriceLine(priceLineRef.current.stop);
    if (priceLineRef.current.target) cs.removePriceLine(priceLineRef.current.target);

    if (rrSetup && rrSetup.entry > 0) {
      priceLineRef.current.entry = cs.createPriceLine({ price: rrSetup.entry, color: '#3b82f6', lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: 'Entry' });
      if (rrSetup.stop > 0) priceLineRef.current.stop = cs.createPriceLine({ price: rrSetup.stop, color: '#ef4444', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'Stop' });
      if (rrSetup.target > 0) priceLineRef.current.target = cs.createPriceLine({ price: rrSetup.target, color: '#22c55e', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'Target' });
    }
  }, [rrSetup]);

  // R/R shaded zone overlay
  useEffect(() => {
    if (!rrSetup || !candleRef.current || !rrOverlayRef.current) return;
    let frame: number;
    const update = () => {
      if (!candleRef.current || !rrOverlayRef.current) return;
      const entryY = candleRef.current.priceToCoordinate(rrSetup.entry);
      const stopY  = candleRef.current.priceToCoordinate(rrSetup.stop);
      const targetY = candleRef.current.priceToCoordinate(rrSetup.target);
      const el = rrOverlayRef.current;
      const profitDiv = el.querySelector('.rr-profit') as HTMLElement;
      const lossDiv   = el.querySelector('.rr-loss') as HTMLElement;
      if (!profitDiv || !lossDiv) return;
      if (entryY === null || stopY === null || targetY === null) {
        profitDiv.style.display = 'none';
        lossDiv.style.display = 'none';
        return;
      }
      const isLong = rrSetup.direction === 'long';
      // Profit zone
      const profitTop = isLong ? targetY : entryY;
      const profitH   = Math.abs(entryY - targetY);
      profitDiv.style.display = 'block';
      profitDiv.style.top  = `${profitTop}px`;
      profitDiv.style.height = `${profitH}px`;
      // Loss zone
      const lossTop = isLong ? entryY : stopY;
      const lossH   = Math.abs(entryY - stopY);
      lossDiv.style.display = 'block';
      lossDiv.style.top  = `${lossTop}px`;
      lossDiv.style.height = `${lossH}px`;
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [rrSetup]);

  const colors = THEME_COLORS[theme];

  return (
    <div className="relative select-none" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* R/R overlay */}
      {rrSetup && rrSetup.entry > 0 && (
        <div ref={rrOverlayRef} className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="rr-profit absolute left-0 right-0 hidden" style={{ backgroundColor: '#22c55e18', borderTop: '1px dashed #22c55e66', borderBottom: '1px dashed #22c55e66' }} />
          <div className="rr-loss absolute left-0 right-0 hidden" style={{ backgroundColor: '#ef444418', borderTop: '1px dashed #ef444466', borderBottom: '1px dashed #ef444466' }} />
        </div>
      )}

      {/* Crosshair tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-20 px-3 py-2 rounded-lg shadow-lg text-xs font-mono border"
          style={{
            left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 400) - 180),
            top: Math.max(8, tooltip.y - 60),
            background: colors.panel,
            borderColor: colors.border,
            color: colors.text,
          }}
        >
          <div className="font-bold mb-1">
            {new Date(tooltip.time * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <span className="opacity-60">O</span><span>${tooltip.open.toFixed(2)}</span>
            <span className="opacity-60">H</span><span className="text-green-500">${tooltip.high.toFixed(2)}</span>
            <span className="opacity-60">L</span><span className="text-red-400">${tooltip.low.toFixed(2)}</span>
            <span className="opacity-60">C</span><span className={tooltip.change >= 0 ? 'text-green-500' : 'text-red-400'}>${tooltip.close.toFixed(2)}</span>
            <span className="opacity-60">Chg</span>
            <span className={tooltip.change >= 0 ? 'text-green-500' : 'text-red-400'}>
              {tooltip.change >= 0 ? '+' : ''}{tooltip.change.toFixed(2)}
            </span>
            <span className="opacity-60">Vol</span>
            <span>{(tooltip.volume / 1e6).toFixed(2)}M</span>
          </div>
        </div>
      )}
    </div>
  );
});

// ── Overlay management helpers ────────────────────────────────────────────────

function addLine(chart: any, LineSeries: any, data: (number | null)[], candles: CandleData[], color: string, lineWidth: 1 | 2 | 3 | 4 = 1, lineStyle = 0, priceScaleId?: string) {
  const opts: any = { color, lineWidth, lineStyle, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
  if (priceScaleId) opts.priceScaleId = priceScaleId;
  const series = chart.addSeries(LineSeries, opts);
  const pts = data.map((v, i) => v !== null && candles[i] ? { time: candles[i].time as any, value: v } : null).filter(Boolean);
  series.setData(pts);
  return series;
}

function renderOverlays(chart: any, _cs: any, LineSeries: any, HistogramSeries: any, indicators: IndicatorConfig[], analysis: StockAnalysis | null) {
  const ind = analysis?.indicators;
  if (!ind) return;
  const candles: CandleData[] = []; // placeholder — actual candles needed
  // This is called once on init, updateOverlays handles ongoing updates
}

function updateOverlays(chart: any, _cs: any, LineSeries: any, HistogramSeries: any, seriesMap: SeriesMap, indicators: IndicatorConfig[], analysis: StockAnalysis | null) {
  const ind = analysis?.indicators;

  // Helper to get candle timestamps from existing series data
  const candles = (() => {
    // We need candle timestamps; we reconstruct from existing series
    if (!_cs) return [] as CandleData[];
    const d = _cs.data();
    return (d ?? []) as CandleData[];
  })();

  if (!ind || candles.length === 0) return;

  type OverlaySpec = { id: string; color: string; data: (number | null)[]; style?: number; panel?: string };

  const specs: OverlaySpec[] = [
    { id: 'ema9',    color: indicators.find(i => i.id === 'ema9')?.color    ?? '#f0c040', data: ind.ema9   },
    { id: 'ema20',   color: indicators.find(i => i.id === 'ema20')?.color   ?? '#4fc3f7', data: ind.ema20  },
    { id: 'ema50',   color: indicators.find(i => i.id === 'ema50')?.color   ?? '#ffb74d', data: ind.ema50  },
    { id: 'ema200',  color: indicators.find(i => i.id === 'ema200')?.color  ?? '#ce93d8', data: ind.ema200, style: 2 },
    { id: 'vwap',    color: indicators.find(i => i.id === 'vwap')?.color    ?? '#00e676', data: ind.vwap,   style: 2 },
    { id: 'bbUpper', color: indicators.find(i => i.id === 'bbands')?.color  ?? '#78909c', data: ind.bbUpper, style: 1 },
    { id: 'bbMid',   color: indicators.find(i => i.id === 'bbands')?.color  ?? '#78909c', data: ind.bbMid  },
    { id: 'bbLower', color: indicators.find(i => i.id === 'bbands')?.color  ?? '#78909c', data: ind.bbLower, style: 1 },
    { id: 'stLine',  color: indicators.find(i => i.id === 'supertrend')?.color ?? '#a0c4ff', data: ind.stFastLine },
  ];

  // ORB levels
  const orbCfg = indicators.find(i => i.id === 'orb');
  if (analysis?.orb?.orb_high != null) {
    specs.push({
      id: 'orbHigh', color: orbCfg?.color ?? '#ffd54f',
      data: new Array(candles.length).fill(analysis.orb.orb_high),
      style: 2,
    });
  }
  if (analysis?.orb?.orb_low != null) {
    specs.push({
      id: 'orbLow', color: orbCfg?.color ?? '#ffd54f',
      data: new Array(candles.length).fill(analysis.orb.orb_low),
      style: 2,
    });
  }

  for (const spec of specs) {
    const group = spec.id.startsWith('bb') ? 'bbands' : spec.id.startsWith('orb') ? 'orb' : spec.id;
    const cfg = indicators.find(i => i.id === group || (i.id === 'supertrend' && spec.id === 'stLine'));
    const enabled = cfg?.enabled ?? false;
    const existing = seriesMap.get(spec.id);

    if (!enabled) {
      if (existing) { try { chart.removeSeries(existing); } catch {} seriesMap.delete(spec.id); }
      continue;
    }
    if (!existing) {
      const pts = spec.data.map((v, i) => v !== null && candles[i] ? { time: candles[i].time as any, value: v } : null).filter(Boolean);
      if (!pts.length) continue;
      const s = chart.addSeries(LineSeries, {
        color: spec.color, lineWidth: 1, lineStyle: spec.style ?? 0,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      s.setData(pts);
      seriesMap.set(spec.id, s);
    } else {
      // Update color if changed
      existing.applyOptions({ color: spec.color });
    }
  }
}

function updateVolumeMA(chart: any, seriesMap: SeriesMap, indicators: IndicatorConfig[], analysis: StockAnalysis | null) {
  // Volume MA handled if needed — placeholder
}
