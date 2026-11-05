import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { runProblem } from "@/lib/accounting/payrollRun";
import { saveRun } from "@/lib/accounting/payrollRunStore";
import { getViewer, viewerIsOwner } from "@/lib/crew/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Wednesday payroll run. Owners only: it's what everyone gets paid.
//
//   PUT { payDate, lines }   save the run for that pay date

const lineSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(["employee", "sub"]),
    hours: z.number().min(0).max(400).nullable(),
    amountCents: z.number().int().min(0).max(100_000_000).nullable(),
    note: z.string().trim().max(200),
  })
  .strict();
const bodySchema = z.object({ payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), lines: z.array(lineSchema).max(100) }).strict();

export async function PUT(request: NextRequest) {
  const viewer = await getViewer();
  if (viewer.kind !== "staff" || !(await viewerIsOwner(viewer))) return NextResponse.json({ ok: false, error: "owners only" }, { status: 403 });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "Check the lines." }, { status: 400 });
  const problem = runProblem(body.data.lines);
  if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });
  await saveRun(body.data.payDate, body.data.lines, viewer.email);
  return NextResponse.json({ ok: true });
}
