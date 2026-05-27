/**
 * Options Order Flow Intelligence API
 * Fetches real options chain data from Yahoo Finance and computes smart money flow metrics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { yfFetch } from '@/lib/yahoo-finance';
import { getYahooSession } from '@/lib/yahooFinance';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface YahooOption {
  contractSymbol: string;
  strike: number;
  currency: string;
  lastPrice: number;
  change: number;
  percentChange: number;
  volume?: number;
  openInterest?: number;
  bid: number;
  ask: number;
  contractSize: string;
  expiration: number;
  lastTradeDate: number;
  impliedVolatility: number;
  inTheMoney: boolean;
}

export interface OptionsFlowResult {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  calls: {
    totalVolume: number;
    totalOI: number;
    premiumFlow: number;
    avgIV: number;
    sweepCount: number;
    largeBlockCount: number;
    maxVolStrike: number;
    callWall: number;
  };
  puts: {
    totalVolume: number;
    totalOI: number;
    premiumFlow: number;
    avgIV: number;
    sweepCount: number;
    largeBlockCount: number;
    maxVolStrike: number;
    putWall: number;
  };
  pcRatioVolume: number;
  pcRatioOI: number;
  ivSkew: number;
  maxPain: number;
  callWall: number;
  putWall: number;
  bullishScore: number;
  bearishScore: number;
  flowBias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  phase: 'accumulation' | 'manipulation' | 'expansion' | 'distribution' | 'unknown';
  phaseReason: string;
  sweeps: { type: 'call' | 'put'; strike: number; volume: number; oi: number; premium: number; ratio: number }[];
  largeBlocks: { type: 'call' | 'put'; strike: number; volume: number; premium: number; iv: number }[];
  ivExpanding: boolean;
  unusualActivity: boolean;
  suggestion: 'CALLS' | 'PUTS' | 'WAIT' | 'SCALP';
  aiInterpretation: string;
  nearestExpiry: string;
  expiryDaysAway: number;
  fetchedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

function safeNum(v: number | undefined | null, fallback = 0): number {
  if (v == null || !Number.isFinite(v) || Number.isNaN(v)) return fallback;
  return v;
}

// ─── Fetch Yahoo options chain ─────────────────────────────────────────────────

const YF_OPTS_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         'https://finance.yahoo.com/',
};

async function fetchOptionsChain(symbol: string): Promise<{
  calls: YahooOption[];
  puts: YahooOption[];
  price: number;
  change: number;
  changePct: number;
  expiryTs: number;
}> {
  const session = await getYahooSession();
  const crumbSuffix = session?.crumb ? `?crumb=${encodeURIComponent(session.crumb)}` : '';
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}${crumbSuffix}`;

  const headers: Record<string, string> = { ...YF_OPTS_HEADERS };
  if (session?.cookie) headers['Cookie'] = session.cookie;

  let res = await yfFetch(url);

  // Fallback: try query1 without crumb if query2 fails
  if (!res.ok && session?.crumb) {
    const fallbackUrl = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
    res = await fetch(fallbackUrl, { headers: YF_OPTS_HEADERS, cache: 'no-store' });
  }

  if (!res.ok) throw new Error(`Yahoo options ${res.status} for ${symbol}`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error('Yahoo returned HTML for options');
  const json = JSON.parse(text);
  const result = json?.optionChain?.result?.[0];
  if (!result) throw new Error(json?.optionChain?.error?.description ?? `No options data for ${symbol}`);

  const quote = result.quote ?? {};
  const price = safeNum(quote.regularMarketPrice ?? quote.previousClose, 0);
  const prev = safeNum(quote.previousClose ?? price, price);
  const change = r2(price - prev);
  const changePct = r2(prev > 0 ? ((price - prev) / prev) * 100 : 0);

  const options = result.options?.[0] ?? {};
  const calls: YahooOption[] = options.calls ?? [];
  const puts: YahooOption[] = options.puts ?? [];
  const expiryTs: number = options.expirationDate ?? result.expirationDates?.[0] ?? 0;

  return { calls, puts, price, change, changePct, expiryTs };
}

// ─── Compute max pain ─────────────────────────────────────────────────────────

function computeMaxPain(calls: YahooOption[], puts: YahooOption[], strikes: number[]): number {
  if (!strikes.length) return 0;
  let minPain = Infinity;
  let maxPainStrike = strikes[0];

  for (const expiry of strikes) {
    let totalPain = 0;
    for (const c of calls) {
      const oi = safeNum(c.openInterest);
      totalPain += oi * Math.max(0, expiry - c.strike);
    }
    for (const p of puts) {
      const oi = safeNum(p.openInterest);
      totalPain += oi * Math.max(0, p.strike - expiry);
    }
    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = expiry;
    }
  }
  return maxPainStrike;
}

// ─── Main compute function ─────────────────────────────────────────────────────

function computeFlow(
  calls: YahooOption[],
  puts: YahooOption[],
  price: number,
  change: number,
  changePct: number,
  symbol: string,
  expiryTs: number
): OptionsFlowResult {
  const now = Date.now();
  const expiryDaysAway = expiryTs > 0 ? Math.round((expiryTs * 1000 - now) / 86_400_000) : 0;
  const nearestExpiry = expiryTs > 0
    ? new Date(expiryTs * 1000).toISOString().slice(0, 10)
    : 'unknown';

  // ── Call metrics ────────────────────────────────────────────────────────────
  let callVol = 0, callOI = 0, callPremium = 0, callIVSum = 0, callIVCount = 0;
  let callSweepCount = 0, callLargeBlockCount = 0;
  let callMaxVolStrike = 0, callMaxVol = 0, callWall = 0, callMaxOI = 0;
  const sweeps: OptionsFlowResult['sweeps'] = [];
  const largeBlocks: OptionsFlowResult['largeBlocks'] = [];

  for (const c of calls) {
    const vol = safeNum(c.volume);
    const oi  = safeNum(c.openInterest);
    const lp  = safeNum(c.lastPrice);
    const iv  = safeNum(c.impliedVolatility);
    const premium = vol * lp * 100;

    callVol += vol;
    callOI  += oi;
    callPremium += premium;
    if (iv > 0) { callIVSum += iv; callIVCount++; }

    if (vol > callMaxVol) { callMaxVol = vol; callMaxVolStrike = c.strike; }
    if (oi > callMaxOI)   { callMaxOI = oi; callWall = c.strike; }

    // Sweep: volume > 5 * OI (and OI > 0)
    if (oi > 0 && vol > 5 * oi && vol > 100) {
      callSweepCount++;
      sweeps.push({ type: 'call', strike: c.strike, volume: vol, oi, premium, ratio: r2(oi > 0 ? vol / oi : 0) });
    }
    // Large block: premium > $50k
    if (premium > 50_000) {
      callLargeBlockCount++;
      largeBlocks.push({ type: 'call', strike: c.strike, volume: vol, premium: Math.round(premium), iv: r4(iv) });
    }
  }

  // ── Put metrics ─────────────────────────────────────────────────────────────
  let putVol = 0, putOI = 0, putPremium = 0, putIVSum = 0, putIVCount = 0;
  let putSweepCount = 0, putLargeBlockCount = 0;
  let putMaxVolStrike = 0, putMaxVol = 0, putWall = 0, putMaxOI = 0;

  for (const p of puts) {
    const vol = safeNum(p.volume);
    const oi  = safeNum(p.openInterest);
    const lp  = safeNum(p.lastPrice);
    const iv  = safeNum(p.impliedVolatility);
    const premium = vol * lp * 100;

    putVol += vol;
    putOI  += oi;
    putPremium += premium;
    if (iv > 0) { putIVSum += iv; putIVCount++; }

    if (vol > putMaxVol) { putMaxVol = vol; putMaxVolStrike = p.strike; }
    if (oi > putMaxOI)   { putMaxOI = oi; putWall = p.strike; }

    if (oi > 0 && vol > 5 * oi && vol > 100) {
      putSweepCount++;
      sweeps.push({ type: 'put', strike: p.strike, volume: vol, oi, premium, ratio: r2(oi > 0 ? vol / oi : 0) });
    }
    if (premium > 50_000) {
      putLargeBlockCount++;
      largeBlocks.push({ type: 'put', strike: p.strike, volume: vol, premium: Math.round(premium), iv: r4(iv) });
    }
  }

  // Sort sweeps and large blocks by premium desc
  sweeps.sort((a, b) => b.premium - a.premium);
  largeBlocks.sort((a, b) => b.premium - a.premium);

  // ── ATM IV skew (within 2% of current price) ────────────────────────────────
  const atmBand = price * 0.02;
  const atmCalls = calls.filter(c => Math.abs(c.strike - price) <= atmBand);
  const atmPuts  = puts.filter(p => Math.abs(p.strike - price) <= atmBand);

  const atmCallIV = atmCalls.length > 0
    ? atmCalls.reduce((s, c) => s + safeNum(c.impliedVolatility), 0) / atmCalls.length
    : (callIVCount > 0 ? callIVSum / callIVCount : 0);
  const atmPutIV = atmPuts.length > 0
    ? atmPuts.reduce((s, p) => s + safeNum(p.impliedVolatility), 0) / atmPuts.length
    : (putIVCount > 0 ? putIVSum / putIVCount : 0);

  const ivSkew = r4(atmPutIV - atmCallIV); // positive = put skew = bearish lean

  // ── Max pain ─────────────────────────────────────────────────────────────────
  const allStrikes = Array.from(new Set([...calls.map(c => c.strike), ...puts.map(p => p.strike)])).sort((a, b) => a - b);
  const maxPain = computeMaxPain(calls, puts, allStrikes);

  // ── Ratios ───────────────────────────────────────────────────────────────────
  const pcRatioVolume = r4(callVol > 0 ? putVol / callVol : putVol > 0 ? 99 : 1);
  const pcRatioOI     = r4(callOI > 0 ? putOI / callOI : putOI > 0 ? 99 : 1);

  const avgCallIV = callIVCount > 0 ? r4(callIVSum / callIVCount) : 0;
  const avgPutIV  = putIVCount  > 0 ? r4(putIVSum  / putIVCount)  : 0;

  const unusualActivity = sweeps.length > 0 || largeBlocks.length > 2;
  const ivExpanding = ivSkew > 0.05 || avgPutIV > avgCallIV * 1.15;

  // ── Bullish score (starts at 50) ────────────────────────────────────────────
  let bullishScore = 50;

  if (pcRatioVolume < 0.5)       bullishScore += 30;
  else if (pcRatioVolume < 0.8)  bullishScore += 15;
  else if (pcRatioVolume > 1.5)  bullishScore -= 25;
  else if (pcRatioVolume > 1.2)  bullishScore -= 15;

  const totalPremium = callPremium + putPremium;
  if (totalPremium > 0 && callPremium / totalPremium > 0.6) bullishScore += 25;

  if (callSweepCount > putSweepCount)             bullishScore += 20;
  else if (putSweepCount > callSweepCount)        bullishScore -= 20;

  if (callLargeBlockCount > putLargeBlockCount)   bullishScore += 15;
  else if (putLargeBlockCount > callLargeBlockCount) bullishScore -= 15;

  if (ivSkew > 0.05)  bullishScore -= 10; // put skew = bearish hedge
  if (ivSkew < -0.05) bullishScore += 10; // call skew = bullish speculation

  if (pcRatioVolume < 0.6) bullishScore += 10;

  bullishScore = Math.max(0, Math.min(100, Math.round(bullishScore)));
  const bearishScore = 100 - bullishScore;

  const flowBias: 'bullish' | 'bearish' | 'neutral' =
    bullishScore >= 60 ? 'bullish' : bullishScore <= 40 ? 'bearish' : 'neutral';

  const confidence = Math.abs(bullishScore - 50) * 2; // 0-100, higher = more confident

  // ── Phase detection ──────────────────────────────────────────────────────────
  let phase: OptionsFlowResult['phase'] = 'unknown';
  let phaseReason = '';

  const ivSpikeDay = Math.abs(changePct) > 3;
  const sweepDetected = sweeps.length > 0;
  const highCallDominance = totalPremium > 0 && callPremium / totalPremium > 0.65;
  const highPutDominance  = totalPremium > 0 && putPremium  / totalPremium > 0.65;
  const priceWhipping = Math.abs(changePct) > 1.5 && Math.abs(changePct) < 4;

  if (ivSpikeDay && sweepDetected && priceWhipping) {
    phase = 'manipulation';
    phaseReason = `IV spike (${changePct.toFixed(1)}% day move), sweep activity detected, price volatility suggests stop-hunt liquidity sweep by institutions.`;
  } else if (highCallDominance && ivExpanding && changePct > 0) {
    phase = 'expansion';
    phaseReason = `Call flow dominance (${totalPremium > 0 ? ((callPremium / totalPremium) * 100).toFixed(0) : 0}%), expanding IV, positive price action — institutions positioning for upside continuation.`;
  } else if (highPutDominance && ivExpanding && changePct < 0) {
    phase = 'expansion';
    phaseReason = `Put flow dominance (${totalPremium > 0 ? ((putPremium / totalPremium) * 100).toFixed(0) : 0}%), expanding IV — institutions protecting against or positioning for downside.`;
  } else if (bullishScore > 60 && putOI > callOI * 1.5 && Math.abs(changePct) < 1) {
    phase = 'distribution';
    phaseReason = `High put OI overhead while price is near highs with weak flow momentum — consistent with distribution phase where smart money exits long positions.`;
  } else if (pcRatioVolume >= 0.8 && pcRatioVolume <= 1.2 && !sweepDetected && Math.abs(changePct) < 1) {
    phase = 'accumulation';
    phaseReason = `Balanced P/C ratio (${pcRatioVolume.toFixed(2)}), no unusual sweep activity, quiet price action — consistent with institutional accumulation under the radar.`;
  } else {
    phase = 'unknown';
    phaseReason = 'Insufficient signal confluence to determine a definitive market phase.';
  }

  // ── Trade suggestion ──────────────────────────────────────────────────────────
  let suggestion: OptionsFlowResult['suggestion'];
  if (phase === 'manipulation' || confidence < 40) {
    suggestion = 'SCALP';
  } else if (bullishScore >= 65 && phase !== 'distribution') {
    suggestion = 'CALLS';
  } else if (bearishScore >= 65 && phase !== 'accumulation') {
    suggestion = 'PUTS';
  } else {
    suggestion = 'WAIT';
  }

  // ── AI interpretation ──────────────────────────────────────────────────────
  const fmtPremium = (p: number) => p >= 1_000_000 ? `$${(p / 1_000_000).toFixed(1)}M` : p >= 1_000 ? `$${(p / 1_000).toFixed(0)}K` : `$${p.toFixed(0)}`;
  const biasWord = flowBias === 'bullish' ? 'bullish' : flowBias === 'bearish' ? 'bearish' : 'neutral';

  let aiInterpretation = '';

  if (phase === 'manipulation') {
    aiInterpretation = `Smart money appears to be running a liquidity sweep on ${symbol}. The combination of IV spike and unusual sweep activity (${sweeps.length} sweep${sweeps.length !== 1 ? 's' : ''} detected) suggests institutions are engineering a stop-hunt move to accumulate or distribute at better prices. Do not chase this move — wait for the dust to settle and direction to confirm. ${callSweepCount > putSweepCount ? 'The call sweep dominance hints at an upside resolution once the manipulation concludes.' : 'The put sweep dominance suggests downside may follow the liquidity grab.'}`;
  } else if (phase === 'expansion' && flowBias === 'bullish') {
    aiInterpretation = `The options market is showing clear ${biasWord} expansion signals on ${symbol}. Call premium flow of ${fmtPremium(callPremium)} is overwhelming put flow at ${fmtPremium(putPremium)}, with ${callSweepCount} call sweep${callSweepCount !== 1 ? 's' : ''} detected. This is consistent with institutional positioning for a sustained upside move. The ${bullishScore}/100 bullish score suggests high-confidence directional bias — smart money is actively accumulating call exposure.`;
  } else if (phase === 'expansion' && flowBias === 'bearish') {
    aiInterpretation = `Put flow is dominating on ${symbol} with ${fmtPremium(putPremium)} in put premium versus ${fmtPremium(callPremium)} in calls. The ${putSweepCount} put sweep${putSweepCount !== 1 ? 's' : ''} and bearish score of ${bearishScore}/100 indicate institutional hedging or outright bearish positioning. This level of put flow dominance typically precedes meaningful downside pressure — smart money is either protecting large long positions or actively betting against the ticker.`;
  } else if (phase === 'distribution') {
    aiInterpretation = `${symbol} is exhibiting distribution characteristics. While surface-level metrics may appear neutral or bullish, the elevated put OI relative to call OI signals that larger players are quietly hedging their long exposure. Price near current levels with high put walls overhead suggests the smart money is beginning to unload inventory — a classic sign that a top may be forming or is already in place.`;
  } else if (phase === 'accumulation') {
    aiInterpretation = `${symbol} options flow is quiet but deliberate. The balanced P/C ratio of ${pcRatioVolume.toFixed(2)} and subdued sweep activity suggest institutions are accumulating positions without drawing attention. This low-noise environment often precedes a significant directional move — smart money accumulates silently before the expansion phase begins. The ${biasWord} lean with ${confidence.toFixed(0)}% confidence warrants attention but patience.`;
  } else {
    aiInterpretation = `${symbol} options flow shows a ${biasWord} lean with a bullish score of ${bullishScore}/100 and P/C ratio of ${pcRatioVolume.toFixed(2)}. ${sweeps.length > 0 ? `${sweeps.length} sweep event${sweeps.length !== 1 ? 's' : ''} detected (${callSweepCount} call, ${putSweepCount} put), indicating some unusual single-transaction activity.` : 'No significant sweep activity detected, suggesting normal retail flow.'} ${largeBlocks.length > 0 ? `${largeBlocks.length} large block trade${largeBlocks.length !== 1 ? 's' : ''} with significant premium indicate institutional participation.` : ''} Monitor for phase clarification before committing to a directional bias.`;
  }

  return {
    symbol,
    price: r2(price),
    change: r2(change),
    changePct: r2(changePct),
    calls: {
      totalVolume: callVol,
      totalOI: callOI,
      premiumFlow: Math.round(callPremium),
      avgIV: avgCallIV,
      sweepCount: callSweepCount,
      largeBlockCount: callLargeBlockCount,
      maxVolStrike: callMaxVolStrike,
      callWall,
    },
    puts: {
      totalVolume: putVol,
      totalOI: putOI,
      premiumFlow: Math.round(putPremium),
      avgIV: avgPutIV,
      sweepCount: putSweepCount,
      largeBlockCount: putLargeBlockCount,
      maxVolStrike: putMaxVolStrike,
      putWall,
    },
    pcRatioVolume,
    pcRatioOI,
    ivSkew,
    maxPain,
    callWall,
    putWall,
    bullishScore,
    bearishScore,
    flowBias,
    confidence: Math.round(confidence),
    phase,
    phaseReason,
    sweeps: sweeps.slice(0, 10),
    largeBlocks: largeBlocks.slice(0, 10),
    ivExpanding,
    unusualActivity,
    suggestion,
    aiInterpretation,
    nearestExpiry,
    expiryDaysAway,
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

const SUPPORTED_TICKERS = ['QQQ', 'SPY', 'TQQQ', 'NVDA', 'TSLA'] as const;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const rawSymbol = sp.get('symbol')?.toUpperCase() ?? '';

  // Single symbol
  if (rawSymbol) {
    try {
      const { calls, puts, price, change, changePct, expiryTs } = await fetchOptionsChain(rawSymbol);
      if (!calls.length && !puts.length) {
        return NextResponse.json({
          success: false,
          error: `No options data returned for ${rawSymbol}. The market may be closed or this ticker has no listed options.`,
        }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
      }
      const result = computeFlow(calls, puts, price, change, changePct, rawSymbol, expiryTs);
      return NextResponse.json({ success: true, data: result }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: err instanceof Error ? err.message : `Options data unavailable for ${rawSymbol}`,
      }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  }

  // Overview: all supported tickers
  const results = await Promise.allSettled(
    SUPPORTED_TICKERS.map(async (sym) => {
      const { calls, puts, price, change, changePct, expiryTs } = await fetchOptionsChain(sym);
      return computeFlow(calls, puts, price, change, changePct, sym, expiryTs);
    })
  );

  const overview = results
    .map((r, i) => r.status === 'fulfilled' ? r.value : { symbol: SUPPORTED_TICKERS[i], error: (r as PromiseRejectedResult).reason?.message })
    .filter(Boolean);

  return NextResponse.json({ success: true, data: overview }, { headers: { 'Cache-Control': 'no-store' } });
}
