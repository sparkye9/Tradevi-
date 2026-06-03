'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Dashboard', icon: '⬡' },
  { href: '/trade-discovery', label: 'Trade Discovery', icon: '◎' },
  { href: '/swing', label: 'Swing', icon: '↗' },
  { href: '/intraday', label: 'Intraday', icon: '⚡' },
  { href: '/opportunity-finder', label: 'Small Account Edge', icon: '🎯' },
  { href: '/options', label: 'Options', icon: '◈' },
  { href: '/mini-futures', label: 'Futures Guide', icon: '▦' },
  { href: '/power-hour', label: 'Power Hour', icon: '◉' },
];

// Mobile bottom nav shows a subset of the most-used pages
const MOBILE_NAV = [
  { href: '/', label: 'Home', icon: '⬡' },
  { href: '/intraday', label: 'Intraday', icon: '⚡' },
  { href: '/mini-futures', label: 'Futures', icon: '▦' },
  { href: '/power-hour', label: 'Power Hour', icon: '◉' },
  { href: '/trade-discovery', label: 'Discover', icon: '◎' },
];

export default function Sidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  // ── Mobile bottom nav ──
  if (mobile) {
    return (
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden flex items-stretch border-t border-[#1a1a1a]"
        style={{ background: '#090909' }}
      >
        {MOBILE_NAV.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-center transition-colors ${
                active ? 'text-emerald-400' : 'text-gray-600 hover:text-gray-300'
              }`}
            >
              <span className="text-lg leading-none">{icon}</span>
              <span className="text-[9px] font-semibold tracking-wide leading-none">{label}</span>
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-emerald-500 rounded-b-full" />
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  // ── Desktop sidebar ──
  return (
    <aside
      className="w-56 min-h-screen flex flex-col py-5 px-3 shrink-0"
      style={{
        background: '#090909',
        borderRight: '1px solid #1a1a1a',
        boxShadow: '1px 0 0 0 #0f0f0f',
      }}
    >
      {/* Logo */}
      <div className="mb-7 px-2 flex items-center gap-2">
        <span className="text-white font-bold text-lg tracking-tight">TRADEVI</span>
        <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
          3.0
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 flex-1">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                active
                  ? 'bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500'
                  : 'text-gray-500 hover:text-gray-200 hover:bg-white/5 border-l-2 border-transparent'
              }`}
            >
              <span className={`text-base leading-none ${active ? 'text-emerald-400' : 'text-gray-600'}`}>
                {icon}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pt-4 border-t border-[#1a1a1a]">
        <p className="text-[10px] text-gray-600 leading-relaxed">Real data only</p>
        <p className="text-[10px] text-gray-700">Finviz · Yahoo Finance</p>
      </div>
    </aside>
  );
}
