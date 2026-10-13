import { Resend } from "resend";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { describeDevice } from "./proof";
import { BILLING_FROM, BILLING_REPLY_TO, RECORDS_COPY } from "./send";
import type { BillingDocument, DocumentEvent, DocumentKind } from "./types";

// Tells Marco when a client opens a document, the way Joist's "viewed"
// notification did: an email from accounting@ for each real opening.
//
// Only openings the proof record counts as a person (not a mail scanner, not
// our own staff) are sent, and openings of the same document close together
// are one email: a client who opens the page and then the PDF a minute later
// is one visit, not two alerts.

export const ALERT_TO = process.env.BILLING_VIEW_ALERT_TO || "marco@saddlewoodcontracting.com";
export const QUIET_MINUTES = 15;

const KIND_LABEL: Record<DocumentKind, string> = {
  estimate: "Estimate",
  change_order: "Change order",
  invoice: "Invoice",
  statement: "Statement",
  notice: "Notice",
};

const isPersonOpening = (e: DocumentEvent) =>
  (e.kind === "viewed" || e.kind === "downloaded") && !e.automatic && e.actor === "client link";

/** Alert for this opening, unless the client already opened this document in the last few minutes. */
export function shouldAlert(earlier: DocumentEvent[], now: Date): boolean {
  const since = now.getTime() - QUIET_MINUTES * 60_000;
  return !earlier.some((e) => isPersonOpening(e) && new Date(e.at).getTime() >= since);
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function phoenixTime(at: Date): string {
  return at.toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function alertMessage(input: {
  doc: Pick<BillingDocument, "id" | "kind" | "number" | "totalCents" | "revision">;
  clientName: string;
  kind: "viewed" | "downloaded";
  what?: string;
  at: Date;
  userAgent: string | null;
  siteUrl: string;
}): { subject: string; text: string } {
  const { doc, clientName } = input;
  const label = `${KIND_LABEL[doc.kind]} ${doc.number}`;
  const subject =
    input.kind === "downloaded"
      ? `${clientName} downloaded ${input.what ?? "a file"} (${label})`
      : `${clientName} opened ${label}`;
  const text = [
    input.kind === "downloaded"
      ? `${clientName} downloaded ${input.what ?? "a file"} from ${label} (${money(doc.totalCents)}).`
      : `${clientName} opened ${label} (${money(doc.totalCents)}).`,
    "",
    `When: ${phoenixTime(input.at)} (Phoenix time)`,
    `Device: ${describeDevice(input.userAgent)}`,
    "",
    `Proof record: ${input.siteUrl.replace(/\/+$/, "")}/app/money/${doc.id}`,
  ].join("\n");
  return { subject, text };
}

async function clientNameOf(doc: BillingDocument): Promise<string> {
  if (!doc.clientId) return "A client";
  const { data } = await getSupabaseAdmin().from("clients").select("name").eq("id", doc.clientId).maybeSingle();
  return (data as { name?: string } | null)?.name || "A client";
}

/** Never throws: a lost alert must not cost the client their document. */
export async function sendViewAlert(input: {
  doc: BillingDocument;
  kind: "viewed" | "downloaded";
  what?: string;
  at: Date;
  userAgent: string | null;
  earlier: DocumentEvent[];
}): Promise<void> {
  try {
    if (!shouldAlert(input.earlier, input.at)) return;
    const key = process.env.RESEND_API_KEY;
    if (!key) return;
    const { subject, text } = alertMessage({
      doc: input.doc,
      clientName: await clientNameOf(input.doc),
      kind: input.kind,
      what: input.what,
      at: input.at,
      userAgent: input.userAgent,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://saddlewoodcontracting.com",
    });
    const { error } = await new Resend(key).emails.send({
      from: BILLING_FROM,
      replyTo: BILLING_REPLY_TO,
      to: [ALERT_TO],
      ...(ALERT_TO === RECORDS_COPY ? {} : { bcc: [RECORDS_COPY] }),
      subject,
      text,
    });
    if (error) console.error("view alert not sent:", error);
  } catch (err) {
    console.error("view alert not sent:", err);
  }
}
