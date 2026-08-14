# Tradevi Premium — PayPal Subscriptions setup

This app now gates one feature — the **Trend Bias Stack** engine at
`/trend-bias` — behind a $7.99/month PayPal subscription. This doc covers
two things: the honest answer on fees, and the steps to turn it on.

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

## What was built

Given this repo has no server database (it's a single Next.js app on
Vercel — serverless functions, no persistent disk), the gate works like
this:

- `/subscribe` — a PayPal Subscribe button (PayPal's hosted JS SDK,
  `intent=subscription`). On approval, PayPal hands back a subscription ID
  (`I-XXXXXXXXXXXX`), which is stored in the browser's `localStorage`
  (`store/subscriptionStore.ts`).
- `components/premium/PremiumGate.tsx` — wraps a premium page. On every
  visit it calls `/api/paypal/status?subscriptionId=...`, which does a
  live server-to-server lookup against PayPal's Subscriptions API
  (`lib/paypal.ts`) and only renders the page if PayPal currently reports
  `ACTIVE`.
- `/api/paypal/webhook` — receives PayPal's subscription lifecycle events
  (cancelled, expired, payment failed) and verifies their signature via
  PayPal's own verify-webhook-signature endpoint. Access control doesn't
  depend on anything this endpoint stores locally — PayPal is always the
  live source of truth — so this exists mainly so PayPal's webhook
  dashboard validation succeeds and events are logged.
- A "restore access" box on `/subscribe` lets a subscriber paste their
  subscription ID to unlock a second device/browser, since the unlock
  token only lives in that one browser's storage.

This means: no card numbers ever touch this app's code — PayPal owns all of
that — and there's nothing sensitive to leak from a database, because there
isn't one. The tradeoff is that "premium access" is really "does this
browser (or a pasted ID) point at a PayPal subscription that's currently
ACTIVE," not a real user-account system. That's fine for one paid feature
run by one person; it would need real accounts if this grows into multiple
premium tiers or a team plan.

## Setup steps

1. **Get a PayPal Business account.** Personal accounts can't create billing
   plans. Upgrade at paypal.com or sign up fresh as a business.

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
   (This can also be done via the `/v1/catalogs/products` and
   `/v1/billing/plans` REST APIs if you'd rather script it.)

4. **Register the webhook.**
   In your app's settings on developer.paypal.com → Webhooks → Add
   Webhook. URL: `https://<your-domain>/api/paypal/webhook`. Subscribe to
   at least: `BILLING.SUBSCRIPTION.ACTIVATED`,
   `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`,
   `BILLING.SUBSCRIPTION.SUSPENDED`, `PAYMENT.SALE.DENIED`. Copy the
   Webhook ID it gives you.

5. **Set environment variables** (see `.env.example`) — in Vercel project
   settings, or `.env.local` for local dev:
   ```
   PAYPAL_ENV=sandbox                 # then "live" when ready
   PAYPAL_CLIENT_ID=...
   PAYPAL_CLIENT_SECRET=...
   PAYPAL_WEBHOOK_ID=...
   NEXT_PUBLIC_PAYPAL_CLIENT_ID=...   # same value as PAYPAL_CLIENT_ID
   NEXT_PUBLIC_PAYPAL_PLAN_ID=...     # the P-... plan ID from step 3
   ```

6. **Test end to end in sandbox** before going live: visit `/subscribe`,
   pay with a PayPal sandbox buyer account, confirm `/trend-bias` unlocks,
   then cancel the subscription from the sandbox buyer's PayPal account and
   confirm the page re-locks on next visit (status is re-checked live, so
   this can take up to one page load, not instant).

7. **Go live**: swap in your live Client ID/Secret/Webhook ID and set
   `PAYPAL_ENV=live`.

## Honest limitations to know about

- **No real accounts.** Access is tied to a subscription ID sitting in
  browser storage, recoverable by anyone who has that ID. Don't treat it as
  a security boundary for anything more sensitive than "can view this page."
- **Payouts still land in your normal PayPal balance** — this doesn't set
  up automatic transfers to your bank; that's a separate setting in your
  PayPal account (Settings → automatic withdrawals).
- **Chargebacks/disputes** are handled through PayPal's normal resolution
  process, same as any PayPal payment.
