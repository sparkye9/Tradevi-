// lib/tradier.ts — Tradier API options fetcher

export interface TradierContract {
  symbol: string;
  expiration: string;
  strike: number;
  type: 'call' | 'put';
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  iv: number | null;
  volume: number | null;
  openInterest: number | null;
  bid: number | null;
  ask: number | null;
  greeksUpdated: string; // ISO
}

export interface TradierOptionsResult {
  contracts: TradierContract[];
  sourceError?: string;
  source: string;
  lastUpdated: string;
}

export interface TradierOptionsFilter {
  minDelta?: number;   // abs delta lower bound (default 0.20)
  maxDelta?: number;   // abs delta upper bound (default 0.70)
  minMid?: number;     // min mid price per share (default none)
  maxMid?: number;     // max mid price per share (default none)
  pennyMode?: boolean; // relax volume/OI, fetch 2 nearest expirations
}

function getBaseUrl(): string {
  const env = process.env.TRADIER_ENV ?? 'production';
  return env === 'sandbox'
    ? 'https://sandbox.tradier.com/v1'
    : 'https://api.tradier.com/v1';
}

function getToken(): string | null {
  return process.env.TRADIER_TOKEN ?? null;
}

async function tradierGet<T>(path: string, token: string): Promise<T> {
  const base = getBaseUrl();
  const resp = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!resp.ok) {
    throw new Error(`Tradier HTTP ${resp.status} for ${path}`);
  }
  return resp.json() as Promise<T>;
}

type OptionRow = {
  symbol: string;
  expiration_date: string;
  strike: number;
  option_type: string;
  bid: number;
  ask: number;
  volume: number;
  open_interest: number;
  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
    mid_iv?: number;
    updated_at?: string;
  };
};

async function fetchChain(symbol: string, expiration: string, token: string): Promise<OptionRow[]> {
  const chainData = await tradierGet<{
    options: { option: OptionRow[] } | null;
  }>(
    `/markets/options/chains?symbol=${encodeURIComponent(symbol)}&expiration=${expiration}&greeks=true`,
    token
  );
  return chainData.options?.option ?? [];
}

export async function fetchTradierOptions(
  symbol: string,
  filter?: TradierOptionsFilter
): Promise<TradierOptionsResult> {
  const token = getToken();
  if (!token) {
    return {
      contracts: [],
      sourceError: 'Tradier not connected',
      source: 'Tradier',
      lastUpdated: new Date().toISOString(),
    };
  }

  const now = new Date().toISOString();

  let expirations: string[];
  try {
    const expData = await tradierGet<{
      expirations: { date: string[] } | null;
    }>(`/markets/options/expirations?symbol=${encodeURIComponent(symbol)}`, token);
    expirations = expData.expirations?.date ?? [];
  } catch (err) {
    return {
      contracts: [],
      sourceError: `Tradier expirations failed: ${String(err)}`,
      source: 'Tradier',
      lastUpdated: now,
    };
  }

  if (!expirations.length) {
    return {
      contracts: [],
      sourceError: `No expirations found for ${symbol}`,
      source: 'Tradier',
      lastUpdated: now,
    };
  }

  // Penny mode: fetch nearest 2 expirations to find more cheap OTM options
  const expirationsToFetch = filter?.pennyMode ? expirations.slice(0, 2) : [expirations[0]];

  const allOptions: OptionRow[] = [];
  for (const exp of expirationsToFetch) {
    try {
      const rows = await fetchChain(symbol, exp, token);
      allOptions.push(...rows);
    } catch (err) {
      if (expirationsToFetch.length === 1) {
        return {
          contracts: [],
          sourceError: `Tradier chain fetch failed: ${String(err)}`,
          source: 'Tradier',
          lastUpdated: now,
        };
      }
      // In penny mode, continue even if one expiration fails
    }
  }

  const minDelta = filter?.minDelta ?? 0.20;
  const maxDelta = filter?.maxDelta ?? 0.70;
  const minVol = filter?.pennyMode ? 1 : 50;
  const minOI = filter?.pennyMode ? 10 : 100;

  const contracts: TradierContract[] = [];

  for (const opt of allOptions) {
    const delta = opt.greeks?.delta ?? null;
    const volume = opt.volume ?? null;
    const oi = opt.open_interest ?? null;

    if (delta === null) continue;
    const absDelta = Math.abs(delta);
    if (absDelta < minDelta || absDelta > maxDelta) continue;
    if (volume !== null && volume < minVol) continue;
    if (oi !== null && oi < minOI) continue;

    if (filter?.minMid !== undefined || filter?.maxMid !== undefined) {
      const mid = opt.bid !== null && opt.ask !== null ? (opt.bid + opt.ask) / 2 : null;
      if (mid === null) continue;
      if (filter.minMid !== undefined && mid < filter.minMid) continue;
      if (filter.maxMid !== undefined && mid > filter.maxMid) continue;
    }

    contracts.push({
      symbol: opt.symbol,
      expiration: opt.expiration_date,
      strike: opt.strike,
      type: opt.option_type === 'call' ? 'call' : 'put',
      delta,
      gamma: opt.greeks?.gamma ?? null,
      theta: opt.greeks?.theta ?? null,
      vega: opt.greeks?.vega ?? null,
      iv: opt.greeks?.mid_iv ?? null,
      volume,
      openInterest: oi,
      bid: opt.bid ?? null,
      ask: opt.ask ?? null,
      greeksUpdated: opt.greeks?.updated_at ?? now,
    });
  }

  contracts.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));

  return { contracts, source: 'Tradier', lastUpdated: now };
}
