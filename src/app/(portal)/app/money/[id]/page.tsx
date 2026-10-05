import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, Chip, Empty, ScreenTitle, SectionTitle } from "@/components/bot/ui";
import { day, money, when } from "@/components/money/format";
import RecordPayment from "@/components/money/RecordPayment";
import { getDocument, listEvents } from "@/lib/billing/documents";
import { listExhibits } from "@/lib/billing/exhibits";
import { paidByDocument, paymentsForDocument } from "@/lib/billing/payments";
import { describeDevice, summarizeProof } from "@/lib/billing/proof";
import type { DocumentEvent } from "@/lib/billing/types";
import { getViewer } from "@/lib/crew/auth";

export const dynamic = "force-dynamic";

// One document: its lines and what is paid on each, the proof record in
// order, what is on its client page, and the payments. Ilene records a
// payment here; the staff link opens the client's page without counting.

const EVENT_LABEL: Record<DocumentEvent["kind"], string> = {
  sent: "Sent",
  delivered: "Delivered",
  bounced: "Bounced",
  complained: "Marked as spam",
  viewed: "Viewed",
  downloaded: "Opened",
  portal_submitted: "Submitted in their portal",
  note: "Note",
};

function eventLine(e: DocumentEvent): string {
  const d = e.detail;
  switch (e.kind) {
    case "sent": {
      const to = Array.isArray(d.to) ? (d.to as string[]).join(", ") : String(d.to ?? "");
      const files = Array.isArray(d.attachments) ? ` · ${(d.attachments as string[]).join(", ")}` : "";
      return `to ${to}${files}`;
    }
    case "viewed":
    case "downloaded": {
      const what = typeof d.exhibit === "string" ? `${d.exhibit} · ` : "";
      return `${what}${describeDevice(typeof d.ua === "string" ? d.ua : null)}${e.automatic ? " · looks automatic" : ""}`;
    }
    case "note":
      return typeof d.text === "string" ? d.text : "";
    default:
      return e.actor;
  }
}

export default async function MoneyDocument({ params }: { params: Promise<{ id: string }> }) {
  if ((await getViewer()).kind !== "staff") redirect("/app");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const doc = await getDocument(id);
  if (!doc) notFound();

  const [events, exhibits, payments, paid] = await Promise.all([listEvents(doc.id), listExhibits(doc.id), paymentsForDocument(doc.id), paidByDocument([doc.id])]);
  const p = paid.get(doc.id);
  const paidCents = p?.total ?? 0;
  const lines = (doc.snapshot.lines ?? []).map((l, index) => ({ index, description: l.description, amountCents: l.amountCents, paidCents: p?.byLine.get(index) ?? 0 }));
  const proof = summarizeProof(events);
  const clientLink = doc.token ? `/d/${doc.token}?copy=1` : null;

  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-5">
      <Link href="/app/money" className="text-sm text-[var(--color-teal)]">
        ← Money
      </Link>
      <ScreenTitle eyebrow={doc.kind.replace("_", " ")} title={doc.number}>
        <p className="text-sm text-[var(--color-charcoal-light)]">{doc.title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Chip tone={doc.status === "void" ? "bad" : doc.totalCents - paidCents <= 0 ? "ok" : "quiet"}>
            {doc.status === "void" ? "Void" : doc.totalCents - paidCents <= 0 ? "Paid in full" : `${money(doc.totalCents - paidCents)} open`}
          </Chip>
          {proof.views.length > 0 ? <Chip tone="ok">Viewed {proof.views.length}×</Chip> : proof.firstSentAt ? <Chip tone="warn">Not viewed</Chip> : <Chip tone="warn">Not sent</Chip>}
          {clientLink ? (
            <a href={clientLink} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[var(--color-teal)] underline underline-offset-2">
              Open the client page
            </a>
          ) : null}
        </div>
      </ScreenTitle>

      <SectionTitle>Lines</SectionTitle>
      <Card>
        <ul className="divide-y divide-[var(--color-stone)]">
          {lines.map((l) => (
            <li key={l.index} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm text-[var(--color-charcoal)]">{l.description}</p>
                {exhibits.filter((x) => x.lineIndex === l.index).length > 0 ? (
                  <p className="text-xs text-[var(--color-charcoal-light)]">On the client page: {exhibits.filter((x) => x.lineIndex === l.index).map((x) => x.label.replace(/^View /, "")).join(", ")}</p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-sm tabular-nums text-[var(--color-charcoal)]">{money(l.amountCents)}</p>
                {l.paidCents > 0 ? (
                  <p className="text-xs text-[var(--color-charcoal-light)]">{l.paidCents >= l.amountCents ? "paid" : `${money(l.paidCents)} paid`}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-[var(--color-stone)] pt-2 text-sm font-medium text-[var(--color-charcoal)]">
          <span>Total</span>
          <span className="tabular-nums">{money(doc.totalCents)}</span>
        </div>
      </Card>

      {doc.status === "issued" ? (
        <div className="mt-4">
          <RecordPayment documentId={doc.id} lines={lines} hasLines={lines.length > 1} />
        </div>
      ) : null}

      <SectionTitle count={payments.length}>Payments</SectionTitle>
      {payments.length === 0 ? (
        <Empty>Nothing recorded yet.</Empty>
      ) : (
        <div className="space-y-2">
          {payments.map((pm) => (
            <Card key={pm.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--color-charcoal)]">
                    {money(pm.amountCents)} by {pm.method}
                    {pm.feeCents > 0 ? ` (fee ${money(pm.feeCents)})` : ""}
                  </p>
                  <p className="text-xs text-[var(--color-charcoal-light)]">
                    {day(pm.receivedOn)}
                    {pm.reference ? ` · ${pm.reference}` : ""} · recorded by {pm.recordedBy.replace(/@.*/, "")}
                  </p>
                  {pm.voidedAt ? <p className="text-xs text-[#9a2a1f]">Voided: {pm.voidReason}</p> : null}
                </div>
                {pm.voidedAt ? <Chip tone="bad">Void</Chip> : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle count={events.length}>Proof record</SectionTitle>
      {events.length === 0 ? (
        <Empty>Not sent yet.</Empty>
      ) : (
        <Card>
          <ol className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="w-[5.5rem] shrink-0 text-xs text-[var(--color-charcoal-light)]">{when(e.at)}</span>
                <span className="min-w-0 text-[var(--color-charcoal)]">
                  <span className="font-medium">{EVENT_LABEL[e.kind]}</span>
                  {eventLine(e) ? <span className="text-[var(--color-charcoal-light)]"> · {eventLine(e)}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </main>
  );
}
