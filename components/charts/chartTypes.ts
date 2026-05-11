// Shared types for the chart system

export type Timeframe = '1m' | '5m' | '15m' | '1H' | '4H' | '1D' | '1W';
export type ChartTheme = 'dark' | 'light';
export type IndicatorPanel = 'main' | 'rsi' | 'macd' | 'atr' | 'volume';
export type IndicatorType =
  | 'ema9' | 'ema20' | 'ema50' | 'ema200'
  | 'vwap' | 'bbands' | 'supertrend' | 'orb'
  | 'rsi' | 'macd' | 'atr' | 'volume' | 'volumema';

export interface IndicatorConfig {
  id: IndicatorType;
  label: string;
  panel: IndicatorPanel;
  enabled: boolean;
  color: string;
  period: number;
  description: string;
}

export const INDICATOR_DEFAULTS: IndicatorConfig[] = [
  { id: 'ema9',       label: 'EMA 9',       panel: 'main',   enabled: false, color: '#f0c040', period: 9,   description: 'Fast 9-period exponential moving average. Shows short-term momentum.' },
  { id: 'ema20',      label: 'EMA 20',      panel: 'main',   enabled: true,  color: '#4fc3f7', period: 20,  description: 'Medium 20-period EMA. Popular swing trade reference line.' },
  { id: 'ema50',      label: 'EMA 50',      panel: 'main',   enabled: true,  color: '#ffb74d', period: 50,  description: '50-period EMA. Key trend direction line for daily charts.' },
  { id: 'ema200',     label: 'EMA 200',     panel: 'main',   enabled: false, color: '#ce93d8', period: 200, description: '200-period EMA. Long-term trend line. Price above = long-term bull.' },
  { id: 'vwap',       label: 'VWAP',        panel: 'main',   enabled: true,  color: '#00e676', period: 0,   description: 'Volume Weighted Average Price. Day traders use this as a fair value line.' },
  { id: 'bbands',     label: 'Bollinger Bands', panel: 'main', enabled: false, color: '#78909c', period: 20, description: 'Measures price volatility. Price near outer bands can mean overbought/oversold.' },
  { id: 'supertrend', label: 'SuperTrend',  panel: 'main',   enabled: true,  color: '#a0c4ff', period: 10,  description: 'Trend-following line. Green = uptrend, Red = downtrend.' },
  { id: 'orb',        label: 'ORB Levels',  panel: 'main',   enabled: false, color: '#ffd54f', period: 30,  description: 'Opening Range Breakout. High/Low of the first 30 minutes. Breakouts are key trade triggers.' },
  { id: 'rsi',        label: 'RSI 14',      panel: 'rsi',    enabled: true,  color: '#ab47bc', period: 14,  description: 'Relative Strength Index. Above 70 = overbought (may drop). Below 30 = oversold (may bounce).' },
  { id: 'macd',       label: 'MACD',        panel: 'macd',   enabled: false, color: '#42a5f5', period: 12,  description: 'Momentum indicator. When fast line crosses above slow line, trend is strengthening.' },
  { id: 'atr',        label: 'ATR',         panel: 'atr',    enabled: false, color: '#ef5350', period: 14,  description: 'Average True Range. Measures how much the stock typically moves. Useful for setting stops.' },
  { id: 'volume',     label: 'Volume',      panel: 'volume', enabled: true,  color: '#546e7a', period: 0,   description: 'Number of shares traded. High volume confirms a move. Low volume = weak signal.' },
  { id: 'volumema',   label: 'Vol MA 20',   panel: 'volume', enabled: false, color: '#ffa726', period: 20,  description: '20-period moving average of volume. Helps see if current volume is above/below normal.' },
];

export interface IndicatorPreset {
  name: string;
  emoji: string;
  description: string;
  enable: IndicatorType[];
}

export const PRESETS: IndicatorPreset[] = [
  { name: 'Clean',      emoji: '🧹', description: 'Just candles, no indicators',          enable: [] },
  { name: 'Trend',      emoji: '📈', description: 'EMA stack + VWAP for trend direction', enable: ['ema9', 'ema20', 'ema50', 'vwap'] },
  { name: 'Momentum',   emoji: '⚡', description: 'RSI + MACD + Volume for momentum',     enable: ['rsi', 'macd', 'volume'] },
  { name: 'Day Trade',  emoji: '🎯', description: 'VWAP + ORB + fast EMAs for intraday',  enable: ['vwap', 'ema9', 'ema20', 'orb', 'volume', 'rsi'] },
  { name: 'Swing',      emoji: '🌊', description: 'Slow EMAs + RSI + MACD for swings',    enable: ['ema20', 'ema50', 'ema200', 'rsi', 'macd'] },
];

export const TIMEFRAME_MAP: Record<Timeframe, { period: string; interval: string; label: string }> = {
  '1m':  { period: '1d',  interval: '1m',   label: '1 Min'   },
  '5m':  { period: '5d',  interval: '5m',   label: '5 Min'   },
  '15m': { period: '1mo', interval: '15m',  label: '15 Min'  },
  '1H':  { period: '3mo', interval: '60m',  label: '1 Hour'  },
  '4H':  { period: '6mo', interval: '60m',  label: '4 Hour'  }, // Yahoo doesn't have 4H; shows 1H data
  '1D':  { period: '1y',  interval: '1d',   label: 'Daily'   },
  '1W':  { period: '5y',  interval: '1wk',  label: 'Weekly'  },
};

// Risk/Reward tool
export type RRDirection = 'long' | 'short';

export interface RRSetup {
  direction: RRDirection;
  entry: number;
  stop: number;
  target: number;
  accountSize: number;
  riskPercent: number;
}

export const DEFAULT_RR: RRSetup = {
  direction: 'long',
  entry: 0,
  stop: 0,
  target: 0,
  accountSize: 10000,
  riskPercent: 1,
};

// Chart theme colors
export const THEME_COLORS = {
  dark: {
    bg: '#0f1117',
    panel: '#1a1e2e',
    border: '#2b3040',
    text: '#d1d4dc',
    textMuted: '#758696',
    grid: '#1e2230',
    crosshair: '#758696',
  },
  light: {
    bg: '#ffffff',
    panel: '#f8fafc',
    border: '#e2e8f0',
    text: '#131722',
    textMuted: '#6b7280',
    grid: '#f0f4f8',
    crosshair: '#9ca3af',
  },
} as const;
