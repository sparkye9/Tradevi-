/**
 * Download 1-minute futures bars from Databento's historical API to a local CSV.
 * Runs on YOUR machine — the API key never goes to the website or the repo.
 *
 *   export DATABENTO_API_KEY=db-xxxxxxxx        (PowerShell: $env:DATABENTO_API_KEY="db-...")
 *   npx tsx scripts/databento-download.ts --symbol MNQ --start 2024-10-01 --end 2026-10-01
 *       → prints the price Databento will charge, downloads nothing
 *   npx tsx scripts/databento-download.ts --symbol MNQ --start 2024-10-01 --end 2026-10-01 --yes
 *       → downloads to data/databento/MNQ.v.0_ohlcv-1m_2024-10-01_2026-10-01.csv
 *
 * Options: --roll v|c|n (volume / calendar / open-interest front month, default v)
 *          --schema ohlcv-1m|ohlcv-1h|ohlcv-1d   --max-usd 5 (refuse above this cost)
 * Historical data is at least 24 hours old (Databento embargo).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://hist.databento.com/v0';
const DATASET = 'GLBX.MDP3';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function call(endpoint: string, params: Record<string, string>, key: string): Promise<Response> {
  return fetch(`${BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
}

async function main() {
  const key = process.env.DATABENTO_API_KEY;
  if (!key) throw new Error('Set DATABENTO_API_KEY in your shell first (never commit it).');
  const root = (arg('symbol', 'MNQ') ?? 'MNQ').toUpperCase();
  const roll = arg('roll', 'v');
  const schema = arg('schema', 'ohlcv-1m')!;
  const start = arg('start');
  const end = arg('end');
  const maxUsd = Number(arg('max-usd', '5'));
  const yes = process.argv.includes('--yes');
  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new Error('Pass --start YYYY-MM-DD and --end YYYY-MM-DD.');
  }
  if (!['c', 'v', 'n'].includes(roll ?? '')) throw new Error('--roll must be c, v or n.');
  if (!['ohlcv-1m', 'ohlcv-1h', 'ohlcv-1d'].includes(schema)) throw new Error('--schema must be ohlcv-1m, ohlcv-1h or ohlcv-1d.');
  const symbol = `${root}.${roll}.0`;
  const base = { dataset: DATASET, symbols: symbol, stype_in: 'continuous', schema, start, end };

  const costRes = await call('metadata.get_cost', base, key);
  const costText = await costRes.text();
  if (!costRes.ok) throw new Error(`Cost check failed (${costRes.status}): ${costText.slice(0, 300)}`);
  const cost = Number(costText);
  console.log(`${symbol} ${schema} ${start} → ${end}: Databento estimates $${cost.toFixed(4)} (drawn from your credits).`);
  if (!Number.isFinite(cost)) throw new Error(`Unexpected cost response: ${costText.slice(0, 200)}`);
  if (cost > maxUsd) throw new Error(`Cost is above --max-usd ${maxUsd}. Shorten the range or raise --max-usd.`);
  if (!yes) { console.log('Nothing downloaded. Re-run with --yes to download.'); return; }

  const pretty = { encoding: 'csv', pretty_px: 'true', pretty_ts: 'true', map_symbols: 'true' };
  let res = await call('timeseries.get_range', { ...base, ...pretty }, key);
  if (res.status === 400 || res.status === 422) {
    // Older API versions reject the formatting flags; the parser handles raw values too.
    console.log('API rejected the formatting options — retrying with plain CSV.');
    res = await call('timeseries.get_range', { ...base, encoding: 'csv' }, key);
  }
  const body = await res.text();
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${body.slice(0, 300)}`);
  const dir = join(process.cwd(), 'data', 'databento');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${symbol}_${schema}_${start}_${end}.csv`);
  writeFileSync(file, body);
  console.log(`Saved ${body.split('\n').length - 2} rows → ${file}`);
  console.log(`Next: npx tsx scripts/backtest-power-hour.ts "${file}" --instrument ${root}`);
  console.log('Or upload the file on the Backtesting page → Intraday Power Hour.');
}

main().catch((e) => { console.error(`error: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
