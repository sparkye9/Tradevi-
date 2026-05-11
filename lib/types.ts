// Core data types for TradeWise

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume?: number;
  marketCap?: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  shortName?: string;
  longName?: string;
}

export interface CandleData {
  time: number; // unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockAnalysis {
  symbol: string;
  price: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  support: number;
  resistance: number;
  atr: number;
  rsi: number;
  ma20: number;
  ma50: number;
  ma200: number;
  volumeChange: number; // % vs average
  vwap?: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  keyLevelAbove: number;
  keyLevelBelow: number;
  breakoutTrigger: number;
  breakdownTrigger: number;
  invalidationLevel: number;
  trendStrength: number; // 0-100
}

export interface OptionContract {
  contractSymbol: string;
  strike: number;
  expiration: string; // YYYY-MM-DD
  dte: number;
  bid: number;
  ask: number;
  lastPrice: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number; // decimal, e.g. 0.45 = 45%
  delta: number;
  theta: number;
  gamma?: number;
  vega?: number;
  type: 'call' | 'put';
  inTheMoney: boolean;
  spreadPercent: number;
  breakeven: number;
  costPerContract: number; // ask * 100
  estimatedTargetPrice: number;
  estimatedGainPercent: number;
  is100PctPossible: boolean;
  is100PctRealistic: boolean;
  riskLabel: 'Low' | 'Medium' | 'High' | 'Lottery';
}

export interface Opportunity {
  id: string;
  symbol: string;
  direction: 'bullish' | 'bearish';
  setupType: string;
  contract: OptionContract;
  stockAnalysis: StockAnalysis;
  entryTrigger: string;
  stopInvalidation: number;
  target1: number;
  target2: number;
  estimatedGainPercent: number;
  costPerContract: number;
  riskScore: number; // 0-100, lower = safer
  opportunityScore: number; // 0-100, higher = better
  beginnerExplanation: string;
  wouldTake: 'yes' | 'watch' | 'skip' | 'lottery';
  scannedAt: string;
}

export type AlertState =
  | 'watching'
  | 'triggered'
  | 'trade_window_open'
  | 'reviewed'
  | 'entered_manually'
  | 'skipped'
  | 'invalidated'
  | 'expired'
  | 'closed';

export interface TradeAlert {
  id: string;
  state: AlertState;
  symbol: string;
  direction: 'call' | 'put';
  strike: number;
  expiration: string;
  suggestedMaxEntry: number;
  currentAsk: number;
  entryTriggerLevel: number;
  triggerReason: string;
  invalidationReason?: string;
  invalidationLevel: number;
  suggestedContract: OptionContract;
  stockAnalysis?: StockAnalysis;
  createdAt: string;
  triggeredAt?: string;
  tradeWindowExpiresAt?: string;
  invalidationTime?: string;
  tradeWindowMinutes: number;
  notes?: string;
}

export interface JournalEntry {
  id: string;
  alertId?: string;
  ticker: string;
  contract: string;
  entryPrice: number;
  exitPrice?: number;
  setup: string;
  triggerReason: string;
  emotion: string;
  followedRules: boolean;
  profitLoss?: number;
  profitLossPct?: number;
  lessonLearned?: string;
  createdAt: string;
  closedAt?: string;
  status: 'open' | 'closed';
}

export interface WatchlistItem {
  symbol: string;
  addedAt: string;
  notes?: string;
  targetPrice?: number;
  alertPrice?: number;
}

export interface RiskCalculationInput {
  accountSize: number;
  maxRiskPercent: number; // e.g. 1 = 1%
  contractAsk: number;
  stopLossPercent: number; // e.g. 50 = 50% loss triggers stop
  numberOfContracts: number;
}

export interface RiskCalculationResult {
  maxContractsAllowed: number;
  maxLoss: number;
  positionCost: number;
  riskPercent: number;
  isTooRisky: boolean;
  isLottery: boolean;
  warnings: string[];
  recommendation: string;
}

export interface ScannerFilters {
  maxPremium: number;
  optionType: 'calls' | 'puts' | 'both';
  tradeType: 'day' | 'swing' | 'both';
  minVolume: number;
  minOpenInterest: number;
  minOpportunityScore: number;
  minDelta: number;
  maxDelta: number;
  minDTE: number;
  maxDTE: number;
  includeLottery: boolean;
  biasFilter: 'bullish' | 'bearish' | 'both';
  symbols: string[];
}

export interface ScannerResult {
  opportunities: Opportunity[];
  scannedAt: string;
  symbolsScanned: number;
  totalContractsAnalyzed: number;
  filters: ScannerFilters;
}

export interface BacktestTrade {
  date: string;
  entryPrice: number;
  exitPrice: number;
  direction: 'long' | 'short';
  result: 'win' | 'loss';
  pnl: number;
  pnlPct: number;
  holdingBars: number;
}

export interface BacktestResult {
  symbol: string;
  strategy: string;
  timeframe: string;
  totalTrades: number;
  winRate: number;
  avgGain: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  netProfit: number;
  trades: BacktestTrade[];
}

export interface NewsItem {
  title: string;
  link: string;
  publisher: string;
  publishedAt: string;
  summary?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  symbol?: string;
  details: string;
  category: 'alert' | 'trade' | 'journal' | 'settings' | 'scan' | 'system';
}
