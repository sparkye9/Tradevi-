'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/stocks', label: 'Discovery' },
  { href: '/swing', label: 'Swing' },
  { href: '/intraday', label: 'Intraday' },
  { href: '/options', label: 'Options' },
  { href: '/opportunity-finder', label: 'Small Account' },
];

export default function StocksSubnav() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-1.5">
      {ITEMS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              active
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'text-gray-500 border-[#2a2a2a] hover:text-gray-300'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
