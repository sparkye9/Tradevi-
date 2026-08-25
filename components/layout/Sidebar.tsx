'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  CandlestickChart,
  LineChart,
  Timer,
  CalendarDays,
  NotebookPen,
  Bookmark,
  MessageCircle,
  Settings,
  FlaskConical,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/futures', label: 'Futures', icon: CandlestickChart },
  { href: '/stocks', label: 'Stocks', icon: LineChart },
  { href: '/power-hour', label: 'Power Hour', icon: Timer },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/journal', label: 'Journal', icon: NotebookPen },
];

const TOOLS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/stocks', label: 'Watchlist', icon: Bookmark },
  { href: '/futures/backtest', label: 'Backtest', icon: FlaskConical },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/chat', label: 'Resources', icon: MessageCircle },
];

const STOCKS_PATHS = new Set(['/stocks', '/swing', '/intraday', '/options', '/opportunity-finder']);

function navActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/stocks') return STOCKS_PATHS.has(pathname);
  if (href === '/futures') return pathname === '/futures' || pathname.startsWith('/futures/');
  return pathname === href;
}

function AccountPanel() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => setEmail(session?.user?.email ?? null));
      return () => subscription.unsubscribe();
    } catch {
      setEmail(null);
    }
  }, []);

  async function handleSignOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Not configured.
    }
    router.push('/');
    router.refresh();
  }

  if (email === undefined) return null;

  if (!email) {
    return (
      <div className="flex flex-col gap-1.5">
        <Link
          href="/login"
          className="text-center text-xs font-semibold text-gray-300 hover:text-white border border-tv-border rounded-lg py-1.5 transition-colors"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="text-center text-xs font-semibold text-tv-purple bg-tv-purple/10 hover:bg-tv-purple/20 border border-tv-purple/40 rounded-lg py-1.5 transition-colors"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-tv-muted truncate" title={email}>
        {email}
      </p>
      <Link href="/account" className="text-left text-xs text-gray-500 hover:text-gray-300 transition-colors">
        Account
      </Link>
      <button
        onClick={handleSignOut}
        className="text-left text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}

export default function Sidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  if (mobile) {
    return (
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden flex items-stretch border-t border-tv-border"
        style={{ background: '#080A10' }}
      >
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = navActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex-1 flex flex-col items-center justify-center py-2 gap-1 text-center transition-colors ${
                active ? 'text-tv-purple' : 'text-gray-600 hover:text-gray-300'
              }`}
            >
              <Icon size={16} strokeWidth={1.75} />
              <span className="text-[9px] font-semibold tracking-wide leading-none">{label}</span>
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-tv-purple rounded-b-full" />
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <aside
      className="w-56 min-h-screen flex flex-col py-5 px-3 shrink-0"
      style={{
        background: '#080A10',
        borderRight: '1px solid #222738',
      }}
    >
      <div className="mb-8 px-2 flex items-center gap-2.5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-tv-purple/15 border border-tv-purple/40 text-tv-purple font-black text-sm shadow-glow-purple">
          V
        </span>
        <div>
          <div className="text-white font-bold text-sm tracking-tight leading-none">TRADEVI</div>
          <div className="text-[10px] text-tv-muted mt-0.5 tracking-wide">Trading intelligence</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = navActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                active
                  ? 'bg-tv-purple/15 text-tv-purple'
                  : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <Icon size={16} strokeWidth={1.75} className={active ? 'text-tv-purple' : 'text-gray-600'} />
              <span className="flex-1">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 px-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600 mb-2">Tools</div>
        <div className="flex flex-col gap-0.5">
          {TOOLS.map(({ href, label, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-200 hover:bg-white/5"
            >
              <Icon size={15} strokeWidth={1.75} className="text-gray-600" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-auto px-1 pt-4 space-y-3">
        <Link
          href="/account"
          className="block rounded-xl border border-tv-purple/30 bg-tv-purple/10 p-3 hover:bg-tv-purple/15 transition-colors"
        >
          <div className="text-[10px] font-bold tracking-widest uppercase text-tv-purple">Desk pass</div>
          <p className="text-[11px] text-gray-400 mt-1 leading-snug">$7.99/mo · full desks, not extra scanners</p>
        </Link>
        <AccountPanel />
        <Link
          href="/account"
          className="flex items-center gap-2 px-2 text-xs text-gray-600 hover:text-gray-300"
        >
          <Settings size={13} />
          Settings
        </Link>
        <p className="px-2 text-[10px] text-gray-600 leading-relaxed">Education only · delayed Yahoo · confirm on TradingView</p>
      </div>
    </aside>
  );
}
