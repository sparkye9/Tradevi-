import { NextRequest, NextResponse } from 'next/server';
import { runUniverseScan } from '@/lib/universe';
import { saveUniverseScan, isPersistenceConfigured } from '@/lib/scanStore';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic'; // must re-run every cron firing, never statically cached

// Vercel Cron fires in UTC and can't shift with US daylight saving time, so
// vercel.json schedules this route at both 08:00 and 09:00 UTC (4:00 AM EDT
// and 4:00 AM EST). Whichever firing lands outside the 4 AM ET hour is a
// no-op — this guard is what keeps the scan from running twice a day.
function currentEasternHour(): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  }).format(new Date());
  return parseInt(formatted, 10) % 24;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const etHour = currentEasternHour();
  if (etHour !== 4) {
    return NextResponse.json({ skipped: true, reason: `ET hour is ${etHour}, not 4 — duplicate DST firing` });
  }

  const result = await runUniverseScan(1.5);
  result.meta.servedFrom = 'live';
  result.meta.persistenceConfigured = isPersistenceConfigured();
  await saveUniverseScan(result);

  return NextResponse.json({
    skipped: false,
    persisted: result.meta.persistenceConfigured,
    scannedCount: result.meta.scannedCount,
    exchangesCovered: result.meta.exchangesCovered,
    asOf: result.meta.asOf,
    sourceError: result.meta.sourceError ?? null,
  });
}
