/**
 * Contract-aware futures position sizing.
 *
 * All money math is done in integer **mills** (1/1000 of a dollar), so every
 * CME tick value is an exact integer (ZN's $15.625 tick = 15,625 mills) and
 * there is no binary floating-point drift. Prices are converted to whole ticks
 * once, up front.
 *
 * Rules:
 *  - Stop distance is rounded **up** to a whole tick when the prices given are
 *    not on the tick grid (conservative: you can't be stopped for less).
 *  - Risk per contract = stop ticks × tick value + stop-side slippage + round-trip fees.
 *  - Max contracts = floor(risk budget / risk per contract). Never rounded up.
 *  - Target profit assumes a resting limit (no slippage) minus round-trip fees.
 */
import { contractSpec, type ContractSpec } from './contracts';

export interface FuturesRiskInput {
  contract: string;
  accountBalance: number;
  /** 'percent' → riskValue is % of balance, 'dollars' → riskValue is $. */
  riskMode: 'percent' | 'dollars';
  riskValue: number;
  entry: number;
  stop: number;
  targets?: number[];
  /** Round-trip commission + exchange + NFA fees per contract, in dollars. */
  feesPerContractRoundTrip?: number;
  /** Expected adverse slippage on the stop fill, in ticks. */
  slippageTicks?: number;
  /** Optional size you plan to trade; checked against the limit. */
  plannedContracts?: number;
}

export interface TargetResult {
  price: number;
  ticks: number;
  points: number;
  grossPerContract: number;
  netPerContract: number;
  netTotal: number;
  /** Gross reward / gross risk (ticks to target ÷ ticks to stop). */
  rrGross: number;
  /** Net reward / net risk after fees and slippage. */
  rrNet: number;
}

export interface FuturesRiskResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  spec: ContractSpec | null;
  side: 'long' | 'short' | null;
  stopPoints: number;
  stopTicks: number;
  /** True when entry/stop were not on the tick grid and the distance was rounded up. */
  offGrid: boolean;
  riskBudget: number;
  riskPerContractGross: number;
  slippagePerContract: number;
  feesPerContract: number;
  riskPerContract: number;
  maxContracts: number;
  contracts: number;
  estimatedLoss: number;
  estimatedLossPctOfBalance: number;
  exceedsLimit: boolean;
  targets: TargetResult[];
  steps: string[];
}

const MILLS = 1000;
const toMills = (dollars: number) => Math.round(dollars * MILLS);
const fromMills = (mills: number) => mills / MILLS;
const usd = (dollars: number) =>
  dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 });

/** Ticks between two prices; ceil when off-grid (tolerance for float noise). */
export function ticksBetween(a: number, b: number, tickSize: number): { ticks: number; offGrid: boolean } {
  const raw = Math.abs(a - b) / tickSize;
  const nearest = Math.round(raw);
  if (Math.abs(raw - nearest) < 1e-6) return { ticks: nearest, offGrid: false };
  return { ticks: Math.ceil(raw), offGrid: true };
}

export function calcFuturesRisk(input: FuturesRiskInput): FuturesRiskResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const steps: string[] = [];
  const spec = contractSpec(input.contract);
  const empty: FuturesRiskResult = {
    ok: false, errors, warnings, spec, side: null, stopPoints: 0, stopTicks: 0, offGrid: false,
    riskBudget: 0, riskPerContractGross: 0, slippagePerContract: 0, feesPerContract: 0, riskPerContract: 0,
    maxContracts: 0, contracts: 0, estimatedLoss: 0, estimatedLossPctOfBalance: 0, exceedsLimit: false,
    targets: [], steps,
  };

  if (!spec) errors.push(`Unknown contract "${input.contract}".`);
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  if (!finite(input.accountBalance) || input.accountBalance <= 0) errors.push('Account balance must be a positive number.');
  if (!finite(input.riskValue) || input.riskValue <= 0) errors.push('Risk must be a positive number.');
  if (input.riskMode === 'percent' && input.riskValue > 100) errors.push('Risk percent cannot exceed 100%.');
  if (!finite(input.entry) || input.entry <= 0) errors.push('Entry price must be a positive number.');
  if (!finite(input.stop) || input.stop <= 0) errors.push('Stop price must be a positive number.');
  if (finite(input.entry) && finite(input.stop) && input.entry === input.stop) errors.push('Stop cannot equal entry.');
  const fees = input.feesPerContractRoundTrip ?? 0;
  const slipTicks = input.slippageTicks ?? 0;
  if (!finite(fees) || fees < 0) errors.push('Fees cannot be negative.');
  if (!finite(slipTicks) || slipTicks < 0 || !Number.isInteger(slipTicks)) errors.push('Slippage must be a whole number of ticks (0 or more).');
  if (input.plannedContracts != null && (!Number.isInteger(input.plannedContracts) || input.plannedContracts < 0)) {
    errors.push('Planned contracts must be a whole number.');
  }
  if (errors.length || !spec) return empty;

  const side: 'long' | 'short' = input.stop < input.entry ? 'long' : 'short';
  const { ticks: stopTicks, offGrid } = ticksBetween(input.entry, input.stop, spec.tickSize);
  if (offGrid) warnings.push(`Entry/stop are not on the ${spec.tickSize} tick grid — stop distance rounded up to ${stopTicks} ticks.`);

  const tickMills = toMills(spec.tickValue);
  const grossMills = stopTicks * tickMills;
  const slipMills = slipTicks * tickMills;
  const feeMills = toMills(fees);
  const perContractMills = grossMills + slipMills + feeMills;

  const budgetMills =
    input.riskMode === 'percent'
      ? Math.floor(toMills(input.accountBalance) * input.riskValue / 100)
      : toMills(input.riskValue);

  const maxContracts = perContractMills > 0 ? Math.floor(budgetMills / perContractMills) : 0;
  const contracts = input.plannedContracts ?? maxContracts;
  const lossMills = contracts * perContractMills;
  const exceedsLimit = lossMills > budgetMills;

  steps.push(`${spec.symbol}: tick ${spec.tickSize} = ${usd(spec.tickValue)}, so 1 point = ${usd(spec.pointValue)}.`);
  steps.push(`Stop distance = |${input.entry} − ${input.stop}| = ${(stopTicks * spec.tickSize).toFixed(spec.decimals)} points = ${stopTicks} ticks.`);
  steps.push(`Price risk per contract = ${stopTicks} ticks × ${usd(spec.tickValue)} = ${usd(fromMills(grossMills))}.`);
  if (slipTicks) steps.push(`Stop slippage = ${slipTicks} ticks × ${usd(spec.tickValue)} = ${usd(fromMills(slipMills))}.`);
  if (feeMills) steps.push(`Round-trip fees = ${usd(fromMills(feeMills))}.`);
  steps.push(`Total risk per contract = ${usd(fromMills(perContractMills))}.`);
  steps.push(
    input.riskMode === 'percent'
      ? `Risk budget = ${usd(input.accountBalance)} × ${input.riskValue}% = ${usd(fromMills(budgetMills))}.`
      : `Risk budget = ${usd(fromMills(budgetMills))}.`,
  );
  steps.push(`Max contracts = floor(${usd(fromMills(budgetMills))} ÷ ${usd(fromMills(perContractMills))}) = ${maxContracts}.`);

  if (maxContracts === 0) warnings.push(`One ${spec.symbol} contract risks ${usd(fromMills(perContractMills))}, more than your ${usd(fromMills(budgetMills))} limit. Do not take this trade at this stop${spec.size !== 'micro' ? ' — consider the micro contract' : ''}.`);
  if (exceedsLimit) warnings.push(`RISK LIMIT EXCEEDED: ${contracts} contracts risk ${usd(fromMills(lossMills))}, over your ${usd(fromMills(budgetMills))} limit. Max is ${maxContracts}.`);

  const targets: TargetResult[] = [];
  for (const t of input.targets ?? []) {
    if (!finite(t) || t <= 0) continue;
    const rightSide = side === 'long' ? t > input.entry : t < input.entry;
    if (!rightSide) {
      warnings.push(`Target ${t} is on the wrong side of entry for a ${side}; ignored.`);
      continue;
    }
    // Profit side: floor to whole ticks (conservative).
    const raw = Math.abs(t - input.entry) / spec.tickSize;
    const ticks = Math.abs(raw - Math.round(raw)) < 1e-6 ? Math.round(raw) : Math.floor(raw);
    const grossT = ticks * tickMills;
    const netT = grossT - feeMills;
    targets.push({
      price: t,
      ticks,
      points: Number((ticks * spec.tickSize).toFixed(10)),
      grossPerContract: fromMills(grossT),
      netPerContract: fromMills(netT),
      netTotal: fromMills(netT * contracts),
      rrGross: stopTicks > 0 ? Math.round((ticks / stopTicks) * 100) / 100 : 0,
      rrNet: perContractMills > 0 ? Math.round((netT / perContractMills) * 100) / 100 : 0,
    });
  }

  const lossDollars = fromMills(lossMills);
  return {
    ok: true,
    errors,
    warnings,
    spec,
    side,
    stopPoints: Number((stopTicks * spec.tickSize).toFixed(10)),
    stopTicks,
    offGrid,
    riskBudget: fromMills(budgetMills),
    riskPerContractGross: fromMills(grossMills),
    slippagePerContract: fromMills(slipMills),
    feesPerContract: fromMills(feeMills),
    riskPerContract: fromMills(perContractMills),
    maxContracts,
    contracts,
    estimatedLoss: lossDollars,
    estimatedLossPctOfBalance: Math.round((lossDollars / input.accountBalance) * 10000) / 100,
    exceedsLimit,
    targets,
    steps,
  };
}
