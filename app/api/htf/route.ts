import { NextRequest, NextResponse } from 'next/server';
import { yfFetch } from '@/lib/yahoo-finance';
import { calcEMA } from '@/lib/indicators';
import type { CandleData } from '@/lib/types';

function etOffsetHours(): number {
  const now = new Date();
  const y = now.getFullYear();
  const mar1 = new Date(y, 2, 1).getDay();
  const nov1 = new Date(y, 10, 1).getDay();
  const dstStart = new Date(y, 2, mar1 === 0 ? 8 : 15 - mar1);
  const dstEnd   = new Date(y, 10, nov1 === 0 ? 1 : 8 - nov1);
  return now >= dstStart && now < dstEnd ? -4 : -5;
}

async function fetchHTFCandles(symbol: string, interval: string, outputsize: number): Promise<CandleData[]> {
  const tdKey = process.env.TWELVE_DATA_API_KEY;
  if (tdKey) {
    try {
      const off = etOffsetHours();
      const tdSym = symbol === 'NQ=F' ? 'NQ1!' : symbol;
      const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSym)}&interval=${interval}&outputsize=${outputsize}&order=ASC&apikey=${tdKey}`;
      const res = await yfFetch(url);
      if (!res.ok) throw new Error(`TD ${res.status}`);
      const json = await res.json();
      if (json.status === 'error') throw new Error(json.message);
      const vals: { datetime: string; open: string; high: string; low: string; close: string; volume: string }[] = json.values ?? [];
      return vals.map(v => {
        const localMs = new Date(v.datetime.replace(' ', 'T') + ':00').getTime();
        return { time: Math.floor(localMs / 1000) - off * 3600, open: parseFloat(v.open) || 0, high: parseFloat(v.high) || 0, low: parseFloat(v.low) || 0, close: parseFloat(v.close) || 0, volume: parseFloat(v.volume) || 0 };
      }).filter(c => c.close > 0);
    } catch { /* fall through */ }
  }
  // Yahoo fallback
  try {
    const yahoosym = symbol === 'NQ=F' ? 'NQ=F' : symbol;
    const nowSec = Math.floor(Date.now() / 1000);
    const yInterval = interval === '1day' || interval === '1d' ? '1d' : interval === '1h' ? '1h' : '15m';
    const fromSec = nowSec - (interval === '1day' || interval === '1d' ? 60 * 86400 : 30 * 86400);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoosym)}?period1=${fromSec}&period2=${nowSec}&interval=${yInterval}`;
    const res = await yfFetch(url);
    if (!res.ok) throw new Error(`Yahoo ${res.status}`);
    const text = await res.text();
    const json = JSON.parse(text);
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('No data');
    const timestamps: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    return timestamps.map((ts, i) => ({ time: ts, open: q.open?.[i] ?? 0, high: q.high?.[i] ?? 0, low: q.low?.[i] ?? 0, close: q.close?.[i] ?? 0, volume: q.volume?.[i] ?? 0 })).filter(c => c.close > 0);
  } catch { return []; }
}

function computeTFBias(candles: CandleData[], label: string): {
  label: string; bias: 'bullish' | 'bearish' | 'neutral';
  ema9: number | null; ema21: number | null; ema50: number | null;
  alignment: 'bull_stack' | 'bear_stack' | 'mixed';
  priceVsEma21: 'above' | 'below'; trendStrength: 'strong' | 'moderate' | 'weak'; score: number;
} {
  if (candles.length < 5) return { label, bias: 'neutral', ema9: null, ema21: null, ema50: null, alignment: 'mixed', priceVsEma21: 'above', trendStrength: 'weak', score: 50 };
  const closes = candles.map(c => c.close);
  function lastVal(arr: number[]) { for (let i = arr.length - 1; i >= 0; i--) if (Number.isFinite(arr[i])) return arr[i]; return null; }
  const e9  = lastVal(calcEMA(closes, 9));
  const e21 = lastVal(calcEMA(closes, Math.min(21, closes.length)));
  const e50 = lastVal(calcEMA(closes, Math.min(50, closes.length)));
  const price = closes[closes.length - 1];

  let score = 50;
  if (e9 && e21) { if (e9 > e21) score += 15; else score -= 15; }
  if (e21 && e50) { if (e21 > e50) score += 10; else score -= 10; }
  if (e21) { if (price > e21) score += 25; else score -= 25; }
  score = Math.max(0, Math.min(100, score));

  const bias: 'bullish' | 'bearish' | 'neutral' = score >= 62 ? 'bullish' : score <= 38 ? 'bearish' : 'neutral';
  const alignment: 'bull_stack' | 'bear_stack' | 'mixed' = e9 && e21 && e50
    ? (e9 > e21 && e21 > e50 ? 'bull_stack' : e9 < e21 && e21 < e50 ? 'bear_stack' : 'mixed')
    : 'mixed';
  const priceVsEma21: 'above' | 'below' = e21 ? (price >= e21 ? 'above' : 'below') : 'above';

  const last10 = candles.slice(-10);
  const netMove = last10.length > 1 ? Math.abs(last10[last10.length - 1].close - last10[0].close) : 0;
  const avgRange = last10.reduce((s, c) => s + (c.high - c.low), 0) / last10.length;
  const trendStrength: 'strong' | 'moderate' | 'weak' = netMove > avgRange * 1.5 ? 'strong' : netMove > avgRange * 0.7 ? 'moderate' : 'weak';

  return {
    label, bias,
    ema9:  e9  ? Math.round(e9  * 100) / 100 : null,
    ema21: e21 ? Math.round(e21 * 100) / 100 : null,
    ema50: e50 ? Math.round(e50 * 100) / 100 : null,
    alignment, priceVsEma21, trendStrength, score: Math.round(score),
  };
}

export async function GET(_req: NextRequest) {
  try {
    const [dailyC, h1C, m15C] = await Promise.all([
      fetchHTFCandles('NQ=F', '1day',  30),
      fetchHTFCandles('NQ=F', '1h',    48),
      fetchHTFCandles('NQ=F', '15min', 40),
    ]);

    const daily = computeTFBias(dailyC, 'Daily');
    const h1    = computeTFBias(h1C,    '1 Hour');
    const m15   = computeTFBias(m15C,   '15 Min');

    const timeframes = [daily, h1, m15];
    const scores = timeframes.map(t => t.score);
    const avgScore = scores.reduce((s, v) => s + v, 0) / scores.length;

    const bullCount = timeframes.filter(t => t.bias === 'bullish').length;
    const bearCount = timeframes.filter(t => t.bias === 'bearish').length;

    let alignmentLabel: string;
    let tradingBias: 'bullish' | 'bearish' | 'neutral';
    if (bullCount === 3)      { alignmentLabel = 'FULL BULL ALIGNMENT'; tradingBias = 'bullish'; }
    else if (bearCount === 3) { alignmentLabel = 'FULL BEAR ALIGNMENT'; tradingBias = 'bearish'; }
    else if (bullCount === 2) { alignmentLabel = 'PARTIAL BULL';        tradingBias = 'bullish'; }
    else if (bearCount === 2) { alignmentLabel = 'PARTIAL BEAR';        tradingBias = 'bearish'; }
    else                      { alignmentLabel = 'MIXED / COUNTERTREND'; tradingBias = 'neutral'; }

    const alignmentScore = Math.round(avgScore);
    const recommendation = tradingBias === 'bullish'
      ? 'Higher timeframes bullish — favor long setups on 5m confirmation'
      : tradingBias === 'bearish'
      ? 'Higher timeframes bearish — favor short setups on 5m confirmation'
      : 'Mixed timeframe bias — reduce size, wait for alignment or avoid';

    return NextResponse.json(
      { success: true, timeframes, alignmentScore, alignmentLabel, tradingBias, recommendation, fetchedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'HTF data unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
