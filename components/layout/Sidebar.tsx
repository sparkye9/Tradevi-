'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';

const NAV = [
  { href: '/',                label: 'Dashboard'    },
  { href: '/swing-engine',    label: 'Swing Trades' },
  { href: '/intraday-scanner',label: 'Intraday'     },
  { href: '/mnq-dashboard',   label: 'Mini Futures' },
  { href: '/power-hour',      label: 'Power Hour'   },
  { href: '/settings',        label: 'Settings'     },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={[
          'fixed left-0 top-0 h-full w-52 z-30 flex flex-col transition-transform duration-300',
          'lg:relative lg:translate-x-0 lg:z-auto',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
        style={{
          background: '#111318',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div>
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: '#00ff88',
                  boxShadow: '0 0 8px rgba(0,255,136,0.8)',
                  animation: 'glowPulse 2s ease-in-out infinite',
                }}
              />
              <span
                className="font-bold text-sm tracking-widest"
                style={{ color: '#f0f0f0', letterSpacing: '0.14em' }}
              >
                TRADEVI
              </span>
            </div>
            <p className="text-xs mt-0.5 pl-4" style={{ color: '#374151', fontSize: '10px', letterSpacing: '0.06em' }}>
              OPERATOR OS
            </p>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded"
            style={{ color: '#6b7280' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-5 px-3 space-y-0.5 overflow-y-auto scrollbar-cockpit">
          {NAV.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={[
                  'block py-2.5 pr-3 rounded-r-lg text-sm font-medium transition-all',
                  active
                    ? 'nav-active'
                    : 'pl-4 hover:text-cp-text hover:bg-white/[0.03]',
                ].join(' ')}
                style={!active ? { color: '#6b7280' } : undefined}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="px-4 py-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-xs leading-relaxed" style={{ color: '#374151', fontSize: '10px' }}>
            Education only. Not financial advice.
          </p>
        </div>
      </aside>
    </>
  );
}
