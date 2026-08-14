'use client';
import { useEffect, useState } from 'react';
import { CONTACT_REPLY_WINDOW } from '@/lib/contact';
import { createClient } from '@/lib/supabase/client';

export default function ChatPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        if (data.user?.email) setEmail((current) => current || data.user!.email!);
      });
    } catch {
      // Accounts aren't configured — visitor types their email.
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message, company: '' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === 'string' ? json.error : 'Could not send. Try again.');
        return;
      }
      if (typeof json.mailto === 'string') {
        window.location.href = json.mailto;
      }
      setSent(true);
    } catch {
      setError('Could not send. Try again.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="max-w-md mx-auto mt-8 space-y-4">
        <h1 className="text-2xl font-bold text-white">Chat with us</h1>
        <div className="text-sm text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 space-y-2">
          <p className="font-semibold text-emerald-100">We got your message.</p>
          <p>Someone will respond within {CONTACT_REPLY_WINDOW}.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Chat with us</h1>
        <p className="text-sm text-gray-500 mt-1">
          Send a note. Someone will respond within {CONTACT_REPLY_WINDOW}.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-[#111111] border border-[#2a2a2a] rounded-2xl p-5 space-y-4">
        <div className="hidden" aria-hidden="true">
          <label>
            Company
            <input type="text" name="company" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-gray-500">Name</label>
          <input
            type="text"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm"
            placeholder="Your name"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-gray-500">Email</label>
          <input
            type="email"
            required
            maxLength={120}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm"
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-gray-500">Message</label>
          <textarea
            required
            minLength={8}
            maxLength={4000}
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm resize-y min-h-[8rem]"
            placeholder="How can we help?"
          />
        </div>
        {error && <div className="text-red-400 text-xs">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg text-sm font-semibold hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Submit'}
        </button>
      </form>
    </div>
  );
}
