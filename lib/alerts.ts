// Alert generation and management helpers
import type { TradeAlert, Opportunity, AlertState } from './types';

function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

export function opportunityToAlert(opp: Opportunity): TradeAlert {
  const windowMins = opp.contract.dte === 0 ? 10 : opp.contract.dte <= 3 ? 20 : 45;
  const windowExpires = new Date(Date.now() + windowMins * 60 * 1000).toISOString();

  return {
    id: generateId(),
    state: 'watching',
    symbol: opp.symbol,
    direction: opp.direction === 'bullish' ? 'call' : 'put',
    strike: opp.contract.strike,
    expiration: opp.contract.expiration,
    suggestedMaxEntry: Math.round(opp.contract.ask * 1.1 * 100) / 100,
    currentAsk: opp.contract.ask,
    entryTriggerLevel: opp.direction === 'bullish'
      ? opp.stockAnalysis.breakoutTrigger
      : opp.stockAnalysis.breakdownTrigger,
    triggerReason: opp.entryTrigger,
    invalidationLevel: opp.stopInvalidation,
    suggestedContract: opp.contract,
    stockAnalysis: opp.stockAnalysis,
    createdAt: new Date().toISOString(),
    tradeWindowExpiresAt: windowExpires,
    tradeWindowMinutes: windowMins,
    notes: opp.beginnerExplanation,
  };
}

export function getAlertStateLabel(state: AlertState): string {
  const labels: Record<AlertState, string> = {
    watching: 'Watching',
    triggered: 'Triggered',
    trade_window_open: 'Trade Window Open',
    reviewed: 'Reviewed',
    entered_manually: 'Entered Manually',
    skipped: 'Skipped',
    invalidated: 'Invalidated',
    expired: 'Expired',
    closed: 'Closed',
  };
  return labels[state] ?? state;
}

export function getAlertStateColor(state: AlertState): string {
  const colors: Record<AlertState, string> = {
    watching: 'bg-blue-100 text-blue-800',
    triggered: 'bg-yellow-100 text-yellow-800',
    trade_window_open: 'bg-green-100 text-green-800 animate-pulse',
    reviewed: 'bg-purple-100 text-purple-800',
    entered_manually: 'bg-green-100 text-green-800',
    skipped: 'bg-gray-100 text-gray-600',
    invalidated: 'bg-red-100 text-red-800',
    expired: 'bg-gray-100 text-gray-500',
    closed: 'bg-gray-100 text-gray-500',
  };
  return colors[state] ?? 'bg-gray-100 text-gray-600';
}

export function isAlertActionable(state: AlertState): boolean {
  return state === 'triggered' || state === 'trade_window_open';
}

export function isAlertActive(state: AlertState): boolean {
  return ['watching', 'triggered', 'trade_window_open', 'reviewed'].includes(state);
}

export function buildRobinhoodTicketText(alert: TradeAlert, contracts = 1): string {
  const lines = [
    `=== ROBINHOOD MANUAL TRADE TICKET ===`,
    ``,
    `Ticker: ${alert.symbol}`,
    `Action: BUY ${alert.direction.toUpperCase()}`,
    `Expiration: ${alert.expiration}`,
    `Strike: $${alert.strike}`,
    `Limit Price: $${alert.suggestedMaxEntry.toFixed(2)} per contract`,
    `Contracts: ${contracts}`,
    `Max Loss: $${(alert.suggestedMaxEntry * 100 * contracts).toFixed(2)}`,
    `Target Sell Price: $${(alert.suggestedMaxEntry * 2).toFixed(2)}+`,
    `Stop/Invalidation: ${alert.symbol} below $${alert.invalidationLevel.toFixed(2)}`,
    ``,
    `Entry Trigger: ${alert.entryTriggerLevel.toFixed(2)}`,
    `Reason: ${alert.triggerReason}`,
    ``,
    `CHECKLIST:`,
    `[ ] I checked bid/ask spread`,
    `[ ] I checked volume`,
    `[ ] I checked expiration date`,
    `[ ] I calculated my risk`,
    `[ ] I understand this can go to zero`,
    `[ ] I am manually confirming this trade`,
    ``,
    `⚠️  NOT FINANCIAL ADVICE. FOR EDUCATIONAL USE ONLY.`,
    `Always confirm manually in Robinhood before entering.`,
  ];
  return lines.join('\n');
}

export function formatTimeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function buildAlert1Text(alert: TradeAlert): string {
  const expiry = new Date(alert.expiration).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${alert.symbol} ${alert.direction.toUpperCase()} setup triggered. ` +
    `Review the ${alert.symbol} $${alert.strike} ${alert.direction === 'call' ? 'Call' : 'Put'} expiring ${expiry}. ` +
    `Max entry: $${alert.suggestedMaxEntry.toFixed(2)}. ` +
    `Trade window: ~${alert.tradeWindowMinutes} minutes. ` +
    `Open Robinhood and review manually.`;
}

export function buildAlert2Text(alert: TradeAlert): string {
  const invalidTime = alert.tradeWindowExpiresAt
    ? new Date(alert.tradeWindowExpiresAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : 'soon';
  return `${alert.symbol} setup invalidates if price crosses $${alert.invalidationLevel.toFixed(2)} ` +
    `or if no continuation by ${invalidTime}. ` +
    `If not entered yet, skip. If entered, reassess or follow your stop. ` +
    `Do not chase if price moved without you.`;
}
