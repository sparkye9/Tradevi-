import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const MARKET_TICKERS = [
  // Mega cap tech
  'AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AMD','INTC','QCOM',
  // Finance
  'JPM','BAC','GS','MS','WFC','V','MA','AXP','C','SCHW',
  // Healthcare
  'JNJ','UNH','PFE','ABBV','MRK','LLY','MRNA','BNTX','BIIB','GILD',
  // Consumer
  'WMT','COST','HD','NKE','MCD','SBUX','TGT','LOW','AMZN','ETSY',
  // Energy
  'XOM','CVX','COP','SLB','EOG','MPC','VLO','HAL','OXY','DVN',
  // ETFs (kept for context, excluded from plays)
  'SPY','QQQ','IWM','DIA','XLK','XLF','XLV','XLE','XLY','GLD',
  // High momentum / growth
  'SHOP','PLTR','SNOW','CRWD','NET','DDOG','PANW','ZS','COIN','HOOD',
  // Entertainment / media
  'NFLX','DIS','SPOT','RBLX','EA','TTWO','PARA',
  // EV / clean energy
  'RIVN','LCID','NIO','XPEV','LI','CHPT','BLNK','PLUG','FCEL',
  // Crypto / fintech
  'MARA','RIOT','CLSK','MSTR','HUT','SOFI','AFRM','UPST','SQ','PYPL',
  // Biotech / speculative
  'SAVA','NVAX','SRPT','ACAD','EXAS','RCUS','ARWR','FATE',
  // Small/mid cap momentum
  'DKNG','PENN','IONQ','SOUN','AI','BBAI','RCAT','SMCI','CLOV','FUTU',
  // Other high-liquidity
  'UBER','LYFT','SNAP','PINS','TWTR','BABA','JD','PDD','BILI',
  // Industrial / macro
  'BA','CAT','DE','GE','MMM','RTX','LMT','NOC','F','GM',
];

export interface ManualCheck {
  choch: boolean;
  bos: boolean;
  fvg: boolean;
  vwap: boolean;
  marketAligned: boolean;
}

export interface TradeviStore {
  // Watchlist
  watchlist: string[];
  addTicker: (s: string) => void;
  removeTicker: (s: string) => void;

  // Thresholds
  rvolThreshold: number;
  setRvolThreshold: (n: number) => void;

  // ORB levels
  orbLevels: Record<string, { high: number | null; low: number | null }>;
  setOrbLevel: (symbol: string, high: number | null, low: number | null) => void;

  // Manual checklist
  manualChecks: Record<string, ManualCheck>;
  setManualCheck: (symbol: string, key: keyof ManualCheck, value: boolean) => void;
  resetManualChecks: (symbol: string) => void;

  // P&L entries
  pnlEntries: { date: string; amount: number }[];
  addPnlEntry: (date: string, amount: number) => void;
  removePnlEntry: (date: string) => void;
  importPnlCsv: (csv: string) => void;

  // Tradeify rule threshold
  tradeifyConcentrationLimit: number;
  setTradeifyConcentrationLimit: (n: number) => void;

  // Scan mode
  scanMode: 'watchlist' | 'market';
  setScanMode: (m: 'watchlist' | 'market') => void;

  // Capital selector for opportunity finder
  capitalAmount: number;
  setCapitalAmount: (n: number) => void;
}

const DEFAULT_WATCHLIST = [
  'SPY', 'QQQ', 'IWM', 'DIA',
  'NVDA', 'TSLA', 'META', 'AAPL', 'MSFT', 'AMD', 'AMZN', 'GOOGL', 'SHOP', 'JPM',
];

const DEFAULT_MANUAL: ManualCheck = {
  choch: false,
  bos: false,
  fvg: false,
  vwap: false,
  marketAligned: false,
};

export const useTradeviStore = create<TradeviStore>()(
  persist(
    (set, get) => ({
      watchlist: DEFAULT_WATCHLIST,
      addTicker: (s: string) => {
        const upper = s.toUpperCase().trim();
        if (!upper || get().watchlist.includes(upper)) return;
        set((state) => ({ watchlist: [...state.watchlist, upper] }));
      },
      removeTicker: (s: string) =>
        set((state) => ({ watchlist: state.watchlist.filter((t) => t !== s) })),

      rvolThreshold: 1.5,
      setRvolThreshold: (n) => set({ rvolThreshold: n }),

      orbLevels: {},
      setOrbLevel: (symbol, high, low) =>
        set((state) => ({
          orbLevels: { ...state.orbLevels, [symbol]: { high, low } },
        })),

      manualChecks: {},
      setManualCheck: (symbol, key, value) =>
        set((state) => {
          const current = state.manualChecks[symbol] ?? { ...DEFAULT_MANUAL };
          return {
            manualChecks: {
              ...state.manualChecks,
              [symbol]: { ...current, [key]: value },
            },
          };
        }),
      resetManualChecks: (symbol) =>
        set((state) => ({
          manualChecks: {
            ...state.manualChecks,
            [symbol]: { ...DEFAULT_MANUAL },
          },
        })),

      pnlEntries: [],
      addPnlEntry: (date, amount) =>
        set((state) => {
          const filtered = state.pnlEntries.filter((e) => e.date !== date);
          return { pnlEntries: [...filtered, { date, amount }] };
        }),
      removePnlEntry: (date) =>
        set((state) => ({
          pnlEntries: state.pnlEntries.filter((e) => e.date !== date),
        })),
      importPnlCsv: (csv) => {
        const lines = csv.trim().split('\n');
        const entries: { date: string; amount: number }[] = [];
        for (const line of lines) {
          const parts = line.split(',');
          if (parts.length < 2) continue;
          const date = parts[0].trim().replace(/"/g, '');
          const amount = parseFloat(parts[1].trim().replace(/"/g, '').replace(/[$,]/g, ''));
          if (date && !isNaN(amount)) entries.push({ date, amount });
        }
        set((state) => {
          const map = new Map(state.pnlEntries.map((e) => [e.date, e]));
          for (const e of entries) map.set(e.date, e);
          return { pnlEntries: Array.from(map.values()) };
        });
      },

      tradeifyConcentrationLimit: 30,
      setTradeifyConcentrationLimit: (n) => set({ tradeifyConcentrationLimit: n }),

      scanMode: 'watchlist',
      setScanMode: (m) => set({ scanMode: m }),

      capitalAmount: 100,
      setCapitalAmount: (n) => set({ capitalAmount: n }),
    }),
    { name: 'tradevi-store' }
  )
);
