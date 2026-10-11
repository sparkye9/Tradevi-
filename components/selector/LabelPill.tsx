import type { SelectorLabel } from '@/lib/selector';

export const LABEL_STYLE: Record<SelectorLabel, { pill: string; wrap: string }> = {
  Trade: { pill: 'border-tv-green/40 text-tv-green bg-tv-green/10', wrap: 'border-tv-green/25' },
  Watch: { pill: 'border-tv-amber/40 text-tv-amber bg-tv-amber/10', wrap: 'border-tv-amber/20' },
  Avoid: { pill: 'border-tv-border text-tv-muted bg-white/5', wrap: 'border-tv-border opacity-70' },
};

export default function LabelPill({ label, title }: { label: SelectorLabel; title?: string }) {
  return (
    <span className={`pill ${LABEL_STYLE[label].pill}`} title={title}>
      {label}
    </span>
  );
}
