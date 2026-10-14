'use client';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import ClientOnly from '@/components/ClientOnly';
import LearnBox from '@/components/ui/LearnBox';
import { NumberField, TextField, Stat, Steps, Notice, usd } from '@/components/ui/Form';
import { usePropFirmStore } from '@/store/propFirmStore';
import {
  KNOWN_FIRMS, summarize, cmeSessionDate,
  type AccountProfile, type AccountRules, type Rule, type DrawdownRule, type ConsistencyRule, type PayoutRule,
} from '@/lib/propFirm';

// ─── Rule metadata row (source / verified) ──────────────────────────────────

function RuleBlock<T>({
  title, help, rule, onChange, children,
}: {
  title: string;
  help: string;
  rule: Rule<T>;
  onChange: (r: Rule<T>) => void;
  children: ReactNode;
}) {
  const set = rule.value != null;
  return (
    <div className="rounded-xl border border-tv-border bg-tv-bg/40 p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
        {!set ? (
          <span className="pill border-gray-700 text-gray-500">not set</span>
        ) : rule.verified ? (
          <span className="pill border-tv-green/40 text-tv-green">verified {rule.verifiedOn ?? ''}</span>
        ) : (
          <span className="pill border-tv-amber/50 text-tv-amber">unverified</span>
        )}
        {set && (
          <button className="ml-auto text-[10px] text-gray-500 hover:text-tv-red" onClick={() => onChange({ ...rule, value: null, verified: false })}>
            clear
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-500 leading-relaxed">{help}</p>
      {children}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
        <div className="sm:col-span-2">
          <TextField label="Source (URL or article)" value={rule.source} onChange={(v) => onChange({ ...rule, source: v, verified: false })} placeholder="Paste your firm's rule page link" />
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-300 pb-2">
          <input
            type="checkbox"
            checked={rule.verified}
            disabled={!set || !rule.source.trim()}
            onChange={(e) => onChange({ ...rule, verified: e.target.checked, verifiedOn: e.target.checked ? new Date().toISOString().slice(0, 10) : rule.verifiedOn })}
          />
          I checked this today
        </label>
      </div>
      <TextField label="Exceptions / notes" value={rule.notes ?? ''} onChange={(v) => onChange({ ...rule, notes: v })} placeholder="e.g. does not apply after first payout" />
    </div>
  );
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      <select className="input font-sans" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function RulesEditor({ acct }: { acct: AccountProfile }) {
  const setRule = usePropFirmStore((s) => s.setRule);
  const R = acct.rules;
  const put = <K extends keyof AccountRules>(k: K) => (r: AccountRules[K]) => setRule(acct.id, k, r);

  const dd: DrawdownRule = R.drawdown.value ?? { type: 'trailing_eod', amount: 0, basis: 'balance', stopTrailingAtOffset: null };
  const cons: ConsistencyRule = R.consistency.value ?? { formula: 'best_day_over_net_profit', thresholdPct: 0, resetsOnPayout: true };
  const pay: PayoutRule = R.payout.value ?? { bufferAboveStart: 0, minPayout: null, maxPayout: null, maxPctOfProfit: null, profitSplitPct: 100 };
  const numRule = (r: Rule<number>, v: number | null): Rule<number> => ({ ...r, value: v, verified: false });

  return (
    <div className="space-y-3">
      <Notice tone="info">
        Tradevi does not ship any firm&apos;s rules. Copy each value from your firm&apos;s <b>current</b> rules page for <b>this exact account type</b>,
        paste the link as the source, then tick &quot;I checked this today&quot;. Editing a value clears its verification.
      </Notice>

      <RuleBlock title="Profit target" help="Profit (balance − starting balance) needed to pass an evaluation." rule={R.profitTarget} onChange={put('profitTarget')}>
        <NumberField label="Target" suffix="$" value={R.profitTarget.value} onChange={(v) => put('profitTarget')(numRule(R.profitTarget, v))} />
      </RuleBlock>

      <RuleBlock
        title="Drawdown"
        help="Static: fixed floor below the start. End-of-day trailing: floor follows your highest closing balance. Intraday trailing: floor follows your highest open equity, including unrealized profit. Many firms stop trailing at a set level."
        rule={R.drawdown}
        onChange={put('drawdown')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select label="Type" value={dd.type} onChange={(t) => put('drawdown')({ ...R.drawdown, value: { ...dd, type: t }, verified: false })} options={[
            { value: 'static', label: 'Static' },
            { value: 'trailing_eod', label: 'End-of-day trailing' },
            { value: 'trailing_intraday', label: 'Intraday trailing' },
          ]} />
          <NumberField label="Max drawdown" suffix="$" value={R.drawdown.value?.amount ?? null} onChange={(v) => put('drawdown')({ ...R.drawdown, value: { ...dd, amount: v ?? 0 }, verified: false })} />
          <Select label="Breach measured on" value={dd.basis} onChange={(b) => put('drawdown')({ ...R.drawdown, value: { ...dd, basis: b }, verified: false })} options={[
            { value: 'balance', label: 'Balance (closed trades)' },
            { value: 'equity', label: 'Equity (incl. open trades)' },
          ]} />
          <NumberField
            label="Stops trailing at start +"
            suffix="$, blank = never"
            value={dd.stopTrailingAtOffset}
            onChange={(v) => put('drawdown')({ ...R.drawdown, value: { ...dd, stopTrailingAtOffset: v }, verified: false })}
            hint="e.g. 0 = floor locks at the starting balance, 100 = start + $100"
          />
        </div>
      </RuleBlock>

      <RuleBlock title="Daily loss limit" help="Leave blank if your account has none." rule={R.dailyLossLimit} onChange={put('dailyLossLimit')}>
        <NumberField label="Daily loss limit" suffix="$" value={R.dailyLossLimit.value} onChange={(v) => put('dailyLossLimit')(numRule(R.dailyLossLimit, v))} />
      </RuleBlock>

      <RuleBlock
        title="Consistency"
        help="Firms word this differently. Pick the formula that matches your firm's text exactly. 'Net' divides by all days including losses; 'gross' divides by winning days only."
        rule={R.consistency}
        onChange={put('consistency')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Select label="Formula" value={cons.formula} onChange={(f) => put('consistency')({ ...R.consistency, value: { ...cons, formula: f }, verified: false })} options={[
            { value: 'best_day_over_net_profit', label: 'Best day ÷ net profit' },
            { value: 'best_day_over_gross_profit', label: 'Best day ÷ winning days total' },
          ]} />
          <NumberField label="Max best-day share" suffix="%" value={R.consistency.value?.thresholdPct ?? null} onChange={(v) => put('consistency')({ ...R.consistency, value: { ...cons, thresholdPct: v ?? 0 }, verified: false })} />
          <label className="flex items-center gap-2 text-xs text-gray-300 pt-5">
            <input type="checkbox" checked={cons.resetsOnPayout} onChange={(e) => put('consistency')({ ...R.consistency, value: { ...cons, resetsOnPayout: e.target.checked }, verified: false })} />
            Counts only days since last payout
          </label>
        </div>
      </RuleBlock>

      <RuleBlock
        title="Trading days"
        help="Minimum number of qualifying days, and the profit a day needs to qualify (blank = any day with a trade)."
        rule={R.minTradingDays}
        onChange={(r) => {
          put('minTradingDays')(r);
          // Both numbers come from the same rule text, so they share source and verification.
          setRule(acct.id, 'qualifyingDayMinProfit', { ...R.qualifyingDayMinProfit, source: r.source, verified: r.verified, verifiedOn: r.verifiedOn, notes: r.notes });
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <NumberField label="Minimum qualifying days" value={R.minTradingDays.value} step={1} onChange={(v) => put('minTradingDays')(numRule(R.minTradingDays, v))} />
          <NumberField label="Day qualifies at ≥" suffix="$" value={R.qualifyingDayMinProfit.value} onChange={(v) => { setRule(acct.id, 'qualifyingDayMinProfit', { ...R.qualifyingDayMinProfit, value: v, verified: false }); setRule(acct.id, 'minTradingDays', { ...R.minTradingDays, verified: false }); }} />
        </div>
      </RuleBlock>

      <RuleBlock title="Payout rules" help="Funded accounts. The buffer is how far above the starting balance your balance must stay after a withdrawal." rule={R.payout} onChange={put('payout')}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <NumberField label="Buffer above start" suffix="$" value={R.payout.value?.bufferAboveStart ?? null} onChange={(v) => put('payout')({ ...R.payout, value: { ...pay, bufferAboveStart: v ?? 0 }, verified: false })} />
          <NumberField label="Min payout" suffix="$" value={pay.minPayout} onChange={(v) => put('payout')({ ...R.payout, value: { ...pay, minPayout: v }, verified: false })} />
          <NumberField label="Max payout" suffix="$" value={pay.maxPayout} onChange={(v) => put('payout')({ ...R.payout, value: { ...pay, maxPayout: v }, verified: false })} />
          <NumberField label="Max % of profit" suffix="%" value={pay.maxPctOfProfit} onChange={(v) => put('payout')({ ...R.payout, value: { ...pay, maxPctOfProfit: v }, verified: false })} />
          <NumberField label="Your profit split" suffix="%" value={R.payout.value?.profitSplitPct ?? null} onChange={(v) => put('payout')({ ...R.payout, value: { ...pay, profitSplitPct: v ?? 0 }, verified: false })} />
        </div>
      </RuleBlock>
    </div>
  );
}

// ─── Day and payout logs ────────────────────────────────────────────────────

function DayLog({ acct }: { acct: AccountProfile }) {
  const { upsertDay, removeDay, addPayout, removePayout, updateAccount } = usePropFirmStore();
  const [date, setDate] = useState(() => cmeSessionDate(new Date()));
  const [realized, setRealized] = useState<number | null>(null);
  const [peak, setPeak] = useState<number | null>(null);
  const [trough, setTrough] = useState<number | null>(null);
  const [payDate, setPayDate] = useState(() => cmeSessionDate(new Date()));
  const [payAmt, setPayAmt] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function add() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || realized == null) return setMsg('Enter a date and the day\'s realized P&L.');
    if (peak != null && peak < 0) return setMsg('Peak open profit cannot be negative.');
    if (trough != null && trough > 0) return setMsg('Lowest open P&L cannot be positive.');
    upsertDay(acct.id, { date, realized, peakUnrealized: peak, troughUnrealized: trough });
    setRealized(null); setPeak(null); setTrough(null); setMsg('');
  }

  function importCsv(text: string) {
    let n = 0, bad = 0;
    for (const line of text.trim().split(/\r?\n/)) {
      const cells = line.split(',').map((c) => c.trim().replace(/"/g, ''));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cells[0] ?? '')) { bad++; continue; }
      const num = (x?: string) => (x == null || x === '' ? null : Number(x.replace(/[$,]/g, '')));
      const r = num(cells[1]);
      if (r == null || !Number.isFinite(r)) { bad++; continue; }
      const pk = num(cells[2]), tr = num(cells[3]);
      upsertDay(acct.id, { date: cells[0], realized: r, peakUnrealized: Number.isFinite(pk as number) ? pk : null, troughUnrealized: Number.isFinite(tr as number) ? tr : null });
      n++;
    }
    setMsg(`Imported ${n} day(s)${bad ? `, skipped ${bad} line(s) (header or invalid)` : ''}.`);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
        <TextField label="Trading date" type="date" value={date} onChange={setDate} />
        <NumberField label="Realized P&L" suffix="$" value={realized} onChange={setRealized} />
        <NumberField label="Peak open profit" suffix="$" value={peak} onChange={setPeak} hint="optional, ≥ 0" />
        <NumberField label="Lowest open P&L" suffix="$" value={trough} onChange={setTrough} hint="optional, ≤ 0" />
        <button className="btn btn-primary h-9" onClick={add}>Save day</button>
      </div>
      <p className="text-[10px] text-gray-600">
        The date defaults to the CME session date (after 6:00 PM ET counts as the next day). Use your firm&apos;s definition if it differs.
        Peak and lowest open P&amp;L are relative to the day&apos;s opening balance and matter for intraday trailing / equity-based rules.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <button className="btn" onClick={() => fileRef.current?.click()}>Import CSV</button>
        <span className="text-[10px] text-gray-600">date,realized[,peak,lowest] — one row per day</span>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) f.text().then(importCsv);
          e.target.value = '';
        }} />
        <NumberField label="Open P&L now" suffix="$" value={acct.unrealizedNow ?? null} onChange={(v) => updateAccount(acct.id, { unrealizedNow: v })} />
      </div>
      {msg && <p className="text-xs text-tv-amber">{msg}</p>}

      {acct.days.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead className="text-gray-500 text-left">
              <tr><th className="py-1 pr-3">Date</th><th className="pr-3 text-right">Realized</th><th className="pr-3 text-right">Peak</th><th className="pr-3 text-right">Low</th><th /></tr>
            </thead>
            <tbody>
              {[...acct.days].reverse().map((d) => (
                <tr key={d.date} className="border-t border-tv-border/60">
                  <td className="py-1 pr-3 text-gray-400">{d.date}</td>
                  <td className={`pr-3 text-right ${d.realized >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{usd(d.realized)}</td>
                  <td className="pr-3 text-right text-gray-500">{d.peakUnrealized != null ? usd(d.peakUnrealized) : '—'}</td>
                  <td className="pr-3 text-right text-gray-500">{d.troughUnrealized != null ? usd(d.troughUnrealized) : '—'}</td>
                  <td className="text-right"><button aria-label={`Delete ${d.date}`} className="text-gray-600 hover:text-tv-red" onClick={() => removeDay(acct.id, d.date)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-tv-border pt-3 space-y-2">
        <h4 className="text-sm font-semibold text-white">Payouts taken</h4>
        <div className="grid grid-cols-3 gap-2 items-end">
          <TextField label="Date" type="date" value={payDate} onChange={setPayDate} />
          <NumberField label="Gross amount" suffix="$" value={payAmt} onChange={setPayAmt} />
          <button className="btn h-9" onClick={() => { if (payAmt && payAmt > 0) { addPayout(acct.id, { date: payDate, amount: payAmt }); setPayAmt(null); } }}>Add payout</button>
        </div>
        {acct.payouts.map((p, i) => (
          <div key={`${p.date}-${i}`} className="flex justify-between text-xs font-mono text-gray-400">
            <span>{p.date}</span><span>{usd(p.amount)}</span>
            <button aria-label="Delete payout" className="text-gray-600 hover:text-tv-red" onClick={() => removePayout(acct.id, i)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

function Dashboard({ acct }: { acct: AccountProfile }) {
  const today = cmeSessionDate(new Date());
  const s = useMemo(() => summarize(acct, today), [acct, today]);
  const dd = s.drawdown;
  const c = s.consistency;
  const p = s.payout;
  const profit = s.balance - acct.startingBalance;

  return (
    <div className="space-y-4">
      {s.unverified.length > 0 && (
        <Notice>
          <b>UNVERIFIED rules:</b> {s.unverified.join(', ')}. The numbers below use what you entered. Confirm each rule against your firm before relying on it.
        </Notice>
      )}
      {dd?.breachedOn && <Notice tone="bad"><b>Drawdown floor breached</b> ({dd.breachedOn}) under the rules you entered.</Notice>}
      {s.dailyLoss?.breached && <Notice tone="bad"><b>Daily loss limit reached.</b> Stop trading this account today.</Notice>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Starting balance" value={usd(acct.startingBalance)} />
        <Stat label="Current balance" value={usd(s.balance)} tone={profit >= 0 ? 'good' : 'bad'} sub={`after ${acct.payouts.length} payout(s)`} />
        <Stat label="Realized P&L" value={usd(s.realized)} tone={s.realized >= 0 ? 'good' : 'bad'} />
        <Stat label="Unrealized P&L" value={s.unrealized == null ? 'not entered' : usd(s.unrealized)} tone={s.unrealized == null ? 'muted' : s.unrealized >= 0 ? 'good' : 'bad'} />
        <Stat label="Profit target" value={s.profitTarget == null ? 'not set' : usd(s.profitTarget)} tone={s.profitTarget == null ? 'muted' : undefined} sub={s.profitToTarget != null ? `${usd(s.profitToTarget)} to go` : undefined} />
        <Stat label="Drawdown floor" value={dd ? usd(dd.floor) : 'not set'} tone={dd ? undefined : 'muted'} sub={dd ? (dd.trailingStopped ? 'trailing stopped' : dd.type.replace('_', ' ')) : undefined} />
        <Stat label="Remaining drawdown" value={dd ? usd(dd.remaining) : '—'} tone={!dd ? 'muted' : dd.remaining <= 0 ? 'bad' : dd.remaining < (acct.rules.drawdown.value?.amount ?? 0) * 0.25 ? 'warn' : 'good'} />
        <Stat label="Daily loss left" value={s.dailyLoss ? usd(s.dailyLoss.remaining) : 'no limit set'} tone={!s.dailyLoss ? 'muted' : s.dailyLoss.breached ? 'bad' : undefined} sub={s.dailyLoss ? `${usd(s.dailyLoss.used)} used today` : undefined} />
        <Stat label="Consistency" value={c?.pct == null ? (c ? 'n/a yet' : 'not set') : `${c.pct}% / ${c.thresholdPct}%`} tone={c?.compliant === false ? 'bad' : c?.compliant ? 'good' : 'muted'} sub={c && c.additionalProfitNeeded > 0 ? `${usd(c.additionalProfitNeeded)} more needed` : undefined} />
        <Stat label="Qualifying days" value={s.minTradingDays == null ? `${s.qualifyingDays}` : `${s.qualifyingDays} / ${s.minTradingDays}`} />
        <Stat label="Payout eligibility" value={acct.phase !== 'funded' ? 'evaluation' : !p ? 'rules not set' : p.eligible ? 'looks eligible' : 'not yet'} tone={p?.eligible ? 'good' : 'muted'} sub={p?.eligible ? `up to ${usd(p.grossWithdrawable)}` : undefined} />
        <Stat label="Max payout" value={acct.rules.payout.value?.maxPayout != null ? usd(acct.rules.payout.value.maxPayout) : '—'} />
      </div>

      <div className="rounded-xl border border-tv-purple/30 bg-tv-purple/5 p-3 text-sm text-gray-200">
        <span className="label mr-2">Next milestone</span>{s.nextMilestone}
      </div>

      {dd && (
        <section className="card space-y-2">
          <h3 className="text-sm font-bold text-white">Drawdown</h3>
          {dd.warnings.map((w) => <Notice key={w}>{w}</Notice>)}
          <Steps steps={dd.steps} />
        </section>
      )}
      {c && (
        <section className="card space-y-2">
          <h3 className="text-sm font-bold text-white">Consistency</h3>
          {c.maxNextDayProfit != null && c.compliant && (
            <p className="text-xs text-gray-400">Keep any single day under <span className="font-mono text-white">{usd(c.maxNextDayProfit)}</span> to stay inside the limit.</p>
          )}
          <Steps steps={c.steps} />
        </section>
      )}
      {p && (
        <section className="card space-y-2">
          <h3 className="text-sm font-bold text-white">Payout planner</h3>
          {!p.eligible && p.reasons.map((r) => <Notice key={r}>{r}</Notice>)}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Profit needed for buffer" value={usd(p.profitNeededForBuffer)} />
            <Stat label="Gross withdrawable" value={usd(p.grossWithdrawable)} sub={p.capApplied ? `capped: ${p.capApplied}` : undefined} />
            <Stat label="You receive (split)" value={usd(p.traderReceives)} />
            <Stat label="Room to floor after" value={usd(p.drawdownRoomAfter)} tone={p.drawdownRoomAfter != null && p.drawdownRoomAfter < 500 ? 'warn' : undefined} />
          </div>
          <Steps steps={p.steps} />
        </section>
      )}
      {s.missing.length > 0 && <p className="text-xs text-gray-500">Not set yet: {s.missing.join(', ')}.</p>}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

function NewAccount({ onDone }: { onDone: () => void }) {
  const addAccount = usePropFirmStore((s) => s.addAccount);
  const [firm, setFirm] = useState<string>(KNOWN_FIRMS[0]);
  const [customFirm, setCustomFirm] = useState('');
  const [accountType, setAccountType] = useState('');
  const [label, setLabel] = useState('');
  const [phase, setPhase] = useState<'evaluation' | 'funded'>('evaluation');
  const [start, setStart] = useState<number | null>(null);
  const [err, setErr] = useState('');
  return (
    <div className="card space-y-3">
      <h3 className="text-sm font-bold text-white">Add an account</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Select label="Firm" value={firm} onChange={setFirm} options={KNOWN_FIRMS.map((f) => ({ value: f, label: f }))} />
        {firm === 'Other' && <TextField label="Firm name" value={customFirm} onChange={setCustomFirm} />}
        <TextField label="Account type" value={accountType} onChange={setAccountType} placeholder="as the firm names it, e.g. '50K Rapid'" />
        <TextField label="Your label" value={label} onChange={setLabel} placeholder="optional" />
        <Select label="Phase" value={phase} onChange={setPhase} options={[{ value: 'evaluation', label: 'Evaluation' }, { value: 'funded', label: 'Funded' }]} />
        <NumberField label="Starting balance" suffix="$" value={start} onChange={setStart} />
      </div>
      {err && <p className="text-xs text-tv-red">{err}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={() => {
          const f = firm === 'Other' ? customFirm.trim() : firm;
          if (!f || !accountType.trim() || !start || start <= 0) return setErr('Firm, account type and a positive starting balance are required.');
          addAccount({ firm: f, accountType: accountType.trim(), label: label.trim() || `${f} ${accountType.trim()}`, phase, startingBalance: start });
          onDone();
        }}>Create</button>
        <button className="btn" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

function isAccountArray(x: unknown): x is AccountProfile[] {
  return Array.isArray(x) && x.every((a) => a && typeof a === 'object' && typeof a.id === 'string' && typeof a.startingBalance === 'number' && Array.isArray(a.days) && Array.isArray(a.payouts) && a.rules && typeof a.rules === 'object');
}

function Manager() {
  const { accounts, selectedId, select, removeAccount, importAll, updateAccount } = usePropFirmStore();
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<'dashboard' | 'rules' | 'log'>('dashboard');
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const acct = accounts.find((a) => a.id === selectedId) ?? accounts[0] ?? null;

  function exportJson() {
    const blob = new Blob([JSON.stringify(accounts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tradevi-prop-accounts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {accounts.map((a) => {
          const s = summarize(a, cmeSessionDate(new Date()));
          return (
            <button
              key={a.id}
              onClick={() => select(a.id)}
              className={`text-left rounded-xl border px-3 py-2 text-xs ${acct?.id === a.id ? 'border-tv-purple/60 bg-tv-purple/10' : 'border-tv-border bg-tv-surface hover:bg-tv-panel'}`}
            >
              <div className="font-semibold text-white">{a.label}</div>
              <div className="text-gray-500">{a.firm} · {a.phase}</div>
              <div className={`font-mono ${s.drawdown?.breachedOn ? 'text-tv-red' : 'text-gray-300'}`}>{usd(s.balance)}{s.drawdown ? ` · ${usd(s.drawdown.remaining)} to floor` : ''}</div>
            </button>
          );
        })}
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Account</button>
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={exportJson} disabled={!accounts.length}>Export</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Import</button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const data: unknown = JSON.parse(await f.text());
              if (!isAccountArray(data)) throw new Error('not a Tradevi accounts file');
              if (accounts.length && !confirm(`Replace your ${accounts.length} account(s) with ${data.length} from the file?`)) return;
              importAll(data);
              setMsg(`Imported ${data.length} account(s).`);
            } catch (err) {
              setMsg(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          }} />
        </div>
      </div>
      {msg && <p className="text-xs text-tv-amber">{msg}</p>}
      {adding && <NewAccount onDone={() => setAdding(false)} />}

      {!acct && !adding && (
        <div className="card text-sm text-gray-400">No accounts yet. Add one and enter its rules from your firm&apos;s rules page.</div>
      )}

      {acct && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-white">{acct.label}</h2>
            <span className="text-xs text-gray-500">{acct.firm} · {acct.accountType}</span>
            <select aria-label="Phase" className="input font-sans w-auto text-xs py-1" value={acct.phase} onChange={(e) => updateAccount(acct.id, { phase: e.target.value as 'evaluation' | 'funded' })}>
              <option value="evaluation">Evaluation</option>
              <option value="funded">Funded</option>
            </select>
            <button className="ml-auto text-xs text-gray-600 hover:text-tv-red" onClick={() => { if (confirm(`Delete ${acct.label} and its history?`)) removeAccount(acct.id); }}>Delete account</button>
          </div>
          <div role="tablist" className="flex gap-1 border-b border-tv-border">
            {(['dashboard', 'rules', 'log'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs font-semibold -mb-px border-b-2 ${tab === t ? 'border-tv-purple text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                {t === 'dashboard' ? 'Dashboard' : t === 'rules' ? 'Rules' : 'Daily log'}
              </button>
            ))}
          </div>
          {tab === 'dashboard' && <Dashboard acct={acct} />}
          {tab === 'rules' && <RulesEditor acct={acct} />}
          {tab === 'log' && <DayLog acct={acct} />}
        </div>
      )}
    </div>
  );
}

export default function PropFirmPage() {
  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Prop Firm Manager</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track each funded or evaluation account against the rules <b>you</b> enter from your firm. Every result shows its math.
          Data stays in this browser — export a backup.
        </p>
      </div>
      <LearnBox
        summary="drawdown, consistency and payout math for your prop accounts, from the rules you enter."
        items={[
          { term: 'Trailing drawdown', text: 'The floor follows your high-water mark up and never comes back down. End-of-day trails closing balances; intraday trails open profit too.' },
          { term: 'Consistency', text: 'Limits how much of your profit can come from one day. Firms compute it differently — choose the formula that matches yours.' },
          { term: 'Buffer', text: 'How far above your starting balance you must stay after a payout.' },
          { term: 'Unverified', text: 'A rule you entered but have not confirmed against the firm today. Tradevi never assumes a firm\'s rules.' },
        ]}
      />
      <ClientOnly fallback={<div className="h-40 skeleton" />}>
        <Manager />
      </ClientOnly>
    </div>
  );
}
