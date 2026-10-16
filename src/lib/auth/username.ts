// Sign in with a username (Lando, 2026-10-15). A seat with no email of its
// own lives under the crew domain: the username "angel.l" is the seat
// angel.l@crew.saddlewoodcontracting.com. Nothing reads mail there, so such a
// seat never gets a code by email: the office reads it one ("Get a code" on
// the Crew screen).

import { PLACEHOLDER_EMAIL_DOMAIN } from "@/lib/crew/types";

export const CREW_LOGIN_DOMAIN = PLACEHOLDER_EMAIL_DOMAIN;

const USERNAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The address a typed username or email signs in as, or "" when it is neither. */
export function loginEmail(typed: string): string {
  const v = typed.trim().toLowerCase();
  if (v.includes("@")) return EMAIL.test(v) ? v : "";
  return USERNAME.test(v) ? `${v}@${CREW_LOGIN_DOMAIN}` : "";
}

/** False for a username seat: no mailbox, so its code comes from the office. */
export function hasInbox(email: string): boolean {
  return !email.trim().toLowerCase().endsWith(`@${CREW_LOGIN_DOMAIN}`);
}
