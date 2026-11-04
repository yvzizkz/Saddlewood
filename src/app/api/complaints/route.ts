import { NextRequest, NextResponse } from "next/server";

import { logComplaint } from "@/lib/complaints/store";
import { jobForWrite, workSeat } from "@/lib/jobs/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Log a client complaint on a job: owners on any job; a PM or field lead on
// their own. Closing it is PATCH /api/tasks, with what was done.

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: NextRequest) {
  const seat = await workSeat();
  if (!seat) return NextResponse.json({ ok: false, error: "owners, project managers and field leads only" }, { status: 403 });
  const b = ((await request.json().catch(() => null)) ?? {}) as { job?: unknown; title?: unknown; detail?: unknown };
  const title = text(b.title, 200);
  if (!title) return NextResponse.json({ ok: false, error: "Say what the complaint is." }, { status: 400 });
  const job = await jobForWrite(seat, text(b.job, 100));
  if (!job) return NextResponse.json({ ok: false, error: "No such job." }, { status: 404 });
  const logged = await logComplaint(job, { title, detail: text(b.detail, 2000), by: seat.email });
  return NextResponse.json({ ok: true, ...logged });
}
