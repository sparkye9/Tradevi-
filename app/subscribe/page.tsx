import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isOwnerEmail } from '@/lib/ownerAccess';
import SubscribeButton from '@/components/premium/SubscribeButton';

export default async function SubscribePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware requires login to reach this page, so user is never null here
  // in practice — this guard is just defense in depth.
  if (!user) {
    return (
      <div className="max-w-lg">
        <p className="text-sm text-gray-400">
          <Link href="/login" className="text-emerald-400 underline">
            Sign in
          </Link>{' '}
          to subscribe.
        </p>
      </div>
    );
  }

  const isOwner = isOwnerEmail(user.email);

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();

  const isActive = isOwner || sub?.status === 'ACTIVE';

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Tradevi Premium</h1>
        <p className="text-sm text-gray-500 mt-1">$7.99/month — subscribe for full access.</p>
      </div>

      {isOwner ? (
        <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
          Owner account — free access, no subscription needed.{' '}
          <Link href="/" className="underline">
            Go to the dashboard
          </Link>
          .
        </div>
      ) : isActive ? (
        <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
          You&apos;re subscribed and active.{' '}
          <Link href="/" className="underline">
            Go to the dashboard
          </Link>
          .
        </div>
      ) : (
        <SubscribeButton />
      )}
    </div>
  );
}
