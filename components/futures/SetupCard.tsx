'use client';
import type { SetupCandidate } from '@/lib/setupEngine';

const STATUS_STYLE: Record<SetupCandidate['status'], string> = {
  Confirmed: 'border-tv-green/50 text-tv-green bg-tv-green/10',
  Watching: 'border-tv-amber/50 text-tv-amber bg-tv-amber/10',
  Invalidated: 'border-tv-red/40 text-tv-red bg-tv-red/10',
  Expired: 'border-gray-600 text-gray-400 bg-white/5',
};

function px(n: number | null) {
  return n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/** One candidate trade, with the inputs that produced it. */
export default function FuturesSetupCard({ s }: { s: SetupCandidate }) {
  const dead = s.status === 'Invalidated' || s.status === 'Expired';
  return (
    <article className={`card space-y-3 ${dead ? 'opacity-60' : ''}`}>
      <header className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-bold text-white">{s.instrument}</span>
        <span className={`pill ${s.direction === 'long' ? 'border-tv-green/40 text-tv-green' : 'border-tv-red/40 text-tv-red'}`}>{s.bias}</span>
        <span className="pill border-tv-border text-gray-300">{s.type}</span>
        <span className={`pill ${STATUS_STYLE[s.status]}`}>{s.status}</span>
        <span className="ml-auto text-xs text-gray-500 font-mono" title="Checklist total — not a probability of success">score {s.score}/100</span>
      </header>
      <p className="text-xs text-gray-400">{s.statusReason}</p>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        <div><dt className="label">Entry zone</dt><dd className="text-white">{px(s.entryZone[0])} – {px(s.entryZone[1])}</dd></div>
        <div><dt className="label">Invalidation</dt><dd className="text-white">{px(s.invalidation)}</dd></div>
        <div><dt className="label">Stop</dt><dd className="text-tv-red">{px(s.stop)}</dd></div>
        <div><dt className="label">R:R to TP1</dt><dd className="text-white">{s.rr ?? '—'}</dd></div>
        <div className="col-span-2"><dt className="label">TP1</dt><dd className="text-tv-green">{px(s.tp1)} {s.tp1Name && <span className="text-gray-500">({s.tp1Name})</span>}</dd></div>
        <div className="col-span-2"><dt className="label">TP2</dt><dd className="text-tv-green">{px(s.tp2)} {s.tp2Name && <span className="text-gray-500">({s.tp2Name})</span>}</dd></div>
      </dl>
      <div>
        <div className="label mb-1">Confirmation required</div>
        <ul className="list-disc pl-5 text-xs text-gray-300 space-y-0.5">{s.confirmation.map((c) => <li key={c}>{c}</li>)}</ul>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-gray-500 hover:text-gray-300">Why this setup? (score breakdown)</summary>
        <p className="mt-2 text-gray-400">{s.rule}</p>
        <table className="mt-2 w-full">
          <tbody>
            {s.factors.map((f) => (
              <tr key={f.key} className="border-t border-tv-border/60">
                <td className="py-1 pr-2 text-gray-300">{f.label}</td>
                <td className="py-1 pr-2 text-gray-500">{f.detail}</td>
                <td className={`py-1 text-right font-mono ${f.points === f.max ? 'text-tv-green' : f.points === 0 ? 'text-tv-red' : 'text-tv-amber'}`}>{f.points}/{f.max}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] text-gray-600">The score is a checklist total with fixed weights. It has not been validated as a win probability.</p>
      </details>
      {!s.dataOk && <p className="text-[10px] text-tv-amber">15m / 5m data missing or stale — this setup cannot be confirmed.</p>}
    </article>
  );
}
