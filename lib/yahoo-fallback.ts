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
  volume: number | null;
  openInterest: number | null;
  bid: number | null;
  ask: number | null;
}

export interface YahooOptionsResult {
  contracts: YahooContract[];
  sourceError?: string;
  source: 'Yahoo Finance (delayed)';
  lastUpdated: string;
}

interface YahooOptionContract {
  contractSymbol?: string;
  expiration?: number;
  strike?: number;
  impliedVolatility?: number;
  volume?: number;
  openInterest?: number;
  bid?: number;
  ask?: number;
}

interface YahooOptionsResponse {
  optionChain?: {
    result?: Array<{
      options?: Array<{
        expirationDate?: number;
        calls?: YahooOptionContract[];
        puts?: YahooOptionContract[];
      }>;
    }>;
    error?: string | null;
  };
}

function parseYahooContract(
  opt: YahooOptionContract,
  type: 'call' | 'put',
  expiration: string
): YahooContract {
  return {
    symbol: opt.contractSymbol ?? '',
    expiration,
    strike: opt.strike ?? 0,
    type,
    iv: opt.impliedVolatility != null ? opt.impliedVolatility : null,
    volume: opt.volume != null ? opt.volume : null,
    openInterest: opt.openInterest != null ? opt.openInterest : null,
    bid: opt.bid != null ? opt.bid : null,
    ask: opt.ask != null ? opt.ask : null,
  };
}

export async function fetchYahooOptions(symbol: string): Promise<YahooOptionsResult> {
  const now = new Date().toISOString();
  const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;

  let json: YahooOptionsResponse;
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Tradevi/3.0)' },
      cache: 'no-store',
    });
    if (!resp.ok) {
      return {
        contracts: [],
        sourceError: `Yahoo Finance HTTP ${resp.status}`,
        source: 'Yahoo Finance (delayed)',
        lastUpdated: now,
      };
    }
    json = (await resp.json()) as YahooOptionsResponse;
  } catch (err) {
    return {
      contracts: [],
      sourceError: `Yahoo Finance fetch failed: ${String(err)}`,
      source: 'Yahoo Finance (delayed)',
      lastUpdated: now,
    };
  }

  const result = json.optionChain?.result?.[0];
  if (!result) {
    return {
      contracts: [],
      sourceError: 'Yahoo Finance returned no options data',
      source: 'Yahoo Finance (delayed)',
      lastUpdated: now,
    };
  }

  const contracts: YahooContract[] = [];

  for (const optionSet of result.options ?? []) {
    const expTs = optionSet.expirationDate;
    const expDate = expTs
      ? new Date(expTs * 1000).toISOString().split('T')[0]
      : 'unknown';

    for (const call of optionSet.calls ?? []) {
      contracts.push(parseYahooContract(call, 'call', expDate));
    }
    for (const put of optionSet.puts ?? []) {
      contracts.push(parseYahooContract(put, 'put', expDate));
    }
  }

  // Filter: volume > 50, OI > 100 where available
  const filtered = contracts.filter(
    (c) => (c.volume === null || c.volume > 50) && (c.openInterest === null || c.openInterest > 100)
  );

  return {
    contracts: filtered.slice(0, 20),
    source: 'Yahoo Finance (delayed)',
    lastUpdated: now,
  };
}
