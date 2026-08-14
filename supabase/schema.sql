-- Tradevi Premium — subscriptions table
-- Run this once in your Supabase project's SQL Editor (Project → SQL Editor → New query).
-- See SUBSCRIPTIONS.md for the full walkthrough.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  paypal_subscription_id text unique,
  status text not null default 'NONE', -- mirrors PayPal: APPROVAL_PENDING | APPROVED | ACTIVE | SUSPENDED | CANCELLED | EXPIRED | NONE
  plan_id text,
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_paypal_subscription_id_idx
  on public.subscriptions (paypal_subscription_id);

alter table public.subscriptions enable row level security;

-- Users can read only their own subscription row.
create policy "Users can view own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Users can create/attach their own subscription row when they complete
-- PayPal checkout (see app/api/subscription/link). Later status changes
-- (cancellation, expiry) come from the PayPal webhook, which uses the
-- service-role key and bypasses RLS entirely — it does not need a policy.
create policy "Users can insert own subscription"
  on public.subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own subscription"
  on public.subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
