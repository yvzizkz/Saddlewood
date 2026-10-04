import { NextResponse } from "next/server";

// Passkey sign-in is OFF. This stub stays so nobody restores the old handler.
//
// The handler that lived here (2026-09-27 to 2026-10-03) minted a full portal
// session for any allowlisted email as long as the request carried some
// `credentialId` string. Nothing was ever checked: enrollment stored no public
// key on the server, the challenge was a constant, and no signature was
// verified. The allowlisted addresses are guessable (info@, marco@), so this
// was a sign-in with no password for anyone who could send one POST.
//
// Sign-in is the emailed code or one-tap link (/api/auth/send-link), which
// proves control of the mailbox. If Face ID sign-in comes back it has to be
// real WebAuthn: a server-issued random challenge, the credential's public key
// stored at enrollment, and the assertion signature verified here before any
// session is created.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function gone() {
  return NextResponse.json(
    { ok: false, error: "passkey sign-in is disabled; use the emailed code or link" },
    { status: 410 },
  );
}

export async function POST() {
  return gone();
}

export async function GET() {
  return gone();
}
