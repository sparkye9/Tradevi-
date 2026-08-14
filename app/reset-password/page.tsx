'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let supabase;
    try {
      supabase = createClient();
    } catch {
      setLinkInvalid(true);
      return;
    }

    // Clicking the emailed link lands here with a recovery token in the URL.
    // supabase-js parses it automatically and fires PASSWORD_RECOVERY once
    // the resulting session is established — that's our signal the form can
    // safely call updateUser(). If nothing arrives shortly, the link was
    // already used or has expired.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    const timeout = setTimeout(() => {
      setReady((r) => {
        if (!r) setLinkInvalid(true);
        return r;
      });
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setDone(true);
      setTimeout(() => {
        router.push('/subscribe');
        router.refresh();
      }, 1500);
    } catch {
      setError('Could not update the password right now.');
    } finally {
      setLoading(false);
    }
  }

  if (linkInvalid) {
    return (
      <div className="max-w-sm mx-auto mt-12 space-y-4">
        <h1 className="text-2xl font-bold text-white">Link expired</h1>
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
          This reset link is invalid or has already been used.
        </div>
        <Link href="/forgot-password" className="text-emerald-400 underline text-sm">
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-sm mx-auto mt-12 space-y-4">
        <h1 className="text-2xl font-bold text-white">Password updated</h1>
        <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
          Taking you to your account...
        </div>
      </div>
    );
  }

  if (!ready) {
    return <div className="text-gray-500 text-sm mt-12 text-center animate-pulse">Confirming link...</div>;
  }

  return (
    <div className="max-w-sm mx-auto mt-12 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Set a new password</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-[#111111] border border-[#2a2a2a] rounded-2xl p-5 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs text-gray-500">New password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm"
            placeholder="At least 8 characters"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-gray-500">Confirm password</label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm"
            placeholder="••••••••"
          />
        </div>
        {error && <div className="text-red-400 text-xs">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg text-sm font-semibold hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
        >
          {loading ? 'Updating...' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
