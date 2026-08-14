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
      className="md:hidden fixed bottom-20 right-3 z-40 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full bg-tv-purple/20 text-tv-purple border border-tv-purple/40 shadow-glow-purple"
    >
      <MessageCircle size={14} strokeWidth={1.75} />
      Chat with us
    </Link>
  );
}
