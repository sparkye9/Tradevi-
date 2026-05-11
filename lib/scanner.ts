// Opportunity scanner — uses Yahoo Finance options chain as the data source
import type { Opportunity, ScannerFilters, ScannerResult, StockAnalysis } from './types';
import { fetchYahooOptionsChain } from './yahooFinance';
import { fetchYahooCandles } from './yahooChart';
import { analyzeStock } from './indicators';
import { calcOpportunityScore, genBeginnerExplanation, rateTradeWouldTake } from './optionsAnalysis';
import { SCANNER_SYMBOLS } from './mock';

function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

function scoreToSetupType(score: number, analysis: StockAnalysis, direction: 'call' | 'put'): string {
  const nearBreakout  = Math.abs(analysis.price - analysis.breakoutTrigger)  / analysis.price < 0.02;
  const nearBreakdown = Math.abs(analysis.price - analysis.breakdownTrigger) / analysis.price < 0.02;

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

// Convert a YYYY-MM-DD expiry string to DTE (days to expiry from now)
function dateToDTE(dateStr: string): number {
  // Use market-close noon UTC to avoid timezone edge cases
  const expiryMs = new Date(dateStr).getTime() + 12 * 3600_000;
  return Math.ceil((expiryMs - Date.now()) / 86_400_000);
}

async function scanSymbol(symbol: string, filters: ScannerFilters): Promise<Opportunity[]> {
  const opportunities: Opportunity[] = [];

  try {
    // Determine DTE range from trade type
    const minDTE = filters.tradeType === 'day'   ? 0
                 : filters.tradeType === 'swing' ? 7
                 : filters.minDTE;
    const maxDTE = filters.tradeType === 'day'   ? 3
                 : filters.tradeType === 'swing' ? 45
                 : filters.maxDTE;

    // Fetch candles and Yahoo's real available expiry dates in parallel.
    // The no-date options call returns all expiration timestamps + first expiry's contracts.
    const [candleResult, baseChain] = await Promise.all([
      fetchYahooCandles(symbol, '3mo', '1d'),
      fetchYahooOptionsChain(symbol),           // no date → gets real expiry calendar
    ]);

    if (!candleResult.candles.length) return [];
    const analysis = analyzeStock(candleResult.candles, symbol);

    // Bias filter
    if (filters.biasFilter !== 'both') {
      const mismatch =
        (filters.biasFilter === 'bullish' && analysis.bias === 'bearish') ||
        (filters.biasFilter === 'bearish' && analysis.bias === 'bullish');
      if (mismatch) return [];
    }

    // Directions to scan
    const directions: Array<'call' | 'put'> = [];
    if      (filters.optionType === 'calls') directions.push('call');
    else if (filters.optionType === 'puts')  directions.push('put');
    else {
      if (analysis.bias !== 'bearish') directions.push('call');
      if (analysis.bias !== 'bullish') directions.push('put');
    }

    // Use Yahoo's ACTUAL expiry dates — filter by the DTE range, cap at 4 expiries
    const validDates = baseChain.expirationDates
      .filter(d => { const dte = dateToDTE(d); return dte >= minDTE && dte <= maxDTE; })
      .slice(0, 4);

    if (!validDates.length) return [];

    // Fetch all valid expiry chains in parallel
    const chainResults = await Promise.allSettled(
      validDates.map(date => fetchYahooOptionsChain(symbol, date)),
    );

    // Score every qualifying contract
    for (const dir of directions) {
      for (const settled of chainResults) {
        if (settled.status === 'rejected') continue;
        const chain     = settled.value;
        const contracts = dir === 'call' ? chain.calls : chain.puts;

        for (const contract of contracts) {
          // Hard filters
          if (contract.costPerContract > filters.maxPremium)     continue;
          if (contract.volume        < filters.minVolume)        continue;
          if (contract.openInterest  < filters.minOpenInterest)  continue;
          if (Math.abs(contract.delta) < filters.minDelta)       continue;
          if (Math.abs(contract.delta) > filters.maxDelta)       continue;
          if (contract.dte < minDTE || contract.dte > maxDTE)    continue;
          if (!filters.includeLottery && contract.riskLabel === 'Lottery') continue;

          const trendAligned =
            (dir === 'call' && analysis.bias !== 'bearish') ||
            (dir === 'put'  && analysis.bias !== 'bullish');

          const distanceToBreakout = dir === 'call'
            ? (analysis.breakoutTrigger  - analysis.price) / analysis.price
            : (analysis.price - analysis.breakdownTrigger) / analysis.price;

          const atrRoom = analysis.atr > 0
            ? Math.abs(contract.estimatedTargetPrice - analysis.price) / analysis.atr
            : 1;

          const oppScore = calcOpportunityScore({
            trend:             analysis.trend,
            direction:         dir,
            distanceToBreakout: Math.abs(distanceToBreakout),
            costPerContract:   contract.costPerContract,
            spreadPct:         contract.spreadPercent,
            volume:            contract.volume,
            openInterest:      contract.openInterest,
            estimatedGainPct:  contract.estimatedGainPercent,
            riskLabel:         contract.riskLabel,
            dte:               contract.dte,
            momentumRSI:       analysis.rsi,
            atrRoom,
            trendStrength:     analysis.trendStrength,
          });

          if (oppScore < filters.minOpportunityScore) continue;

          const target1 = dir === 'call' ? analysis.resistance : analysis.support;
          const target2 = dir === 'call'
            ? analysis.resistance + analysis.atr
            : analysis.support    - analysis.atr;

          opportunities.push({
            id:                 generateId(),
            symbol,
            direction:          dir === 'call' ? 'bullish' : 'bearish',
            setupType:          scoreToSetupType(oppScore, analysis, dir),
            contract,
            stockAnalysis:      analysis,
            entryTrigger:       generateEntryTrigger(symbol, analysis, dir),
            stopInvalidation:   dir === 'call' ? analysis.breakdownTrigger : analysis.breakoutTrigger,
            target1:            Math.round(target1 * 100) / 100,
            target2:            Math.round(target2 * 100) / 100,
            estimatedGainPercent: contract.estimatedGainPercent,
            costPerContract:    contract.costPerContract,
            riskScore:          100 - oppScore,
            opportunityScore:   oppScore,
            beginnerExplanation: genBeginnerExplanation({
              symbol,
              direction:        dir,
              strike:           contract.strike,
              expiration:       contract.expiration,
              costPerContract:  contract.costPerContract,
              dte:              contract.dte,
              riskLabel:        contract.riskLabel,
              estimatedGain:    contract.estimatedGainPercent,
              breakeven:        contract.breakeven,
              trend:            analysis.trend,
            }),
            wouldTake:          rateTradeWouldTake(
              oppScore, contract.riskLabel, trendAligned, contract.spreadPercent, contract.dte,
            ),
            scannedAt: new Date().toISOString(),
          });
        }
      }
    }
  } catch (err: unknown) {
    console.error(`[Scanner] ${symbol} failed:`, err instanceof Error ? err.message : err);
  }

  return opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 5);
}

export async function runScanner(filters: Partial<ScannerFilters> = {}): Promise<ScannerResult> {
  const defaults: ScannerFilters = {
    maxPremium:          200,
    optionType:          'both',
    tradeType:           'swing',
    minVolume:           1,      // low default — volume can be 0 outside trading hours
    minOpenInterest:     10,
    minOpportunityScore: 40,
    minDelta:            0.10,
    maxDelta:            0.80,
    minDTE:              7,
    maxDTE:              60,
    includeLottery:      false,
    biasFilter:          'both',
    symbols:             SCANNER_SYMBOLS,
  };

  const merged  = { ...defaults, ...filters };
  const symbols = merged.symbols.slice(0, 16);

  const results = await Promise.allSettled(
    symbols.map(sym => scanSymbol(sym, merged)),
  );

  let allOpportunities: Opportunity[] = [];
  let totalContracts = 0;

  results.forEach(r => {
    if (r.status === 'fulfilled') {
      allOpportunities = allOpportunities.concat(r.value);
      totalContracts  += r.value.length * 5;
    }
  });

  allOpportunities.sort((a, b) => b.opportunityScore - a.opportunityScore);

  return {
    opportunities:        allOpportunities.slice(0, 50),
    scannedAt:            new Date().toISOString(),
    symbolsScanned:       symbols.length,
    totalContractsAnalyzed: totalContracts,
    filters:              merged,
  };
}
