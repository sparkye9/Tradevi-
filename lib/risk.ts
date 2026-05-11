// Risk calculator
import type { RiskCalculationInput, RiskCalculationResult } from './types';

export function calcRisk(input: RiskCalculationInput): RiskCalculationResult {
  const { accountSize, maxRiskPercent, contractAsk, stopLossPercent, numberOfContracts } = input;

  const maxRiskDollar = accountSize * (maxRiskPercent / 100);
  const costPerContract = contractAsk * 100;
  const stopLossDollar = costPerContract * (stopLossPercent / 100);
  const maxContractsAllowed = stopLossDollar > 0
    ? Math.floor(maxRiskDollar / stopLossDollar)
    : 0;

  const actualContracts = numberOfContracts;
  const positionCost = costPerContract * actualContracts;
  const maxLoss = stopLossDollar * actualContracts;
  const riskPercent = accountSize > 0 ? (maxLoss / accountSize) * 100 : 0;

  const warnings: string[] = [];
  if (contractAsk < 0.10) warnings.push('This is an extremely cheap option — high probability of going to zero.');
  if (contractAsk <= 0.25) warnings.push('Options under $0.25 are lottery tickets. Most expire worthless.');
  const dte = input as typeof input & { dte?: number };
  if ((dte.dte ?? 999) <= 1) warnings.push('0-1 DTE options decay extremely fast. Only experienced traders should use these.');
  if ((dte.dte ?? 999) <= 3) warnings.push('Short-dated options (0-3 DTE) have very fast time decay. Price must move quickly.');
  if (riskPercent > 5) warnings.push(`You are risking ${riskPercent.toFixed(1)}% of your account — above the recommended 1-2% max.`);
  if (riskPercent > 2) warnings.push('Consider reducing position size to keep risk below 2% of account.');
  if (maxContractsAllowed === 0) warnings.push('Risk settings do not allow any contracts at this premium. Reduce position size or increase max risk.');
  if (actualContracts > maxContractsAllowed && maxContractsAllowed > 0) warnings.push(`You selected ${actualContracts} contracts but your risk settings only allow ${maxContractsAllowed}.`);

  const isLottery = contractAsk <= 0.25;
  const isTooRisky = riskPercent > 5 || actualContracts > maxContractsAllowed;

  let recommendation = '';
  if (isTooRisky) recommendation = 'Reduce position size. Your risk exceeds safe levels.';
  else if (isLottery) recommendation = 'This is a lottery contract. Only use with money you can afford to lose completely.';
  else if (maxContractsAllowed >= 1 && riskPercent <= 2) recommendation = `Safe to trade ${Math.min(actualContracts, maxContractsAllowed)} contract(s) at this risk level.`;
  else recommendation = 'Review your risk parameters before entering.';

  return {
    maxContractsAllowed,
    maxLoss: Math.round(maxLoss * 100) / 100,
    positionCost: Math.round(positionCost * 100) / 100,
    riskPercent: Math.round(riskPercent * 100) / 100,
    isTooRisky,
    isLottery,
    warnings,
    recommendation,
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function getRiskColor(percent: number): string {
  if (percent <= 1) return 'text-green-600';
  if (percent <= 2) return 'text-yellow-600';
  if (percent <= 5) return 'text-orange-600';
  return 'text-red-600';
}
