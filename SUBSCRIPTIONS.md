# Tradevi Premium — accounts + subscription setup

The app now works like this for a visitor:

1. They land on `/` — the only page that works with no account.
2. Clicking anything else (any nav link, or typing another URL) redirects
   them to `/login`.
3. `/signup` creates a free Supabase account (email + password).
4. Right after signing in, an account with no active subscription is
   redirected to `/subscribe` — a $7.99/month PayPal Subscribe button.
5. Once PayPal confirms the subscription is active, the whole app unlocks
   for that account, on any device they sign into.

This doc covers both halves: the free account system (Supabase), and the
honest truth about payment fees (no processor, PayPal included, can bill a
card for free).

## Why Supabase

This repo is a single Next.js app deployed on Vercel — serverless functions,
no persistent disk. Real user accounts need somewhere durable to live, so
this wires in [Supabase](https://supabase.com): a hosted Postgres database
with built-in auth (signup, login, email verification, password reset)
included. The free tier needs no credit card and comfortably covers a
single-operator SaaS at this scale (500MB database, 50,000 monthly active
users).

## How access control actually works

- `middleware.ts` runs on every request. It's the single place access is
  decided — no page has to remember to check anything itself.
  - `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`,
    `/auth/callback` — open to anyone. `/auth/callback` is the PKCE
    exchange for emailed confirmation and reset links.
  - `/api/finviz/screener`, `/api/finviz/futures` — also open, because the
    public home page and the futures ticker in the header need them.
  - `/api/paypal/webhook` — open, but self-verifies via PayPal's signature
    check instead of a login.
  - `/subscribe`, `/account`, `/api/subscription/link`,
    `/api/subscription/cancel`, `/api/paypal/status` — require login, but
    not an active subscription (this is how you get one, manage it, or
    cancel it).
  - Everything else — requires both a logged-in Supabase user **and** a row
    in the `subscriptions` table with `status = 'ACTIVE'`.
- `supabase/schema.sql` creates that `subscriptions` table: one row per
  user, holding their PayPal subscription ID and its current status.
- `/api/subscription/link` is called right after a successful PayPal
  checkout. It looks the subscription up live against PayPal (never trusts
  the browser) and writes the row.
- `/api/subscription/cancel` lets a signed-in user cancel from `/account`
  (PayPal cancel API, then the row is marked `CANCELLED`). Cancelling
  directly in PayPal still works — the webhook catches that too.
- `/api/paypal/webhook` keeps that row current after the fact — if someone
  cancels through PayPal directly, or a renewal payment fails, PayPal calls
  this endpoint and the row's status is updated, which locks them back out
  on their next request.

Nothing about access control depends on browser storage anymore — sign in
from any device and the same account, same subscription, works.

## Setup steps

### 1. Supabase (free)

1. Create a project at [supabase.com](https://supabase.com) (free tier, no
   card required).
2. Project Settings → API — copy the **Project URL**, the **anon public**
   key, and the **service_role** key (keep this one secret).
3. SQL Editor → New query → paste the contents of `supabase/schema.sql` →
   Run. This creates the `subscriptions` table and its access policies.
4. Optional but recommended: Authentication → Providers → Email — decide
   whether to require email confirmation before login (on by default). If
   you leave it on, Supabase sends the confirmation email itself, for free,
   at low volume — fine for getting started. For real volume later,
   Authentication → Email Templates lets you plug in your own SMTP
   provider.
5. Authentication → URL Configuration — set **Site URL** to your deployed
   origin (e.g. `https://tradevi.vercel.app`) and add these **Redirect URLs**:
   - `https://<your-domain>/auth/callback`
   - `http://localhost:3000/auth/callback`
   Signup confirmation and password-reset emails land on `/auth/callback`,
   which exchanges the PKCE `code` for a session. Without these URLs in the
   allow-list, the emailed links fail.
6. Set the env vars from `.env.example`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
7. Password reset works out of the box once these are set — `/forgot-password`
   sends the email (Supabase's own low-volume sender, same as the signup
   confirmation email) and `/auth/callback?next=/reset-password` is where
   that link lands before `/reset-password` lets the user set a new password.

### 2. PayPal Subscriptions

1. **Get a PayPal Business account.** Personal accounts can't create
   billing plans. Upgrade at paypal.com or sign up fresh as a business.

2. **Create API credentials.**
   Go to [developer.paypal.com](https://developer.paypal.com) → Apps &
   Credentials. Start in **Sandbox** mode to test the whole flow for free
   with fake money, then repeat in **Live** mode when you're ready to
   charge real cards. Each mode gives you a separate Client ID + Secret.

3. **Create the $7.99/month plan.**
   In the PayPal dashboard: Pay & Get Paid → Subscriptions → Create Plan.
   - Product: e.g. "Tradevi Premium"
   - Pricing: $7.99, billed monthly, until cancelled
   - Save it — you'll get a Plan ID that looks like `P-XXXXXXXXXXXX`.

4. **Register the webhook.**
   In your app's settings on developer.paypal.com → Webhooks → Add
   Webhook. URL: `https://<your-domain>/api/paypal/webhook`. Subscribe to
   at least: `BILLING.SUBSCRIPTION.ACTIVATED`,
   `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`,
   `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.UPDATED`. Copy
   the Webhook ID it gives you.

5. **Set environment variables** (see `.env.example`):
   ```
   PAYPAL_ENV=sandbox                 # then "live" when ready
   PAYPAL_CLIENT_ID=...
   PAYPAL_CLIENT_SECRET=...
   PAYPAL_WEBHOOK_ID=...
   NEXT_PUBLIC_PAYPAL_CLIENT_ID=...   # same value as PAYPAL_CLIENT_ID
   NEXT_PUBLIC_PAYPAL_PLAN_ID=...     # the P-... plan ID from step 3
   ```

6. **Test end to end in sandbox**: sign up for an account, get redirected
   to `/subscribe`, pay with a PayPal sandbox buyer account, confirm the
   rest of the app unlocks, then cancel the subscription from the sandbox
   buyer's PayPal account and confirm access locks again (this depends on
   the webhook firing — sandbox webhook delivery can lag by a minute or
   two).

7. **Go live**: swap in your live Client ID/Secret/Webhook ID and set
   `PAYPAL_ENV=live`.

### 3. Your own free access

You shouldn't have to pay yourself $7.99/month to use your own app. Set:
```
OWNER_EMAILS=you@example.com
```
(comma-separated if you want more than one — e.g. a co-founder). Sign up
through `/signup` with that exact email, same as any other user — no
special flow. Once that env var is set, that account skips the PayPal step
entirely: `middleware.ts` and `/subscribe` both check `OWNER_EMAILS` before
they check the `subscriptions` table. There's nothing to configure in
Supabase for this — it's a plain env var, checked directly, so comping an
account never depends on the database being reachable.

## There's no way to take card payments with zero fees

Every processor that can bill a card automatically every month — PayPal,
Stripe, Square, Braintree, all of them — takes a cut. That's not a PayPal
weakness, it's how card networks (Visa/Mastercard/Amex) and banks are paid;
every processor sits on top of the same interchange fees and adds its own
margin. There is no legitimate "linked account, no fee" option for recurring
card billing. Concretely, for a **$7.99/month** charge:

| Method | Typical fee* | On $7.99 | Recurring billing? |
|---|---|---|---|
| PayPal Standard checkout | 3.49% + $0.49 | ≈ $0.77 | Yes (Subscriptions API) |
| PayPal Micropayments rate (apply separately) | 4.99% + $0.09 | ≈ $0.49 | Yes |
| Stripe | 2.9% + $0.30 | ≈ $0.53 | Yes |
| Zelle / Venmo (personal) | $0 | $0 | **No** — no billing API, and using a personal account to collect recurring business payments violates most banks' terms and gives you no invoicing, no dispute protection, no way to auto-charge |
| Crypto (e.g. USDC) | network/gas fee, varies | often < $0.10 | No native recurring billing — you'd have to build your own charge-and-verify flow, and price volatility becomes your problem |

*Fees change over time and vary by country/account history — check
[paypal.com/us/business/paypal-business-fees](https://www.paypal.com/us/business/paypal-business-fees)
for PayPal's current numbers before you launch. The point that survives any
rate change: **something in the 5–10% range on a $7.99 charge is normal**,
not a sign you configured something wrong.

If minimizing the fee matters more than convenience, ask PayPal support
about the **micropayments rate** — it's a real, official rate class for
small transactions, cheaper than standard, but you have to request it and it
isn't guaranteed.

## Honest limitations to know about

- **This is account-based now, not device-based** — the earlier version of
  this feature stored the subscription ID in browser storage; that's gone.
  Signing into the same account from a new device now just works.
- **Payouts still land in your normal PayPal balance** — this doesn't set
  up automatic transfers to your bank; that's a separate setting in your
  PayPal account (Settings → automatic withdrawals).
- **Chargebacks/disputes** are handled through PayPal's normal resolution
  process, same as any PayPal payment.
- **`OWNER_EMAILS` is a plain env var, not a role in the database** — anyone
  with deploy access to change environment variables can add themselves.
  That's normal for a solo-operator app; if you ever bring on other people
  who shouldn't have that power, this would need to move to a real
  `role` column with proper access control instead.
