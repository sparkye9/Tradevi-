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
