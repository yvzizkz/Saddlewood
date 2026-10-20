import { NextRequest, NextResponse } from "next/server";

import { subsError } from "@/lib/subs/access";
import { inviteByToken, signSubsUpload, SUBS_BUCKET } from "@/lib/subs/store";
import { isOpenForBids } from "@/lib/subs/types";
import { uploadSchema } from "@/lib/subs/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A one-time upload slot for the sub's own quote or backup, in their invite's
// folder of the private bucket. It joins the bid only when they send it.

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await inviteByToken(token);
  if (!view) return NextResponse.json({ ok: false, error: "this link does not open a bid package" }, { status: 404 });
  if (!isOpenForBids(view.pkg, new Date())) return NextResponse.json({ ok: false, error: "this package is not taking bids" }, { status: 409 });
  const body = uploadSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "PDFs, pictures, spreadsheets and documents up to 25 MB" }, { status: 400 });
  try {
    const slot = await signSubsUpload(`b/${view.invite.id}`, body.data.name);
    return NextResponse.json({ ok: true, bucket: SUBS_BUCKET, ...slot, file: { path: slot.path, ...body.data } });
  } catch (err) {
    return subsError(err, "prepare the upload");
  }
}
