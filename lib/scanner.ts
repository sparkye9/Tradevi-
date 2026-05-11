// Opportunity scanner logic
import type { Opportunity, ScannerFilters, ScannerResult, StockAnalysis, OptionContract } from './types';
import { fetchQuote, fetchCandles, fetchOptionsChain } from './yahoo';
import { analyzeStock } from './indicators';
import { calcOpportunityScore, genBeginnerExplanation, rateTradeWouldTake } from './optionsAnalysis';
import { SCANNER_SYMBOLS } from './mock';

function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

// Get next few expiration dates relative to now
function getExpirationDates(minDTE: number, maxDTE: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let days = minDTE; days <= maxDTE; days++) {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    const day = d.getDay();
    // Only Fridays (5) and near-term for 0DTE (Mon-Fri)
    if (maxDTE <= 5 || day === 5) {
      dates.push(d.toISOString().split('T')[0]);
    }
  }
  // deduplicate
  return Array.from(new Set(dates)).slice(0, 4);
}

function scoreToSetupType(score: number, analysis: StockAnalysis, direction: 'call' | 'put'): string {
  const nearBreakout = Math.abs(analysis.price - analysis.breakoutTrigger) / analysis.price < 0.02;
  const nearBreakdown = Math.abs(analysis.price - analysis.breakdownTrigger) / analysis.price < 0.02;
  const atrMove = analysis.atr / analysis.price;

  if (direction === 'call') {
    if (nearBreakout) return 'Breakout Play';
    if (analysis.rsi < 45 && analysis.trend === 'bullish') return 'Oversold Bounce';
    if (analysis.price > analysis.ma20 && analysis.ma20 > analysis.ma50) return 'Trend Continuation';
    return 'Momentum Setup';
  } else {
    if (nearBreakdown) return 'Breakdown Play';
    if (analysis.rsi > 65 && analysis.trend === 'bearish') return 'Overbought Fade';
    if (analysis.price < analysis.ma20 && analysis.ma20 < analysis.ma50) return 'Downtrend Ride';
    return 'Reversal Setup';
  }
}

function generateEntryTrigger(symbol: string, analysis: StockAnalysis, direction: 'call' | 'put'): string {
  if (direction === 'call') {
    return `${symbol} breaks and holds above $${analysis.breakoutTrigger.toFixed(2)} with volume confirmation. ` +
      `RSI above 50 and price above VWAP preferred.`;
  }
  return `${symbol} breaks and holds below $${analysis.breakdownTrigger.toFixed(2)} with increasing sell volume. ` +
    `RSI below 50 and price below VWAP preferred.`;
}

async function scanSymbol(symbol: string, filters: ScannerFilters): Promise<Opportunity[]> {
  const opportunities: Opportunity[] = [];

  try {
    const [quote, candles] = await Promise.all([
      fetchQuote(symbol),
      fetchCandles(symbol, '3mo', '1d'),
    ]);

    const analysis = analyzeStock(candles, symbol);

    // Apply bias filter
    if (filters.biasFilter !== 'both') {
      const biasMismatch =
        (filters.biasFilter === 'bullish' && analysis.bias === 'bearish') ||
        (filters.biasFilter === 'bearish' && analysis.bias === 'bullish');
      if (biasMismatch) return [];
    }

    const directions: Array<'call' | 'put'> = [];
    if (filters.optionType === 'calls') directions.push('call');
    else if (filters.optionType === 'puts') directions.push('put');
    else {
      if (analysis.bias !== 'bearish') directions.push('call');
      if (analysis.bias !== 'bullish') directions.push('put');
    }

    // Determine expiration date range
    const minDTE = filters.tradeType === 'day' ? 0 : filters.tradeType === 'swing' ? 7 : filters.minDTE;
    const maxDTE = filters.tradeType === 'day' ? 3 : filters.tradeType === 'swing' ? 45 : filters.maxDTE;
    const expiryDates = getExpirationDates(minDTE, maxDTE);

    for (const dir of directions) {
      for (const expDate of expiryDates.slice(0, 2)) {
        try {
          const chain = await fetchOptionsChain(symbol, expDate);
          const contracts = dir === 'call' ? chain.calls : chain.puts;

          for (const contract of contracts) {
            if (contract.costPerContract > filters.maxPremium) continue;
            if (contract.volume < filters.minVolume) continue;
            if (contract.openInterest < filters.minOpenInterest) continue;
            if (Math.abs(contract.delta) < filters.minDelta) continue;
            if (Math.abs(contract.delta) > filters.maxDelta) continue;
            if (contract.dte < minDTE || contract.dte > maxDTE) continue;
            if (!filters.includeLottery && contract.riskLabel === 'Lottery') continue;

            const trendAligned =
              (dir === 'call' && analysis.bias !== 'bearish') ||
              (dir === 'put' && analysis.bias !== 'bullish');

            const distanceToBreakout = dir === 'call'
              ? (analysis.breakoutTrigger - analysis.price) / analysis.price
              : (analysis.price - analysis.breakdownTrigger) / analysis.price;

            const atrRoom = analysis.atr > 0
              ? Math.abs(contract.estimatedTargetPrice - analysis.price) / analysis.atr
              : 1;

            const oppScore = calcOpportunityScore({
              trend: analysis.trend,
              direction: dir,
              distanceToBreakout: Math.abs(distanceToBreakout),
              costPerContract: contract.costPerContract,
              spreadPct: contract.spreadPercent,
              volume: contract.volume,
              openInterest: contract.openInterest,
              estimatedGainPct: contract.estimatedGainPercent,
              riskLabel: contract.riskLabel,
              dte: contract.dte,
              momentumRSI: analysis.rsi,
              atrRoom,
              trendStrength: analysis.trendStrength,
            });

            if (oppScore < filters.minOpportunityScore) continue;

            const target1 = dir === 'call'
              ? analysis.resistance
              : analysis.support;
            const target2 = dir === 'call'
              ? analysis.resistance + analysis.atr
              : analysis.support - analysis.atr;

            const riskScore = 100 - oppScore;
            const wouldTake = rateTradeWouldTake(oppScore, contract.riskLabel, trendAligned, contract.spreadPercent, contract.dte);
            const setupType = scoreToSetupType(oppScore, analysis, dir);
            const entryTrigger = generateEntryTrigger(symbol, analysis, dir);
            const beginnerExplanation = genBeginnerExplanation({
              symbol,
              direction: dir,
              strike: contract.strike,
              expiration: contract.expiration,
              costPerContract: contract.costPerContract,
              dte: contract.dte,
              riskLabel: contract.riskLabel,
              estimatedGain: contract.estimatedGainPercent,
              breakeven: contract.breakeven,
              trend: analysis.trend,
            });

            opportunities.push({
              id: generateId(),
              symbol,
              direction: dir === 'call' ? 'bullish' : 'bearish',
              setupType,
              contract,
              stockAnalysis: analysis,
              entryTrigger,
              stopInvalidation: dir === 'call' ? analysis.breakdownTrigger : analysis.breakoutTrigger,
              target1: Math.round(target1 * 100) / 100,
              target2: Math.round(target2 * 100) / 100,
              estimatedGainPercent: contract.estimatedGainPercent,
              costPerContract: contract.costPerContract,
              riskScore,
              opportunityScore: oppScore,
              beginnerExplanation,
              wouldTake,
              scannedAt: new Date().toISOString(),
            });
          }
        } catch { /* skip this expiry */ }
      }
    }
  } catch { /* skip this symbol */ }

  return opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 5);
}

export async function runScanner(filters: Partial<ScannerFilters> = {}): Promise<ScannerResult> {
  const defaults: ScannerFilters = {
    maxPremium: 100,
    optionType: 'both',
    tradeType: 'both',
    minVolume: 10,
    minOpenInterest: 50,
    minOpportunityScore: 40,
    minDelta: 0.15,
    maxDelta: 0.70,
    minDTE: 0,
    maxDTE: 45,
    includeLottery: false,
    biasFilter: 'both',
    symbols: SCANNER_SYMBOLS,
  };

  const mergedFilters: ScannerFilters = { ...defaults, ...filters };
  const symbols = mergedFilters.symbols.slice(0, 16);

  const results = await Promise.allSettled(symbols.map(sym => scanSymbol(sym, mergedFilters)));

  let allOpportunities: Opportunity[] = [];
  let totalContracts = 0;
  results.forEach(r => {
    if (r.status === 'fulfilled') {
      allOpportunities = allOpportunities.concat(r.value);
      totalContracts += r.value.length * 5;
    }
  });

  allOpportunities.sort((a, b) => b.opportunityScore - a.opportunityScore);

  return {
    opportunities: allOpportunities.slice(0, 50),
    scannedAt: new Date().toISOString(),
    symbolsScanned: symbols.length,
    totalContractsAnalyzed: totalContracts,
    filters: mergedFilters,
  };
}
