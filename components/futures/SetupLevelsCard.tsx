import type { TradeSetup } from '@/lib/futuresSetups';

function fmt(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS: Record<TradeSetup['status'], { tag: string; wrap: string }> = {
  look: { tag: 'LOOK', wrap: 'border-emerald-500/30 bg-emerald-500/5' },
  wait: { tag: 'WAIT', wrap: 'border-amber-500/30 bg-amber-500/5' },
  none: { tag: 'NO SETUP', wrap: 'border-[#2a2a2a] bg-[#111111]' },
};

export default function SetupLevelsCard({
  title,
  subtitle,
  setup,
}: {
  title: string;
  subtitle: string;
  setup: TradeSetup;
}) {
  const meta = STATUS[setup.status];
  const side =
    setup.side === 'long' ? 'LONG' : setup.side === 'short' ? 'SHORT' : null;
  const sideColor = setup.side === 'long' ? 'text-emerald-400' : setup.side === 'short' ? 'text-red-400' : 'text-gray-500';

  return (
    <div className={`border rounded-2xl p-5 space-y-4 ${meta.wrap}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500">{title}</div>
          <div className="text-lg font-bold text-white mt-0.5">
            {side ? (
              <span className={sideColor}>
                {side} · {meta.tag}
              </span>
            ) : (
              <span className="text-gray-300">{meta.tag}</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        </div>
        {setup.rToTp1 != null && setup.status !== 'none' && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-gray-600">TP1</div>
            <div className="text-xl font-mono font-bold text-white">{setup.rToTp1}R</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <LevelBox label="Entry" value={fmt(setup.entry)} />
        <LevelBox label="Stop loss" value={fmt(setup.stop)} tone="stop" />
        <LevelBox label="Take profit 1" value={fmt(setup.tp1)} tone="tp" />
        <LevelBox label="Take profit 2" value={fmt(setup.tp2)} tone="tp" />
      </div>

      {setup.risk != null && setup.status !== 'none' && (
        <div className="text-xs font-mono text-gray-500">Risk {fmt(setup.risk)} from entry to stop</div>
      )}
      <p className="text-xs text-gray-400 leading-relaxed">{setup.note}</p>
    </div>
  );
}

function LevelBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'stop' | 'tp';
}) {
  const color = tone === 'stop' ? 'text-red-300' : tone === 'tp' ? 'text-emerald-300' : 'text-white';
  return (
    <div className="rounded-xl bg-black/30 border border-white/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-gray-500">{label}</div>
      <div className={`text-sm font-mono font-semibold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
