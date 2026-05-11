'use client';
import { useRef, useEffect, useState } from 'react';
import type { CandleData } from '@/lib/types';
import type { TFCOutput } from '@/lib/tfc';

interface Props {
  candles: CandleData[];
  indicators: TFCOutput;
  mainHeight?: number;
  rsiHeight?: number;
}

export function CandleChart({ candles, indicators, mainHeight = 420, rsiHeight = 110 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => setWidth(Math.max(300, entries[0].contentRect.width)));
    obs.observe(el);
    setWidth(Math.max(300, el.clientWidth));
    return () => obs.disconnect();
  }, []);

  const n = candles.length;
  if (n === 0) return <div ref={containerRef} className="w-full h-96 bg-[#0d1117] rounded-xl" />;

  const PAD = { top: 18, right: 72, bottom: 22, left: 4 };
  const GAP = 6;
  const totalH = mainHeight + GAP + rsiHeight;
  const chartW = Math.max(10, width - PAD.left - PAD.right);
  const mainH = mainHeight - PAD.top - PAD.bottom;
  const rsiPanelH = rsiHeight - 18;

  // Price range including all overlays
  const overlayVals: number[] = [];
  for (let i = 0; i < n; i++) {
    const e20 = indicators.ema20[i], e50 = indicators.ema50[i];
    const vw = indicators.vwap[i], st = indicators.superTrendLine[i];
    if (e20 !== null) overlayVals.push(e20);
    if (e50 !== null) overlayVals.push(e50);
    if (vw !== null) overlayVals.push(vw);
    if (st !== null) overlayVals.push(st);
  }
  const allPrices = [...candles.flatMap(c => [c.high, c.low]), ...overlayVals];
  const rawMin = Math.min(...allPrices);
  const rawMax = Math.max(...allPrices);
  const priceRange = rawMax - rawMin || 1;
  const priceMin = rawMin - priceRange * 0.02;
  const priceMax = rawMax + priceRange * 0.02;
  const pRange = priceMax - priceMin;

  const py = (price: number) => PAD.top + mainH * (1 - (price - priceMin) / pRange);
  const px = (i: number) => PAD.left + (i + 0.5) * (chartW / n);
  const cw = Math.max(1, (chartW / n) * 0.72);

  // Build SVG path for a series
  function linePath(vals: (number | null)[]): string {
    let d = '';
    for (let i = 0; i < n; i++) {
      const v = vals[i];
      if (v === null || isNaN(v)) { continue; }
      const x = px(i).toFixed(1), y = py(v).toFixed(1);
      const prev = vals[i - 1];
      d += (prev === null || isNaN(prev as number) || d === '') ? `M${x},${y}` : `L${x},${y}`;
    }
    return d;
  }

  // SuperTrend segments split by direction color
  const stSegs: { d: string; color: string }[] = [];
  {
    let seg = '', dir = 0;
    for (let i = 0; i < n; i++) {
      const v = indicators.superTrendLine[i];
      const d = indicators.superTrendDir[i];
      if (v === null) {
        if (seg) stSegs.push({ d: seg, color: dir === 1 ? '#22c55e' : '#ef4444' });
        seg = ''; dir = 0; continue;
      }
      const x = px(i).toFixed(1), y = py(v).toFixed(1);
      if (d !== dir && seg) {
        stSegs.push({ d: seg, color: dir === 1 ? '#22c55e' : '#ef4444' });
        seg = `M${x},${y}`;
      } else {
        seg += seg === '' ? `M${x},${y}` : `L${x},${y}`;
      }
      dir = d;
    }
    if (seg) stSegs.push({ d: seg, color: dir === 1 ? '#22c55e' : '#ef4444' });
  }

  // Price axis ticks
  const priceTicks: number[] = [];
  const tickCount = 6;
  for (let i = 0; i <= tickCount; i++) priceTicks.push(priceMin + (pRange / tickCount) * i);

  // Time labels: ~6 evenly spaced
  const labelStep = Math.max(1, Math.floor(n / 6));

  // RSI y coords (panel starts at mainHeight + GAP)
  const rsiTop = mainHeight + GAP;
  const ry = (rsiVal: number) => rsiTop + 10 + rsiPanelH * (1 - rsiVal / 100);

  // RSI fill areas
  let rsiPathLine = '';
  let rsiPathFillHigh = ''; // above 70
  let rsiPathFillLow = '';  // below 30
  for (let i = 0; i < n; i++) {
    const v = indicators.rsi[i];
    if (v === null) continue;
    const x = px(i).toFixed(1);
    const y = ry(v).toFixed(1);
    const prev = indicators.rsi[i - 1];
    rsiPathLine += (prev === null || rsiPathLine === '') ? `M${x},${y}` : `L${x},${y}`;
  }

  return (
    <div ref={containerRef} className="w-full select-none">
      <svg width={width} height={totalH} className="block">
        {/* ── Main chart background ── */}
        <rect x={PAD.left} y={PAD.top} width={chartW} height={mainH} fill="#0d1117" />

        {/* Price grid */}
        {priceTicks.map((price, i) => {
          const y = py(price);
          if (y < PAD.top || y > PAD.top + mainH) return null;
          return (
            <g key={i}>
              <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y} stroke="#1e2732" strokeWidth={0.5} />
              <text x={PAD.left + chartW + 4} y={y + 3.5} fill="#6b7280" fontSize={9.5} fontFamily="monospace">
                {price >= 100 ? price.toFixed(0) : price.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* VWAP – thin dashed green */}
        <path d={linePath(indicators.vwap)} fill="none" stroke="#22c55e" strokeWidth={1} strokeDasharray="3,2" opacity={0.65} />

        {/* EMA 50 – yellow */}
        <path d={linePath(indicators.ema50)} fill="none" stroke="#eab308" strokeWidth={1.5} />

        {/* EMA 20 – blue */}
        <path d={linePath(indicators.ema20)} fill="none" stroke="#60a5fa" strokeWidth={1.5} />

        {/* SuperTrend combo */}
        {stSegs.map((seg, i) => (
          <path key={i} d={seg.d} fill="none" stroke={seg.color} strokeWidth={2} />
        ))}

        {/* Candlesticks */}
        {candles.map((c, i) => {
          const openY = py(c.open);
          const closeY = py(c.close);
          const highY = py(c.high);
          const lowY = py(c.low);
          const x = px(i);
          const rsiVal = indicators.rsi[i];
          const bullish = c.close >= c.open;

          // RSI bar coloring: overbought → bright green, oversold → bright red, else normal
          let color: string;
          if (rsiVal !== null && rsiVal > 70) color = '#4ade80';
          else if (rsiVal !== null && rsiVal < 30) color = '#f87171';
          else color = bullish ? '#22c55e' : '#ef4444';

          const bodyTop = Math.min(openY, closeY);
          const bodyH = Math.max(1, Math.abs(closeY - openY));

          return (
            <g key={i}>
              <line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth={1} />
              <rect
                x={x - cw / 2} y={bodyTop} width={cw} height={bodyH}
                fill={bullish ? color : 'none'}
                stroke={color}
                strokeWidth={1}
              />
            </g>
          );
        })}

        {/* Entry arrows */}
        {indicators.entrySignals.map((sig, i) => {
          const c = candles[sig.index];
          if (!c) return null;
          const x = px(sig.index);
          if (sig.direction === 1) {
            const tipY = py(c.low) + 14;
            return <polygon key={i} points={`${x},${tipY - 11} ${x - 6},${tipY + 1} ${x + 6},${tipY + 1}`} fill="#fbbf24" />;
          } else {
            const tipY = py(c.high) - 14;
            return <polygon key={i} points={`${x},${tipY + 11} ${x - 6},${tipY - 1} ${x + 6},${tipY - 1}`} fill="#fbbf24" />;
          }
        })}

        {/* Time labels */}
        {candles.map((c, i) => {
          if (i % labelStep !== 0) return null;
          const label = new Date(c.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return (
            <text key={i} x={px(i)} y={mainHeight - 5} fill="#4b5563" fontSize={9} textAnchor="middle">{label}</text>
          );
        })}

        {/* Indicator legend (top-left, TradingView style) */}
        {[
          { text: 'RSI Bars 14  70  30', color: '#c084fc' },
          { text: 'EMA 20 close', color: '#60a5fa' },
          { text: `TFC  D  1.5 7  1.65 50  8 15  8 8  0.7 13  3`, color: '#f97316' },
          { text: 'EMA 50 close', color: '#eab308' },
          { text: 'VWAP Session', color: '#22c55e' },
        ].map((item, i) => (
          <text key={i} x={PAD.left + 7} y={PAD.top + 13 + i * 11} fill={item.color} fontSize={9} fontFamily="monospace" opacity={0.9}>
            {item.text}
          </text>
        ))}

        {/* ── RSI sub-panel ── */}
        <rect x={PAD.left} y={rsiTop + 8} width={chartW} height={rsiPanelH} fill="#0d1117" />

        {/* RSI overbought/oversold zone fills */}
        {(() => {
          const obY = ry(70), osY = ry(30), topY = ry(100), botY = ry(0);
          return (
            <>
              <rect x={PAD.left} y={obY} width={chartW} height={topY - obY} fill="#ef444418" />
              <rect x={PAD.left} y={botY} width={chartW} height={osY - botY} fill="#22c55e18" />
            </>
          );
        })()}

        {/* RSI reference lines */}
        {[70, 50, 30].map(level => {
          const y = ry(level);
          const color = level === 70 ? '#ef4444' : level === 30 ? '#22c55e' : '#374151';
          return (
            <g key={level}>
              <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
                stroke={color} strokeWidth={0.5} strokeDasharray={level !== 50 ? '3,2' : undefined} />
              <text x={PAD.left + chartW + 4} y={y + 3.5} fill="#6b7280" fontSize={9} fontFamily="monospace">{level}</text>
            </g>
          );
        })}

        {/* RSI line */}
        <path d={rsiPathLine} fill="none" stroke="#c084fc" strokeWidth={1.5} />

        {/* RSI label */}
        <text x={PAD.left + 7} y={rsiTop + 20} fill="#c084fc" fontSize={9} fontFamily="monospace" opacity={0.9}>
          RSI 14 close
        </text>
      </svg>
    </div>
  );
}
