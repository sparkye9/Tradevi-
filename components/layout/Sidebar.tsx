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
          className="text-center text-xs font-semibold text-gray-300 hover:text-white border border-[#2a2a2a] rounded-lg py-1.5 transition-colors"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="text-center text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg py-1.5 transition-colors"
        >
          Sign up
        </Link>
        <Link href="/chat" className="text-center text-xs text-gray-600 hover:text-gray-300 transition-colors">
          Chat with us
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-gray-400 truncate" title={email}>
        {email}
      </p>
      <Link href="/account" className="text-left text-xs text-gray-600 hover:text-gray-300 transition-colors">
        Account
      </Link>
      <Link href="/chat" className="text-left text-xs text-gray-600 hover:text-gray-300 transition-colors">
        Chat with us
      </Link>
      <button
        onClick={handleSignOut}
        className="text-left text-xs text-gray-600 hover:text-gray-300 transition-colors"
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
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden flex items-stretch border-t border-[#1a1a1a]"
        style={{ background: '#090909' }}
      >
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = navActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex-1 flex flex-col items-center justify-center py-2 gap-1 text-center transition-colors ${
                active ? 'text-emerald-400' : 'text-gray-600 hover:text-gray-300'
              }`}
            >
              <Icon size={16} strokeWidth={1.75} />
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

  return (
    <aside
      className="w-56 min-h-screen flex flex-col py-5 px-3 shrink-0"
      style={{
        background: '#090909',
        borderRight: '1px solid #1a1a1a',
      }}
    >
      <div className="mb-8 px-2 flex items-center gap-2.5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-black text-sm">
          V
        </span>
        <div>
          <div className="text-white font-bold text-sm tracking-tight leading-none">TRADEVI</div>
          <div className="text-[10px] text-gray-600 mt-0.5 tracking-wide">Trading intelligence</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = navActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                active
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <Icon size={16} strokeWidth={1.75} className={active ? 'text-emerald-400' : 'text-gray-600'} />
              <span className="flex-1">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pt-4 border-t border-[#1a1a1a] space-y-3">
        <AccountPanel />
        <div>
          <p className="text-[10px] text-gray-600 leading-relaxed">Education only · confirm on TradingView</p>
          <p className="text-[10px] text-gray-700">Yahoo Finance delayed data</p>
        </div>
      </div>
    </aside>
  );
}
