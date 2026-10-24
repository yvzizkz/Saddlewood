import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDocumentByToken } from "@/lib/billing/documents";
import { sendPush } from "@/lib/bot/push";
import { laneAddresses } from "@/lib/crew/notify";
import { notifyAfterSignature } from "@/lib/sales/mail";
import { readSignatureInput } from "@/lib/sales/signing";
import { loadSettings } from "@/lib/sales/settingsStore";
import { acceptProposal, proposalRecord, SalesError } from "@/lib/sales/store";
import { localDay } from "@/lib/crew/time";
import { usd } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The client accepts a proposal on its link, /d/<token>/accept, and signs it
// when the proposal asks for a signature. Only the exact token opens it (site
// rule since 2026-10-05). The price is worked out again from the frozen
// proposal; what the browser says it is, is ignored. One acceptance per
// proposal. Marco's phone (the sales lane) gets a push, and the signing
// workflow emails whoever Sales settings say, after the answer is sent.

const input = z.object({
  name: z.string().max(200),
  packageId: z.string().max(40),
  optionIds: z.array(z.string().max(40)).max(40).default([]),
  note: z.string().max(1000).optional(),
  agree: z.literal(true),
  signature: z.unknown().optional(),
});


export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await getDocumentByToken(token).catch(() => null);
  if (!doc || doc.kind !== "estimate" || doc.status === "draft") {
    return NextResponse.json({ ok: false, error: "This link does not open a proposal." }, { status: 404 });
  }
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Type your name and tick the box to accept." }, { status: 400 });
  let signature;
  if (parsed.data.signature !== undefined) {
    const s = readSignatureInput(parsed.data.signature);
    if (!s.ok) return NextResponse.json({ ok: false, error: s.error }, { status: 400 });
    signature = s.value;
  }
  try {
    const r = await acceptProposal(
      doc,
      { name: parsed.data.name, packageId: parsed.data.packageId, optionIds: parsed.data.optionIds, note: parsed.data.note, signature },
      {
        ip: (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim(),
        ua: request.headers.get("user-agent") ?? "",
        today: localDay(),
      },
    );
    const who = (signature?.name ?? parsed.data.name).trim();
    after(async () => {
      try {
        await sendPush(await laneAddresses("sales"), {
          title: `${r.signed ? "Signed" : "Accepted"}: ${doc.title || doc.number}`.slice(0, 80),
          body: `${who} ${r.signed ? "signed" : "accepted"} ${r.packageName} at ${usd(r.totalCents)}.${r.executed ? " Fully signed." : r.signed ? " Countersign in Sales." : " Open the job next."}`,
          url: r.opportunityId ? `/app/sales/${r.opportunityId}` : "/app/sales",
          tag: `accepted-${doc.id}`.slice(0, 60),
        });
      } catch (e) {
        console.error("[accept] push:", (e as Error).message);
      }
      try {
        const rec = await proposalRecord(doc.id);
        if (rec) await notifyAfterSignature({ doc: rec.doc, proposal: rec.proposal, sigs: rec.signatures, events: rec.events, settings: await loadSettings(), who: "client", executed: r.executed });
      } catch (e) {
        console.error("[accept] notices:", (e as Error).message);
      }
    });
    return NextResponse.json({ ok: true, totalCents: r.totalCents, packageName: r.packageName, signed: r.signed, executed: r.executed });
  } catch (err) {
    if (err instanceof SalesError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    console.error("accept proposal:", err);
    return NextResponse.json({ ok: false, error: "We could not record that. Please call us." }, { status: 500 });
  }
}
