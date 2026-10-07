import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

import { safeNext } from "@/lib/auth/magicLink";
import {
  challengeCookie,
  mayUseApp,
  mintSession,
  newChallenge,
  ORIGIN,
  passkeyByCredential,
  readChallenge,
  RP_ID,
  signChallenge,
  touchPasskey,
} from "@/lib/auth/passkeys";
import { isAllowedEmail } from "@/lib/ops/allowlist";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Face ID / fingerprint sign-in. The version that lived here from 2026-09-27
// to 2026-10-03 minted a session for any allowlisted email that sent some
// `credentialId` string, with nothing checked. This one is real WebAuthn:
//
//   POST  a fresh random challenge (signed, in a short-lived cookie) and the
//         options the browser needs to ask the phone for a passkey;
//   PUT   the phone's signed answer. It is checked against the public key
//         stored when the passkey was enrolled (register/route.ts), against
//         the challenge this server issued, and against the site's origin.
//         The person must still have access. Only then is a session made.
//
// Enrollment and sign-in refuse a plain tap: the phone has to verify the
// face or the finger (userVerification: required).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const challenge = newChallenge("login");
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    challenge: challenge.challenge,
    userVerification: "required",
    // No allow-list: the phone offers whichever Saddlewood passkey it holds.
    allowCredentials: [],
  });
  const res = NextResponse.json({ ok: true, options });
  res.cookies.set(challengeCookie.name, signChallenge(challenge), challengeCookie.options);
  return res;
}

export async function PUT(request: NextRequest) {
  let body: { response?: AuthenticationResponseJSON; next?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const clear = (res: NextResponse) => {
    res.cookies.set(challengeCookie.name, "", { ...challengeCookie.options, maxAge: 0 });
    return res;
  };
  const refused = (status: number, error: string) => clear(NextResponse.json({ ok: false, error }, { status }));

  const challenge = readChallenge(request.cookies.get(challengeCookie.name)?.value, "login");
  if (!challenge) return refused(400, "challenge missing or expired; try again");
  const response = body.response;
  if (!response || typeof response !== "object" || typeof response.id !== "string") {
    return refused(400, "response required");
  }

  // One answer for every miss, so this cannot be used to probe which
  // credential ids exist.
  const row = await passkeyByCredential(response.id);
  if (!row) return refused(401, "that passkey is not known here");

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: row.credential_id,
        publicKey: new Uint8Array(Buffer.from(row.public_key, "base64url")),
        counter: Number(row.counter),
        transports: row.transports,
      },
      requireUserVerification: true,
    });
  } catch (e) {
    console.warn("[auth/passkey] verify:", (e as Error).message);
    return refused(401, "that passkey is not known here");
  }
  if (!verification.verified) return refused(401, "that passkey is not known here");

  // The passkey is real. Is the person still allowed in?
  const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(row.user_id);
  const user = data?.user;
  if (error || !user?.email || !mayUseApp(user) || user.email.toLowerCase() !== row.email.toLowerCase()) {
    return refused(403, "this account no longer has access");
  }

  await touchPasskey(row.id, verification.authenticationInfo.newCounter);
  try {
    await mintSession(user.email);
  } catch (e) {
    console.error("[auth/passkey] session:", (e as Error).message);
    return refused(502, "could not start the session");
  }

  const wanted = safeNext(typeof body.next === "string" ? body.next : undefined);
  const staff = isAllowedEmail(user.email);
  const next = staff || wanted === "/app" || wanted.startsWith("/app/") ? wanted : "/app";
  return clear(NextResponse.json({ ok: true, next }));
}
