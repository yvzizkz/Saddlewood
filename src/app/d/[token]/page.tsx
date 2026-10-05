import type { Metadata } from "next";
import { headers } from "next/headers";

import { getDocumentByToken, listEvents, recordEvent } from "@/lib/billing/documents";
import { looksAutomatic } from "@/lib/billing/proof";
import type { BillingDocument, DocumentKind } from "@/lib/billing/types";
import { isAllowedEmail } from "@/lib/ops/allowlist";
import { createClient } from "@/lib/supabase/server";

// The client's copy of a document we issued: /d/<token>.
//
// Opening this page is what "viewed" means in the proof record. The email we
// send carries a summary and this link, so reading the document itself leaves
// a line here: when, and on what kind of device. Staff looking at it while
// signed in are not counted, and an opening that looks like a mail scanner is
// kept but marked (src/lib/billing/proof.ts).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saddlewood Contracting",
  robots: { index: false, follow: false },
};

const KIND_LABEL: Record<DocumentKind, string> = {
  estimate: "Estimate",
  change_order: "Change Order",
  invoice: "Invoice",
  statement: "Statement",
  notice: "Notice",
};

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function day(iso: string | null | undefined): string {
  if (!iso) return "";
  // A plain date (2026-10-05) is a calendar day, not an instant: keep it out of time zones.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Phoenix" });
}

async function isStaff(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return isAllowedEmail(user?.email);
  } catch {
    return false;
  }
}

async function recordView(doc: BillingDocument): Promise<void> {
  try {
    if (await isStaff()) return;
    const h = await headers();
    const now = new Date();
    const events = await listEvents(doc.id);
    const last = events.filter((e) => e.kind === "sent" || e.kind === "delivered").at(-1);
    const ua = h.get("user-agent");
    await recordEvent({
      documentId: doc.id,
      kind: "viewed",
      at: now,
      actor: "client link",
      automatic: looksAutomatic({
        userAgent: ua,
        purpose: h.get("sec-purpose") ?? h.get("purpose") ?? (h.get("next-router-prefetch") ? "prefetch" : null),
        at: now,
        lastSentOrDeliveredAt: last ? new Date(last.at) : null,
      }),
      detail: {
        ua: (ua ?? "").slice(0, 300),
        ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64),
      },
    });
  } catch (err) {
    // The client still gets their document; we lose one line, and say so in the logs.
    console.error("document view not recorded:", err);
  }
}

export default async function DocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await getDocumentByToken(token);

  if (!doc || doc.status === "draft") {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-white">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-slate-900">This link does not open a document</h1>
          <p className="mt-2 text-sm text-slate-600">
            Check that the whole link was copied, or ask us to send it again: accounting@saddlewoodcontracting.com
          </p>
        </div>
      </main>
    );
  }

  await recordView(doc);

  const s = doc.snapshot;
  const lines = s.lines ?? [];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 print:bg-white print:py-0">
      <article className="mx-auto max-w-3xl bg-white border border-slate-200 rounded-xl p-6 sm:p-10 print:border-0 print:p-0">
        {doc.status === "void" && (
          <p className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            This {KIND_LABEL[doc.kind].toLowerCase()} was voided and is no longer in effect.
          </p>
        )}

        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <p className="text-lg font-semibold text-slate-900">Saddlewood Contracting LLC</p>
            <p className="text-sm text-slate-600">accounting@saddlewoodcontracting.com</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-slate-900">{KIND_LABEL[doc.kind]}</p>
            <p className="text-sm text-slate-700">
              No. {doc.number}
              {doc.revision > 1 ? ` (revision ${doc.revision})` : ""}
            </p>
            <p className="text-sm text-slate-600">{day(s.date ?? doc.issuedAt)}</p>
          </div>
        </header>

        <section className="grid gap-6 py-6 sm:grid-cols-2">
          {s.billTo && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">To</p>
              <p className="text-sm font-medium text-slate-900">{s.billTo.name}</p>
              {s.billTo.attention && <p className="text-sm text-slate-700">Attn: {s.billTo.attention}</p>}
              {s.billTo.address && <p className="text-sm text-slate-700 whitespace-pre-line">{s.billTo.address}</p>}
            </div>
          )}
          {s.job && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Job</p>
              <p className="text-sm font-medium text-slate-900">{s.job.name}</p>
              {s.job.address && <p className="text-sm text-slate-700 whitespace-pre-line">{s.job.address}</p>}
            </div>
          )}
        </section>

        {doc.title && <h1 className="pb-4 text-base font-semibold text-slate-900">{doc.title}</h1>}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4 font-semibold">Description</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-b border-slate-100 align-top">
                <td className="py-3 pr-4 text-slate-900">
                  <span className="whitespace-pre-line">{line.description}</span>
                  {line.quantity !== undefined && (
                    <span className="block text-xs text-slate-500">
                      {line.quantity} {line.unit ?? ""}
                    </span>
                  )}
                  {line.note && <span className="block text-xs text-slate-500">{line.note}</span>}
                </td>
                <td className="py-3 text-right tabular-nums text-slate-900">{money(line.amountCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-4 pr-4 text-right font-semibold text-slate-900">Total</td>
              <td className="pt-4 text-right text-lg font-semibold tabular-nums text-slate-900">{money(doc.totalCents)}</td>
            </tr>
            {doc.dueDate && (
              <tr>
                <td className="pt-1 pr-4 text-right text-slate-600">Due</td>
                <td className="pt-1 text-right text-slate-900">{day(doc.dueDate)}</td>
              </tr>
            )}
          </tfoot>
        </table>

        {s.terms && (
          <section className="mt-8 border-t border-slate-200 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Terms</p>
            <p className="mt-1 text-sm text-slate-700 whitespace-pre-line">{s.terms}</p>
          </section>
        )}
        {s.note && <p className="mt-4 text-sm text-slate-700 whitespace-pre-line">{s.note}</p>}
      </article>
    </main>
  );
}
