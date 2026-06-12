'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const MAIN_NAV = [
  { href: '/', label: 'Dashboard', icon: '⬡' },
  { href: '/futures-bias', label: 'Futures', icon: '◀' },
  { href: '/command-center', label: 'Command Center', icon: '⊕' },
  { href: '/mini-futures', label: 'Decision Engine', icon: '▦' },
  { href: '/swing', label: 'Swing Trades', icon: '↗' },
  { href: '/intraday', label: 'Intraday', icon: '⚡' },
  { href: '/power-hour', label: 'Power Hour', icon: '◉' },
  { href: '/options', label: 'Options Scanner', icon: '⊗' },
];

const UTILITY_NAV = [
  { href: '/journal', label: 'Journal', icon: '◈' },
  { href: '/trade-discovery', label: 'Trade Discovery', icon: '◎' },
  { href: '/opportunity-finder', label: 'Small Account Edge', icon: '🎯' },
  { href: '/edge', label: 'Edge Scanner', icon: '⊞' },
];

const BOTTOM_NAV = [
  { href: '/', label: 'Home', icon: '⬡' },
  { href: '/futures-bias', label: 'Futures', icon: '◀' },
  { href: '/edge', label: 'Edge', icon: '⊞' },
  { href: '/swing', label: 'Swing', icon: '↗' },
  { href: '/journal', label: 'Journal', icon: '◈' },
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
      <span className={`text-base leading-none ${active ? 'text-emerald-400' : 'text-gray-600'}`}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden md:flex w-56 min-h-screen flex-col py-5 px-3 flex-shrink-0"
        style={{ background: '#090909', borderRight: '1px solid #1a1a1a' }}
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

      {/* ── Mobile top bar ── */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-12"
        style={{ background: '#090909', borderBottom: '1px solid #1a1a1a' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-base tracking-tight">TRADEVI</span>
          <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            3.0
          </span>
        </div>
        <button onClick={() => setDrawerOpen(true)} className="text-gray-400 text-xl px-1" aria-label="Open menu">
          ☰
        </button>
      </div>

      {/* ── Mobile drawer ── */}
      {drawerOpen && (
        <>
          <div className="md:hidden fixed inset-0 z-50 bg-black/70" onClick={() => setDrawerOpen(false)} />
          <div
            className="md:hidden fixed top-0 left-0 bottom-0 z-50 w-64 flex flex-col py-5 px-3 overflow-y-auto"
            style={{ background: '#090909', borderRight: '1px solid #1a1a1a' }}
          >
            <div className="mb-6 px-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-lg tracking-tight">TRADEVI</span>
                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  3.0
                </span>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-500 text-lg px-1">✕</button>
            </div>
            <nav className="flex flex-col gap-0.5 flex-1" onClick={() => setDrawerOpen(false)}>
              {MAIN_NAV.map(({ href, label, icon }) => (
                <NavLink key={href} href={href} label={label} icon={icon} active={pathname === href} />
              ))}
              <div className="my-2 border-t border-[#1e1e1e]" />
              {UTILITY_NAV.map(({ href, label, icon }) => (
                <NavLink key={href} href={href} label={label} icon={icon} active={pathname === href} />
              ))}
            </nav>
          </div>
        </>
      )}

      {/* ── Mobile bottom nav ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around px-2 h-14"
        style={{ background: '#090909', borderTop: '1px solid #1a1a1a' }}
      >
        {BOTTOM_NAV.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all ${active ? 'text-emerald-400' : 'text-gray-600'}`}
            >
              <span className="text-lg leading-none">{icon}</span>
              <span className="text-[9px] font-medium">{label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-1 text-gray-600"
        >
          <span className="text-lg leading-none">☰</span>
          <span className="text-[9px] font-medium">More</span>
        </button>
      </nav>
    </>
  );
}
