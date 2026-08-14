export const CONTACT_EMAIL = 'TheOptionaltrader@gmail.com';
export const CONTACT_REPLY_WINDOW = '24–48 business hours';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ChatPayload {
  name: string;
  email: string;
  message: string;
}

export function parseChatPayload(body: unknown): { ok: true; data: ChatPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Send your name, email, and message.' };
  }
  const rec = body as Record<string, unknown>;
  const name = typeof rec.name === 'string' ? rec.name.trim() : '';
  const email = typeof rec.email === 'string' ? rec.email.trim() : '';
  const message = typeof rec.message === 'string' ? rec.message.trim() : '';

  if (name.length < 1 || name.length > 80) {
    return { ok: false, error: 'Name is required.' };
  }
  if (!EMAIL_RE.test(email) || email.length > 120) {
    return { ok: false, error: 'Enter a valid email so we can reply.' };
  }
  if (message.length < 8 || message.length > 4000) {
    return { ok: false, error: 'Message should be at least a sentence.' };
  }

  return { ok: true, data: { name, email, message } };
}

export function chatMailto({ name, email, message }: ChatPayload): string {
  const subject = `Tradevi — Chat with us (${name})`;
  const body = `From: ${name} <${email}>\n\n${message}`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
