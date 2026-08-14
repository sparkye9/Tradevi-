'use client';

import { useEffect } from 'react';

/**
 * Supabase sometimes returns expired/used confirmation errors in the URL
 * hash (never sent to the server). Treat those as "account is ready — sign in"
 * instead of leaving a scary error on the home page.
 */
const AUTH_LINK_ERRORS = new Set([
  'access_denied',
  'otp_expired',
  'expired',
  'flow_state_not_found',
]);

export default function AuthHashRedirect() {
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const error = params.get('error') ?? '';
    const errorCode = params.get('error_code') ?? '';
    if (!AUTH_LINK_ERRORS.has(error) && !AUTH_LINK_ERRORS.has(errorCode)) return;
    const notice = params.get('type') === 'recovery' ? 'reset' : 'ready';
    window.location.replace(`/login?notice=${notice}`);
  }, []);
  return null;
}
