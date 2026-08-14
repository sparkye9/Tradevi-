import { NextResponse } from 'next/server';
import { CONTACT_EMAIL, chatMailto, parseChatPayload } from '@/lib/contact';

export const dynamic = 'force-dynamic';

async function forwardToInbox(data: { name: string; email: string; message: string }): Promise<boolean> {
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${CONTACT_EMAIL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        name: data.name,
        email: data.email,
        message: data.message,
        _subject: `Tradevi — Chat with us (${data.name})`,
        _replyto: data.email,
        _template: 'table',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send your name, email, and message.' }, { status: 400 });
  }

  const rec = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  // Honeypot — bots fill hidden fields. Pretend success so they move on.
  if (typeof rec.company === 'string' && rec.company.trim()) {
    return NextResponse.json({ ok: true });
  }

  const parsed = parseChatPayload(json);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const delivered = await forwardToInbox(parsed.data);
  return NextResponse.json({
    ok: true,
    ...(delivered ? {} : { mailto: chatMailto(parsed.data) }),
  });
}
