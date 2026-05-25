import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooQuote } from '@/lib/yahooFinance';
import { fetchYahooCandles } from '@/lib/yahooChart';
import { calcAllIndicators } from '@/lib/clientIndicators';
import type { CandleData } from '@/lib/types';

// ─── Narrative generators ─────────────────────────────────────────────────────

function deriveRiskEnvironment(vix: number, dxy: number, tnx: number): 'risk-on' | 'risk-off' | 'neutral' {
  const vixRisk = vix > 25 ? -1 : vix < 15 ? 1 : 0;
  const dxyRisk = dxy > 104 ? -1 : dxy < 100 ? 1 : 0;
  const tnxRisk = tnx > 4.5 ? -1 : tnx < 4.0 ? 1 : 0;
  const score = vixRisk + dxyRisk + tnxRisk;
  return score >= 2 ? 'risk-on' : score <= -2 ? 'risk-off' : 'neutral';
}

function psychologyNarrative(gap: number, rsi: number, chg: number, from52Hi: number, vix: number): string {
  const parts: string[] = [];
  if (gap > 0.5) {
    parts.push(`A ${gap.toFixed(2)}% gap-up opens the session with FOMO pressure on retail traders.`);
    if (rsi > 65) parts.push('With RSI in bullish momentum territory, late buyers risk holding the bag if price fails to push through resistance — smart money may distribute into this strength.');
    else parts.push('Gap has momentum support but market makers will probe for stop clusters below the opening range before confirming direction.');
  } else if (gap < -0.5) {
    parts.push(`A ${Math.abs(gap).toFixed(2)}% gap-down triggers stop-loss cascades among overnight longs.`);
    if (rsi < 40) parts.push('RSI approaching oversold — panic sellers may be exhausting supply. Watch for absorption wicks and volume dry-up as signals of smart money accumulation.');
    else parts.push('RSI has more downside room, suggesting sellers are not yet exhausted. Premature long entries risk catching a falling knife.');
  } else {
    parts.push('Flat open signals price discovery mode — no clear directional bias at the open. Expect the market to run stop clusters on both sides before committing to a trend.');
  }
  if (from52Hi > -3) parts.push('Trading near 52-week highs elevates distribution risk — institutions may be scaling out into retail strength. Premium zone demands tighter risk management.');
  else if (from52Hi < -20) parts.push('Significant distance from 52-week highs suggests either a structural downtrend or a deep value opportunity. Confirm accumulation before trading reversals.');
  if (vix > 25) parts.push(`VIX at ${vix.toFixed(1)} signals elevated fear — expect erratic price swings, liquidity gaps, and wider bid/ask spreads. Reduce position size and widen stops.`);
  else if (vix < 14) parts.push(`VIX below 14 signals complacency — options are historically cheap, but low VIX environments can precede sharp volatility events. Consider hedging.`);
  return parts.join(' ');
}

function trappedTraderAnalysis(gap: number, rsi: number, trend: string, from52Hi: number) {
  if (rsi > 70 && gap > 0 && from52Hi > -5) {
    return { side: 'Bulls', reason: 'Late longs who chased the gap-up near all-time highs are overextended. A reversal below the open would cascade their stops and trigger forced liquidations — a feeding frenzy for market makers.' };
  }
  if (rsi < 32 && gap < 0) {
    return { side: 'Bears', reason: 'Aggressive shorts pressed into oversold conditions at key support. A volume-backed reversal candle could force a painful short squeeze, with bears covering into rising prices above resistance.' };
  }
  if (trend === 'bullish' && gap < -0.4) {
    return { side: 'Short-term Bears', reason: 'Shorts entered into a pullback within a strong uptrend. If bulls defend the key moving average levels, a reversal squeeze could flush these shorts quickly.' };
  }
  if (trend === 'bearish' && gap > 0.4) {
    return { side: 'Short-term Bulls', reason: 'Longs who bought the bounce in a bearish structure may find themselves trapped at dead-cat resistance. A rejection here would have them scrambling for exits.' };
  }
  return { side: 'Neither Side (Equal Risk)', reason: 'The market is in equilibrium — bulls and bears are evenly matched. This is often the environment where smart money accumulates or distributes quietly before the next directional impulse.' };
}

function openingScenarios(gap: number, rsi: number, vix: number, trend: string) {
  let gapAndGo = 15, gapFill = 20, fakeBrk = 20, liqSweep = 15;
  let openPD = 15, openDR = 15, trendDay = 25, rangeDay = 30, chopDay = 25;

  if (gap > 0.5) {
    gapAndGo = Math.min(40, 28 + gap * 4);
    gapFill = rsi > 65 ? 30 : 38;
    openPD = rsi > 65 ? 28 : 22;
    openDR = 10;
    fakeBrk = 18;
    trendDay = 35;
    rangeDay = 25;
    chopDay = 15;
  } else if (gap < -0.5) {
    gapAndGo = 22;
    gapFill = rsi < 38 ? 42 : 36;
    openDR = rsi < 38 ? 32 : 26;
    openPD = 10;
    liqSweep = 20;
    trendDay = 28;
    rangeDay = 30;
    chopDay = 18;
  } else {
    gapAndGo = 10;
    gapFill = 15;
    fakeBrk = 28;
    liqSweep = 28;
    openPD = 20;
    openDR = 20;
    trendDay = 20;
    rangeDay = 40;
    chopDay = 38;
  }

  if (vix > 25) { trendDay += 10; chopDay -= 10; liqSweep += 5; }
  else if (vix < 14) { rangeDay += 10; chopDay += 5; trendDay -= 10; }
  if (trend === 'bullish') { gapAndGo += 5; gapFill -= 3; }
  else if (trend === 'bearish') { gapFill += 5; gapAndGo -= 3; }

  const clamp = (n: number) => Math.max(5, Math.min(90, Math.round(n)));
  return {
    gapAndGo: clamp(gapAndGo),
    gapFill: clamp(gapFill),
    fakeBreakout: clamp(fakeBrk),
    liquiditySweep: clamp(liqSweep),
    openPumpDump: clamp(openPD),
    openDumpRecovery: clamp(openDR),
    trendDay: clamp(trendDay),
    rangeDay: clamp(rangeDay),
    chopDay: clamp(chopDay),
  };
}

function powerHourAnalysis(chgPct: number, rsi: number, vix: number, trend: string) {
  let pump = 33, dump = 33, flat = 34;

  if (chgPct > 1.0) { dump = 45; pump = 25; flat = 30; }
  else if (chgPct > 0.5) { dump = 38; pump = 30; flat = 32; }
  else if (chgPct < -1.0) { pump = 45; dump = 25; flat = 30; }
  else if (chgPct < -0.5) { pump = 38; dump = 32; flat = 30; }

  if (rsi > 70) { dump += 8; pump -= 4; flat -= 4; }
  else if (rsi < 32) { pump += 8; dump -= 4; flat -= 4; }
  if (vix > 22) { pump += 4; dump += 4; flat -= 8; }
  if (trend === 'bullish') { pump += 5; dump -= 3; flat -= 2; }
  else if (trend === 'bearish') { dump += 5; pump -= 3; flat -= 2; }

  const total = pump + dump + flat;
  pump = Math.round((pump / total) * 100);
  dump = Math.round((dump / total) * 100);
  flat = 100 - pump - dump;

  let narrative: string;
  if (dump > pump && dump > flat) {
    narrative = `Power hour bias leans toward profit-taking (${dump}%). ${chgPct > 0 ? 'An up day' : 'A volatile session'} often sees institutional rebalancing in the final hour. Watch for volume spikes into key levels as signals of distribution.`;
  } else if (pump > dump) {
    narrative = `Power hour shows ${pump}% squeeze/pump probability. ${rsi < 40 ? 'Oversold conditions make a short-covering rally in the final hour plausible.' : 'Buyers defending key levels may push for a final-hour close near highs.'} Watch for volume expansion above resistance.`;
  } else {
    narrative = `Balanced power hour — range continuation is most likely. Market makers may keep price pinned near current levels for maximum options pain. Expect low-volume drifting.`;
  }

  return {
    pump, dump, flat, narrative,
    squeezeRisk: rsi < 35 && chgPct < -0.5 ? 'HIGH' : rsi < 45 ? 'MODERATE' : 'LOW' as const,
    profitTakingRisk: rsi > 65 && chgPct > 0.5 ? 'HIGH' : 'MODERATE' as const,
  };
}

function tradePlan(
  price: number, atr: number, support: number, resistance: number,
  dayHigh: number, dayLow: number, ma20: number, style: string
) {
  const sl = Math.max(atr * 0.25, price * 0.003);
  const bullStop  = Math.round((dayLow - sl) * 100) / 100;
  const bullT1    = Math.round((dayHigh + atr * 0.4) * 100) / 100;
  const bullT2    = Math.round((resistance + atr * 0.3) * 100) / 100;
  const bearStop  = Math.round((dayHigh + sl) * 100) / 100;
  const bearT1    = Math.round((dayLow - atr * 0.4) * 100) / 100;
  const bearT2    = Math.round((support - atr * 0.3) * 100) / 100;
  const bullRR    = price > bullStop ? ((bullT1 - price) / (price - bullStop)).toFixed(1) : 'N/A';
  const bearRR    = bearStop > price ? ((price - bearT1) / (bearStop - price)).toFixed(1) : 'N/A';

  return {
    bullish: {
      entryTrigger: price > ma20
        ? `Pullback to VWAP / ${ma20.toFixed(2)} with bullish engulfing or hammer confirmation`
        : `Clean breakout above ${resistance.toFixed(2)} on 20%+ above-average volume`,
      confirmation: 'Volume expansion on entry candle; price holds above VWAP for 2+ candles',
      target1: bullT1,
      target2: bullT2,
      stopLoss: bullStop,
      invalidation: `15m close below ${(Math.round((dayLow - atr * 0.6) * 100) / 100).toFixed(2)} — structure broken`,
      riskReward: bullRR,
    },
    bearish: {
      entryTrigger: price < ma20
        ? `Bounce to VWAP / ${ma20.toFixed(2)} rejected with shooting star or bearish engulfing`
        : `Clean breakdown below ${support.toFixed(2)} with volume confirmation`,
      confirmation: 'Volume expansion on entry candle; price rejected at VWAP on the first re-test',
      target1: bearT1,
      target2: bearT2,
      stopLoss: bearStop,
      invalidation: `15m close above ${(Math.round((dayHigh + atr * 0.6) * 100) / 100).toFixed(2)} — structure broken`,
      riskReward: bearRR,
    },
  };
}

function optionsSetup(price: number, atr: number, rsi: number, timeframe: string) {
  const isSwing = timeframe === 'swing' || timeframe === 'long-term';
  const dte = isSwing ? '30–45 DTE' : '7–14 DTE';
  const bullStrike = Math.round(price * 0.99);
  const bearStrike = Math.round(price * 1.01);
  const ivElevated = rsi > 65 || rsi < 35;

  return {
    bestBullishArea: `Calls near $${bullStrike} strike — target 0.40–0.55 delta for balanced leverage`,
    bestBearishArea: `Puts near $${bearStrike} strike — target 0.40–0.55 delta, avoid deep OTM`,
    deltaRange: '0.35–0.55 for directional plays; 0.20–0.35 for lottery/high-risk setups',
    thetaRisk: isSwing
      ? 'Theta at 30–45 DTE is manageable (~1–2% daily decay near expiry). Scale out at 50% gain.'
      : 'Theta aggressive at < 14 DTE — every day costs you. Exit at 25–50% gain or cut quickly.',
    ivRisk: ivElevated
      ? 'IV is elevated due to directional momentum — debit spreads reduce premium risk vs naked contracts'
      : 'IV appears moderate — straight debit calls/puts are reasonable with defined risk',
    saferExpiration: dte,
    avoidance: 'Avoid contracts under $0.10 with < 100 daily volume — liquidity risk guarantees poor fills',
    spreadIdea: `$${bullStrike}/$${(bullStrike + Math.round(atr * 2)).toFixed(0)} call spread to cap max loss and reduce IV risk`,
  };
}

function finalVerdict(
  bias: 'bullish' | 'bearish' | 'neutral', confidence: number, trend: string,
  rsi: number, gap: number, from52Hi: number, vix: number, chgPct: number, style: string
) {
  let summary = '';
  if (bias === 'bullish') {
    summary = `The TRUE outlook is CAUTIOUSLY BULLISH. ${trend === 'bullish' ? 'Primary structure remains bullish — buyers are defending key MAs and the path of least resistance is higher. ' : ''}${rsi > 60 ? 'RSI confirms momentum but approaches overbought — do not chase extended moves. Wait for pullbacks to value areas. ' : ''}${from52Hi > -5 ? 'Premium zone near yearly highs demands disciplined entries and smaller position sizing.' : 'Price has room to run before reaching premium territory.'}`;
  } else if (bias === 'bearish') {
    summary = `The TRUE outlook is BEARISH. ${trend === 'bearish' ? 'Primary structure is broken — sellers control price below key MAs, lower lows are the default expectation. ' : ''}${rsi < 42 ? 'RSI may produce short-covering bounces — use these as shorting/put opportunities, not reversals. ' : ''}Avoid catching the falling knife. Wait for rejection at resistance before adding bearish exposure.`;
  } else {
    summary = `The TRUE outlook is NEUTRAL/MIXED. The market is in a consolidation phase — smart money is likely accumulating or distributing quietly. The safest trade is NO trade. Wait for a clean structural break with volume confirmation before committing capital.`;
  }

  const rec = confidence >= 7
    ? (bias === 'bullish'
        ? (style.includes('option') || style === 'scalp' ? 'Calls — wait for pullback entry' : 'Long shares/calls at key support')
        : bias === 'bearish'
          ? (style.includes('option') || style === 'scalp' ? 'Puts — wait for bounce rejection' : 'Short/puts at key resistance')
          : 'WAIT — no clean directional edge')
    : 'WAIT — Setup unclear. Protect capital first.';

  return {
    bias, confidence,
    dailyDirection: bias === 'bullish' ? 'Higher — buyers targeting resistance' : bias === 'bearish' ? 'Lower — sellers targeting support' : 'Range-bound — breakout direction TBD',
    weeklyDirection: trend === 'bullish' ? 'Bullish structure — higher highs expected; pullbacks are buying opportunities' : trend === 'bearish' ? 'Bearish structure — lower lows expected; rallies are selling opportunities' : 'Consolidation — no weekly edge',
    strongestRisk: vix > 22 ? `Elevated VIX (${vix.toFixed(1)}) — position sizing critical` : rsi > 72 ? 'Overbought RSI — exhaustion and reversal risk high' : rsi < 30 ? 'Oversold RSI — dead-cat bounce risk in bearish trend' : from52Hi > -3 ? 'Near 52-week highs — distribution risk elevated' : 'Macro event / headline risk',
    strongestBullish: trend === 'bullish' ? 'Confirmed bullish structure with buyers at key MAs' : rsi < 35 ? 'Extreme oversold RSI — mean-reversion bounce significant potential' : 'Momentum divergence may support short-term upside',
    strongestBearish: trend === 'bearish' ? 'Confirmed bearish structure — price below all key MAs' : rsi > 68 ? 'RSI overbought — sellers likely emerging at resistance' : 'Distribution pattern near highs — institutional selling building',
    recommendation: rec,
    cleanSetup: confidence >= 7,
    summary,
  };
}

// ─── Main analysis builder ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAnalysis(quote: any, candles: CandleData[], intradayCandles: CandleData[], globalCtx: Record<string, number>, ticker: string, timeframe: string, tradingStyle: string) {
  const price     = quote.price as number;
  const prevClose = price - (quote.change as number);
  const gapPct    = prevClose > 0 ? ((quote.regularMarketOpen - prevClose) / prevClose) * 100 : 0;

  const { analysis } = calcAllIndicators(candles);
  const { rsi, atr, ma20, ma50, trend, trendStrength, support, resistance } = analysis;
  const rsiVal = rsi ?? 50;
  const atrVal = atr ?? price * 0.01;

  const from52Hi = quote.fiftyTwoWeekHigh > 0 ? ((price - quote.fiftyTwoWeekHigh) / quote.fiftyTwoWeekHigh) * 100 : 0;
  const from52Lo = quote.fiftyTwoWeekLow > 0 ? ((price - quote.fiftyTwoWeekLow) / quote.fiftyTwoWeekLow) * 100 : 0;
  const rangePct = (quote.fiftyTwoWeekHigh - quote.fiftyTwoWeekLow) > 0
    ? ((price - quote.fiftyTwoWeekLow) / (quote.fiftyTwoWeekHigh - quote.fiftyTwoWeekLow)) * 100 : 50;

  const vix = globalCtx.vix ?? 18;
  const dxy = globalCtx.dxy ?? 103;
  const tnx = globalCtx.tnx ?? 4.3;
  const oil = globalCtx.oil ?? 80;
  const esChg = globalCtx.esChange ?? 0;
  const nqChg = globalCtx.nqChange ?? 0;
  const riskEnv = deriveRiskEnvironment(vix, dxy, tnx);

  // Intraday trend from 15m candles
  let intradayTrend = 'neutral';
  if (intradayCandles.length > 5) {
    const first = intradayCandles[0].close;
    const last  = intradayCandles[intradayCandles.length - 1].close;
    intradayTrend = last > first * 1.002 ? 'bullish' : last < first * 0.998 ? 'bearish' : 'neutral';
  }

  const volRatio = quote.avgVolume > 0 ? (quote.volume / quote.avgVolume) : 1;
  const volLabel = volRatio > 1.5 ? 'HIGH' : volRatio < 0.7 ? 'LOW' : 'NORMAL';

  // Bias scoring
  let bull = 0, bear = 0;
  if (trend === 'bullish') bull += 2; else if (trend === 'bearish') bear += 2;
  if (price > ma20) bull++; else bear++;
  if (price > ma50) bull++; else bear++;
  if (rsiVal > 50) bull++; else if (rsiVal < 50) bear++;
  if (gapPct > 0.2) bull++; else if (gapPct < -0.2) bear++;
  if (riskEnv === 'risk-on') bull++; else if (riskEnv === 'risk-off') bear++;
  if (intradayTrend === 'bullish') bull++; else if (intradayTrend === 'bearish') bear++;
  if (esChg > 0.2) bull++; else if (esChg < -0.2) bear++;

  const bias: 'bullish' | 'bearish' | 'neutral' = bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral';
  const confidence = Math.min(bias !== 'neutral' ? 4 + Math.max(bull, bear) : 5, 10);

  const vwapEst = (quote.regularMarketOpen + quote.regularMarketDayHigh + quote.regularMarketDayLow + price) / 4;

  return {
    ticker,
    timestamp: new Date().toISOString(),
    quote: {
      price,
      change: Math.round(quote.change * 100) / 100,
      changePercent: Math.round(quote.changePercent * 100) / 100,
      volume: quote.volume,
      volumeRatio: Math.round(volRatio * 100) / 100,
      volumeLabel: volLabel,
      open: quote.regularMarketOpen,
      high: quote.regularMarketDayHigh,
      low: quote.regularMarketDayLow,
      prevClose: Math.round(prevClose * 100) / 100,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      shortName: quote.shortName,
      gapPercent: Math.round(gapPct * 100) / 100,
    },
    globalConditions: {
      vix: Math.round(vix * 100) / 100,
      dxy: Math.round(dxy * 100) / 100,
      tnx: Math.round(tnx * 100) / 100,
      oil: Math.round(oil * 100) / 100,
      esFuturesChange: Math.round(esChg * 100) / 100,
      nqFuturesChange: Math.round(nqChg * 100) / 100,
      riskEnvironment: riskEnv,
      riskLabel: riskEnv === 'risk-on' ? 'RISK ON' : riskEnv === 'risk-off' ? 'RISK OFF' : 'NEUTRAL',
      vixLabel: vix > 25 ? 'FEAR' : vix < 15 ? 'GREED' : 'NEUTRAL',
      dxyStrength: dxy > 104 ? 'STRONG (bearish equity)' : dxy < 100 ? 'WEAK (bullish equity)' : 'MODERATE',
      yieldPressure: tnx > 4.5 ? 'HIGH (bearish)' : tnx < 4.0 ? 'LOW (bullish)' : 'MODERATE',
      futuresNarrative: esChg > 0.5
        ? `ES +${esChg.toFixed(2)}% / NQ +${nqChg.toFixed(2)}% overnight — gap-up probability elevated. Watch for liquidity sweep above overnight highs before directional move.`
        : esChg < -0.5
          ? `ES ${esChg.toFixed(2)}% / NQ ${nqChg.toFixed(2)}% overnight — risk-off sentiment. Monitor for stop hunts below overnight lows before potential recovery.`
          : `ES ${esChg >= 0 ? '+' : ''}${esChg.toFixed(2)}% / NQ ${nqChg >= 0 ? '+' : ''}${nqChg.toFixed(2)}% — flat overnight. First 30 minutes of RTH will set the intraday tone.`,
    },
    indicators: {
      rsi: rsi ? Math.round(rsi * 10) / 10 : null,
      atr: atr ? Math.round(atr * 100) / 100 : null,
      ma20: ma20 ? Math.round(ma20 * 100) / 100 : null,
      ma50: ma50 ? Math.round(ma50 * 100) / 100 : null,
      trend,
      trendStrength: Math.round(trendStrength),
    },
    structure: {
      trend, intradayTrend,
      rsi: rsi ? Math.round(rsi * 10) / 10 : null,
      rsiLabel: rsiVal > 70 ? 'OVERBOUGHT' : rsiVal < 30 ? 'OVERSOLD' : rsiVal > 60 ? 'BULLISH MOMENTUM' : rsiVal < 40 ? 'BEARISH MOMENTUM' : 'NEUTRAL',
      from52High: Math.round(from52Hi * 10) / 10,
      from52Low: Math.round(from52Lo * 10) / 10,
      rangePosition: Math.round(rangePct),
      zone: rangePct > 80 ? 'PREMIUM (near highs)' : rangePct < 20 ? 'DISCOUNT (near lows)' : 'MID-RANGE',
      keyLevels: {
        support1: Math.round(support * 100) / 100,
        support2: Math.round((support - atrVal * 0.8) * 100) / 100,
        resistance1: Math.round(resistance * 100) / 100,
        resistance2: Math.round((resistance + atrVal * 0.8) * 100) / 100,
        dayHigh: quote.regularMarketDayHigh,
        dayLow: quote.regularMarketDayLow,
        vwapEstimate: Math.round(vwapEst * 100) / 100,
      },
      mtf: {
        monthly: trend === 'bullish' ? 'Bullish — higher highs, higher lows intact' : trend === 'bearish' ? 'Bearish — lower highs, lower lows pattern' : 'Neutral — consolidation, no clear monthly trend',
        weekly: trendStrength > 50 ? 'Bullish — strong momentum, buyers defending structure' : trendStrength > 25 ? 'Mixed — trend weakening, watch for CHoCH' : 'Bearish — sellers in control below key MAs',
        daily: `${trend === 'bullish' ? 'Uptrend' : trend === 'bearish' ? 'Downtrend' : 'Sideways'} — RSI ${rsiVal.toFixed(0)}, ATR ${atrVal.toFixed(2)}, trend strength ${Math.round(trendStrength)}%`,
        h4: intradayTrend === 'bullish' ? 'Bullish 4H — buyers active, higher lows forming' : intradayTrend === 'bearish' ? 'Bearish 4H — sellers pressing, lower highs forming' : 'Neutral 4H — range-bound, await structural break',
        h1: `1H momentum is ${intradayTrend} — ${intradayTrend !== 'neutral' ? 'aligns with' : 'diverges from'} daily bias`,
        m15: gapPct > 0.5 ? '15M showing gap-up impulse — watch for first pullback entry signal' : gapPct < -0.5 ? '15M showing gap-down pressure — watch for exhaustion wick at support' : '15M in price discovery — wait for first 30-min range formation',
      },
    },
    psychology: {
      narrative: psychologyNarrative(gapPct, rsiVal, quote.changePercent, from52Hi, vix),
      trappedTrader: trappedTraderAnalysis(gapPct, rsiVal, trend, from52Hi),
      fearGreedTone: rsiVal > 68 ? 'GREED' : rsiVal < 32 ? 'FEAR' : 'NEUTRAL',
      fomoRisk: gapPct > 0.5 && rsiVal > 60 ? 'HIGH' : 'MODERATE',
      panicRisk: gapPct < -0.5 && rsiVal < 40 ? 'HIGH' : 'MODERATE',
      squeezeRisk: rsiVal < 35 && quote.changePercent < -0.5 ? 'HIGH' : 'MODERATE',
      capitulationRisk: trend === 'bearish' && rsiVal < 25 ? 'HIGH' : 'LOW',
    },
    openingScenarios: openingScenarios(gapPct, rsiVal, vix, trend),
    powerHour: powerHourAnalysis(quote.changePercent, rsiVal, vix, trend),
    tradePlan: tradePlan(price, atrVal, support, resistance, quote.regularMarketDayHigh, quote.regularMarketDayLow, ma20, tradingStyle),
    optionsSetup: optionsSetup(price, atrVal, rsiVal, timeframe),
    verdict: finalVerdict(bias, confidence, trend, rsiVal, gapPct, from52Hi, vix, quote.changePercent, tradingStyle),
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ticker       = String(body.ticker ?? 'SPY').toUpperCase().trim();
    const timeframe    = String(body.timeframe ?? 'intraday');
    const tradingStyle = String(body.tradingStyle ?? 'day trade');
    const accountSize  = body.accountSize ? Number(body.accountSize) : null;
    const riskTol      = String(body.riskTolerance ?? 'medium');

    const [quoteR, candlesR, intradayR, vixR, dxyR, tnxR, oilR, esR, nqR] = await Promise.allSettled([
      fetchYahooQuote(ticker),
      fetchYahooCandles(ticker, '3mo', '1d'),
      fetchYahooCandles(ticker, '1d', '15m'),
      fetchYahooQuote('^VIX'),
      fetchYahooQuote('DX-Y.NYB'),
      fetchYahooQuote('^TNX'),
      fetchYahooQuote('CL=F'),
      fetchYahooQuote('ES=F'),
      fetchYahooQuote('NQ=F'),
    ]);

    if (quoteR.status === 'rejected') {
      return NextResponse.json({ error: `Unable to fetch data for ${ticker}. Verify the ticker symbol and try again.` }, { status: 404 });
    }

    const quote          = quoteR.value;
    const candles        = candlesR.status === 'fulfilled' ? (candlesR.value.candles as CandleData[]) : [];
    const intradayCandles = intradayR.status === 'fulfilled' ? (intradayR.value.candles as CandleData[]) : [];

    const globalCtx = {
      vix:      vixR.status === 'fulfilled' ? vixR.value.price : 18,
      dxy:      dxyR.status === 'fulfilled' ? dxyR.value.price : 103,
      tnx:      tnxR.status === 'fulfilled' ? tnxR.value.price : 4.3,
      oil:      oilR.status === 'fulfilled' ? oilR.value.price : 80,
      esChange: esR.status === 'fulfilled' ? esR.value.changePercent : 0,
      nqChange: nqR.status === 'fulfilled' ? nqR.value.changePercent : 0,
    };

    const analysis = buildAnalysis(quote, candles, intradayCandles, globalCtx, ticker, timeframe, tradingStyle);

    return NextResponse.json({ success: true, analysis, accountSize, riskTolerance: riskTol }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Analysis failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
