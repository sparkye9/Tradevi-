'use client';
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined,
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setSent(true);
    } catch {
      setError('Password reset is not available right now — accounts may not be configured on this deployment.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="max-w-sm mx-auto mt-12 space-y-4">
        <h1 className="text-2xl font-bold text-white">Check your email</h1>
        <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
          If an account exists for <span className="font-semibold">{email}</span>, a reset link is on its way.
        </div>
        <Link href="/login" className="text-emerald-400 underline text-sm">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto mt-12 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Reset your password</h1>
        <p className="text-sm text-gray-500 mt-1">We&apos;ll email you a link to set a new one.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-[#111111] border border-[#2a2a2a] rounded-2xl p-5 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs text-gray-500">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm"
            placeholder="you@example.com"
          />
        </div>
        {error && <div className="text-red-400 text-xs">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg text-sm font-semibold hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
      </form>

      <p className="text-sm text-gray-500 text-center">
        <Link href="/login" className="text-emerald-400 underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
