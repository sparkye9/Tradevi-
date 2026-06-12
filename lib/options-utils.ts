// lib/options-utils.ts — Black-Scholes helpers for options pricing

/**
 * Cumulative distribution function for the standard normal distribution
 * Uses Abramowitz and Stegun approximation (accurate to ~7 decimal places)
 */
export function normalCDF(x: number): number {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  const erf = 1.0 - poly * Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * erf);
}

/** Standard normal probability density function */
function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Black-Scholes delta for a European put or call
 * @param S - current stock price
 * @param K - strike price
 * @param T_years - time to expiry in years
 * @param r - risk-free rate (e.g. 0.05)
 * @param sigma - implied volatility (annualized, e.g. 0.28)
 * @param isPut - true for put, false for call
 */
export function bsmDelta(
  S: number,
  K: number,
  T_years: number,
  r: number,
  sigma: number,
  isPut: boolean
): number {
  if (T_years <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    // Approximation at expiry
    if (isPut) return S < K ? -1 : 0;
    return S > K ? 1 : 0;
  }
  const sqrtT = Math.sqrt(T_years);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T_years) / (sigma * sqrtT);
  if (isPut) return normalCDF(d1) - 1;
  return normalCDF(d1);
}

/**
 * Black-Scholes gamma (same for put and call)
 */
export function bsmGamma(
  S: number,
  K: number,
  T_years: number,
  r: number,
  sigma: number
): number {
  if (T_years <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const sqrtT = Math.sqrt(T_years);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T_years) / (sigma * sqrtT);
  return normalPDF(d1) / (S * sigma * sqrtT);
}

/**
 * Bid-ask spread as a percentage of the ask price
 */
export function spreadPct(bid: number, ask: number): number {
  if (ask <= 0) return 0;
  return ((ask - bid) / ask) * 100;
}

/**
 * Days to expiry from a Unix timestamp in seconds
 */
export function daysToExpiry(expirationUnixSec: number): number {
  const nowMs = Date.now();
  const expMs = expirationUnixSec * 1000;
  const diffMs = expMs - nowMs;
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}
