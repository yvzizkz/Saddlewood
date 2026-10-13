import { NextRequest, NextResponse } from "next/server";

import { runAdminAct } from "@/lib/crew/admin";
import { mayRun, requireManager } from "@/lib/crew/auth";
import { adminHome } from "@/lib/crew/home";
import { adminActSchema } from "@/lib/crew/types";

// The owners' side of the crew: who is on the clock, what came in from the
// field, the schedule, tasks, hours, and who has a seat. Owners: a portal
// session with an owner's seat. A crew seat whose group has the Crew tab on:
// what the group's switches allow (mayRun). Not other crew, not the agent token.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const forbidden = () => NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
const ownersOnly = () => NextResponse.json({ ok: false, error: "Your group does not have that switched on. Marco or Lando can change it." }, { status: 403 });

/** The site can be deployed before supabase/migrations/0011_crew.sql is applied. Say that, not a database error. */
function failure(e: unknown) {
  const message = (e as Error).message ?? "";
  if (/does not exist|schema cache|could not find the table/i.test(message)) {
    return NextResponse.json(
      { ok: false, error: "The crew side is not switched on yet: its database tables are missing (migration 0011)." },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const manager = await requireManager(request);
    if (!manager) return forbidden();
    const home = await adminHome(manager, new URL(request.url).searchParams.get("week"));
    return NextResponse.json(home, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  try {
    const manager = await requireManager(request);
    if (!manager) return forbidden();
    const parsed = adminActSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    }
    if (!mayRun(manager, parsed.data.kind)) return ownersOnly();
    const res = await runAdminAct(manager, parsed.data);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
