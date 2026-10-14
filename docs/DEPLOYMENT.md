# TRADEVI — Deployment

Production: Vercel, built from `main` (`vercel.json` → `npm run build`). **Nothing from this branch is deployed until it is merged to `main`.**

## Before merging

```bash
npm ci
npx tsc --noEmit          # typecheck
npm test                  # engine + trading checks (deterministic fixtures, no network)
npm run build             # Next.js production build
```

Optional, from a machine that can reach Yahoo, Stooq and Forex Factory:

```bash
npx tsx scripts/verify-data-sources.ts
npx tsx scripts/validate-readiness.ts 30
```

## Preview first

1. Push the branch and open a pull request. Vercel builds a **preview deployment** for it automatically.
2. On the preview URL, check:
   - The top tape shows quote times on hover and no `FEED DISCONNECTED`.
   - `/market-structure` and `/power-hour` load for MNQ with timeframes marked `fresh` during Globex hours.
   - `/prop-firms` and `/risk` work at phone width.
3. Merge to `main`. Vercel promotes it to production.

## Environment variables (unchanged)

| Name | Required | Notes |
|---|---|---|
| `TRADIER_TOKEN`, `TRADIER_ENV` | optional | Real-time equity quotes and options greeks. |
| `FINVIZ_EMAIL`, `FINVIZ_PASSWORD` or `FINVIZ_SESSION_COOKIE` | optional | Stock screener. |
| `TRADINGVIEW_WEBHOOK_SECRET` | optional | Required for `/api/tradingview/webhook`. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | optional | Only for storing TradingView alerts. The service-role key is server-only. |

No new variables were added. All provider keys stay server-side.

## Post-deploy note: TradingView alerts table

Alerts stored before this change contain the webhook secret in `tv_alerts.payload`. After deploying, rotate `TRADINGVIEW_WEBHOOK_SECRET` (in Vercel and in each TradingView alert). Optionally scrub old rows in the Supabase SQL editor:

```sql
update public.tv_alerts set payload = payload - 'secret' where payload ? 'secret';
```

## Rollback

In Vercel → Deployments, promote the previous production deployment, or revert the merge commit on `main`.
