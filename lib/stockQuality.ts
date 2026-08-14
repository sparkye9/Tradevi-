import type { FinvizQuote } from './finviz';

export type StockVerdict = 'LOOK' | 'NO_TRADE';
export type StockSide = 'long' | 'short' | 'none';

export interface StockQuality {
  score: number;
  label: StockVerdict;
  side: StockSide;
  headline: string;
  reasons: string[];
}

const HONEST_GAPS = [
  'SMA alignment is not ICT structure. CHOCH, BOS, FVG, and VWAP are not computed here.',
  'No options flow and no GEX. Confirm the contract on your broker chain.',
  'Yahoo / Finviz tape is delayed. This is not a live feed.',
];

export const STOCK_HONEST_GAPS = HONEST_GAPS;

/**
 * Volume + SMA tape quality. A LOOK requires volume evidence and a side.
 * Weak RVOL, mixed SMAs, or no directional lean is a hard NO TRADE.
 */
export function stockQuality(q: FinvizQuote, rvolThreshold: number): StockQuality {
  const rvol = q.rvol ?? 0;
  const chg = q.changePercent ?? 0;
  const reasons: string[] = [];
  let score = 0;

  if (rvol >= rvolThreshold * 2) {
    score += 35;
    reasons.push(`RVOL ${rvol.toFixed(1)}x`);
  } else if (rvol >= rvolThreshold) {
    score += 20;
    reasons.push(`RVOL ${rvol.toFixed(1)}x meets threshold`);
  } else {
    reasons.push(rvol ? `RVOL ${rvol.toFixed(1)}x below ${rvolThreshold}` : 'RVOL unavailable');
  }

  if (q.unusualVolume) {
    score += 20;
    reasons.push('Unusual volume flag');
  }
  if (q.newHighDay) {
    score += 15;
    reasons.push('New day high');
  }

  const smaUp = q.sma50rel === 'above' && q.sma200rel === 'above';
  const smaDown = q.sma50rel === 'below' && q.sma200rel === 'below';
  if (smaUp) {
    score += 15;
    reasons.push('Above SMA 50 & 200 (moving averages, not structure)');
  } else if (smaDown) {
    score += 15;
    reasons.push('Below SMA 50 & 200 (moving averages, not structure)');
  }

  if (q.groupStrength === 'strong' && smaUp) {
    score += 10;
    reasons.push('Group strong');
  } else if (q.groupStrength === 'weak' && smaDown) {
    score += 10;
    reasons.push('Group weak');
  }

  let side: StockSide = 'none';
  if (smaUp && chg >= 0) side = 'long';
  else if (smaDown && chg < 0) side = 'short';
  else if (rvol >= rvolThreshold && chg >= 1) side = 'long';
  else if (rvol >= rvolThreshold && chg <= -1) side = 'short';

  const volumeOk = rvol >= rvolThreshold || q.unusualVolume === true;
  if (!volumeOk || side === 'none' || score < 40) {
    return {
      score: Math.min(score, 35),
      label: 'NO_TRADE',
      side: 'none',
      headline: 'NO TRADE — volume or direction is not enough',
      reasons,
    };
  }

  return {
    score: Math.min(100, score),
    label: 'LOOK',
    side,
    headline: side === 'long' ? 'LOOK LONG — confirm structure on TradingView' : 'LOOK SHORT — confirm structure on TradingView',
    reasons,
  };
}
