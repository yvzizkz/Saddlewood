import { NextRequest, NextResponse } from "next/server";

import { allowMirror } from "@/lib/billing/deliver";
import { documentsInGroup } from "@/lib/billing/documents";
import { bad, readBody } from "@/lib/billing/http";
import { mirrorIsFresh } from "@/lib/billing/send";
import { listSendGroups } from "@/lib/billing/sendGroups";
import { createAction, getAction, readState } from "@/lib/bot/queries";
import { actionSchema, ONLINE_WITHIN_MS } from "@/lib/bot/types";
import { requireOwner } from "@/lib/crew/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Bill screen's door (Saddlewood-KB docs/BILLING-ISSUE-PLAN-2026-10-12.md,
// "The screen"). Owners only, signed in: billing is for the owners (decision
// 2026-10-12), and the Mac carries a tap out only for a seat it knows.
//
//   GET            what the Start screen shows: the latest groups (to continue
//                  or look back at), the Joist invoices the Mac says are still
//                  unsent, whether the Mac is online and has reported the
//                  owner's allowlist.
//   GET ?action=N  how a Prepare is going (the Mac answers through
//                  /api/bot/sync; the page polls this).
//   POST           Prepare: queue a billing.prepare tap for the Mac, which
//                  reads the Joist invoices, makes the drafts, their exhibits
//                  and the send group, and fills the group's message.

const unauthorized = () => NextResponse.json({ ok: false, error: "billing is for the owners" }, { status: 403 });

export async function GET(request: NextRequest) {
  const owner = await requireOwner(request);
  if (!owner) return unauthorized();
  const { searchParams } = new URL(request.url);

  try {
    if (searchParams.has("action")) {
      const id = Number(searchParams.get("action"));
      const action = Number.isInteger(id) && id > 0 ? await getAction(id) : null;
      if (!action || action.kind !== "billing.prepare") return NextResponse.json({ ok: false, error: "no such prepare" }, { status: 404 });
      return NextResponse.json({ ok: true, action: { id: action.id, status: action.status, result: action.result, createdAt: action.createdAt } });
    }

    const [{ sections, bridge }, allow, groups] = await Promise.all([readState(), allowMirror(), listSendGroups(12)]);
    const online = !!bridge.seenAt && Date.now() - Date.parse(bridge.seenAt) < ONLINE_WITHIN_MS;
    const withDocs = await Promise.all(
      groups.map(async (g) => {
        const docs = await documentsInGroup(g.id);
        return {
          id: g.id,
          name: g.name,
          createdAt: g.createdAt,
          sentAt: g.message.sentAt ?? null,
          emailId: g.message.emailId ?? null,
          numbers: docs.map((d) => d.number),
          totalCents: docs.reduce((s, d) => s + d.totalCents, 0),
          drafts: docs.filter((d) => d.status === "draft").length,
        };
      }),
    );
    return NextResponse.json({
      ok: true,
      owner,
      online,
      allow: { fresh: mirrorIsFresh(allow), updatedAt: allow?.updatedAt ?? null },
      recent: sections.joistRecent,
      groups: withDocs,
    });
  } catch (err) {
    console.error("bill:", err);
    return NextResponse.json({ ok: false, error: "could not load" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const owner = await requireOwner(request);
  if (!owner) return unauthorized();
  const body = await readBody(request);
  if (!body) return bad("invalid json");
  const parsed = actionSchema.safeParse({ kind: "billing.prepare", payload: body });
  if (!parsed.success) return bad(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  try {
    const { bridge } = await readState();
    const online = !!bridge.seenAt && Date.now() - Date.parse(bridge.seenAt) < ONLINE_WITHIN_MS;
    if (!online) return bad("the Mac is not checking in right now; Prepare needs it (it reads Joist). Try again in a minute.", 503);
    const action = await createAction(owner.email, parsed.data);
    return NextResponse.json({ ok: true, action: { id: action.id, status: action.status } }, { status: 202 });
  } catch (err) {
    console.error("bill prepare:", err);
    return NextResponse.json({ ok: false, error: "could not ask the Mac" }, { status: 500 });
  }
}
