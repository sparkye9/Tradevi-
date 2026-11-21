/**
 * Import licensed historical option chains for the Crash Simulator.
 *
 *   npx tsx scripts/import-historical-options.ts <file.csv> [--format orats|historicaloptiondata|cboe-datashop|tradevi-snapshot] [--symbol SPY]
 *
 * Reads a vendor end-of-day CSV, normalizes it to Tradevi's row shape,
 * validates every row (symbols, expirations, quotes, Greeks, multipliers,
 * duplicates, stale quotes), keeps puts within 800 DTE and 40–110% of spot,
 * and writes data/historical-options/<SYMBOL>/<YYYY-MM>.json plus an import
 * report. The data/ folder is git-ignored: licensed data stays on your
 * machine and is never committed or uploaded. Run `npm run dev` locally and
 * the simulator uses these chains (labelled ACTUAL) instead of the
 * theoretical model for the dates they cover.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { detectFormat, normalizeRows, parseCsv, validateRows, type HistoricalOptionRow, type VendorFormat } from '../lib/crash/history/optionsImport';

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const opt = (k: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  if (!file) {
    console.error('Usage: npx tsx scripts/import-historical-options.ts <file.csv> [--format …] [--symbol SPY]');
    process.exit(1);
  }
  const text = await fs.readFile(file, 'utf8');
  const records = parseCsv(text);
  if (!records.length) throw new Error('No rows in file');
  const format = (opt('format') as VendorFormat | undefined) ?? detectFormat(Object.keys(records[0]));
  if (!format) throw new Error('Could not detect the vendor format from the header; pass --format');
  const { rows, unparsed } = normalizeRows(records, format);
  const only = opt('symbol')?.toUpperCase();
  const scoped = only ? rows.filter((r) => r.underlying === only) : rows;
  const { accepted, report } = validateRows(scoped);
  const kept = accepted.filter((r) => {
    const dte = (Date.parse(r.expiration) - Date.parse(r.tradeDate)) / 86_400_000;
    const m = r.underlyingPrice ? r.strike / r.underlyingPrice : 1;
    return dte >= 0 && dte <= 800 && m >= 0.4 && m <= 1.1;
  });

  const groups = new Map<string, HistoricalOptionRow[]>();
  for (const r of kept) {
    const key = `${r.underlying}/${r.tradeDate.slice(0, 7)}`;
    const g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
  }
  const root = path.join(process.cwd(), 'data', 'historical-options');
  for (const [key, list] of Array.from(groups.entries())) {
    const [symbol, month] = key.split('/');
    const dir = path.join(root, symbol);
    await fs.mkdir(dir, { recursive: true });
    const target = path.join(dir, `${month}.json`);
    let existing: HistoricalOptionRow[] = [];
    try {
      existing = JSON.parse(await fs.readFile(target, 'utf8'));
    } catch {
      /* new month */
    }
    const merged = new Map(existing.map((r) => [`${r.tradeDate}|${r.optionSymbol}`, r]));
    for (const r of list) merged.set(`${r.tradeDate}|${r.optionSymbol}`, r);
    await fs.writeFile(target, JSON.stringify(Array.from(merged.values())));
  }
  const summary = { file: path.basename(file), format, records: records.length, unparsed, ...report, kept: kept.length, months: groups.size, importedAt: new Date().toISOString() };
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, `import-report-${Date.now()}.json`), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
