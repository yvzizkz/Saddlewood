import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { billsThrough } from "@/lib/billing/jobMoneyLoad";
import { OpeningError, saveOpening } from "@/lib/billing/jobOpeningStore";
import { jobForWrite, workSeat } from "@/lib/jobs/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What a job carried in from before the app (0064). Owners only.
//
//   PUT { contractCents, settledCents, asOf, source }   a new opening; the newest counts

const cents = z.number().int().min(0).max(100_000_000_00);
const bodySchema = z
  .object({
    contractCents: cents.nullable(),
    settledCents: cents,
    asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    source: z.string().trim().min(1).max(200),
  })
  .strict();

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const seat = await workSeat();
  if (!seat?.owner) return NextResponse.json({ ok: false, error: "owners only" }, { status: 403 });
  const ref = await jobForWrite(seat, (await params).id);
  if (!ref?.billingId) return NextResponse.json({ ok: false, error: "This job has no billing side yet." }, { status: 404 });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "Fill in the amounts, the date and where the figure came from." }, { status: 400 });
  try {
    await saveOpening(ref.billingId, body.data, seat.email, await billsThrough(ref.billingId, body.data.asOf));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof OpeningError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    console.error("job opening:", err);
    return NextResponse.json({ ok: false, error: "Could not save." }, { status: 500 });
  }
}
