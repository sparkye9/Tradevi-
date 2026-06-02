// lib/tradier.ts
// Tradier API options fetcher. Uses TRADIER_TOKEN + TRADIER_ENV env vars.

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
  volume: number;
  openInterest: number;
  bid: number | null;
  ask: number | null;
  greeksUpdated: string; // ISO
}

export interface TradierOptionsResult {
  contracts: TradierContract[];
  sourceError?: string;
  lastUpdated: string;
}

function getBase(): string {
  const env = process.env.TRADIER_ENV ?? 'production';
  return env === 'sandbox'
    ? 'https://sandbox.tradier.com/v1'
    : 'https://api.tradier.com/v1';
}

async function tradierGet<T>(path: string, token: string): Promise<T> {
  const base = getBase();
  const resp = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    next: { revalidate: 0 },
  });
  if (!resp.ok) {
    throw new Error(`Tradier HTTP ${resp.status} for ${path}`);
  }
  return resp.json() as Promise<T>;
}

export async function fetchTradierOptions(
  symbol: string
): Promise<TradierOptionsResult> {
  const now = new Date().toISOString();
  const token = process.env.TRADIER_TOKEN;
  if (!token) {
    return { contracts: [], sourceError: 'Tradier not connected', lastUpdated: now };
  }

  try {
    // Step 1: get nearest expiration
    const expResp = await tradierGet<{
      expirations: { expiration: { date: string[] | string } };
    }>(`/markets/options/expirations?symbol=${symbol}`, token);

    const dates = expResp?.expirations?.expiration;
    if (!dates) {
      return { contracts: [], sourceError: 'No expirations returned by Tradier', lastUpdated: now };
    }

    const dateList: string[] = Array.isArray(dates) ? dates : [dates as unknown as string];
    const expiration = dateList[0];
    if (!expiration) {
      return { contracts: [], sourceError: 'No valid expiration found', lastUpdated: now };
    }

    // Step 2: fetch option chain with greeks
    const chainResp = await tradierGet<{
      options: { option: unknown[] };
    }>(
      `/markets/options/chains?symbol=${symbol}&expiration=${expiration}&greeks=true`,
      token
    );

    const rawOptions = chainResp?.options?.option;
    if (!rawOptions || !Array.isArray(rawOptions)) {
      return { contracts: [], sourceError: 'No option chain data from Tradier', lastUpdated: now };
    }

    interface RawOption {
      symbol?: string;
      expiration_date?: string;
      strike?: number;
      option_type?: string;
      volume?: number;
      open_interest?: number;
      bid?: number;
      ask?: number;
      greeks?: {
        delta?: number;
        gamma?: number;
        theta?: number;
        vega?: number;
        mid_iv?: number;
        smv_vol?: number;
      };
    }

    const contracts: TradierContract[] = (rawOptions as RawOption[])
      .map((o): TradierContract | null => {
        const delta = o.greeks?.delta ?? null;
        const gamma = o.greeks?.gamma ?? null;
        const theta = o.greeks?.theta ?? null;
        const vega = o.greeks?.vega ?? null;
        const iv = o.greeks?.mid_iv ?? o.greeks?.smv_vol ?? null;
        const volume = o.volume ?? 0;
        const oi = o.open_interest ?? 0;

        // Filter by delta 0.20-0.70, volume > 50, OI > 100
        const absDelta = delta !== null ? Math.abs(delta) : null;
        if (absDelta === null || absDelta < 0.20 || absDelta > 0.70) return null;
        if (volume <= 50) return null;
        if (oi <= 100) return null;

        return {
          symbol: o.symbol ?? '',
          expiration: o.expiration_date ?? expiration,
          strike: o.strike ?? 0,
          type: (o.option_type === 'call' ? 'call' : 'put') as 'call' | 'put',
          delta,
          gamma,
          theta,
          vega,
          iv,
          volume,
          openInterest: oi,
          bid: o.bid ?? null,
          ask: o.ask ?? null,
          greeksUpdated: now,
        };
      })
      .filter((c): c is TradierContract => c !== null)
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));

    return { contracts, lastUpdated: now };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { contracts: [], sourceError: `Tradier error: ${msg}`, lastUpdated: now };
  }
}
