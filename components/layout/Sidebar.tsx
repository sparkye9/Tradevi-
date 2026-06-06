'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MAIN_NAV = [
  { href: '/', label: 'Dashboard', icon: '⬡' },
  { href: '/futures-bias', label: 'Futures', icon: '◀' },
  { href: '/command-center', label: 'Command Center', icon: '⊕' },
  { href: '/mini-futures', label: 'Decision Engine', icon: '▦' },
  { href: '/swing', label: 'Swing Trades', icon: '↗' },
  { href: '/intraday', label: 'Intraday', icon: '⚡' },
  { href: '/power-hour', label: 'Power Hour', icon: '◉' },
];

const UTILITY_NAV = [
  { href: '/journal', label: 'Journal', icon: '◈' },
  { href: '/trade-discovery', label: 'Trade Discovery', icon: '◎' },
  { href: '/opportunity-finder', label: 'Small Account Edge', icon: '🎯' },
  { href: '/edge', label: 'Edge Scanner', icon: '⊞' },
];

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
  return (
    <Link
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
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-56 min-h-screen flex flex-col py-5 px-3"
      style={{
        background: '#090909',
        borderRight: '1px solid #1a1a1a',
        boxShadow: '1px 0 0 0 #0f0f0f',
      }}
    >
      <div className="mb-7 px-2 flex items-center gap-2">
        <span className="text-white font-bold text-lg tracking-tight">TRADEVI</span>
        <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
          3.0
        </span>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1">
        {MAIN_NAV.map(({ href, label, icon }) => (
          <NavLink key={href} href={href} label={label} icon={icon} active={pathname === href} />
        ))}

        <div className="my-2 border-t border-[#1e1e1e]" />

        {UTILITY_NAV.map(({ href, label, icon }) => (
          <NavLink key={href} href={href} label={label} icon={icon} active={pathname === href} />
        ))}
      </nav>

      <div className="px-3 pt-4 border-t border-[#1a1a1a]">
        <p className="text-[10px] text-gray-600 leading-relaxed">Real data only</p>
        <p className="text-[10px] text-gray-700">Stooq · Yahoo Finance</p>
      </div>
    </aside>
  );
}
