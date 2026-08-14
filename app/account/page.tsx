import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isOwnerEmail } from '@/lib/ownerAccess';
import AccountActions from '@/components/premium/AccountActions';

export default async function AccountPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="max-w-lg">
        <p className="text-sm text-gray-400">
          <Link href="/login" className="text-emerald-400 underline">
            Sign in
          </Link>{' '}
          to view your account.
        </p>
      </div>
    );
  }

  const isOwner = isOwnerEmail(user.email);
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, paypal_subscription_id, plan_id, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  const isActive = isOwner || sub?.status === 'ACTIVE';
  const statusLabel = isOwner ? 'Owner (free access)' : sub?.status ?? 'NONE';

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Account</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your Tradevi login and Premium subscription.</p>
      </div>

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-2xl p-5 space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-600">Email</div>
          <div className="text-sm text-white">{user.email}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-600">Subscription</div>
          <div className={`text-sm font-semibold ${isActive ? 'text-emerald-400' : 'text-amber-300'}`}>
            {statusLabel}
          </div>
        </div>
        {sub?.updated_at && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-600">Last updated</div>
            <div className="text-xs text-gray-400">{new Date(sub.updated_at).toLocaleString()}</div>
          </div>
        )}
      </div>

      <AccountActions isOwner={isOwner} isActive={!!isActive} hasPaypal={!!sub?.paypal_subscription_id} />
    </div>
  );
}
