'use client';
import { useMemo, useState } from 'react';
import ClientOnly from '@/components/ClientOnly';
import LearnBox from '@/components/ui/LearnBox';
import { NumberField, Stat, Steps, Notice, usd } from '@/components/ui/Form';
import { calcFuturesRisk } from '@/lib/futuresRisk';
import { CALCULATOR_CONTRACTS, CONTRACTS, SPEC_REVIEWED_ON, SPEC_SOURCE } from '@/lib/contracts';
import { usePropFirmStore } from '@/store/propFirmStore';
import { summarize, cmeSessionDate } from '@/lib/propFirm';

function Calculator() {
  const accounts = usePropFirmStore((s) => s.accounts);
  const [acctId, setAcctId] = useState('');
  const [contract, setContract] = useState('MNQ');
  const [balance, setBalance] = useState<number | null>(50_000);
  const [mode, setMode] = useState<'percent' | 'dollars'>('dollars');
  const [riskValue, setRiskValue] = useState<number | null>(250);
  const [entry, setEntry] = useState<number | null>(null);
  const [stop, setStop] = useState<number | null>(null);
  const [tp1, setTp1] = useState<number | null>(null);
  const [tp2, setTp2] = useState<number | null>(null);
  const [fees, setFees] = useState<number | null>(null);
  const [slip, setSlip] = useState<number | null>(1);
  const [planned, setPlanned] = useState<number | null>(null);

  const acct = accounts.find((a) => a.id === acctId) ?? null;
  const acctSummary = useMemo(() => (acct ? summarize(acct, cmeSessionDate(new Date())) : null), [acct]);
  const spec = CONTRACTS[contract];

  const ready = balance != null && riskValue != null && entry != null && stop != null;
  const r = ready
    ? calcFuturesRisk({
        contract,
        accountBalance: balance!,
        riskMode: mode,
        riskValue: riskValue!,
        entry: entry!,
        stop: stop!,
        targets: [tp1, tp2].filter((t): t is number => t != null),
        feesPerContractRoundTrip: fees ?? 0,
        slippageTicks: slip ?? 0,
        plannedContracts: planned ?? undefined,
      })
    : null;

  // Prop-account caps: the trade should not be able to breach the floor or the daily limit.
  const propWarnings: string[] = [];
  if (r?.ok && acctSummary) {
    if (acctSummary.drawdown && r.estimatedLoss >= acctSummary.drawdown.remaining) {
      propWarnings.push(`A full stop-out (${usd(r.estimatedLoss)}) reaches or passes this account's drawdown floor (${usd(acctSummary.drawdown.remaining)} left).`);
    }
    if (acctSummary.dailyLoss && r.estimatedLoss >= acctSummary.dailyLoss.remaining) {
      propWarnings.push(`A full stop-out (${usd(r.estimatedLoss)}) reaches the daily loss limit (${usd(acctSummary.dailyLoss.remaining)} left today).`);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="card space-y-3">
        <h2 className="text-sm font-bold text-white">Inputs</h2>
        {accounts.length > 0 && (
          <label className="block space-y-1">
            <span className="label">Prop account (optional)</span>
            <select className="input font-sans" value={acctId} onChange={(e) => {
              setAcctId(e.target.value);
              const a = accounts.find((x) => x.id === e.target.value);
              if (a) setBalance(summarize(a, cmeSessionDate(new Date())).balance);
            }}>
              <option value="">None</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
        )}
        <label className="block space-y-1">
          <span className="label">Contract</span>
          <select className="input font-sans" value={contract} onChange={(e) => setContract(e.target.value)}>
            {CALCULATOR_CONTRACTS.map((c) => (
              <option key={c} value={c}>{c} — {CONTRACTS[c].name}</option>
            ))}
          </select>
          <span className="block text-[10px] text-gray-600 font-mono">
            tick {spec.tickSize} = {usd(spec.tickValue)} · 1 pt = {usd(spec.pointValue)} · {spec.multiplier} · {spec.exchange}
          </span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Account balance" suffix="$" value={balance} onChange={setBalance} />
          <div className="space-y-1">
            <span className="label">Max risk</span>
            <div className="flex gap-1">
              <select aria-label="Risk unit" className="input font-sans w-20" value={mode} onChange={(e) => setMode(e.target.value as 'percent' | 'dollars')}>
                <option value="dollars">$</option>
                <option value="percent">%</option>
              </select>
              <input aria-label="Max risk value" type="number" inputMode="decimal" className="input" value={riskValue ?? ''} onChange={(e) => setRiskValue(e.target.value === '' ? null : Number(e.target.value))} />
            </div>
          </div>
          <NumberField label="Entry" value={entry} onChange={setEntry} step={spec.tickSize} />
          <NumberField label="Stop-loss" value={stop} onChange={setStop} step={spec.tickSize} />
          <NumberField label="Target 1" value={tp1} onChange={setTp1} step={spec.tickSize} hint="optional" />
          <NumberField label="Target 2" value={tp2} onChange={setTp2} step={spec.tickSize} hint="optional" />
          <NumberField label="Fees per contract, round trip" suffix="$" value={fees} onChange={setFees} hint="commission + exchange + NFA, from your broker" />
          <NumberField label="Stop slippage" suffix="ticks" value={slip} onChange={setSlip} step={1} min={0} />
          <NumberField label="Contracts you plan" value={planned} onChange={setPlanned} step={1} min={0} hint="blank = use the maximum" />
        </div>
        <p className="text-[10px] text-gray-600">Specs: {SPEC_SOURCE}, reviewed {SPEC_REVIEWED_ON}. Confirm on cmegroup.com if the exchange changes a contract.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-bold text-white">Result</h2>
        {!ready && <p className="text-sm text-gray-500">Enter balance, risk, entry and stop.</p>}
        {r && !r.ok && r.errors.map((e) => <Notice key={e} tone="bad">{e}</Notice>)}
        {r?.ok && (
          <>
            {r.warnings.map((w) => <Notice key={w} tone={/EXCEEDED|Do not/.test(w) ? 'bad' : 'warn'}>{w}</Notice>)}
            {propWarnings.map((w) => <Notice key={w} tone="bad">{w}</Notice>)}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Stat label="Side" value={r.side?.toUpperCase()} tone={r.side === 'long' ? 'good' : 'bad'} />
              <Stat label="Stop distance" value={`${r.stopPoints} pts`} sub={`${r.stopTicks} ticks`} />
              <Stat label="Risk / contract" value={usd(r.riskPerContract)} sub={`price ${usd(r.riskPerContractGross)} + slip ${usd(r.slippagePerContract)} + fees ${usd(r.feesPerContract)}`} />
              <Stat label="Risk budget" value={usd(r.riskBudget)} />
              <Stat label="Max contracts" value={r.maxContracts} tone={r.maxContracts === 0 ? 'bad' : 'good'} sub="rounded down" />
              <Stat label="Estimated loss" value={usd(r.estimatedLoss)} tone={r.exceedsLimit ? 'bad' : undefined} sub={`${r.contracts} contract(s) · ${r.estimatedLossPctOfBalance}% of balance`} />
            </div>
            {r.targets.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead className="text-gray-500 text-left">
                    <tr><th className="py-1">Target</th><th className="text-right">Ticks</th><th className="text-right">Net / contract</th><th className="text-right">Net total</th><th className="text-right">R:R gross / net</th></tr>
                  </thead>
                  <tbody>
                    {r.targets.map((t) => (
                      <tr key={t.price} className="border-t border-tv-border/60">
                        <td className="py-1">{t.price}</td>
                        <td className="text-right">{t.ticks}</td>
                        <td className="text-right text-tv-green">{usd(t.netPerContract)}</td>
                        <td className="text-right text-tv-green">{usd(t.netTotal)}</td>
                        <td className="text-right">{t.rrGross} / {t.rrNet}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Steps steps={r.steps} />
            <p className="text-[10px] text-gray-600">Estimates assume the stop fills within the slippage you entered. Fast markets, gaps and limit-locked moves can fill worse.</p>
          </>
        )}
      </section>
    </div>
  );
}

export default function RiskPage() {
  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Risk Calculator</h1>
        <p className="text-sm text-gray-500 mt-1">Contract-aware futures position sizing. Size is always rounded down so you never exceed your risk limit.</p>
      </div>
      <LearnBox
        summary="how many futures contracts fit your risk limit at a given stop."
        items={[
          { term: 'Tick', text: 'The smallest price step. MNQ moves in 0.25 points, and each tick is worth $0.50.' },
          { term: 'Micro vs standard', text: 'A micro is 1/10 of the full contract. The same 20-point NQ stop risks $400 on NQ but $40 on MNQ.' },
          { term: 'R:R', text: 'Reward ÷ risk. Net R:R includes fees and stop slippage.' },
        ]}
      />
      <ClientOnly fallback={<div className="h-64 skeleton" />}>
        <Calculator />
      </ClientOnly>
    </div>
  );
}
