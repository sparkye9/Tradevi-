'use client';

export type StatusType = 'READY' | 'WATCH' | 'AVOID' | 'WAIT_FOR_RETEST';

interface Props {
  status: StatusType;
}

const CONFIG: Record<StatusType, { label: string; className: string }> = {
  READY: { label: 'READY', className: 'bg-green-500/20 text-green-400 border border-green-500/40' },
  WATCH: { label: 'WATCH', className: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40' },
  AVOID: { label: 'AVOID', className: 'bg-red-500/20 text-red-400 border border-red-500/40' },
  WAIT_FOR_RETEST: { label: 'WAIT FOR RETEST', className: 'bg-orange-500/20 text-orange-400 border border-orange-500/40' },
};

export default function StatusBadge({ status }: Props) {
  const { label, className } = CONFIG[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tracking-wide ${className}`}>
      {label}
    </span>
  );
}
