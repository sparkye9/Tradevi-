'use client';
import { useState } from 'react';
import { useNotificationsStore } from '@/store/notificationsStore';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell() {
  const { notifications, markRead, markAllRead, clear } = useNotificationsStore();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((p) => !p)}
        className="relative flex items-center justify-center w-7 h-7 rounded-full hover:bg-white/5 transition-colors"
        title="Notifications"
      >
        <span className="text-gray-400 text-sm">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-amber-400 text-black text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-50 w-80 max-h-96 overflow-y-auto bg-[#111111] border border-[#2a2a2a] rounded-2xl shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e1e] sticky top-0 bg-[#111111]">
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Notifications</span>
              <div className="flex gap-3">
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-[11px] text-emerald-500 hover:text-emerald-400">
                    Mark all read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button onClick={clear} className="text-[11px] text-gray-600 hover:text-gray-400">
                    Clear
                  </button>
                )}
              </div>
            </div>
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-gray-600">
                No notifications yet — check back after the market opens.
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`w-full text-left px-4 py-3 border-b border-[#1a1a1a] last:border-0 transition-colors hover:bg-[#161616] ${
                    n.read ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full ${
                      n.level === 'good' ? 'bg-emerald-400' : n.level === 'warn' ? 'bg-amber-400' : 'bg-gray-500'
                    }`} />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-200 leading-snug">{n.message}</p>
                      <p className="text-[10px] text-gray-600 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
