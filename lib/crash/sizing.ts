/**
 * Position sizing and exposure. Research arithmetic only: it never
 * recommends a number of contracts beyond the user's own risk budget, and
 * cheapness is never a reason to buy more.
 */

export interface RiskBudget {
  accountEquity: number;
  /** Max premium at risk for one idea, dollars. */
  maxRiskPerTrade: number;
  /** Fee per contract, dollars (each way). */
  feePerContract: number;
}

export const DEFAULT_BUDGET: RiskBudget = { accountEquity: 2000, maxRiskPerTrade: 50, feePerContract: 0.65 };

export interface SizingResult {
  costPerContract: number;
  /** Contracts whose premium + entry fee fit inside maxRiskPerTrade. */
  affordable: number;
  premiumAtRisk: number;
  maxLoss: number;
  pctOfEquity: number;
  warnings: string[];
}

export function sizePosition(pricePerShare: number, b: RiskBudget, contracts?: number): SizingResult {
  const warnings: string[] = [];
  const costPerContract = pricePerShare * 100 + b.feePerContract;
  const affordable = costPerContract > 0 ? Math.floor(b.maxRiskPerTrade / costPerContract) : 0;
  const n = contracts ?? Math.min(affordable, 1);
  const premiumAtRisk = n * costPerContract;
  const pct = b.accountEquity > 0 ? premiumAtRisk / b.accountEquity : 0;
  if (affordable === 0) warnings.push('One contract costs more than your per-trade risk budget.');
  if (pct > 0.05) warnings.push(`This is ${(pct * 100).toFixed(1)}% of your account in one idea that can expire worthless.`);
  if (contracts != null && contracts > affordable) warnings.push('More contracts than your risk budget allows.');
  // Closing fee is paid only if the option is sold, so max loss = premium + entry fees (expires worthless).
  return { costPerContract, affordable, premiumAtRisk, maxLoss: premiumAtRisk, pctOfEquity: pct, warnings };
}

/**
 * Correlation groups for the exposure tracker. Puts on SPY, QQQ, IWM, DIA and
 * most single stocks are all bets on the same US equity sell-off, so they are
 * summed as one risk, not treated as independent.
 */
export function exposureGroup(underlying: string): string {
  const u = underlying.toUpperCase();
  if (['TLT', 'IEF', 'SHY', 'HYG', 'JNK', 'LQD'].includes(u)) return 'Bonds & credit';
  if (['GLD', 'SLV', 'USO', 'UNG'].includes(u)) return 'Commodities';
  return 'US equity sell-off';
}

export interface Position {
  id: string;
  underlying: string;
  description: string;
  contracts: number;
  premiumPerShare: number;
}

export function exposureByGroup(positions: Position[], b: RiskBudget) {
  const groups = new Map<string, { premium: number; positions: Position[] }>();
  for (const p of positions) {
    const g = exposureGroup(p.underlying);
    const cur = groups.get(g) ?? { premium: 0, positions: [] };
    cur.premium += p.contracts * (p.premiumPerShare * 100 + b.feePerContract);
    cur.positions.push(p);
    groups.set(g, cur);
  }
  return Array.from(groups).map(([group, v]) => ({
    group,
    premium: v.premium,
    pctOfEquity: b.accountEquity > 0 ? v.premium / b.accountEquity : 0,
    count: v.positions.length,
    warning: v.positions.length > 1 ? `${v.positions.length} positions in "${group}" move together; treat them as one ${(v.premium).toFixed(0)}-dollar bet.` : null,
  }));
}
