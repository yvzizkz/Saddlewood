import { NextResponse } from "next/server";
import { z } from "zod";

import { sendPush } from "@/lib/bot/push";
import { gateCrew } from "@/lib/crew/auth";
import { laneAddresses } from "@/lib/crew/notify";
import { createOpportunity, SalesError } from "@/lib/sales/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A lead from the field: a neighbor asked about a patio, a client wants the
// next room done. The worker types what they heard; it lands in the pipeline
// as a new lead with their name on it, and Marco's phone (the sales lane)
// gets a push. The crew never see the pipeline itself.

const input = z.object({
  what: z.string().trim().min(3, "say what they want done").max(300),
  name: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(40).default(""),
  address: z.string().trim().max(300).default(""),
  note: z.string().trim().max(2000).default(""),
});

export async function POST(request: Request) {
  const gate = await gateCrew();
  if (gate.response) return gate.response;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "not valid" }, { status: 400 });
  const d = parsed.data;
  const by = gate.person.name || gate.person.email;
  try {
    const o = await createOpportunity(
      {
        title: d.name ? `${d.name}: ${d.what}` : d.what,
        kind: "other",
        source: "field",
        contact: { name: d.name, phone: d.phone },
        address: d.address,
        notes: "",
      },
      `crew: ${gate.person.email}`,
      { kind: "field", text: [d.what, d.note].filter(Boolean).join("\n\n"), detail: { by } },
    );
    try {
      await sendPush(await laneAddresses("sales"), {
        title: `Lead from ${by.split(" ")[0]}`.slice(0, 80),
        body: `${d.what}${d.name ? ` · ${d.name}` : ""}${d.phone ? ` · ${d.phone}` : ""}`.slice(0, 240),
        url: `/app/sales/${o.id}`,
        tag: `sales-${o.id}`.slice(0, 60),
      });
    } catch (e) {
      console.error("[crew/refer] push:", (e as Error).message);
    }
    return NextResponse.json({ ok: true, number: o.number }, { status: 201 });
  } catch (err) {
    if (err instanceof SalesError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    console.error("crew refer:", err);
    return NextResponse.json({ ok: false, error: "could not send it" }, { status: 500 });
  }
}
