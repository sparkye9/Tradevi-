'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { authCallbackUrl } from '@/lib/siteUrl';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmEmailSent, setConfirmEmailSent] = useState(false);

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
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: authCallbackUrl('/subscribe'),
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (data.session) {
        // Email confirmation is disabled on this project — session is live immediately.
        router.push('/subscribe');
        router.refresh();
        return;
      }
      setConfirmEmailSent(true);
    } catch {
      setError('Sign-up is not available right now — accounts may not be configured on this deployment.');
    } finally {
      setLoading(false);
    }
  }

  if (confirmEmailSent) {
    return (
      <div className="max-w-sm mx-auto mt-12 space-y-4">
        <h1 className="text-2xl font-bold text-white">Check your email</h1>
        <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
          <p>
            We sent a confirmation link to <span className="font-semibold">{email}</span>. The
            email comes from Supabase — check spam if it is not in your inbox.
          </p>
          <p>
            After you tap it once, come back here and sign in with the password you just created.
            If the link already opened or says it expired, you don&apos;t need a new one — just
            sign in. Your account is already created.
          </p>
        </div>
        <Link href="/login" className="text-emerald-400 underline text-sm">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto mt-12 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Create your account</h1>
        <p className="text-sm text-gray-500 mt-1">Free to create. Subscribe for full access.</p>
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
        <div className="space-y-1.5">
          <label className="text-xs text-gray-500">Password</label>
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
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="text-sm text-gray-500 text-center">
        Already have an account?{' '}
        <Link href="/login" className="text-emerald-400 underline">
          Sign in
        </Link>
      </p>
      <p className="text-sm text-gray-500 text-center">
        <Link href="/chat" className="text-emerald-400 underline">
          Chat with us
        </Link>
      </p>
    </div>
  );
}
