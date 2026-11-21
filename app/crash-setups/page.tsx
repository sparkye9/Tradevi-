'use client';
import { useEffect, useState } from 'react';
import LearnBox from '@/components/ui/LearnBox';
import CrashSubnav from '@/components/crash/CrashSubnav';
import { LabelBadge, Pill, SectionTitle, Stat, TONE_TEXT, fmtDate, pctFmt, qualityTone, scoreTone, usd } from '@/components/crash/ui';
import type { LiveSetupsResult, LiveSetup } from '@/lib/crash/history/liveSetups';
import type { SignalStats } from '@/lib/crash/history/signals';
import type { PeriodStats } from '@/lib/crash/history/strategies';

type Resp = LiveSetupsResult & { symbol: string; error?: string };

function SignalLine({ label, s }: { label: string; s: SignalStats }) {
  return (
    <tr className="border-t border-white/[0.04]">
      <td className="py-1 pr-2 text-tv-muted">{label}</td>
      <td className="pr-2 text-right font-mono">{s.warned}/{s.declines}</td>
      <td className="pr-2 text-right font-mono">{s.avgLeadDays != null ? `${Math.round(s.avgLeadDays)} d` : '—'}</td>
      <td className="pr-2 text-right font-mono">{s.episodes}</td>
      <td className="text-right font-mono">{s.falseAlarms} <span className="text-tv-muted">({pctFmt(s.falseAlarmRate, 0)})</span></td>
    </tr>
  );
}

function TradeLine({ label, s }: { label: string; s: PeriodStats }) {
  return (
    <tr className="border-t border-white/[0.04]">
      <td className="py-1 pr-2 text-tv-muted">{label}</td>
      <td className="pr-2 text-right font-mono">{s.trades}</td>
      <td className="pr-2 text-right font-mono">{pctFmt(s.winRate, 0)}</td>
      <td className={`pr-2 text-right font-mono ${s.net >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{usd(s.net, 0)}</td>
      <td className="pr-2 text-right font-mono">{s.profitFactor != null ? s.profitFactor.toFixed(2) : '—'}</td>
      <td className="text-right font-mono">{s.maxConsecutiveLosses}</td>
    </tr>
  );
}

function SetupCard({ s }: { s: LiveSetup }) {
  const ev = s.evidence;
  return (
    <div className={`card p-4 space-y-3 ${s.firing ? 'border-tv-red/40' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-white">{s.def.name}</div>
          <div className="text-[11px] text-tv-muted">{s.def.horizon} · puts only · {s.def.about}</div>
        </div>
        {s.firing ? <Pill tone="red">CONDITIONS PRESENT TODAY</Pill> : <Pill tone="gray">NOT FIRING</Pill>}
      </div>
      <div className="text-xs text-gray-300">Rule: <b className="text-white">{ev?.rule ?? (s.rule.kind === 'score' ? `Risk score ≥ ${s.rule.min}` : s.rule.regimes.join(' or '))}</b> · {s.distance}</div>
      {ev ? (
        <div className="grid lg:grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-tv-muted mb-1">Track record of the rule against 10% declines (point-in-time). {ev.thresholdSource}.</div>
            <table className="w-full">
              <thead className="text-tv-muted text-left"><tr><th className="py-1 pr-2" /><th className="pr-2 text-right">Warned</th><th className="pr-2 text-right">Avg lead</th><th className="pr-2 text-right">Fires</th><th className="text-right">False alarms</th></tr></thead>
              <tbody>
                <SignalLine label="Whole history" s={ev.signal} />
                <SignalLine label={`In-sample (< ${ev.splitDate.slice(0, 4)})`} s={ev.inSample} />
                <SignalLine label={`Out-of-sample (≥ ${ev.splitDate.slice(0, 4)})`} s={ev.outOfSample} />
              </tbody>
            </table>
            {ev.walkForward && <p className="text-tv-muted mt-1">Walk-forward, all unseen windows: {ev.walkForward.warned}/{ev.walkForward.declines} declines warned, {ev.walkForward.falseAlarms} false alarms.</p>}
          </div>
          <div>
            <div className="text-tv-muted mb-1"><Pill tone="amber">THEORETICAL</Pill> Outcome of this setup&apos;s puts on SPY, priced with the disclosed model (no historical chains), $500 per trade, bought at the ask, sold at the bid.</div>
            {ev.theoretical ? (
              <table className="w-full">
                <thead className="text-tv-muted text-left"><tr><th className="py-1 pr-2" /><th className="pr-2 text-right">Trades</th><th className="pr-2 text-right">Win rate</th><th className="pr-2 text-right">Net</th><th className="pr-2 text-right">Profit factor</th><th className="text-right">Worst streak</th></tr></thead>
                <tbody>
                  <TradeLine label="Whole history" s={ev.theoretical.all} />
                  <TradeLine label="In-sample" s={ev.theoretical.inSample} />
                  <TradeLine label="Out-of-sample" s={ev.theoretical.outOfSample} />
                </tbody>
              </table>
            ) : <p className="text-tv-muted">No theoretical trades in the history.</p>}
          </div>
        </div>
      ) : (
        <p className="text-xs text-tv-muted">Historical evidence unavailable right now.</p>
      )}
      {s.firing && (
        <div>
          <div className="text-xs text-tv-muted mb-1">Live contracts at WATCH or better{s.hunt ? ` · ${s.hunt.source} · ${s.hunt.passing} of ${s.hunt.scanned} passed filters` : ''}</div>
          {s.hunt?.error && <p className="text-xs text-tv-amber">{s.hunt.error}</p>}
          {s.contracts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-tv-muted text-left"><tr><th className="py-1 pr-2">Label</th><th className="pr-2">Contract</th><th className="pr-2 text-right">Bid / ask</th><th className="pr-2 text-right">Cost</th><th className="pr-2 text-right">Δ</th><th className="pr-2 text-right">Breakeven</th><th className="pr-2 text-right">Quality</th><th className="text-right">Setup</th></tr></thead>
                <tbody>
                  {s.contracts.map((r) => (
                    <tr key={r.ev.contract.symbol} className="border-t border-white/[0.04]">
                      <td className="py-1 pr-2"><LabelBadge label={r.setup.label} /></td>
                      <td className="pr-2 font-mono whitespace-nowrap">{r.ev.contract.strike}P {fmtDate(r.ev.contract.expiration)} <span className="text-tv-muted">{r.ev.contract.dte}d</span></td>
                      <td className="pr-2 text-right font-mono">{usd(r.ev.contract.bid)} / {usd(r.ev.contract.ask)}</td>
                      <td className="pr-2 text-right font-mono">{usd(r.ev.costAtAsk)}</td>
                      <td className="pr-2 text-right font-mono">{r.ev.contract.delta?.toFixed(2)}</td>
                      <td className="pr-2 text-right font-mono">{usd(r.ev.breakevenAtAsk)}</td>
                      <td className={`pr-2 text-right font-mono ${TONE_TEXT[qualityTone(r.ev.quality)]}`}>{r.ev.quality}</td>
                      <td className={`text-right font-mono ${TONE_TEXT[qualityTone(r.setup.setup)]}`}>{r.setup.setup}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-xs text-tv-muted">{s.hunt?.noTradeReason ?? 'No contract reached WATCH.'} Open Put Hunter for the full list.</p>}
        </div>
      )}
    </div>
  );
}

export default function CrashSetupsPage() {
  const [symbol, setSymbol] = useState('SPY');
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    fetch(`/api/crash/setups?symbol=${symbol}`)
      .then(async (r) => {
        const j = (await r.json()) as Resp;
        if (!r.ok && !j.error) j.error = `HTTP ${r.status}`;
        setData(j);
      })
      .catch((e) => setData({ error: e instanceof Error ? e.message : String(e) } as Resp))
      .finally(() => setLoading(false));
  }, [symbol]);
  return (
    <div className="space-y-4 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Put Setups</h1>
          <p className="text-sm text-tv-muted">Today&apos;s market checked against put entry rules tested on the historical replay.</p>
        </div>
        <CrashSubnav />
      </div>
      <LearnBox
        summary="Each setup is a rule tested on history; it lights up when today's conditions match, with its track record beside it."
        items={[
          { term: 'Research flags', text: 'A firing setup means the rule’s conditions are present today. It is not a recommendation or a forecast, and Tradevi never places orders.' },
          { term: 'Evidence', text: 'How often the rule fired before a 10% decline, how much warning it gave, how many false alarms, separately before and after 2016 (out of sample) and in walk-forward tests.' },
          { term: 'Theoretical outcomes', text: 'Without licensed historical chains, the trade results are model prices from historical closes and Cboe volatility indexes. They are labelled THEORETICAL and are not historical trades.' },
          { term: 'Sizing', text: 'Every put can expire worthless. Keep each idea inside the risk budget on Put Hunter; one contract is the default.' },
        ]}
      />
      <div className="card p-4">
        <SectionTitle
          title="Market today"
          right={
            <div className="flex gap-1.5">
              {['SPY', 'QQQ', 'IWM', 'DIA'].map((s) => <button key={s} className={`btn text-xs ${symbol === s ? 'btn-primary' : ''}`} onClick={() => setSymbol(s)}>{s}</button>)}
            </div>
          }
        />
        {loading && <div className="skeleton h-16 rounded-xl" />}
        {data?.error && <p className="text-sm text-tv-red">{data.error}</p>}
        {data && !data.error && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Crash Risk Score" value={data.market.score != null ? Math.round(data.market.score) : '—'} tone={scoreTone(data.market.score)} sub={`as of ${fmtDate(data.market.asOf)}`} />
            <Stat label="Regime" value={data.market.insufficient ? 'INSUFFICIENT DATA' : data.market.regime} />
            <Stat label="Setups firing" value={data.setups.filter((s) => s.firing).length} sub={`of ${data.setups.length}`} />
            <Stat label="Underlying" value={data.symbol} sub="live contracts from Tradier" />
          </div>
        )}
        {data?.evidenceError && <p className="text-xs text-tv-amber mt-2">{data.evidenceError}</p>}
      </div>
      {data && !data.error && data.setups.map((s) => <SetupCard key={s.def.id} s={s} />)}
      <p className="text-[11px] text-tv-muted">Research and education only. Past and theoretical results do not predict future results. No profit is promised.</p>
    </div>
  );
}
