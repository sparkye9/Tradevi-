// Options analysis and Greeks estimation
import type { OptionContract } from './types';

// Black-Scholes approximation for delta
export function estimateDelta(
  stockPrice: number,
  strike: number,
  dte: number,
  iv: number,
  type: 'call' | 'put'
): number {
  if (dte <= 0 || iv <= 0) return type === 'call' ? (stockPrice > strike ? 1 : 0) : (stockPrice < strike ? -1 : 0);

  const t = dte / 365;
  const moneyness = Math.log(stockPrice / strike) / (iv * Math.sqrt(t));
  const normalCDF = (x: number) => {
    const a = 0.2316419;
    const b1 = 0.319381530, b2 = -0.356563782, b3 = 1.781477937, b4 = -1.821255978, b5 = 1.330274429;
    const t2 = 1 / (1 + a * Math.abs(x));
    const poly = ((((b5 * t2 + b4) * t2 + b3) * t2 + b2) * t2 + b1) * t2;
    const result = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x) * poly;
    return x >= 0 ? result : 1 - result;
  };

  const d1 = moneyness + 0.5 * iv * Math.sqrt(t);
  return type === 'call' ? normalCDF(d1) : normalCDF(d1) - 1;
}

// Estimate theta per day
export function estimateTheta(
  ask: number,
  iv: number,
  dte: number,
  delta: number
): number {
  if (dte <= 0) return -ask;
  const absDelta = Math.abs(delta);
  const baseDecay = (ask * 0.5) / Math.max(dte, 1);
  const accelerationFactor = dte <= 7 ? 1.5 : dte <= 14 ? 1.2 : 1.0;
  return -(baseDecay * accelerationFactor * (1 + (1 - absDelta) * 0.3));
}

// Estimate breakeven for buyer
export function calcBreakeven(strike: number, premium: number, type: 'call' | 'put'): number {
  return type === 'call' ? strike + premium : strike - premium;
}

// Estimate target price for 100% gain scenario
export function estimateTargetForDoubling(
  strike: number,
  ask: number,
  stockPrice: number,
  iv: number,
  dte: number,
  type: 'call' | 'put'
): number {
  // Target: option doubles in value, need stock to move enough
  const targetOptionValue = ask * 2;
  if (type === 'call') return strike + targetOptionValue + ask * 0.1;
  return strike - targetOptionValue - ask * 0.1;
}

// Estimate gain % if stock reaches target (1.5x ATR move)
export function estimateGainPct(
  strike: number,
  ask: number,
  targetStockPrice: number,
  dte: number,
  iv: number,
  type: 'call' | 'put'
): number {
  if (ask <= 0) return 0;
  const intrinsicAtTarget = Math.max(0, type === 'call' ? targetStockPrice - strike : strike - targetStockPrice);
  const remainingDTE = Math.max(0, dte - 2);
  const timeValueAtTarget = iv * targetStockPrice * Math.sqrt(remainingDTE / 365) * 0.15;
  const estimatedValue = intrinsicAtTarget + timeValueAtTarget;
  return ((estimatedValue - ask) / ask) * 100;
}

// Calculate spread as % of ask
export function calcSpreadPct(bid: number, ask: number): number {
  if (ask <= 0) return 100;
  return ((ask - bid) / ask) * 100;
}

// Risk label based on multiple factors
export function calcRiskLabel(
  dte: number,
  delta: number,
  spreadPct: number,
  iv: number
): 'Low' | 'Medium' | 'High' | 'Lottery' {
  const absDelta = Math.abs(delta);

  if (dte === 0 || (dte <= 1 && absDelta < 0.30)) return 'Lottery';
  if (dte <= 3 && absDelta < 0.20) return 'Lottery';
  if (absDelta < 0.15) return 'Lottery';

  if (dte <= 3 || spreadPct > 30 || iv > 1.5 || absDelta < 0.25) return 'High';
  if (dte <= 14 || spreadPct > 15 || iv > 0.80 || absDelta < 0.35) return 'Medium';
  return 'Low';
}

// Opportunity score 0-100
export function calcOpportunityScore(params: {
  trend: 'bullish' | 'bearish' | 'neutral';
  direction: 'call' | 'put';
  distanceToBreakout: number; // % away from trigger
  costPerContract: number;
  spreadPct: number;
  volume: number;
  openInterest: number;
  estimatedGainPct: number;
  riskLabel: string;
  dte: number;
  momentumRSI: number;
  atrRoom: number; // how many ATRs to target
  trendStrength: number;
}): number {
  let score = 0;

  // Trend alignment (0-20)
  const trendAligned =
    (params.direction === 'call' && params.trend === 'bullish') ||
    (params.direction === 'put' && params.trend === 'bearish');
  score += trendAligned ? 20 : params.trend === 'neutral' ? 8 : 0;

  // Breakout proximity (0-15) — closer to trigger = higher score
  const proximity = Math.max(0, 15 - params.distanceToBreakout * 150);
  score += proximity;

  // Affordability (0-10)
  if (params.costPerContract <= 25) score += 10;
  else if (params.costPerContract <= 50) score += 8;
  else if (params.costPerContract <= 100) score += 6;
  else if (params.costPerContract <= 200) score += 4;
  else score += 2;

  // Spread tightness (0-10)
  score += Math.max(0, 10 - params.spreadPct * 0.4);

  // Volume/OI liquidity (0-10)
  const liquidityScore = Math.min(10, (Math.log10(Math.max(1, params.volume)) - 1) * 3 + (Math.log10(Math.max(1, params.openInterest)) - 2) * 2);
  score += Math.max(0, liquidityScore);

  // Reward potential (0-15)
  if (params.estimatedGainPct >= 200) score += 15;
  else if (params.estimatedGainPct >= 100) score += 12;
  else if (params.estimatedGainPct >= 50) score += 8;
  else score += Math.max(0, params.estimatedGainPct * 0.06);

  // Risk level (0-10)
  const riskScores: Record<string, number> = { Low: 10, Medium: 7, High: 4, Lottery: 0 };
  score += riskScores[params.riskLabel] ?? 0;

  // DTE sweet spot (0-5)
  if (params.dte >= 7 && params.dte <= 30) score += 5;
  else if (params.dte >= 3 && params.dte <= 45) score += 3;
  else score += 1;

  // Momentum confirmation (0-8)
  const momentumAligned =
    (params.direction === 'call' && params.momentumRSI > 50 && params.momentumRSI < 75) ||
    (params.direction === 'put' && params.momentumRSI < 50 && params.momentumRSI > 25);
  score += momentumAligned ? 8 : 3;

  // ATR room (0-7)
  score += Math.min(7, params.atrRoom * 2.5);

  return Math.min(100, Math.max(0, Math.round(score)));
}

// Generate beginner explanation
export function genBeginnerExplanation(params: {
  symbol: string;
  direction: 'call' | 'put';
  strike: number;
  expiration: string;
  costPerContract: number;
  dte: number;
  riskLabel: string;
  estimatedGain: number;
  breakeven: number;
  trend: string;
}): string {
  const dirWord = params.direction === 'call' ? 'go up' : 'go down';
  const contractWord = params.direction === 'call' ? 'Call' : 'Put';
  const expiryShort = new Date(params.expiration).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `This trade bets that ${params.symbol} will ${dirWord} before ${expiryShort}. ` +
    `You buy one ${contractWord} option at the $${params.strike} strike for $${params.costPerContract.toFixed(0)} total. ` +
    `The stock needs to reach $${params.breakeven.toFixed(2)} for you to break even. ` +
    `If ${params.symbol} moves in your favor, you could gain ~${Math.round(params.estimatedGain)}%. ` +
    `Risk level: ${params.riskLabel}. ${params.dte <= 3 ? 'Warning: This expires very soon — high risk of total loss.' : ''}`;
}

// "Would I take this trade?" rating
export function rateTradeWouldTake(
  opportunityScore: number,
  riskLabel: string,
  trendAligned: boolean,
  spreadPct: number,
  dte: number
): 'yes' | 'watch' | 'skip' | 'lottery' {
  if (riskLabel === 'Lottery') return 'lottery';
  if (!trendAligned) return 'skip';
  if (spreadPct > 25) return 'skip';
  if (opportunityScore >= 65 && riskLabel !== 'High') return 'yes';
  if (opportunityScore >= 45) return 'watch';
  return 'skip';
}

// Full option analysis combining all above
export function analyzeOptionContract(
  raw: Partial<OptionContract> & {
    strike: number; expiration: string; type: 'call' | 'put';
    bid: number; ask: number; volume: number; openInterest: number;
    impliedVolatility: number; stockPrice: number; dte: number;
  }
): OptionContract {
  const { strike, expiration, type, bid, ask, volume, openInterest, impliedVolatility: iv, stockPrice, dte } = raw;
  const midPrice = (bid + ask) / 2;
  const delta = raw.delta ?? estimateDelta(stockPrice, strike, dte, iv, type);
  const theta = raw.theta ?? estimateTheta(ask, iv, dte, delta);
  const spreadPct = calcSpreadPct(bid, ask);
  const breakeven = calcBreakeven(strike, ask, type);
  const costPerContract = Math.round(ask * 100 * 100) / 100;
  const intrinsicNow = Math.max(0, type === 'call' ? stockPrice - strike : strike - stockPrice);
  const atrMove = iv * stockPrice * Math.sqrt(Math.max(dte, 1) / 365) * 1.5;
  const targetStockPrice = type === 'call' ? stockPrice + atrMove : stockPrice - atrMove;
  const estimatedGainPct = estimateGainPct(strike, ask, targetStockPrice, dte, iv, type);
  const riskLabel = calcRiskLabel(dte, delta, spreadPct, iv);
  const is100PctPossible = estimatedGainPct >= 100;
  const is100PctRealistic = is100PctPossible && Math.abs(delta) >= 0.25 && dte >= 3 && volume >= 100;

  return {
    contractSymbol: raw.contractSymbol ?? `${expiration.replace(/-/g,'')}${type[0].toUpperCase()}${strike}`,
    strike, expiration, dte, bid, ask,
    lastPrice: raw.lastPrice ?? midPrice,
    volume, openInterest, impliedVolatility: iv,
    delta: Math.round(delta * 1000) / 1000,
    theta: Math.round(theta * 1000) / 1000,
    type, inTheMoney: intrinsicNow > 0,
    spreadPercent: Math.round(spreadPct * 10) / 10,
    breakeven: Math.round(breakeven * 100) / 100,
    costPerContract,
    estimatedTargetPrice: Math.round(targetStockPrice * 100) / 100,
    estimatedGainPercent: Math.round(estimatedGainPct * 10) / 10,
    is100PctPossible, is100PctRealistic, riskLabel,
  };
}
