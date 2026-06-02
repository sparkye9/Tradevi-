'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/trade-discovery', label: 'Trade Discovery' },
  { href: '/swing', label: 'Swing' },
  { href: '/intraday', label: 'Intraday' },
  { href: '/options', label: 'Options' },
  { href: '/mini-futures', label: 'Mini Futures' },
  { href: '/power-hour', label: 'Power Hour' },
  { href: '/futures-bias', label: 'Futures Bias' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-52 min-h-screen bg-[#0a0a0a] border-r border-[#1a1a1a] flex flex-col py-4 px-3">
      <div className="mb-6 px-2">
        <span className="text-white font-bold text-lg tracking-tight">Tradevi</span>
        <span className="text-gray-600 text-xs ml-1">3.0</span>
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-2 rounded text-sm transition-colors ${
                active
                  ? 'bg-[#1a1a1a] text-white font-medium'
                  : 'text-gray-400 hover:text-white hover:bg-[#141414]'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
