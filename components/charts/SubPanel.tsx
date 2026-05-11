'use client';
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { ChevronDown } from 'lucide-react';
import type { CandleData, StockAnalysis } from '@/lib/apiClient';
import type { IndicatorConfig, ChartTheme } from './chartTypes';
import { THEME_COLORS } from './chartTypes';

export interface SubPanelHandle {
  setLogicalRange: (range: { from: number; to: number }) => void;
}

interface Props {
  candles: CandleData[];
  analysis: StockAnalysis | null;
  indicators: IndicatorConfig[];
  theme: ChartTheme;
  panelType: 'rsi' | 'macd' | 'atr';
  height?: number;
  onRangeChange?: (range: { from: number; to: number } | null) => void;
}

const PANEL_META = {
  rsi:  { label: 'RSI',  defaultHeight: 120 },
  macd: { label: 'MACD', defaultHeight: 130 },
  atr:  { label: 'ATR',  defaultHeight: 100 },
};

export const SubPanel = forwardRef<SubPanelHandle, Props>(function SubPanel(
  { candles, analysis, indicators, theme, panelType, height, onRangeChange },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<any>(null);
  const syncing      = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [currentVal, setCurrentVal] = useState<string>('');

  const meta = PANEL_META[panelType];
  const panelHeight = height ?? meta.defaultHeight;
  const colors = THEME_COLORS[theme];

  useImperativeHandle(ref, () => ({
    setLogicalRange(range) {
      if (syncing.current || !chartRef.current) return;
      syncing.current = true;
      chartRef.current.timeScale().setVisibleLogicalRange(range);
      syncing.current = false;
    },
  }));

  useEffect(() => {
    if (!containerRef.current || candles.length === 0 || collapsed) return;
    let cleanup: (() => void) | undefined;

    async function init() {
      const tv = await import('lightweight-charts');
      const { createChart, ColorType, CrosshairMode, LineSeries, HistogramSeries } = tv;
      const ind = analysis?.indicators;
      if (!ind) return;

      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }

      const el = containerRef.current!;
      const chart = createChart(el, {
        width: el.clientWidth,
        height: panelHeight,
        layout: {
          background: { type: ColorType.Solid, color: colors.bg },
          textColor: colors.text,
          fontSize: 11,
        },
        grid: {
          vertLines: { color: 'transparent' },
          horzLines: { color: colors.grid },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: colors.crosshair, labelBackgroundColor: colors.panel },
          horzLine: { color: colors.crosshair, labelBackgroundColor: colors.panel },
        },
        rightPriceScale: { borderColor: colors.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: colors.border, timeVisible: true, secondsVisible: false },
        handleScroll: true,
        handleScale: true,
      });
      chartRef.current = chart;

      const times = candles.map(c => c.time as any);

      if (panelType === 'rsi') {
        const rsiCfg = indicators.find(i => i.id === 'rsi');
        const rsiData = ind.rsi.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean);

        chart.priceScale('right').applyOptions({ autoScale: false });

        const rsiSeries = chart.addSeries(LineSeries, {
          color: rsiCfg?.color ?? '#ab47bc',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
        });
        rsiSeries.setData(rsiData as any);
        rsiSeries.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });

        // Reference lines
        rsiSeries.createPriceLine({ price: 70, color: '#ef5350', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '70' });
        rsiSeries.createPriceLine({ price: 30, color: '#26a69a', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '30' });
        rsiSeries.createPriceLine({ price: 50, color: colors.crosshair, lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: '' });

        chart.subscribeCrosshairMove((params: any) => {
          const bar = params?.seriesData?.get(rsiSeries);
          if (bar) setCurrentVal((bar.value as number).toFixed(1));
        });

        const lastRsi = ind.rsi.findLast(v => v !== null);
        if (lastRsi != null) setCurrentVal((lastRsi as number).toFixed(1));

      } else if (panelType === 'macd') {
        const macdCfg = indicators.find(i => i.id === 'macd');
        const macdColor = macdCfg?.color ?? '#42a5f5';

        const histData = ind.macdHist.map((v, i) => v !== null ? {
          time: times[i], value: v,
          color: v >= 0 ? '#26a69a88' : '#ef535088',
        } : null).filter(Boolean);

        const lineData = ind.macdLine.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean);
        const signalData = ind.macdSignal.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean);

        const histSeries = chart.addSeries(HistogramSeries, {
          priceLineVisible: false,
          lastValueVisible: false,
        });
        histSeries.setData(histData as any);

        const lineSeries = chart.addSeries(LineSeries, {
          color: macdColor,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        lineSeries.setData(lineData as any);

        const signalSeries = chart.addSeries(LineSeries, {
          color: '#ff9800',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        signalSeries.setData(signalData as any);

        chart.subscribeCrosshairMove((params: any) => {
          const bar = params?.seriesData?.get(lineSeries);
          if (bar) setCurrentVal((bar.value as number).toFixed(4));
        });

        const lastMacd = ind.macdLine.findLast(v => v !== null);
        if (lastMacd != null) setCurrentVal((lastMacd as number).toFixed(4));

      } else if (panelType === 'atr') {
        const atrCfg = indicators.find(i => i.id === 'atr');
        const atrData = ind.atr.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean);

        const atrSeries = chart.addSeries(LineSeries, {
          color: atrCfg?.color ?? '#ef5350',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
        });
        atrSeries.setData(atrData as any);

        chart.subscribeCrosshairMove((params: any) => {
          const bar = params?.seriesData?.get(atrSeries);
          if (bar) setCurrentVal((bar.value as number).toFixed(2));
        });

        const lastAtr = ind.atr.findLast(v => v !== null);
        if (lastAtr != null) setCurrentVal((lastAtr as number).toFixed(2));
      }

      // Sync logical range with main chart
      chart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
        if (syncing.current) return;
        onRangeChange?.(range);
      });

      chart.timeScale().fitContent();

      const observer = new ResizeObserver(() => {
        if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
      });
      observer.observe(el);
      cleanup = () => observer.disconnect();
    }

    init();
    return () => {
      cleanup?.();
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, analysis, theme, panelType, panelHeight, collapsed]);

  // Update series colors when indicator config changes
  useEffect(() => {
    if (!chartRef.current) return;
    // Colors applied at init; minor color changes can be re-applied if needed
  }, [indicators]);

  const isEnabled = indicators.find(i => i.id === panelType)?.enabled ?? false;
  if (!isEnabled) return null;

  return (
    <div className="border-t" style={{ borderColor: colors.border }}>
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-3 py-1 cursor-pointer select-none"
        style={{ backgroundColor: colors.panel }}
        onClick={() => setCollapsed(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: colors.textMuted }}>
            {meta.label}
          </span>
          {currentVal && (
            <span className="text-xs font-mono" style={{ color: colors.text }}>
              {currentVal}
            </span>
          )}
          {panelType === 'rsi' && currentVal && (
            <span className={`text-xs font-medium ${
              parseFloat(currentVal) > 70 ? 'text-red-400' :
              parseFloat(currentVal) < 30 ? 'text-green-400' : 'text-gray-400'
            }`}>
              {parseFloat(currentVal) > 70 ? 'OB' : parseFloat(currentVal) < 30 ? 'OS' : ''}
            </span>
          )}
        </div>
        <ChevronDown
          size={12}
          className="transition-transform"
          style={{
            color: colors.textMuted,
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          }}
        />
      </div>

      {/* Chart area */}
      {!collapsed && (
        <div ref={containerRef} style={{ height: panelHeight }} />
      )}
    </div>
  );
});
