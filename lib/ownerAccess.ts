/**
 * Lets specific accounts (you, the operator) use the app without paying
 * yourself through PayPal. Set OWNER_EMAILS to a comma-separated list of
 * the exact email(s) your own account(s) sign up with — those accounts
 * skip the subscription check everywhere it's enforced (middleware.ts,
 * /subscribe). Anyone else still needs an ACTIVE row in `subscriptions`.
 *
 * Plain env var, not a database flag: it's read in middleware (Edge
 * runtime), and it means comping an account never depends on the database
 * being reachable.
 */
function ownerEmailSet(): Set<string> {
  return new Set(
    (process.env.OWNER_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ownerEmailSet().has(email.toLowerCase());
}
