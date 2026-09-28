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

export const DEFAULT_ALLOWED_PHONES: Record<string, string> = {
  "+16022181191": "lando@saddlewoodcontracting.com",
  "+14806556565": "marco@saddlewoodcontracting.com",
  "+16027431766": "ilene8a@gmail.com",
};

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function normalizePhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

export function allowedPhones(envValue?: string | null): Record<string, string> {
  const raw = envValue ?? process.env.INTERNAL_ALLOWED_PHONES ?? process.env.OPS_ALLOWED_PHONES;
  if (raw && raw.trim()) {
    const custom: Record<string, string> = {};
    for (const pair of raw.split(",")) {
      const [p, e] = pair.split(":");
      if (p && e) custom[normalizePhone(p)] = normalizeEmail(e);
    }
    return { ...DEFAULT_ALLOWED_PHONES, ...custom };
  }
  return { ...DEFAULT_ALLOWED_PHONES };
}

export function emailForPhone(phone: string | null | undefined, envValue?: string | null): string | null {
  const norm = normalizePhone(phone);
  if (!norm) return null;
  const phones = allowedPhones(envValue);
  return phones[norm] || null;
}

export function isAllowedPhone(phone: string | null | undefined, envValue?: string | null): boolean {
  return emailForPhone(phone, envValue) !== null;
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

export function isAllowedIdentity(identity: string | null | undefined): { allowed: boolean; email?: string; phone?: string } {
  if (!identity) return { allowed: false };
  const raw = identity.trim();
  if (raw.includes("@")) {
    const e = normalizeEmail(raw);
    return isAllowedEmail(e) ? { allowed: true, email: e } : { allowed: false };
  }
  const p = normalizePhone(raw);
  const mapped = emailForPhone(p);
  if (mapped && isAllowedEmail(mapped)) {
    return { allowed: true, email: mapped, phone: p };
  }
  return { allowed: false };
}

