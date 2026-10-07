import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

import {
  challengeBytes,
  challengeCookie,
  deletePasskey,
  mayUseApp,
  newChallenge,
  ORIGIN,
  passkeysForUser,
  readChallenge,
  RP_ID,
  RP_NAME,
  savePasskey,
  signChallenge,
} from "@/lib/auth/passkeys";
import { createClient } from "@/lib/supabase/server";

// Enrolling a passkey (Face ID / fingerprint) on the device in hand. The
// person is already signed in, by code or link; this adds a second way in
// for next time. Nothing here creates a session.
//
//   GET     the passkeys on this account (label, dates), for the More screen
//   POST    start: a challenge and the options the browser needs
//   PUT     finish: verify the browser's answer, store the public key
//   DELETE  remove one of the account's own passkeys

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && mayUseApp(user) ? user : null;
}

export async function GET() {
  const user = await signedIn();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const rows = await passkeysForUser(user.id);
  return NextResponse.json({
    ok: true,
    passkeys: rows.map((r) => ({
      id: r.id,
      credentialId: r.credential_id,
      label: r.device_label,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
    })),
  });
}

export async function POST() {
  const user = await signedIn();
  if (!user?.email) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const existing = await passkeysForUser(user.id);
  const challenge = newChallenge("register", user.id);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.email,
    challenge: challengeBytes(challenge),
    attestationType: "none",
    excludeCredentials: existing.map((r) => ({ id: r.credential_id, transports: r.transports })),
    authenticatorSelection: {
      residentKey: "preferred",
      // The point is the face or the finger: a plain tap is not enough.
      userVerification: "required",
    },
  });
  const res = NextResponse.json({ ok: true, options });
  res.cookies.set(challengeCookie.name, signChallenge(challenge), challengeCookie.options);
  return res;
}

export async function PUT(request: NextRequest) {
  const user = await signedIn();
  if (!user?.email) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: { response?: RegistrationResponseJSON; label?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const challenge = readChallenge(request.cookies.get(challengeCookie.name)?.value, "register");
  const clear = (res: NextResponse) => {
    res.cookies.set(challengeCookie.name, "", { ...challengeCookie.options, maxAge: 0 });
    return res;
  };
  if (!challenge || challenge.userId !== user.id) {
    return clear(NextResponse.json({ ok: false, error: "challenge missing or expired; start again" }, { status: 400 }));
  }
  if (!body.response || typeof body.response !== "object") {
    return clear(NextResponse.json({ ok: false, error: "response required" }, { status: 400 }));
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });
  } catch (e) {
    return clear(NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 }));
  }
  if (!verification.verified || !verification.registrationInfo) {
    return clear(NextResponse.json({ ok: false, error: "could not verify the passkey" }, { status: 400 }));
  }

  const { credential } = verification.registrationInfo;
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";
  const row = await savePasskey({
    user_id: user.id,
    email: user.email.toLowerCase(),
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports ?? [],
    device_label: label,
  });
  return clear(NextResponse.json({ ok: true, id: row.id, credentialId: row.credential_id }));
}

export async function DELETE(request: NextRequest) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  }
  const removed = await deletePasskey(body.id, user.id);
  return NextResponse.json({ ok: removed, ...(removed ? {} : { error: "not found" }) }, { status: removed ? 200 : 404 });
}
