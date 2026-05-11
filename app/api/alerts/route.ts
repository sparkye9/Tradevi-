import { NextRequest, NextResponse } from 'next/server';
// Alerts are managed client-side via Zustand + localStorage.
// This route can be used for server-side alert seeding or validation.

export async function GET() {
  return NextResponse.json({
    message: 'Alerts are managed client-side. Use the /alerts page.',
    docs: 'POST /api/scanner to get opportunities, then create alerts from them in the UI.',
  });
}
