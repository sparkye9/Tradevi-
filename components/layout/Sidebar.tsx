'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { useState, useEffect } from 'react';

const NAV = [
  { href: '/',                label: 'Dashboard'    },
  { href: '/swing-engine',    label: 'Swing Trades' },
  { href: '/intraday-scanner',label: 'Intraday'     },
  { href: '/mnq-dashboard',   label: 'Mini Futures' },
  { href: '/power-hour',      label: 'Power Hour'   },
  { href: '/settings',        label: 'Settings'     },
];

const SCRIPTURES = [
  // Faith
  { verse: 'Now faith is confidence in what we hope for and assurance about what we do not see.', ref: 'Hebrews 11:1' },
  { verse: 'Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.', ref: 'Proverbs 3:5-6' },
  { verse: 'Be still and know that I am God.', ref: 'Psalm 46:10' },
  { verse: 'I can do all things through Christ who strengthens me.', ref: 'Philippians 4:13' },
  { verse: 'And my God will meet all your needs according to the riches of his glory in Christ Jesus.', ref: 'Philippians 4:19' },
  // Money stewardship
  { verse: 'Whoever can be trusted with very little can also be trusted with much.', ref: 'Luke 16:10' },
  { verse: 'The plans of the diligent lead to profit as surely as haste leads to poverty.', ref: 'Proverbs 21:5' },
  { verse: 'Know well the condition of your flocks, and give attention to your herds.', ref: 'Proverbs 27:23' },
  { verse: 'Dishonest money dwindles away, but whoever gathers money little by little makes it grow.', ref: 'Proverbs 13:11' },
  { verse: 'Commit to the Lord whatever you do, and he will establish your plans.', ref: 'Proverbs 16:3' },
  { verse: 'He who guards his lips guards his life, but he who speaks rashly will come to ruin.', ref: 'Proverbs 13:3' },
  // Wealth & prosperity
  { verse: 'For I know the plans I have for you, declares the Lord — plans to prosper you and not to harm you, plans to give you hope and a future.', ref: 'Jeremiah 29:11' },
  { verse: 'Beloved, I pray that you may prosper in all things and be in health, just as your soul prospers.', ref: '3 John 1:2' },
  { verse: 'Give, and it will be given to you. A good measure, pressed down, shaken together and running over.', ref: 'Luke 6:38' },
  { verse: 'Wealth gained hastily will dwindle, but whoever gathers little by little will increase it.', ref: 'Proverbs 13:11' },
  { verse: 'A good person leaves an inheritance for their children\'s children.', ref: 'Proverbs 13:22' },
  { verse: 'But seek first his kingdom and his righteousness, and all these things will be given to you as well.', ref: 'Matthew 6:33' },
  { verse: 'The blessing of the Lord brings wealth, without painful toil for it.', ref: 'Proverbs 10:22' },
  { verse: 'Plans fail for lack of counsel, but with many advisers they succeed.', ref: 'Proverbs 15:22' },
  { verse: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.', ref: 'Philippians 4:6' },
];

const ROTATE_MS = 25 * 60 * 1000; // 25 minutes

function ScriptureWidget() {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % SCRIPTURES.length);
        setFade(true);
      }, 400);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  const s = SCRIPTURES[idx];

  return (
    <div
      className="px-4 py-3"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        transition: 'opacity 0.4s ease',
        opacity: fade ? 1 : 0,
      }}
    >
      <p style={{ color: '#374151', fontSize: '8px', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 4 }}>
        WORD OF THE DAY
      </p>
      <p
        className="leading-relaxed italic"
        style={{ color: '#4b5563', fontSize: '9px', lineHeight: 1.5 }}
      >
        &ldquo;{s.verse}&rdquo;
      </p>
      <p style={{ color: '#00ff88', fontSize: '8px', fontWeight: 700, marginTop: 4, opacity: 0.7 }}>
        — {s.ref}
      </p>
    </div>
  );
}

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

        {/* Scripture widget */}
        <ScriptureWidget />
      </aside>
    </>
  );
}
