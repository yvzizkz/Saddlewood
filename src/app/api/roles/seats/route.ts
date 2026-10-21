import { NextRequest, NextResponse } from "next/server";

import { requireOwner } from "@/lib/crew/auth";
import { loadPeople, loadSeats, saveSeat, SeatError } from "@/lib/roles/store";
import { ROLES, seatHolder } from "@/lib/roles/seats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Role seats: who holds each role and who covers it. Owners read and change them.

export async function GET(request: NextRequest) {
  if (!(await requireOwner(request))) return NextResponse.json({ ok: false, error: "owners only" }, { status: 403 });
  const [seats, people] = await Promise.all([loadSeats(), loadPeople()]);
  return NextResponse.json({ ok: true, seats, holders: Object.fromEntries(ROLES.map((r) => [r, seatHolder(r, seats, people)])) });
}

export async function PATCH(request: NextRequest) {
  const owner = await requireOwner(request);
  if (!owner) return NextResponse.json({ ok: false, error: "owners only" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { role?: string; holder?: string; backup?: string; note?: string } | null;
  if (!body?.role) return NextResponse.json({ ok: false, error: "role required" }, { status: 400 });
  try {
    await saveSeat(body.role, body, owner.email);
  } catch (e) {
    if (e instanceof SeatError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
