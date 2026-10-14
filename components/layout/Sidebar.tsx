'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  GraduationCap,
  CandlestickChart,
  LineChart,
  Timer,
  CalendarDays,
  Layers,
  FlaskConical,
  Crosshair,
  ClipboardCheck,
  Network,
  Building2,
  Calculator,
  NotebookPen,
  Settings,
  MoreHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';

interface NavItem { href: string; label: string; icon: LucideIcon }

const GROUPS: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/command-center', label: 'Command Center', icon: ClipboardCheck },
    ],
  },
  {
    title: 'Futures',
    items: [
      { href: '/futures', label: 'Futures Analysis', icon: CandlestickChart },
      { href: '/market-structure', label: 'Market Structure', icon: Network },
      { href: '/power-hour', label: 'Power Hour', icon: Timer },
      { href: '/market-selector', label: 'Selector', icon: Crosshair },
    ],
  },
  {
    title: 'Risk & accounts',
    items: [
      { href: '/prop-firms', label: 'Prop Firm Manager', icon: Building2 },
      { href: '/risk', label: 'Risk Calculator', icon: Calculator },
      { href: '/futures/backtest', label: 'Backtesting', icon: FlaskConical },
      { href: '/journal', label: 'Trading Journal', icon: NotebookPen },
    ],
  },
  {
    title: 'Markets',
    items: [
      { href: '/stocks', label: 'Stocks', icon: LineChart },
      { href: '/options', label: 'Options chains', icon: Layers },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    title: null,
    items: [
      { href: '/learn', label: 'Education', icon: GraduationCap },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);
/** Bottom bar on phones; everything else lives behind "More". */
const MOBILE_PRIMARY = ['/', '/futures', '/power-hour', '/prop-firms'];

// /options has its own entry, so it doesn't also light up Stocks.
const STOCKS_PATHS = new Set(['/stocks', '/swing', '/intraday', '/opportunity-finder']);

function navActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/stocks') return STOCKS_PATHS.has(pathname);
  if (href === '/learn') return pathname === '/learn' || pathname.startsWith('/learn/');
  return pathname === href;
}

export default function Sidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  if (mobile) {
    const primary = ALL.filter((i) => MOBILE_PRIMARY.includes(i.href));
    const moreActive = !primary.some((i) => navActive(pathname, i.href));
    return (
      <>
        {open && (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="All pages">
            <button aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-tv-border bg-[#080A10] p-4 pb-8">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-white">All pages</span>
                <button aria-label="Close" className="p-1 text-gray-400" onClick={() => setOpen(false)}><X size={18} /></button>
              </div>
              {GROUPS.map((g, gi) => (
                <div key={gi} className="mb-3">
                  {g.title && <div className="label mb-1">{g.title}</div>}
                  <div className="grid grid-cols-2 gap-1">
                    {g.items.map(({ href, label, icon: Icon }) => (
                      <Link key={href} href={href} className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${navActive(pathname, href) ? 'bg-tv-purple/15 text-tv-purple' : 'text-gray-300 bg-white/[0.03]'}`}>
                        <Icon size={16} strokeWidth={1.75} />{label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden flex items-stretch border-t border-tv-border" style={{ background: '#080A10' }} aria-label="Primary">
          {primary.map(({ href, label, icon: Icon }) => {
            const active = navActive(pathname, href);
            return (
              <Link key={href} href={href} aria-current={active ? 'page' : undefined}
                className={`relative flex-1 flex flex-col items-center justify-center py-2.5 gap-1 text-center ${active ? 'text-tv-purple' : 'text-gray-500'}`}>
                <Icon size={18} strokeWidth={1.75} />
                <span className="text-[10px] font-semibold leading-none">{label.replace(' Manager', '').replace(' Analysis', '')}</span>
              </Link>
            );
          })}
          <button onClick={() => setOpen(true)} aria-label="More pages" aria-expanded={open}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 ${moreActive ? 'text-tv-purple' : 'text-gray-500'}`}>
            <MoreHorizontal size={18} strokeWidth={1.75} />
            <span className="text-[10px] font-semibold leading-none">More</span>
          </button>
        </nav>
      </>
    );
  }

  return (
    <aside className="w-56 min-h-screen flex flex-col py-5 px-3 shrink-0" style={{ background: '#080A10', borderRight: '1px solid #222738' }}>
      <div className="mb-6 px-2 flex items-center gap-2.5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-tv-purple/15 border border-tv-purple/40 text-tv-purple font-black text-sm">V</span>
        <div>
          <div className="text-white font-bold text-sm tracking-tight leading-none">TRADEVI</div>
          <div className="text-[10px] text-tv-muted mt-0.5 tracking-wide">Trading decision support</div>
        </div>
      </div>

      <nav className="flex flex-col gap-4" aria-label="Main">
        {GROUPS.map((g, gi) => (
          <div key={gi}>
            {g.title && <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">{g.title}</div>}
            <div className="flex flex-col gap-0.5">
              {g.items.map(({ href, label, icon: Icon }) => {
                const active = navActive(pathname, href);
                return (
                  <Link key={href} href={href} aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${active ? 'bg-tv-purple/15 text-tv-purple' : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'}`}>
                    <Icon size={15} strokeWidth={1.75} className={active ? 'text-tv-purple' : 'text-gray-600'} />
                    <span className="flex-1">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto px-1 pt-4 space-y-3">
        <Link href="/?guide=1" className="block rounded-xl border border-tv-purple/30 bg-tv-purple/10 p-3 hover:bg-tv-purple/15 transition-colors">
          <div className="text-[10px] font-bold tracking-widest uppercase text-tv-purple">About this site</div>
          <p className="text-[11px] text-gray-400 mt-1 leading-snug">What Tradevi is and what each page does</p>
        </Link>
        <p className="px-2 text-[10px] text-gray-600 leading-relaxed">Decision support only · no orders are placed · delayed data · verify on your platform</p>
      </div>
    </aside>
  );
}
