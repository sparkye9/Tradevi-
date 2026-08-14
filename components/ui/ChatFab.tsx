'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function ChatFab() {
  const pathname = usePathname();
  if (pathname === '/chat') return null;

  return (
    <Link
      href="/chat"
      className="md:hidden fixed bottom-20 right-3 z-40 text-xs font-semibold px-3 py-2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-lg"
    >
      Chat with us
    </Link>
  );
}
