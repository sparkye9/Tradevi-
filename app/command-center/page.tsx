'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ClientOnly from '@/components/ClientOnly';
import { NumberField, Stat, Notice, usd } from '@/components/ui/Form';
import { useWorkspaceStore, PREMARKET_ITEMS } from '@/store/workspaceStore';
import { usePropFirmStore } from '@/store/propFirmStore';
import { summarize, cmeSessionDate } from '@/lib/propFirm';
import { useMarketClock } from '@/hooks/useMarketClock';
import type { CalendarEvent } from '@/lib/economicCalendar';

interface QuoteRow {
  symbol: string; name: string; clsLabel: string; price: number | null; changePercent: number | null;
  quoteTime: string | null; freshness: { state: string; detail: string }; note?: string;
}

const FOCUS = ['NQ', 'ES', 'YM', 'RTY', 'GC', 'SI', 'VIX', 'BTC', 'EURUSD', 'XAUUSD', 'NAS100', 'US30'];

const MILESTONES = [
  { at: 9 * 60 + 30, label: 'NY cash open' },
  { at: 14 * 60 + 38, label: 'Power Hour entry window' },
  { at: 15 * 60, label: 'Stock Power Hour' },
  { at: 16 * 60, label: 'Cash close' },
  { at: 17 * 60, label: 'Globex halt' },
  { at: 18 * 60, label: 'Globex reopen' },
];

function etMinutes(now: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
}

const stateTone = (s: string) => (s === 'live' || s === 'delayed' ? 'text-gray-200' : s === 'closed' ? 'text-gray-500' : s === 'stale' ? 'text-tv-amber' : 'text-tv-red');

function Center() {
  const clock = useMarketClock(30_000);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id); }, []);
  const today = cmeSessionDate(now);
  const { plans, updatePlan, journal } = useWorkspaceStore();
  const plan = plans[today] ?? { date: today, checks: {}, maxDailyRisk: null, scenarios: '', bias: '' };
  const accounts = usePropFirmStore((s) => s.accounts);

  const [quotes, setQuotes] = useState<QuoteRow[] | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [calErr, setCalErr] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    const loadQ = () => fetch('/api/quotes').then((r) => r.json()).then((j) => { if (!off) { setQuotes(j.rows ?? []); setFeedError(j.feedError ?? null); } }).catch(() => { if (!off) setFeedError('Quote feed unreachable'); });
    const loadC = () => fetch('/api/calendar').then((r) => r.json()).then((j) => { if (!off) { setEvents(j.events ?? []); setCalErr(j.sourceError ?? null); } }).catch(() => { if (!off) setCalErr('Calendar unreachable'); });
    loadQ(); loadC();
    const id = setInterval(loadQ, 60_000);
    return () => { off = true; clearInterval(id); };
  }, []);

  const nextNews = useMemo(() => (events ?? []).filter((e) => e.impact === 'High' && e.country === 'USD' && Date.parse(e.at) >= now.getTime() - 15 * 60_000).slice(0, 4), [events, now]);
  const mins = etMinutes(now);
  const nextMilestone = MILESTONES.find((m) => m.at > mins);

  const todaysTrades = journal.filter((j) => j.date === today);
  const todayNet = todaysTrades.reduce((s, j) => s + (j.pnl ?? 0), 0);
  const riskLeft = plan.maxDailyRisk == null ? null : plan.maxDailyRisk - Math.max(0, -todayNet);
  const done = PREMARKET_ITEMS.filter((i) => plan.checks[i.key]).length;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Pre-market */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">1 · Pre-market</h2>
          <span className={`text-xs font-mono ${done === PREMARKET_ITEMS.length ? 'text-tv-green' : 'text-gray-500'}`}>{done}/{PREMARKET_ITEMS.length}</span>
        </div>
        <p className="text-[10px] text-gray-600">Session date {today} (CME: after 6 PM ET counts as the next day).</p>
        <ul className="space-y-1.5">
          {PREMARKET_ITEMS.map((i) => (
            <li key={i.key}>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={Boolean(plan.checks[i.key])} onChange={(e) => updatePlan(today, { checks: { ...plan.checks, [i.key]: e.target.checked } })} />
                {i.label}
              </label>
            </li>
          ))}
        </ul>
        <NumberField label="Max daily risk" suffix="$" value={plan.maxDailyRisk} onChange={(v) => updatePlan(today, { maxDailyRisk: v })} />
        <label className="block space-y-1"><span className="label">HTF bias / key levels</span>
          <textarea className="input font-sans min-h-[52px]" value={plan.bias} onChange={(e) => updatePlan(today, { bias: e.target.value.slice(0, 2000) })} />
        </label>
        <label className="block space-y-1"><span className="label">Trade scenarios (if / then)</span>
          <textarea className="input font-sans min-h-[72px]" value={plan.scenarios} onChange={(e) => updatePlan(today, { scenarios: e.target.value.slice(0, 4000) })} placeholder="If MNQ sweeps the Asia low and reclaims VWAP, look long to PDH. If it loses PDL, no longs." />
        </label>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link className="btn" href="/calendar">Calendar</Link>
          <Link className="btn" href="/market-structure">Structure</Link>
          <Link className="btn" href="/prop-firms">Accounts</Link>
        </div>
      </section>

      {/* Session */}
      <section className="card space-y-3">
        <h2 className="text-sm font-bold text-white">2 · Trading session</h2>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Market" value={clock?.shortLabel ?? '…'} tone={clock?.tradesOpen ? 'good' : 'muted'} sub={clock?.clock} />
          <Stat label="Next" value={nextMilestone ? nextMilestone.label : 'Tomorrow'} sub={nextMilestone ? `in ${nextMilestone.at - mins} min` : undefined} />
          <Stat label="Risk budget left" value={riskLeft == null ? 'set max risk' : usd(riskLeft)} tone={riskLeft == null ? 'muted' : riskLeft <= 0 ? 'bad' : 'good'} sub={`today net ${usd(todayNet)} (${todaysTrades.length} logged)`} />
          <Stat label="Next USD high-impact" value={calErr ? 'calendar down' : nextNews[0] ? new Date(nextNews[0].at).toLocaleTimeString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }) : events ? 'none this week' : '…'} tone={calErr ? 'bad' : undefined} sub={nextNews[0]?.title} />
        </div>
        {riskLeft != null && riskLeft <= 0 && <Notice tone="bad"><b>Daily risk used up.</b> Stop trading for today.</Notice>}
        {calErr && <Notice>Economic calendar unavailable ({calErr}). Check Forex Factory manually before trading.</Notice>}
        {clock?.holidayName && <Notice tone="info">{clock.headline}</Notice>}

        {accounts.length > 0 && (
          <div className="space-y-1">
            <div className="label">Accounts</div>
            {accounts.map((a) => {
              const s = summarize(a, today);
              return (
                <div key={a.id} className="flex justify-between text-xs font-mono">
                  <span className="text-gray-400 truncate">{a.label}</span>
                  <span className={s.drawdown && s.drawdown.remaining < (a.rules.drawdown.value?.amount ?? 0) * 0.25 ? 'text-tv-amber' : 'text-gray-200'}>
                    {s.drawdown ? `${usd(s.drawdown.remaining)} to floor` : 'drawdown not set'}{s.dailyLoss ? ` · ${usd(s.dailyLoss.remaining)} daily` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between">
            <span className="label">Instruments</span>
            {feedError ? <span className="text-[10px] font-bold text-tv-red">FEED DISCONNECTED</span> : <span className="text-[10px] text-gray-600">Yahoo · delayed</span>}
          </div>
          <div className="mt-1 divide-y divide-tv-border/50">
            {(quotes ?? []).filter((q) => FOCUS.includes(q.symbol)).map((q) => (
              <div key={q.symbol} className="flex items-center gap-2 py-1 text-xs" title={`${q.freshness.detail}${q.note ? ` · ${q.note}` : ''}`}>
                <span className="w-14 font-mono font-bold text-white">{q.symbol}</span>
                <span className="text-[10px] text-gray-600 w-24 truncate">{q.clsLabel}</span>
                <span className={`ml-auto font-mono ${stateTone(q.freshness.state)}`}>{q.price != null ? q.price.toLocaleString() : 'n/a'}</span>
                <span className={`w-14 text-right font-mono ${(q.changePercent ?? 0) >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{q.changePercent != null ? `${q.changePercent.toFixed(2)}%` : ''}</span>
                <span className={`w-16 text-right text-[10px] uppercase ${stateTone(q.freshness.state)}`}>{q.freshness.state}</span>
              </div>
            ))}
            {!quotes && !feedError && <div className="h-24 skeleton" />}
          </div>
          <p className="text-[10px] text-gray-600 mt-1">Futures, cash indexes, spot and CFDs are different prices — see each row&apos;s class. Hover for the quote time and source.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link className="btn btn-primary" href="/market-structure">Candidate setups →</Link>
          <Link className="btn" href="/power-hour">Power Hour →</Link>
          <Link className="btn" href="/risk">Size a trade →</Link>
        </div>
      </section>

      {/* Post-session */}
      <section className="card space-y-3">
        <h2 className="text-sm font-bold text-white">3 · Post-session</h2>
        {todaysTrades.length === 0 ? (
          <p className="text-sm text-gray-500">No trades logged for {today}. A day without a trade is a valid outcome.</p>
        ) : (
          <ul className="space-y-1 text-xs font-mono">
            {todaysTrades.map((t) => (
              <li key={t.id} className="flex justify-between">
                <span className="text-gray-300">{t.instrument} {t.direction}</span>
                <span className={(t.pnl ?? 0) >= 0 ? 'text-tv-green' : 'text-tv-red'}>{t.pnl != null ? usd(t.pnl) : '—'}</span>
                <span className={t.followedRules ? 'text-gray-500' : 'text-tv-amber'}>{t.followedRules ? 'rules ok' : 'rule break'}</span>
              </li>
            ))}
          </ul>
        )}
        <Link className="btn btn-primary" href="/journal">Open journal — log reasoning, mistakes, lessons, screenshots</Link>
        <p className="text-[10px] text-gray-600">Remember to add today&apos;s realized P&amp;L to each prop account&apos;s daily log so drawdown and consistency stay current.</p>
      </section>
    </div>
  );
}

export default function CommandCenterPage() {
  return (
    <div className="space-y-5 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Daily Command Center</h1>
        <p className="text-sm text-gray-500 mt-1">Prepare, trade, review. Checklists and notes are saved in this browser.</p>
      </div>
      <ClientOnly fallback={<div className="h-64 skeleton" />}><Center /></ClientOnly>
    </div>
  );
}
