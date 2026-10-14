/**
 * Replay the Power Hour rules over a Databento 1-minute CSV.
 *   npx tsx scripts/backtest-power-hour.ts data/databento/MNQ.v.0_ohlcv-1m_....csv --instrument MNQ \
 *     [--entry 14:38-14:45] [--exit 15:15-15:20] [--fees 1.24] [--slip 1]
 */
import { readFileSync } from 'node:fs';
import { parseDatabentoCsv } from '../lib/databentoCsv';
import { backtestPowerHour } from '../lib/powerHourBacktest';
import { DEFAULT_POWER_HOUR } from '../lib/powerHourEngine';

const arg = (n: string, d?: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

const file = process.argv[2];
if (!file || file.startsWith('--')) { console.error('usage: backtest-power-hour.ts <file.csv> --instrument MNQ'); process.exit(1); }
const parsed = parseDatabentoCsv(readFileSync(file, 'utf8'));
const [es, ee] = (arg('entry', '14:38-14:45') ?? '').split('-');
const [xs, xe] = (arg('exit', '15:15-15:20') ?? '').split('-');
const res = backtestPowerHour({
  instrument: (arg('instrument', 'MNQ') ?? 'MNQ').toUpperCase(),
  bars1m: parsed.bars,
  cfg: { ...DEFAULT_POWER_HOUR, entryStart: hm(es), entryEnd: hm(ee), exitStart: hm(xs), exitEnd: hm(xe) },
  feesRoundTrip: Number(arg('fees', '1.24')),
  slippageTicks: Number(arg('slip', '1')),
});
const s = res.stats;
console.log(`${parsed.bars.length} bars (${parsed.symbols.join(', ')}) · ${parsed.warnings.join(' ')}`);
console.log(`${res.instrument} ${res.from} → ${res.to}: ${res.sessions} sessions`);
const count = (o: string) => res.days.filter((d) => d.outcome === o).length;
console.log(`traded ${count('traded')} · no trade ${count('no_trade')} · candidate not confirmed ${count('candidate_unconfirmed')} · no data ${count('no_data')} · holiday/early close ${count('skipped_calendar')}`);
console.log('Rules that blocked trades (days):', res.ruleFailures);
console.log(`Trades ${s.trades} · win ${s.winRate}% · expectancy ${s.expectancyR}R · PF ${s.profitFactor ?? '∞'} · total ${s.totalR}R · max DD ${s.maxDrawdownR}R · loss streak ${s.maxConsecutiveLosses}`);
console.log(`Net per contract $${res.netPerContract} · IS ${res.inSample.expectancyR}R/trade (${res.inSample.trades}) · OOS ${res.outOfSample.expectancyR}R/trade (${res.outOfSample.trades}) from ${res.splitDate ?? '—'}`);
if (res.sampleWarning) console.log(`⚠ ${res.sampleWarning}`);
for (const n of res.notes) console.log(`- ${n}`);
