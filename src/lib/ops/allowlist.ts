// Who may open the internal portal and the Ops board.
//
// One list, imported by the login page (client, to fail fast with a clear
// message), the internal layout (server, the real gate), and the Ops API.
// Emails are compared lowercased and trimmed. Supabase Auth is configured
// with shouldCreateUser: false, so an address must ALSO exist as an Auth user
// before a magic link can be issued for it; see docs/OPS-BOARD.md.
//
// Override in production without a deploy: INTERNAL_ALLOWED_EMAILS (the name
// src/proxy.ts has always read) or OPS_ALLOWED_EMAILS, comma separated. The
// constant below is the fallback and the documented default. Keep the Vercel
// variable and this list in agreement: whichever is set wins.

export const DEFAULT_ALLOWED_EMAILS = [
  "marco@saddlewoodcontracting.com",
  "ilene8a@gmail.com",
  "info@saddlewoodcontracting.com",
  "bot@saddlewoodcontracting.com",
  "lando@saddlewoodcontracting.com",
] as const;

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function allowedEmails(envValue?: string | null): string[] {
  const raw = envValue ?? process.env.INTERNAL_ALLOWED_EMAILS ?? process.env.OPS_ALLOWED_EMAILS;
  if (raw && raw.trim()) {
    return raw
      .split(",")
      .map((e) => normalizeEmail(e))
      .filter(Boolean);
  }
  return [...DEFAULT_ALLOWED_EMAILS];
}

export function isAllowedEmail(email: string | null | undefined, envValue?: string | null): boolean {
  const e = normalizeEmail(email);
  return e.length > 0 && allowedEmails(envValue).includes(e);
}
