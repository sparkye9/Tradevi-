import { clsx } from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'gray';
  size?: 'sm' | 'md';
  className?: string;
}

const variants = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
  gray: 'bg-gray-100 text-gray-500',
};

export function Badge({ children, variant = 'default', size = 'sm', className }: BadgeProps) {
  return (
    <span className={clsx(
      'inline-flex items-center font-medium rounded-full',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      variants[variant],
      className
    )}>
      {children}
    </span>
  );
}

export function RiskBadge({ label }: { label: string }) {
  const map: Record<string, BadgeProps['variant']> = {
    Low: 'success', Medium: 'warning', High: 'danger', Lottery: 'gray',
  };
  return <Badge variant={map[label] ?? 'default'}>{label}</Badge>;
}

export function BiasBadge({ bias }: { bias: string }) {
  const map: Record<string, BadgeProps['variant']> = {
    bullish: 'success', bearish: 'danger', neutral: 'info',
  };
  return (
    <Badge variant={map[bias] ?? 'default'}>
      {bias === 'bullish' ? '▲ Bullish' : bias === 'bearish' ? '▼ Bearish' : '→ Neutral'}
    </Badge>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const variant: BadgeProps['variant'] = score >= 70 ? 'success' : score >= 50 ? 'warning' : 'danger';
  return <Badge variant={variant} size="md">{score}/100</Badge>;
}
