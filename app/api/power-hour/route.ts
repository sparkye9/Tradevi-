import { NextRequest, NextResponse } from 'next/server';
import { yfFetch } from '@/lib/yahoo-finance';

function getETOffsetHours(): number {
  const now = new Date();
  const year = now.getFullYear();
  const mar1Day = new Date(year, 2, 1).getDay();
  const dstStart = new Date(year, 2, mar1Day === 0 ? 8 : 15 - mar1Day);
  const nov1Day = new Date(year, 10, 1).getDay();
  const dstEnd = new Date(year, 10, nov1Day === 0 ? 1 : 8 - nov1Day);
  return now >= dstStart && now < dstEnd ? -4 : -5;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchYahooIntradayCandles(symbol: string, fromSec: number): Promise<Candle[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${fromSec}&period2=${nowSec}&interval=1m&includePrePost=false`;

  const res = await yfFetch(url);
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`);

  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error('Yahoo Finance returned HTML (rate limited)');

  const json = JSON.parse(text);
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description ?? 'No chart data from Yahoo Finance');

  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};

  return timestamps
    .map((ts, i) => ({
      time: ts,
      open: q.open?.[i] ?? 0,
      high: q.high?.[i] ?? 0,
      low: q.low?.[i] ?? 0,
      close: q.close?.[i] ?? 0,
      volume: q.volume?.[i] ?? 0,
    }))
    .filter(c => c.close > 0 && c.high > 0);
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const symbol = sp.get('symbol')?.toUpperCase()?.trim() ?? 'SPY';

  try {
    const etOffset = getETOffsetHours();
    const now = new Date();
    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

    // Regular session open: 9:30 AM ET
    const sessionOpenSec = Math.floor(utcMidnight / 1000) + (9 * 60 + 30 - etOffset * 60) * 60;
    // Power hour window: 3:00 PM – 3:35 PM ET
    const phStartSec = Math.floor(utcMidnight / 1000) + (15 * 60 - etOffset * 60) * 60;
    const phEndSec = phStartSec + 35 * 60;

    const candles = await fetchYahooIntradayCandles(symbol, sessionOpenSec - 1800);

    if (candles.length === 0) {
      throw new Error('No intraday data available — market may be closed or symbol invalid');
    }

    const sessionCandles = candles.filter(c => c.time >= sessionOpenSec);
    const powerHourCandles = candles.filter(c => c.time >= phStartSec && c.time < phEndSec);
    const currentTime = Math.floor(Date.now() / 1000);

    const sessionPhase =
      currentTime < phStartSec ? 'pre_power_hour' :
      currentTime < phEndSec   ? 'power_hour' :
                                  'post_power_hour';

    const currentPrice = candles[candles.length - 1].close;
    const allForStats = sessionCandles.length > 0 ? sessionCandles : candles;

    const dayHigh = Math.max(...allForStats.map(c => c.high));
    const dayLow  = Math.min(...allForStats.map(c => c.low));
    const dayOpen = allForStats[0].open;

    // VWAP (cumulative over session)
    let cumPV = 0, cumV = 0;
    for (const c of allForStats) {
      const tp = (c.high + c.low + c.close) / 3;
      cumPV += tp * c.volume;
      cumV  += c.volume;
    }
    const vwap = cumV > 0 ? cumPV / cumV : currentPrice;

    // Power-hour window levels
    const phHigh = powerHourCandles.length > 0 ? Math.max(...powerHourCandles.map(c => c.high)) : null;
    const phLow  = powerHourCandles.length > 0 ? Math.min(...powerHourCandles.map(c => c.low))  : null;
    const phOpen = powerHourCandles.length > 0 ? powerHourCandles[0].open : null;

    // Short-term momentum: last 10 candles
    const recentCandles = allForStats.slice(-10);
    const momentumScore =
      recentCandles.length >= 2
        ? ((recentCandles[recentCandles.length - 1].close - recentCandles[0].open) /
            recentCandles[0].open) * 100
        : 0;

    // Volume surge (current vs session average)
    const totalSessionVolume = allForStats.reduce((s, c) => s + c.volume, 0);
    const avgCandleVolume = allForStats.length > 0 ? totalSessionVolume / allForStats.length : 1;
    const lastVolume  = candles[candles.length - 1].volume;
    const volumeSurge = avgCandleVolume > 0 ? lastVolume / avgCandleVolume : 1;

    // Bias
    const aboveVWAP   = currentPrice > vwap;
    const aboveMidDay = currentPrice > (dayHigh + dayLow) / 2;
    const bias: 'bullish' | 'bearish' | 'neutral' =
      aboveVWAP && aboveMidDay   ? 'bullish' :
      !aboveVWAP && !aboveMidDay ? 'bearish' : 'neutral';

    // Setup signals
    type SignalStrength  = 'strong' | 'moderate' | 'weak';
    type SignalDirection = 'bullish' | 'bearish' | 'neutral';
    interface Signal {
      type: string;
      description: string;
      direction: SignalDirection;
      strength: SignalStrength;
    }
    const signals: Signal[] = [];

    const distFromVWAPPct = ((currentPrice - vwap) / vwap) * 100;

    if (Math.abs(distFromVWAPPct) < 0.08) {
      signals.push({
        type: 'VWAP Test',
        description: `Price is testing VWAP at $${round2(vwap)} — watch for a reclaim (calls) or rejection (puts) with volume confirmation`,
        direction: 'neutral',
        strength: volumeSurge > 1.5 ? 'strong' : 'moderate',
      });
    } else if (distFromVWAPPct > 0 && distFromVWAPPct < 0.25) {
      signals.push({
        type: 'VWAP Support',
        description: `Price is ${round2(distFromVWAPPct)}% above VWAP ($${round2(vwap)}) — bullish; a dip to VWAP is a call entry`,
        direction: 'bullish',
        strength: 'moderate',
      });
    } else if (distFromVWAPPct < 0 && distFromVWAPPct > -0.25) {
      signals.push({
        type: 'VWAP Resistance',
        description: `Price is ${round2(Math.abs(distFromVWAPPct))}% below VWAP ($${round2(vwap)}) — bearish; a bounce to VWAP is a put entry`,
        direction: 'bearish',
        strength: 'moderate',
      });
    }

    const distFromHODPct = ((dayHigh - currentPrice) / dayHigh) * 100;
    const distFromLODPct = ((currentPrice - dayLow)  / dayLow)  * 100;

    if (distFromHODPct < 0.12) {
      signals.push({
        type: 'HOD Breakout Setup',
        description: `Price within 0.12% of day high $${round2(dayHigh)} — breakout above triggers call scalp`,
        direction: 'bullish',
        strength: volumeSurge > 1.5 ? 'strong' : 'moderate',
      });
    }
    if (distFromLODPct < 0.12) {
      signals.push({
        type: 'LOD Breakdown Setup',
        description: `Price within 0.12% of day low $${round2(dayLow)} — breakdown below triggers put scalp`,
        direction: 'bearish',
        strength: volumeSurge > 1.5 ? 'strong' : 'moderate',
      });
    }

    if (Math.abs(momentumScore) > 0.25 && volumeSurge > 1.2) {
      signals.push({
        type: momentumScore > 0 ? 'Bullish Momentum' : 'Bearish Momentum',
        description: `${round2(Math.abs(momentumScore))}% directional move in the last 10 candles with ${round2(volumeSurge)}x average volume`,
        direction: momentumScore > 0 ? 'bullish' : 'bearish',
        strength: Math.abs(momentumScore) > 0.5 ? 'strong' : 'moderate',
      });
    }

    // Extended from VWAP = mean-reversion candidate
    if (Math.abs(distFromVWAPPct) > 0.5) {
      signals.push({
        type: 'Extended from VWAP',
        description: `Price is ${round2(Math.abs(distFromVWAPPct))}% ${distFromVWAPPct > 0 ? 'above' : 'below'} VWAP — mean-reversion toward $${round2(vwap)} is possible in power hour`,
        direction: distFromVWAPPct > 0 ? 'bearish' : 'bullish',
        strength: Math.abs(distFromVWAPPct) > 1 ? 'strong' : 'moderate',
      });
    }

    const minsToPhStart       = Math.max(0, Math.floor((phStartSec - currentTime) / 60));
    const minsInPh            = sessionPhase === 'power_hour' ? Math.floor((currentTime - phStartSec) / 60) : null;
    const minsRemainingInPh   = sessionPhase === 'power_hour' ? Math.max(0, Math.floor((phEndSec - currentTime) / 60)) : null;

    return NextResponse.json(
      {
        success: true,
        symbol,
        currentPrice:       round2(currentPrice),
        dayHigh:            round2(dayHigh),
        dayLow:             round2(dayLow),
        dayOpen:            round2(dayOpen),
        vwap:               round2(vwap),
        phHigh:             phHigh !== null ? round2(phHigh) : null,
        phLow:              phLow  !== null ? round2(phLow)  : null,
        phOpen:             phOpen !== null ? round2(phOpen) : null,
        bias,
        momentumScore:      round2(momentumScore),
        volumeSurge:        round2(volumeSurge),
        signals,
        sessionPhase,
        minsToPhStart,
        minsInPh,
        minsRemainingInPh,
        totalSessionVolume,
        avgCandleVolume:    round2(avgCandleVolume),
        lastVolume,
        candleCount:        allForStats.length,
        phCandleCount:      powerHourCandles.length,
        recentCandles:      allForStats.slice(-20),
        fetchedAt:          new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Power hour data unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
