import { NextRequest, NextResponse } from "next/server";

import { subsError } from "@/lib/subs/access";
import { inviteByToken, submitBid } from "@/lib/subs/store";
import { readBid } from "@/lib/subs/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A sub sends their bid from their link. No account: the link is the key, and
// the bid is kept with their signature, the time, where it came from and a
// fingerprint of what they priced. A second send is a new revision.

const CONSENT = "By signing, I submit this bid for the scope shown, at these prices, and I agree that this electronic signature is as binding as a handwritten one.";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await inviteByToken(token);
  if (!view) return NextResponse.json({ ok: false, error: "this link does not open a bid package" }, { status: 404 });
  const bid = readBid(await request.json().catch(() => null));
  if (!bid.ok) return NextResponse.json({ ok: false, error: bid.error }, { status: 400 });
  try {
    const r = await submitBid(
      view,
      { ...bid.value, consent: CONSENT },
      { ip: (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim(), ua: request.headers.get("user-agent") ?? "" },
    );
    return NextResponse.json({ ok: true, revision: r.revision, totalCents: r.totalCents, submittedAt: r.submittedAt });
  } catch (err) {
    return subsError(err, "send the bid");
  }
}
