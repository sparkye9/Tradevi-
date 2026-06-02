// lib/yahoo-fallback.ts
// Yahoo Finance options fallback — used only when Tradier is not connected.
// Returns IV, OI, volume, bid, ask only. Never computes greeks.
// Data labeled as delayed.

export interface YahooContract {
  symbol: string;
  expiration: string;
  strike: number;
  type: 'call' | 'put';
  iv: number | null;
  volume: number;
  openInterest: number;
  bid: number | null;
  ask: number | null;
  source: 'Yahoo Finance (delayed)';
}

export interface YahooOptionsResult {
  contracts: YahooContract[];
  sourceError?: string;
  lastUpdated: string;
  source: 'Yahoo Finance (delayed)';
}

interface YahooOptionRaw {
  contractSymbol?: string;
  expiration?: number;
  strike?: number;
  impliedVolatility?: number;
  volume?: number;
  openInterest?: number;
  bid?: number;
  ask?: number;
}

export async function fetchYahooOptions(symbol: string): Promise<YahooOptionsResult> {
  const now = new Date().toISOString();
  const source = 'Yahoo Finance (delayed)' as const;

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Tradevi/3.0)',
        Accept: 'application/json',
      },
      next: { revalidate: 0 },
    });

    if (!resp.ok) {
      return { contracts: [], sourceError: `Yahoo Finance HTTP ${resp.status}`, lastUpdated: now, source };
    }

    const json = await resp.json() as {
      optionChain?: {
        result?: Array<{
          options?: Array<{
            calls?: YahooOptionRaw[];
            puts?: YahooOptionRaw[];
            expirationDate?: number;
          }>;
        }>;
      };
    };

    const result = json?.optionChain?.result?.[0];
    if (!result) {
      return { contracts: [], sourceError: 'No option data from Yahoo Finance', lastUpdated: now, source };
    }

    const options = result.options?.[0];
    const expTs = options?.expirationDate;
    const expiration = expTs
      ? new Date(expTs * 1000).toISOString().split('T')[0]
      : 'unknown';

    const mapContracts = (
      raws: YahooOptionRaw[] | undefined,
      type: 'call' | 'put'
    ): YahooContract[] => {
      if (!raws) return [];
      return raws.map((o): YahooContract => ({
        symbol: o.contractSymbol ?? '',
        expiration,
        strike: o.strike ?? 0,
        type,
        iv: o.impliedVolatility !== undefined ? o.impliedVolatility : null,
        volume: o.volume ?? 0,
        openInterest: o.openInterest ?? 0,
        bid: o.bid ?? null,
        ask: o.ask ?? null,
        source,
      }));
    };

    const calls = mapContracts(options?.calls, 'call');
    const puts = mapContracts(options?.puts, 'put');
    const contracts = [...calls, ...puts].sort(
      (a, b) => (b.volume ?? 0) - (a.volume ?? 0)
    );

    return { contracts, lastUpdated: now, source };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { contracts: [], sourceError: `Yahoo Finance error: ${msg}`, lastUpdated: now, source };
  }
}
