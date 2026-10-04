import { NextRequest, NextResponse } from "next/server";

import { runCrewAct } from "@/lib/crew/act";
import { gateCrew } from "@/lib/crew/auth";
import { crewActSchema } from "@/lib/crew/types";

// One door for everything a crew member does: clock in and out, send a
// receipt, a progress note or the end-of-day check-in, answer a question,
// finish a task. Recorded at once under their own name. The office Mac is not
// involved: it reads what was recorded afterwards.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gate = await gateCrew();
  if (gate.response) return gate.response;
  const person = gate.person;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = crewActSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }
  try {
    const res = await runCrewAct(person, parsed.data);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
    return NextResponse.json(res);
  } catch (e) {
    console.error("[crew/act]", parsed.data.kind, (e as Error).message);
    return NextResponse.json({ ok: false, error: "That did not save. Try again." }, { status: 500 });
  }
}
