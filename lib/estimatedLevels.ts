/**
 * Percent-based placeholders from last price. Not ICT, VWAP, or structure.
 * Only call this for LOOK names.
 */
export function estimatedLevels(price: number, side: 'long' | 'short') {
  if (side === 'long') {
    return {
      entry: price,
      stop: +(price * 0.97).toFixed(2),
      t1: +(price * 1.05).toFixed(2),
      t2: +(price * 1.1).toFixed(2),
    };
  }
  return {
    entry: price,
    stop: +(price * 1.03).toFixed(2),
    t1: +(price * 0.95).toFixed(2),
    t2: +(price * 0.9).toFixed(2),
  };
}

export const LEVELS_DISCLAIMER =
  'Entry / stop / targets are percent estimates from last price — not structure. Confirm on TradingView.';
