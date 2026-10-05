import { NextRequest, NextResponse } from "next/server";

import { getDocument } from "@/lib/billing/documents";
import { paidByDocument, PAYMENT_METHODS, recordPayment, type PaymentMethod } from "@/lib/billing/payments";
import { authorizeOps } from "@/lib/ops/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Record money received against one document (and, for a statement, one of
// its lines). Staff only. Without "confirm": true the answer shows what would
// be recorded and the balance it would leave, and writes nothing.

export async function POST(request: NextRequest) {
  const who = await authorizeOps(request);
  if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let input: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    input = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const bad = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });

  const documentId = typeof input.documentId === "string" ? input.documentId : "";
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return bad("documentId is required");
  const amountCents = input.amountCents;
  if (!Number.isInteger(amountCents) || (amountCents as number) <= 0) return bad("amountCents must be whole cents, above zero");
  const feeCents = input.feeCents === undefined ? 0 : input.feeCents;
  if (!Number.isInteger(feeCents) || (feeCents as number) < 0) return bad("feeCents must be whole cents");
  const method = typeof input.method === "string" ? (input.method as PaymentMethod) : ("" as PaymentMethod);
  if (!PAYMENT_METHODS.includes(method)) return bad(`method must be one of ${PAYMENT_METHODS.join(", ")}`);
  const receivedOn = typeof input.receivedOn === "string" ? input.receivedOn : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) return bad("receivedOn must be a date (YYYY-MM-DD)");
  let lineIndex: number | null = null;
  if (input.lineIndex !== undefined && input.lineIndex !== null) {
    if (!Number.isInteger(input.lineIndex) || (input.lineIndex as number) < 0) return bad("lineIndex must be a line number");
    lineIndex = input.lineIndex as number;
  }

  try {
    const doc = await getDocument(documentId);
    if (!doc) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    if (doc.status !== "issued") return NextResponse.json({ ok: false, error: "only an issued document takes a payment" }, { status: 409 });
    const lines = doc.snapshot.lines ?? [];
    if (lineIndex !== null && lineIndex >= lines.length) return bad(`lineIndex must be a line of this document (0 to ${Math.max(lines.length - 1, 0)})`);

    const paid = (await paidByDocument([doc.id])).get(doc.id);
    const paidBefore = paid?.total ?? 0;
    const lineTotal = lineIndex === null ? doc.totalCents : lines[lineIndex].amountCents;
    const linePaid = lineIndex === null ? paidBefore : (paid?.byLine.get(lineIndex) ?? 0);
    const over = linePaid + (amountCents as number) - lineTotal;
    const preview = {
      document: { id: doc.id, number: doc.number, totalCents: doc.totalCents },
      line: lineIndex === null ? null : { index: lineIndex, description: lines[lineIndex].description, amountCents: lineTotal },
      receivedOn,
      amountCents,
      feeCents,
      method,
      reference: typeof input.reference === "string" ? input.reference.trim().slice(0, 120) : "",
      balanceBefore: doc.totalCents - paidBefore,
      balanceAfter: doc.totalCents - paidBefore - (amountCents as number),
      overpaysBy: over > 0 ? over : 0,
    };
    if (input.confirm !== true) return NextResponse.json({ ok: true, recorded: false, preview });
    if (over > 0 && input.allowOverpayment !== true) {
      return NextResponse.json({ ok: false, error: `this would overpay by ${(over / 100).toFixed(2)}; pass allowOverpayment to record it anyway`, preview }, { status: 409 });
    }

    const payment = await recordPayment({
      clientId: doc.clientId,
      receivedOn,
      amountCents: amountCents as number,
      feeCents: feeCents as number,
      method,
      reference: preview.reference,
      note: typeof input.note === "string" ? input.note : "",
      evidence: typeof input.evidence === "string" ? input.evidence : "",
      recordedBy: who.actor,
      allocations: [{ documentId: doc.id, lineIndex, amountCents: amountCents as number }],
    });
    return NextResponse.json({ ok: true, recorded: true, payment, preview });
  } catch (err) {
    console.error("payments:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "could not record" }, { status: 500 });
  }
}
