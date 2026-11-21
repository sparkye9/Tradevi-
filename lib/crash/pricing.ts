/**
 * Option pricing for Crash Intelligence scenarios.
 *
 *  - Black-Scholes-Merton (continuous dividend yield) for European values and
 *    Greeks, used as a cross-check and for fast IV seeds.
 *  - Cox-Ross-Rubinstein binomial tree with early exercise, used for every
 *    scenario value because SPY / QQQ / IWM / DIA and US single-stock options
 *    are American-style.
 *
 * Model limits (shown in the UI): dividends are a continuous yield, not
 * discrete cash dividends; volatility is constant over the option's life;
 * the tree has a small discretisation error (~0.1–0.5% at 200 steps); none
 * of this models liquidity, so outputs are estimates, never executable prices.
 */

export type OptionType = 'put' | 'call';

export interface PricingInput {
  type: OptionType;
  /** Underlying price. */
  S: number;
  /** Strike. */
  K: number;
  /** Time to expiry in years. */
  T: number;
  /** Continuously compounded risk-free rate, decimal (0.045 = 4.5%). */
  r: number;
  /** Continuous dividend yield, decimal. */
  q: number;
  /** Volatility, decimal (0.20 = 20%). */
  sigma: number;
}

/** Abramowitz-Stegun 7.1.26 based normal CDF, |error| < 7.5e-8. */
export function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function intrinsic(type: OptionType, S: number, K: number): number {
  return type === 'put' ? Math.max(K - S, 0) : Math.max(S - K, 0);
}

function valid(p: PricingInput): boolean {
  return [p.S, p.K, p.T, p.r, p.q, p.sigma].every(Number.isFinite) && p.S > 0 && p.K > 0;
}

export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  /** Per calendar day, per share. */
  theta: number;
  /** Per 1 volatility point (0.01), per share. */
  vega: number;
}

/** European Black-Scholes-Merton price and Greeks. */
export function blackScholes(p: PricingInput): Greeks {
  if (!valid(p)) return { price: NaN, delta: NaN, gamma: NaN, theta: NaN, vega: NaN };
  const { type, S, K, T, r, q, sigma } = p;
  if (T <= 0 || sigma <= 0) {
    const price = intrinsic(type, S, K);
    const itm = price > 0;
    return { price, delta: itm ? (type === 'put' ? -1 : 1) : 0, gamma: 0, theta: 0, vega: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const dfq = Math.exp(-q * T);
  const dfr = Math.exp(-r * T);
  let price: number;
  let delta: number;
  let thetaYear: number;
  const common = (-S * dfq * normPdf(d1) * sigma) / (2 * sqrtT);
  if (type === 'call') {
    price = S * dfq * normCdf(d1) - K * dfr * normCdf(d2);
    delta = dfq * normCdf(d1);
    thetaYear = common - r * K * dfr * normCdf(d2) + q * S * dfq * normCdf(d1);
  } else {
    price = K * dfr * normCdf(-d2) - S * dfq * normCdf(-d1);
    delta = -dfq * normCdf(-d1);
    thetaYear = common + r * K * dfr * normCdf(-d2) - q * S * dfq * normCdf(-d1);
  }
  const gamma = (dfq * normPdf(d1)) / (S * sigma * sqrtT);
  const vega = (S * dfq * normPdf(d1) * sqrtT) / 100;
  return { price, delta, gamma, theta: thetaYear / 365, vega };
}

/** American option value from a CRR binomial tree with early exercise. */
export function americanPrice(p: PricingInput, steps = 200): number {
  if (!valid(p)) return NaN;
  const { type, S, K, T, r, q, sigma } = p;
  if (T <= 0 || sigma <= 0) return intrinsic(type, S, K);
  const n = Math.max(10, Math.floor(steps));
  const dt = T / n;
  const u = Math.exp(sigma * Math.sqrt(dt));
  const d = 1 / u;
  const disc = Math.exp(-r * dt);
  const pu = (Math.exp((r - q) * dt) - d) / (u - d);
  if (!(pu > 0 && pu < 1)) return blackScholes(p).price; // degenerate tree, fall back
  const pd = 1 - pu;
  const values = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) values[i] = intrinsic(type, S * Math.pow(u, n - 2 * i), K);
  for (let step = n - 1; step >= 0; step--) {
    for (let i = 0; i <= step; i++) {
      const cont = disc * (pu * values[i] + pd * values[i + 1]);
      const ex = intrinsic(type, S * Math.pow(u, step - 2 * i), K);
      values[i] = cont > ex ? cont : ex;
    }
  }
  return values[0];
}

/** American Greeks by finite differences on the tree (delta, gamma, theta per day, vega per vol point). */
export function americanGreeks(p: PricingInput, steps = 200): Greeks {
  const price = americanPrice(p, steps);
  const hS = p.S * 0.01;
  const up = americanPrice({ ...p, S: p.S + hS }, steps);
  const dn = americanPrice({ ...p, S: p.S - hS }, steps);
  const delta = (up - dn) / (2 * hS);
  const gamma = (up - 2 * price + dn) / (hS * hS);
  const dayT = 1 / 365;
  const later = p.T > dayT ? americanPrice({ ...p, T: p.T - dayT }, steps) : intrinsic(p.type, p.S, p.K);
  const vUp = americanPrice({ ...p, sigma: p.sigma + 0.01 }, steps);
  return { price, delta, gamma, theta: later - price, vega: vUp - price };
}

/**
 * Implied volatility that reproduces `target` under the American tree, by
 * bisection between 1% and 400%. Returns null when the target is below
 * intrinsic value or above what any volatility can produce.
 */
export function impliedVolAmerican(p: Omit<PricingInput, 'sigma'>, target: number, steps = 150): number | null {
  if (!Number.isFinite(target) || target <= 0) return null;
  if (target < intrinsic(p.type, p.S, p.K) - 1e-9) return null;
  let lo = 0.01;
  let hi = 4;
  const f = (s: number) => americanPrice({ ...p, sigma: s }, steps) - target;
  const flo = f(lo);
  const fhi = f(hi);
  if (flo > 0) return lo; // even 1% vol overprices: price is basically intrinsic
  if (fhi < 0) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-5) return mid;
    if (fm > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Year fraction from now to an expiration date's 4:00 PM ET close (approximated as 20:00 UTC). */
export function yearsToExpiry(expiration: string, now: Date = new Date()): number {
  const close = Date.parse(`${expiration}T20:00:00Z`);
  if (!Number.isFinite(close)) return 0;
  return Math.max(0, (close - now.getTime()) / (365 * 86_400_000));
}

/** Calendar days to expiration, rounded up (matches the Options page). */
export function daysToExpiry(expiration: string, now: Date = new Date()): number {
  const close = Date.parse(`${expiration}T20:00:00Z`);
  if (!Number.isFinite(close)) return 0;
  return Math.max(0, Math.ceil((close - now.getTime()) / 86_400_000));
}
