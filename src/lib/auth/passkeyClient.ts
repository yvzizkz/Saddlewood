import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";

// Browser side of Face ID / fingerprint sign-in. The server does the
// checking (src/lib/auth/passkeys.ts); this only ferries the browser's
// answers to it.

// Remembered on the device once a passkey is enrolled here, so the login
// page can lead with the Face ID button instead of the email field.
export const PASSKEY_FLAG = "saddlewood_passkey";

export function passkeySupported(): boolean {
  return typeof window !== "undefined" && browserSupportsWebAuthn();
}

export function passkeyOnThisDevice(): boolean {
  try {
    return localStorage.getItem(PASSKEY_FLAG) === "1";
  } catch {
    return false;
  }
}

// "Not now" on the offer after sign-in. Asked again after a month, the way a
// bank app would, not on every sign-in.
const DECLINED_KEY = "saddlewood_passkey_declined";
const ASK_AGAIN_DAYS = 30;

export function shouldOfferPasskey(): boolean {
  if (!passkeySupported() || passkeyOnThisDevice()) return false;
  try {
    const at = Number(localStorage.getItem(DECLINED_KEY) || 0);
    return !at || Date.now() - at > ASK_AGAIN_DAYS * 86_400_000;
  } catch {
    return true;
  }
}

export function declinePasskeyOffer() {
  try {
    localStorage.setItem(DECLINED_KEY, String(Date.now()));
  } catch {
    // private mode
  }
}

function remember(on: boolean) {
  try {
    if (on) localStorage.setItem(PASSKEY_FLAG, "1");
    else localStorage.removeItem(PASSKEY_FLAG);
  } catch {
    // private mode
  }
}

async function json<T>(res: Response): Promise<T & { ok: boolean; error?: string }> {
  const body = (await res.json().catch(() => ({}))) as T & { ok: boolean; error?: string };
  if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

/** Enroll this device. The person is signed in already. */
export async function enrollPasskey(label: string): Promise<{ id: string }> {
  const start = await json<{ options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>(
    await fetch("/api/auth/passkey/register", { method: "POST" }),
  );
  const response = await startRegistration({ optionsJSON: start.options });
  const done = await json<{ id: string }>(
    await fetch("/api/auth/passkey/register", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response, label }),
    }),
  );
  remember(true);
  return { id: done.id };
}

/** Sign in with a passkey the phone holds. Resolves to where to go next. */
export async function signInWithPasskey(next: string): Promise<string> {
  const start = await json<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>(
    await fetch("/api/auth/passkey", { method: "POST" }),
  );
  const response = await startAuthentication({ optionsJSON: start.options });
  const done = await json<{ next: string }>(
    await fetch("/api/auth/passkey", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response, next }),
    }),
  );
  remember(true);
  return done.next;
}

export async function removePasskey(id: string): Promise<void> {
  await json(
    await fetch("/api/auth/passkey/register", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }),
  );
}

export function forgetPasskeyOnThisDevice() {
  remember(false);
}

/** A friendly name for the device being enrolled, best effort. */
export function deviceLabel(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "This device";
}
