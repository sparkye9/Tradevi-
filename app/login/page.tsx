'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const misconfigured = searchParams.get('misconfigured') === '1';
  const authError = searchParams.get('error') === 'auth';

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        if (!data.user) return;
        const next = searchParams.get('next');
        const dest =
          next && next.startsWith('/') && !next.startsWith('//') && next !== '/login' ? next : '/trend-bias';
        router.replace(dest);
      });
    } catch {
      // Accounts aren't configured — stay on the form.
    }
  }, [router, searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      const next = searchParams.get('next');
      const dest =
        next && next.startsWith('/') && !next.startsWith('//') && next !== '/login' ? next : '/trend-bias';
      router.push(dest);
      router.refresh();
    } catch {
      setError('Sign-in is not available right now — accounts may not be configured on this deployment.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-12 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Sign in</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back to Tradevi.</p>
      </div>

      {misconfigured && (
        <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
          Accounts aren&apos;t set up on this deployment yet — see SUBSCRIPTIONS.md for the Supabase setup
          steps.
        </div>
      )}
      {authError && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
          That email link is invalid or has expired. Sign in, or request a new reset link.
        </div>
      )}

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
        <div className="space-y-1.5">
          <label className="text-xs text-gray-500">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
        <div className="text-center">
          <Link href="/forgot-password" className="text-xs text-gray-500 hover:text-gray-300 underline">
            Forgot password?
          </Link>
        </div>
      </form>

      <p className="text-sm text-gray-500 text-center">
        No account yet?{' '}
        <Link href="/signup" className="text-emerald-400 underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
