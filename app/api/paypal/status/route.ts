import { NextResponse } from 'next/server';
import { getSubscription, ACTIVE_STATUSES } from '@/lib/paypal';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subscriptionId = searchParams.get('subscriptionId');

  if (!subscriptionId) {
    return NextResponse.json({ active: false, error: 'subscriptionId is required' }, { status: 400 });
  }

  try {
    const sub = await getSubscription(subscriptionId);
    return NextResponse.json({
      active: ACTIVE_STATUSES.has(sub.status),
      status: sub.status,
      planId: sub.planId,
    });
  } catch (e) {
    return NextResponse.json(
      { active: false, error: e instanceof Error ? e.message : 'PayPal lookup failed' },
      { status: 502 }
    );
  }
}
