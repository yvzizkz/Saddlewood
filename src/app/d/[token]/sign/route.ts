import { after, NextResponse, type NextRequest } from "next/server";

import { signAgreement } from "@/lib/agreements/store";
import { DocumentError, getDocumentByToken } from "@/lib/billing/documents";
import { sendPush } from "@/lib/bot/push";
import { laneAddresses } from "@/lib/crew/notify";
import { readSignatureInput } from "@/lib/sales/signing";
import { settleWatches } from "@/lib/sales/watchRecords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The client signs the job's agreement on its link, /d/<token>/sign (T130).
// Only the exact token opens it, only an issued agreement takes a signature,
// and only one. The signature is a line in the agreement's proof record with
// the hash of the frozen agreement; the job's agreement watch then closes
// from it (src/lib/sales/watchRecords.ts), and the sales lane gets a push.

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await getDocumentByToken(token).catch(() => null);
  if (!doc || doc.kind !== "agreement" || doc.status === "draft") {
    return NextResponse.json({ ok: false, error: "This link does not open an agreement." }, { status: 404 });
  }
  const s = readSignatureInput(await request.json().catch(() => null));
  if (!s.ok) return NextResponse.json({ ok: false, error: s.error }, { status: 400 });
  try {
    const sig = await signAgreement(doc, s.value, {
      ip: (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim(),
      ua: request.headers.get("user-agent") ?? "",
    });
    if (doc.jobId) await settleWatches([doc.jobId]);
    after(async () => {
      try {
        await sendPush(await laneAddresses("sales"), {
          title: `Signed: ${doc.title || doc.number}`.slice(0, 80),
          body: `${sig.name} signed agreement ${doc.number}.`,
          url: doc.jobId ? `/app/jobs/${doc.jobId}` : "/app/sales",
          tag: `agreement-signed-${doc.id}`.slice(0, 60),
        });
      } catch (e) {
        console.error("[agreement sign] push:", (e as Error).message);
      }
    });
    return NextResponse.json({ ok: true, signed: { name: sig.name, at: sig.at } });
  } catch (err) {
    if (err instanceof DocumentError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    console.error("sign agreement:", err);
    return NextResponse.json({ ok: false, error: "We could not record that. Please call us." }, { status: 500 });
  }
}
