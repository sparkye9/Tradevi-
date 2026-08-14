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

-- Journal — one row per trade, scoped to the signed-in account.
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  contract text not null default '',
  entry_price numeric not null,
  exit_price numeric,
  setup text not null default '',
  trigger_reason text not null default '',
  emotion text not null default 'calm',
  followed_rules boolean not null default true,
  profit_loss numeric,
  profit_loss_pct numeric,
  lesson_learned text,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  alert_id text
);

create index if not exists journal_entries_user_id_created_at_idx
  on public.journal_entries (user_id, created_at desc);

alter table public.journal_entries enable row level security;

drop policy if exists "Users can view own journal" on public.journal_entries;
drop policy if exists "Users can insert own journal" on public.journal_entries;
drop policy if exists "Users can update own journal" on public.journal_entries;
drop policy if exists "Users can delete own journal" on public.journal_entries;

create policy "Users can view own journal"
  on public.journal_entries for select
  using (auth.uid() = user_id);

create policy "Users can insert own journal"
  on public.journal_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can update own journal"
  on public.journal_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own journal"
  on public.journal_entries for delete
  using (auth.uid() = user_id);
