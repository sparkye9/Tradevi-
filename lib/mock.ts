// Mock fallback data when Yahoo Finance is unavailable
import type { StockQuote, CandleData, OptionContract, StockAnalysis, NewsItem } from './types';

export const SCANNER_SYMBOLS = [
  'SPY', 'QQQ', 'IWM', 'TSLA', 'NVDA', 'AAPL', 'AMD',
  'META', 'MSFT', 'F', 'SQQQ', 'TQQQ', 'SOFI', 'PLTR', 'USO', 'XLE'
];

export const MOCK_QUOTES: Record<string, StockQuote> = {
  SPY: { symbol: 'SPY', price: 534.20, change: 2.15, changePercent: 0.40, volume: 65000000, avgVolume: 55000000, fiftyTwoWeekHigh: 560.00, fiftyTwoWeekLow: 420.00, regularMarketOpen: 532.00, regularMarketDayHigh: 535.50, regularMarketDayLow: 531.20, shortName: 'SPDR S&P 500 ETF' },
  QQQ: { symbol: 'QQQ', price: 456.80, change: 3.20, changePercent: 0.71, volume: 42000000, avgVolume: 38000000, fiftyTwoWeekHigh: 490.00, fiftyTwoWeekLow: 340.00, regularMarketOpen: 453.60, regularMarketDayHigh: 458.00, regularMarketDayLow: 452.10, shortName: 'Invesco QQQ Trust' },
  IWM: { symbol: 'IWM', price: 198.45, change: -0.85, changePercent: -0.43, volume: 28000000, avgVolume: 25000000, fiftyTwoWeekHigh: 225.00, fiftyTwoWeekLow: 165.00, regularMarketOpen: 199.30, regularMarketDayHigh: 200.10, regularMarketDayLow: 197.80, shortName: 'iShares Russell 2000' },
  TSLA: { symbol: 'TSLA', price: 248.50, change: 5.80, changePercent: 2.39, volume: 95000000, avgVolume: 85000000, fiftyTwoWeekHigh: 300.00, fiftyTwoWeekLow: 138.00, regularMarketOpen: 242.70, regularMarketDayHigh: 250.20, regularMarketDayLow: 241.00, shortName: 'Tesla Inc' },
  NVDA: { symbol: 'NVDA', price: 892.30, change: 12.50, changePercent: 1.42, volume: 45000000, avgVolume: 40000000, fiftyTwoWeekHigh: 974.00, fiftyTwoWeekLow: 392.00, regularMarketOpen: 879.80, regularMarketDayHigh: 895.00, regularMarketDayLow: 877.00, shortName: 'NVIDIA Corp' },
  AAPL: { symbol: 'AAPL', price: 189.20, change: 1.30, changePercent: 0.69, volume: 55000000, avgVolume: 50000000, fiftyTwoWeekHigh: 198.00, fiftyTwoWeekLow: 164.00, regularMarketOpen: 187.90, regularMarketDayHigh: 190.00, regularMarketDayLow: 187.50, shortName: 'Apple Inc' },
  AMD: { symbol: 'AMD', price: 168.75, change: -2.45, changePercent: -1.43, volume: 38000000, avgVolume: 35000000, fiftyTwoWeekHigh: 210.00, fiftyTwoWeekLow: 93.00, regularMarketOpen: 171.20, regularMarketDayHigh: 172.00, regularMarketDayLow: 167.30, shortName: 'Advanced Micro Devices' },
  PLTR: { symbol: 'PLTR', price: 24.85, change: 0.65, changePercent: 2.69, volume: 52000000, avgVolume: 45000000, fiftyTwoWeekHigh: 28.00, fiftyTwoWeekLow: 12.50, regularMarketOpen: 24.20, regularMarketDayHigh: 25.10, regularMarketDayLow: 24.00, shortName: 'Palantir Technologies' },
};

export function generateMockCandles(basePrice: number, days = 90): CandleData[] {
  const candles: CandleData[] = [];
  let price = basePrice * 0.85;
  const now = Date.now();
  const msPerDay = 86400000;

  for (let i = days; i >= 0; i--) {
    const time = now - i * msPerDay;
    const volatility = basePrice * 0.015;
    const open = price + (Math.random() - 0.5) * volatility;
    const change = (Math.random() - 0.48) * volatility;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    const volume = Math.floor(50000000 * (0.7 + Math.random() * 0.6));
    candles.push({ time: Math.floor(time / 1000), open, high, low, close, volume });
    price = close;
  }
  return candles;
}

export function generateMockOptionChain(
  symbol: string,
  stockPrice: number,
  expiration: string,
  type: 'call' | 'put'
): OptionContract[] {
  const contracts: OptionContract[] = [];
  const expiryDate = new Date(expiration);
  const now = new Date();
  const dte = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000));
  const iv = 0.30 + Math.random() * 0.40;

  const strikeRange = type === 'call'
    ? [0.90, 0.93, 0.95, 0.97, 0.98, 1.00, 1.02, 1.03, 1.05, 1.07, 1.10]
    : [0.90, 0.93, 0.95, 0.97, 0.98, 1.00, 1.02, 1.03, 1.05, 1.07, 1.10];

  for (const mult of strikeRange) {
    const strike = Math.round(stockPrice * mult * 2) / 2;
    const moneyness = type === 'call' ? stockPrice - strike : strike - stockPrice;
    const inTheMoney = moneyness > 0;

    let delta: number;
    if (type === 'call') {
      delta = inTheMoney ? 0.5 + (moneyness / stockPrice) * 2 : 0.5 - Math.abs(moneyness / stockPrice) * 2;
      delta = Math.max(0.01, Math.min(0.99, delta));
    } else {
      delta = inTheMoney ? -(0.5 + (moneyness / stockPrice) * 2) : -(0.5 - Math.abs(moneyness / stockPrice) * 2);
      delta = Math.max(-0.99, Math.min(-0.01, delta));
    }

    const absDelta = Math.abs(delta);
    const intrinsic = Math.max(0, moneyness);
    const timeValue = stockPrice * iv * Math.sqrt(dte / 365) * absDelta * 0.4;
    const midPrice = intrinsic + timeValue;
    const spread = Math.max(0.01, midPrice * 0.04 + 0.02);
    const bid = Math.max(0.01, midPrice - spread / 2);
    const ask = midPrice + spread / 2;
    const theta = -(ask * 0.05 / dte) * (1 + (1 - absDelta) * 0.5);
    const volume = Math.floor(Math.random() * 5000 * absDelta + 100);
    const openInterest = Math.floor(volume * (3 + Math.random() * 7));
    const spreadPct = ((ask - bid) / ask) * 100;
    const costPerContract = Math.round(ask * 100 * 100) / 100;
    const breakeven = type === 'call' ? strike + ask : strike - ask;
    const targetMove = iv * stockPrice * Math.sqrt(dte / 365) * 1.5;
    const targetPrice = type === 'call' ? stockPrice + targetMove : stockPrice - targetMove;
    const targetOptionValue = Math.max(0, type === 'call' ? targetPrice - strike : strike - targetPrice);
    const estimatedGain = ask > 0 ? ((targetOptionValue - ask) / ask) * 100 : 0;
    const is100PctPossible = estimatedGain >= 100;
    const is100PctRealistic = is100PctPossible && absDelta >= 0.30 && dte >= 3 && volume >= 200;
    let riskLabel: 'Low' | 'Medium' | 'High' | 'Lottery';
    if (dte <= 1 || absDelta < 0.15) riskLabel = 'Lottery';
    else if (absDelta < 0.30 || dte <= 3) riskLabel = 'High';
    else if (absDelta < 0.45) riskLabel = 'Medium';
    else riskLabel = 'Low';

    contracts.push({
      contractSymbol: `${symbol}${expiration.replace(/-/g, '')}${type === 'call' ? 'C' : 'P'}${String(strike * 1000).padStart(8, '0')}`,
      strike, expiration, dte, bid: Math.round(bid * 100) / 100, ask: Math.round(ask * 100) / 100,
      lastPrice: Math.round(midPrice * 100) / 100, volume, openInterest, impliedVolatility: iv,
      delta: Math.round(delta * 100) / 100, theta: Math.round(theta * 1000) / 1000,
      type, inTheMoney, spreadPercent: Math.round(spreadPct * 10) / 10,
      breakeven: Math.round(breakeven * 100) / 100, costPerContract: Math.round(costPerContract * 100) / 100,
      estimatedTargetPrice: Math.round(targetPrice * 100) / 100,
      estimatedGainPercent: Math.round(estimatedGain * 10) / 10,
      is100PctPossible, is100PctRealistic, riskLabel,
    });
  }
  return contracts;
}

export const MOCK_NEWS: Record<string, NewsItem[]> = {
  SPY: [
    { title: 'S&P 500 hits new milestone as Fed signals rate patience', link: '#', publisher: 'MarketWatch', publishedAt: new Date(Date.now() - 3600000).toISOString() },
    { title: 'Options market pricing in 1.2% move for SPY this week', link: '#', publisher: 'Options Insider', publishedAt: new Date(Date.now() - 7200000).toISOString() },
  ],
  TSLA: [
    { title: 'Tesla deliveries beat estimates, stock jumps premarket', link: '#', publisher: 'Reuters', publishedAt: new Date(Date.now() - 1800000).toISOString() },
    { title: 'TSLA call options see unusual activity ahead of earnings', link: '#', publisher: 'Benzinga', publishedAt: new Date(Date.now() - 5400000).toISOString() },
  ],
  NVDA: [
    { title: 'NVIDIA raises guidance on AI chip demand surge', link: '#', publisher: 'Bloomberg', publishedAt: new Date(Date.now() - 900000).toISOString() },
    { title: 'Data center revenue drives NVDA to record quarterly results', link: '#', publisher: 'CNBC', publishedAt: new Date(Date.now() - 4500000).toISOString() },
  ],
};
