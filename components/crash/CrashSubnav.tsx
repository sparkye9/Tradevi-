'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/crash-intelligence', label: 'Crash Intelligence' },
  { href: '/put-hunter', label: 'Put Hunter' },
  { href: '/crash-setups', label: 'Put Setups' },
  { href: '/crash-guide', label: 'How to use' },
];

export default function CrashSubnav() {
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
              active ? 'bg-tv-purple/20 text-tv-purple border-tv-purple/40' : 'text-gray-500 border-[#2a2a2a] hover:text-gray-300'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
