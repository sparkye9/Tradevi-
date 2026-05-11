'use client';
import type { StockAnalysis } from '@/lib/apiClient';

interface Props {
  analysis: StockAnalysis | null;
  beginnerMode: boolean;
  price?: number | null;
}

interface Chip {
  label: string;
  value: string;
  color: string;
  tip: string;
}

function chip(label: string, value: string, color: string, tip: string): Chip {
  return { label, value, color, tip };
}

export function SignalSummaryBar({ analysis, beginnerMode, price }: Props) {
  if (!analysis) return null;

  const { rsi, bias, trend, trendStrength, indicators } = analysis;
  const ind = indicators;

  // Trend chip
  const trendChip: Chip =
    trend === 'bullish' ? chip('Trend', beginnerMode ? '↑ Going Up' : '↑ Bullish', 'bg-green-100 text-green-700', 'Both SuperTrend lines agree price is in an uptrend.') :
    trend === 'bearish' ? chip('Trend', beginnerMode ? '↓ Going Down' : '↓ Bearish', 'bg-red-100 text-red-700', 'Both SuperTrend lines agree price is in a downtrend.') :
    chip('Trend', '→ Neutral', 'bg-gray-100 text-gray-600', 'No clear trend direction yet.');

  // Momentum via ADX
  const adx = (ind?.adx?.findLast(v => v !== null) as number | null) ?? 0;
  const momentumChip: Chip =
    adx >= 30 ? chip('Momentum', beginnerMode ? '🔥 Strong Move' : '⚡ Strong', 'bg-orange-100 text-orange-700', `ADX is ${adx.toFixed(0)} — above 30 means a strong trend is in place.`) :
    adx >= 20 ? chip('Momentum', beginnerMode ? '→ Moderate' : '→ Moderate', 'bg-yellow-100 text-yellow-700', `ADX is ${adx.toFixed(0)} — between 20–30 means some trending but choppy.`) :
    chip('Momentum', beginnerMode ? '😴 Flat/Choppy' : '↔ Weak', 'bg-gray-100 text-gray-500', `ADX is ${adx.toFixed(0)} — below 20 means no clear trend, avoid trend trades.`);

  // RSI chip
  const rsiChip: Chip =
    rsi > 70 ? chip('RSI', beginnerMode ? `RSI ${rsi.toFixed(0)} — May Be Tired` : `RSI ${rsi.toFixed(0)} Overbought`, 'bg-red-100 text-red-600', `RSI ${rsi.toFixed(1)}: Stock may be overextended. Watch for pullback.`) :
    rsi < 30 ? chip('RSI', beginnerMode ? `RSI ${rsi.toFixed(0)} — Possible Bounce` : `RSI ${rsi.toFixed(0)} Oversold`, 'bg-green-100 text-green-700', `RSI ${rsi.toFixed(1)}: Stock may be oversold. Watch for a bounce.`) :
    chip('RSI', beginnerMode ? `RSI ${rsi.toFixed(0)} — Neutral` : `RSI ${rsi.toFixed(0)}`, 'bg-gray-100 text-gray-500', `RSI ${rsi.toFixed(1)}: Neutral — no extreme reading.`);

  // VWAP chip
  const vwap = (ind?.vwap?.findLast(v => v !== null) as number | null) ?? null;
  const vwapChip: Chip | null = vwap && price
    ? price > vwap
      ? chip('VWAP', beginnerMode ? '↑ Above Fair Value' : '↑ Above VWAP', 'bg-green-100 text-green-700', `Price ($${price.toFixed(2)}) is above VWAP ($${vwap.toFixed(2)}) — buyers in control.`)
      : chip('VWAP', beginnerMode ? '↓ Below Fair Value' : '↓ Below VWAP', 'bg-red-100 text-red-600', `Price ($${price.toFixed(2)}) is below VWAP ($${vwap.toFixed(2)}) — sellers in control.`)
    : null;

  // EMA alignment chip
  const ema20 = (ind?.ema20?.findLast(v => v !== null) as number | null) ?? null;
  const ema50 = (ind?.ema50?.findLast(v => v !== null) as number | null) ?? null;
  const ema200 = (ind?.ema200?.findLast(v => v !== null) as number | null) ?? null;
  let emaChip: Chip | null = null;
  if (ema20 && ema50) {
    if (ema20 > ema50 && (!ema200 || ema50 > ema200)) {
      emaChip = chip('EMAs', beginnerMode ? '↑↑ All Lined Up Bullish' : '↑↑ Bull Stack', 'bg-green-100 text-green-700', 'EMA 20 > 50 > 200 — classic bullish alignment.');
    } else if (ema20 < ema50 && (!ema200 || ema50 < ema200)) {
      emaChip = chip('EMAs', beginnerMode ? '↓↓ All Lined Up Bearish' : '↓↓ Bear Stack', 'bg-red-100 text-red-600', 'EMA 20 < 50 < 200 — classic bearish alignment.');
    } else {
      emaChip = chip('EMAs', beginnerMode ? '↔ Mixed Signals' : '↔ Mixed', 'bg-gray-100 text-gray-500', 'EMAs are not cleanly aligned — choppy or transitioning.');
    }
  }

  const chips = [trendChip, momentumChip, rsiChip, vwapChip, emaChip].filter(Boolean) as Chip[];

  return (
    <div className="flex flex-wrap items-center gap-2 py-2 px-1">
      {chips.map(c => (
        <span
          key={c.label}
          title={c.tip}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold cursor-help select-none ${c.color}`}
        >
          <span className="opacity-60 text-[10px] font-normal">{c.label}</span>
          {c.value}
        </span>
      ))}
      {beginnerMode && (
        <span className="text-[10px] text-blue-500 font-medium ml-1">
          💡 Beginner mode — hover chips for explanations
        </span>
      )}
    </div>
  );
}
