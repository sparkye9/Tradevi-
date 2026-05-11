// Mock fallback data — used ONLY when Yahoo Finance is unreachable.
// Prices below are approximate mid-2025 values.
// NVDA reflects the 10-for-1 split effective June 2024.
// These are NOT real-time and will drift. When you see these, a red
// "DEMO DATA" banner appears in the app.
import type { StockQuote, CandleData, OptionContract, NewsItem } from './types';

export const SCANNER_SYMBOLS = [
  'SPY', 'QQQ', 'IWM', 'TSLA', 'NVDA', 'AAPL', 'AMD',
  'META', 'MSFT', 'F', 'SQQQ', 'TQQQ', 'SOFI', 'PLTR', 'USO', 'XLE'
];

// Approximate prices as of mid-2025. NVDA is post-10-for-1 split.
export const MOCK_QUOTES: Record<string, StockQuote> = {
  SPY:  { symbol: 'SPY',  price: 562.40, change: 0,  changePercent: 0,    volume: 65000000,  avgVolume: 55000000, fiftyTwoWeekHigh: 615.00, fiftyTwoWeekLow: 480.00, regularMarketOpen: 560.00, regularMarketDayHigh: 564.00, regularMarketDayLow: 558.00, shortName: 'SPDR S&P 500 ETF' },
  QQQ:  { symbol: 'QQQ',  price: 483.20, change: 0,  changePercent: 0,    volume: 42000000,  avgVolume: 38000000, fiftyTwoWeekHigh: 530.00, fiftyTwoWeekLow: 385.00, regularMarketOpen: 480.00, regularMarketDayHigh: 485.00, regularMarketDayLow: 479.00, shortName: 'Invesco QQQ Trust' },
  IWM:  { symbol: 'IWM',  price: 209.80, change: 0,  changePercent: 0,    volume: 28000000,  avgVolume: 25000000, fiftyTwoWeekHigh: 245.00, fiftyTwoWeekLow: 185.00, regularMarketOpen: 208.00, regularMarketDayHigh: 211.00, regularMarketDayLow: 207.00, shortName: 'iShares Russell 2000' },
  TSLA: { symbol: 'TSLA', price: 285.60, change: 0,  changePercent: 0,    volume: 95000000,  avgVolume: 85000000, fiftyTwoWeekHigh: 420.00, fiftyTwoWeekLow: 180.00, regularMarketOpen: 282.00, regularMarketDayHigh: 288.00, regularMarketDayLow: 280.00, shortName: 'Tesla Inc' },
  NVDA: { symbol: 'NVDA', price: 118.50, change: 0,  changePercent: 0,    volume: 300000000, avgVolume: 280000000, fiftyTwoWeekHigh: 153.00, fiftyTwoWeekLow:  75.00, regularMarketOpen: 116.00, regularMarketDayHigh: 120.00, regularMarketDayLow: 115.00, shortName: 'NVIDIA Corp (post-split)' },
  AAPL: { symbol: 'AAPL', price: 213.40, change: 0,  changePercent: 0,    volume: 55000000,  avgVolume: 50000000, fiftyTwoWeekHigh: 240.00, fiftyTwoWeekLow: 164.00, regularMarketOpen: 211.00, regularMarketDayHigh: 215.00, regularMarketDayLow: 210.00, shortName: 'Apple Inc' },
  AMD:  { symbol: 'AMD',  price: 162.30, change: 0,  changePercent: 0,    volume: 38000000,  avgVolume: 35000000, fiftyTwoWeekHigh: 225.00, fiftyTwoWeekLow: 120.00, regularMarketOpen: 160.00, regularMarketDayHigh: 164.00, regularMarketDayLow: 159.00, shortName: 'Advanced Micro Devices' },
  PLTR: { symbol: 'PLTR', price:  78.40, change: 0,  changePercent: 0,    volume: 52000000,  avgVolume: 45000000, fiftyTwoWeekHigh: 125.00, fiftyTwoWeekLow:  16.00, regularMarketOpen:  77.00, regularMarketDayHigh:  80.00, regularMarketDayLow:  76.00, shortName: 'Palantir Technologies' },
  META: { symbol: 'META', price: 572.80, change: 0,  changePercent: 0,    volume: 18000000,  avgVolume: 16000000, fiftyTwoWeekHigh: 740.00, fiftyTwoWeekLow: 400.00, regularMarketOpen: 568.00, regularMarketDayHigh: 577.00, regularMarketDayLow: 565.00, shortName: 'Meta Platforms' },
  MSFT: { symbol: 'MSFT', price: 435.60, change: 0,  changePercent: 0,    volume: 22000000,  avgVolume: 20000000, fiftyTwoWeekHigh: 468.00, fiftyTwoWeekLow: 360.00, regularMarketOpen: 432.00, regularMarketDayHigh: 438.00, regularMarketDayLow: 430.00, shortName: 'Microsoft Corp' },
  AMZN: { symbol: 'AMZN', price: 195.20, change: 0,  changePercent: 0,    volume: 35000000,  avgVolume: 32000000, fiftyTwoWeekHigh: 232.00, fiftyTwoWeekLow: 153.00, regularMarketOpen: 193.00, regularMarketDayHigh: 197.00, regularMarketDayLow: 192.00, shortName: 'Amazon.com Inc' },
};

export function generateMockCandles(basePrice: number, days = 90): CandleData[] {
  const candles: CandleData[] = [];
  let price = basePrice * 0.88;
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

  const strikeRange = [0.90, 0.93, 0.95, 0.97, 0.98, 1.00, 1.02, 1.03, 1.05, 1.07, 1.10];

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
    { title: 'S&P 500 consolidates near highs ahead of Fed decision', link: '#', publisher: 'MarketWatch', publishedAt: new Date(Date.now() - 3600000).toISOString() },
    { title: 'Options market pricing in elevated volatility this week', link: '#', publisher: 'Options Insider', publishedAt: new Date(Date.now() - 7200000).toISOString() },
  ],
  TSLA: [
    { title: 'Tesla updates guidance on vehicle production targets', link: '#', publisher: 'Reuters', publishedAt: new Date(Date.now() - 1800000).toISOString() },
    { title: 'TSLA options see unusual activity ahead of earnings', link: '#', publisher: 'Benzinga', publishedAt: new Date(Date.now() - 5400000).toISOString() },
  ],
  NVDA: [
    { title: 'NVIDIA continues to dominate AI chip market share', link: '#', publisher: 'Bloomberg', publishedAt: new Date(Date.now() - 900000).toISOString() },
    { title: 'Data center revenue drives NVDA to record results', link: '#', publisher: 'CNBC', publishedAt: new Date(Date.now() - 4500000).toISOString() },
  ],
};
