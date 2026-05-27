const SESSION_TTL = 55 * 60 * 1000;

let cachedSession: { cookies: string; email: string; ts: number } | null = null;

export async function authenticateStockCharts(): Promise<string | null> {
  if (cachedSession && Date.now() - cachedSession.ts < SESSION_TTL) {
    return cachedSession.cookies;
  }

  const email    = process.env.STOCKCHARTS_EMAIL;
  const password = process.env.STOCKCHARTS_PASSWORD;
  if (!email || !password) return null;

  try {
    const getResp = await fetch('https://stockcharts.com/login/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
      cache: 'no-store',
    });

    const initCookies = getResp.headers.get('set-cookie') ?? '';
    const html        = await getResp.text();
    const tokenMatch  = html.match(/name="_token"\s+value="([^"]+)"/);
    const csrfToken   = tokenMatch?.[1] ?? '';

    const body = new URLSearchParams({
      email, password, remember: '1',
      ...(csrfToken ? { _token: csrfToken } : {}),
    });

    const postResp = await fetch('https://stockcharts.com/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer':      'https://stockcharts.com/login/',
        'Accept':       'text/html,application/xhtml+xml,*/*',
        'Origin':       'https://stockcharts.com',
        ...(initCookies ? { Cookie: extractCookieStr(initCookies) } : {}),
      },
      body:     body.toString(),
      redirect: 'manual',
      cache:    'no-store',
    });

    const rawCookies = collectCookies(postResp.headers.get('set-cookie') ?? '');
    if (rawCookies) {
      cachedSession = { cookies: rawCookies, email, ts: Date.now() };
      return rawCookies;
    }
  } catch (err) {
    console.error('[StockCharts] Auth failed:', err);
  }
  return null;
}

export function getCachedSession() { return cachedSession; }

function extractCookieStr(raw: string): string {
  return raw.split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

function collectCookies(raw: string): string {
  if (!raw) return '';
  return raw.split(',').map(c => c.split(';')[0].trim()).filter(c => c.includes('=')).join('; ');
}
