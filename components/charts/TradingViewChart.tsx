'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { CandleData, StockAnalysis, IndicatorData } from '@/lib/apiClient';

interface ChartOverlays {
  showEMA9?: boolean;
  showEMA20?: boolean;
  showEMA50?: boolean;
  showEMA200?: boolean;
  showVWAP?: boolean;
  showBollinger?: boolean;
  showSuperTrend?: boolean;
  showMACD?: boolean;
  showRSI?: boolean;
  showVolume?: boolean;
}

interface Props {
  candles: CandleData[];
  analysis?: StockAnalysis | null;
  livePrice?: number | null;
  overlays?: ChartOverlays;
  height?: number;
}

const DEFAULT_OVERLAYS: ChartOverlays = {
  showEMA9: false,
  showEMA20: true,
  showEMA50: true,
  showEMA200: false,
  showVWAP: true,
  showBollinger: false,
  showSuperTrend: true,
  showMACD: true,
  showRSI: true,
  showVolume: true,
};

export default function TradingViewChart({
  candles,
  analysis,
  livePrice,
  overlays: overlaysProp,
  height = 520,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const overlays = { ...DEFAULT_OVERLAYS, ...overlaysProp };

  const buildChart = useCallback(async () => {
    if (!containerRef.current || !candles.length) {
      setLoading(false);
      return;
    }

    const tv = await import('lightweight-charts');
    const {
      createChart,
      ColorType,
      CrosshairMode,
      LineStyle,
      CandlestickSeries,
      LineSeries,
      HistogramSeries,
    } = tv;

    // Destroy previous chart instance
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const el = containerRef.current;
    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#0f1117' },
        textColor: '#d1d4dc',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#1e2230' },
        horzLines: { color: '#1e2230' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#758696', labelBackgroundColor: '#2b3040' },
        horzLine: { color: '#758696', labelBackgroundColor: '#2b3040' },
      },
      rightPriceScale: { borderColor: '#2b3040' },
      timeScale: {
        borderColor: '#2b3040',
        timeVisible: true,
        secondsVisible: false,
      },
    });
    chartRef.current = chart;

    // ── Candlestick series ─────────────────────────────────────────────────────
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candleSeriesRef.current = candleSeries;
    candleSeries.setData(
      candles.map(c => ({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close }))
    );

    // ── Helper: add a line series ──────────────────────────────────────────────
    const ind: IndicatorData | undefined = analysis?.indicators;

    const addLine = (
      values: (number | null)[],
      color: string,
      lineWidth: 1 | 2 | 3 | 4 = 1,
      style = LineStyle.Solid,
    ) => {
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth,
        lineStyle: style,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const data = values
        .map((v, i) => (v !== null && candles[i] ? { time: candles[i].time as any, value: v } : null))
        .filter(Boolean);
      series.setData(data as any);
      return series;
    };

    if (ind) {
      if (overlays.showEMA9)   addLine(ind.ema9,   '#f0c040', 1);
      if (overlays.showEMA20)  addLine(ind.ema20,  '#4fc3f7', 1);
      if (overlays.showEMA50)  addLine(ind.ema50,  '#ffb74d', 1);
      if (overlays.showEMA200) addLine(ind.ema200, '#ce93d8', 1, LineStyle.Dashed);
      if (overlays.showVWAP)   addLine(ind.vwap,   '#00e676', 1, LineStyle.Dashed);

      if (overlays.showBollinger) {
        addLine(ind.bbUpper, '#78909c', 1, LineStyle.Dotted);
        addLine(ind.bbMid,   '#78909c', 1);
        addLine(ind.bbLower, '#78909c', 1, LineStyle.Dotted);
      }

      if (overlays.showSuperTrend && ind.stFastLine.length) {
        const stData = ind.stFastLine
          .map((v, i) => (v !== null && candles[i] ? { time: candles[i].time as any, value: v } : null))
          .filter(Boolean);
        if (stData.length) {
          const stSeries = chart.addSeries(LineSeries, {
            color: '#a0c4ff',
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          stSeries.setData(stData as any);
        }
      }
    }

    // ── Volume ────────────────────────────────────────────────────────────────
    if (overlays.showVolume) {
      const volSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
        color: '#3a4060',
      });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
      volSeries.setData(
        candles.map(c => ({
          time: c.time as any,
          value: c.volume,
          color: c.close >= c.open ? '#26a69a55' : '#ef535055',
        }))
      );
    }

    // ── MACD ──────────────────────────────────────────────────────────────────
    if (overlays.showMACD && ind) {
      const macdSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: 'macd',
        color: '#4fc3f7',
      });
      chart.priceScale('macd').applyOptions({ scaleMargins: { top: 0.75, bottom: 0.1 } });
      const macdData = ind.macdHist
        .map((v, i) =>
          v !== null && candles[i]
            ? { time: candles[i].time as any, value: v, color: v >= 0 ? '#26a69a88' : '#ef535088' }
            : null
        )
        .filter(Boolean);
      macdSeries.setData(macdData as any);

      const addMacdLine = (values: (number | null)[], color: string) => {
        const series = chart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          priceScaleId: 'macd',
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        const data = values
          .map((v, i) => (v !== null && candles[i] ? { time: candles[i].time as any, value: v } : null))
          .filter(Boolean);
        series.setData(data as any);
      };
      addMacdLine(ind.macdLine,   '#4fc3f7');
      addMacdLine(ind.macdSignal, '#ff7043');
    }

    chart.timeScale().fitContent();
    setLoading(false);

    // Responsive resize
    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [candles, analysis, overlays, height]);

  useEffect(() => {
    setLoading(true);
    let cleanup: (() => void) | undefined;
    buildChart().then(fn => { if (fn) cleanup = fn; });
    return () => {
      cleanup?.();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [buildChart]);

  // Live price — update last candle
  useEffect(() => {
    if (!livePrice || !candleSeriesRef.current || !candles.length) return;
    const last = candles[candles.length - 1];
    candleSeriesRef.current.update({
      time: last.time as any,
      open: last.open,
      high: Math.max(last.high, livePrice),
      low: Math.min(last.low, livePrice),
      close: livePrice,
    });
  }, [livePrice]);

  return (
    <div className="relative">
      {loading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-[#0f1117] rounded-xl z-10"
          style={{ height }}
        >
          <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div ref={containerRef} className="w-full rounded-xl overflow-hidden" style={{ height }} />
    </div>
  );
}
