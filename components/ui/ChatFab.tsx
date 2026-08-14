'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle } from 'lucide-react';

export default function ChatFab() {
  const pathname = usePathname();
  if (pathname === '/chat') return null;

  return (
    <Link
      href="/chat"
      className="md:hidden fixed bottom-20 right-3 z-40 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-lg"
    >
      <MessageCircle size={14} strokeWidth={1.75} />
      Chat with us
    </Link>
  );
}
