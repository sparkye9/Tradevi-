import { clsx } from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  border?: boolean;
  shadow?: 'none' | 'sm' | 'md';
  id?: string;
  accent?: string;
}

export function Card({ children, className, padding = 'md', border = true, shadow = 'sm', id, accent }: CardProps) {
  return (
    <div id={id} className={clsx(
      'bg-white rounded-xl',
      border && 'border',
      accent ? accent : 'border-gray-100',
      shadow === 'sm' && 'shadow-sm',
      shadow === 'md' && 'shadow-md',
      padding === 'sm' && 'p-3',
      padding === 'md' && 'p-4',
      padding === 'lg' && 'p-6',
      className
    )}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export function CardHeader({ title, subtitle, action, icon }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-2">
        {icon && <span className="text-purple-600">{icon}</span>}
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, change, changeLabel, color = 'gray' }: {
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  color?: 'gray' | 'green' | 'red' | 'purple';
}) {
  const colorMap = { gray: 'text-gray-900', green: 'text-green-700', red: 'text-red-700', purple: 'text-purple-700' };
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={clsx('text-2xl font-bold mt-1', colorMap[color])}>{value}</p>
      {change != null && (
        <p className={clsx('text-xs mt-1', change >= 0 ? 'text-green-600' : 'text-red-600')}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}% {changeLabel}
        </p>
      )}
    </div>
  );
}
