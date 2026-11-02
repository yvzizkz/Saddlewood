import { after, NextResponse, type NextRequest } from "next/server";

import { approveChangeOrder } from "@/lib/billing/coApprove";
import { DocumentError, getDocumentByToken } from "@/lib/billing/documents";
import { sendPush } from "@/lib/bot/push";
import { laneAddresses } from "@/lib/crew/notify";
import { usd } from "@/lib/money";
import { readSignatureInput } from "@/lib/sales/signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The client approves a change order on its link, /d/<token>/approve (T256).
// Only the exact token opens it, only the change order's current issued
// document takes an approval, and only one (src/lib/billing/coApprove.ts).
// Whoever decides on change orders (the "decisions" lane) gets a push.

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await getDocumentByToken(token).catch(() => null);
  if (!doc || doc.kind !== "change_order" || doc.status === "draft") {
    return NextResponse.json({ ok: false, error: "This link does not open a change order." }, { status: 404 });
  }
  const s = readSignatureInput(await request.json().catch(() => null));
  if (!s.ok) return NextResponse.json({ ok: false, error: s.error }, { status: 400 });
  try {
    const r = await approveChangeOrder(doc, s.value, {
      ip: (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim(),
      ua: request.headers.get("user-agent") ?? "",
    });
    after(async () => {
      try {
        await sendPush(await laneAddresses("decisions"), {
          title: `Approved: ${doc.number}`.slice(0, 80),
          body: `${r.signature.name} approved ${doc.title || doc.number} at ${usd(doc.totalCents)}.`.slice(0, 240),
          url: `/app/changes/${r.changeOrderId}`,
          tag: `co-approved-${r.changeOrderId}`,
        });
      } catch (e) {
        console.error("[co approve] push:", (e as Error).message);
      }
    });
    return NextResponse.json({ ok: true, signed: { name: r.signature.name, at: r.signature.at }, signedOn: r.signedOn });
  } catch (err) {
    if (err instanceof DocumentError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    console.error("approve change order:", err);
    return NextResponse.json({ ok: false, error: "We could not record that. Please call us." }, { status: 500 });
  }
}
