'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Search, BarChart2, Eye, Zap, Shield,
  Bell, BookOpen, FlaskConical, BookMarked, ClipboardList, X, TrendingUp,
  CandlestickChart, Crosshair, Gauge, Layers, Flame, Moon, Activity, Brain, Droplets, Target,
} from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/charts', label: 'Technical Charts', icon: CandlestickChart },
  { href: '/market-analysis', label: 'Market Analysis', icon: TrendingUp },
  { href: '/orb-analysis', label: 'ORB Analysis', icon: Crosshair },
  { href: '/power-hour', label: 'Power Hour', icon: Flame },
  { href: '/power-hour-engine', label: 'PH Prediction Engine', icon: Brain },
  { href: '/liquidity-engine', label: 'Liquidity & Exit Engine', icon: Droplets },
  { href: '/swing-engine', label: 'Swing Engine', icon: Target },
  { href: '/after-hours', label: 'After-Hours', icon: Moon },
  { href: '/mnq-dashboard', label: 'MNQ Dashboard', icon: Gauge },
  { href: '/esm6-dashboard', label: 'ESM6 Dashboard', icon: Activity },
  { href: '/options-flow', label: 'Options Flow', icon: Layers },
  { href: '/options-chain', label: 'Options Chain', icon: BarChart2 },
  { href: '/watchlist', label: 'Watchlist', icon: Eye },
  { href: '/signals', label: 'Signals', icon: Zap },
  { href: '/risk', label: 'Risk & Safety', icon: Shield },
  { href: '/alerts', label: 'Trade Alerts', icon: Bell },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/backtest', label: 'Backtest Lab', icon: FlaskConical },
  { href: '/bible', label: 'Bible & Mindset', icon: BookMarked },
  { href: '/audit', label: 'Audit Log', icon: ClipboardList },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={clsx(
        'fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-100 z-30 flex flex-col transition-transform duration-300',
        'lg:relative lg:translate-x-0 lg:z-auto',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <TrendingUp size={16} className="text-white" />
            </div>
            <div>
              <span className="font-bold text-gray-900 text-sm">TradeWise</span>
              <p className="text-xs text-gray-400">Analysis Only</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-gray-600 p-1">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-colors',
                  active
                    ? 'bg-purple-50 text-purple-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <Icon size={16} className={active ? 'text-purple-600' : 'text-gray-400'} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100">
          <p className="text-xs text-gray-400 leading-relaxed">
            For education only. Not financial advice. Options can go to zero.
          </p>
        </div>
      </aside>
    </>
  );
}
