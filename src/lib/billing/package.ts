import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listExhibits } from "./exhibits";
import type { BillingAttachment, BillingDocument, BillingProfile } from "./types";

// What must go out with a client's invoices (SOP-006 Gate 3), read against what
// is on the documents' pages. A bill isn't sent without it, or they reject it.

export const ATTACHMENT_LABEL: Record<BillingAttachment, string> = {
  conditional_waiver: "Conditional waiver",
  final_waiver: "Final waiver",
  tracker_workbook: "Tracker workbook",
  schedule_of_values: "Schedule of values",
  insurance_certificate: "COI",
  w9: "W-9",
};

/** An exhibit has only a label, so that's what says what it is: "Conditional waiver 8009-13", "Progress Payment Tracker (Excel)". */
const LOOKS_LIKE: Record<BillingAttachment, RegExp> = {
  conditional_waiver: /waiver/i,
  final_waiver: /waiver/i,
  tracker_workbook: /tracker|workbook/i,
  schedule_of_values: /schedule of values|\bsov\b/i,
  insurance_certificate: /insurance|\bcoi\b/i,
  w9: /\bw-?9\b/i,
};

const isWaiver = (a: BillingAttachment) => a === "conditional_waiver" || a === "final_waiver";
const isBill = (kind: string) => kind === "invoice" || kind === "statement";

export type PackageDoc = { id: string; number: string; kind: string; exhibits: { label: string }[] };
export type PackageItem = { attachment: BillingAttachment; label: string; missing: { id: string; number: string }[] };

/**
 * Each item and the documents still without it. A waiver covers one invoice, so
 * each needs its own; anything else goes once per email. A change order alone
 * isn't a bill, so it needs nothing. A client wanting both waivers gets one,
 * the conditional: the final goes with the last bill (WaiverPanel).
 */
export function packageItems(wants: readonly BillingAttachment[], docs: readonly PackageDoc[]): PackageItem[] {
  const bills = docs.filter((d) => isBill(d.kind));
  if (!bills.length) return [];
  const asked = wants.filter((a) => !(a === "final_waiver" && wants.includes("conditional_waiver")));
  return asked.map((attachment) => {
    const lacking = bills.filter((d) => !d.exhibits.some((x) => LOOKS_LIKE[attachment].test(x.label)));
    const missing = isWaiver(attachment) ? lacking : lacking.length === bills.length ? bills.slice(0, 1) : [];
    return { attachment, label: ATTACHMENT_LABEL[attachment], missing: missing.map(({ id, number }) => ({ id, number })) };
  });
}

/** The refusal, or null when the package is whole. */
export function packageGap(items: readonly PackageItem[]): string | null {
  const gaps = items.flatMap((i) => i.missing.map((d) => `${i.label} for ${d.number}`));
  return gaps.length ? `Still needed before this goes: ${gaps.join(", ")}` : null;
}

async function clientProfile(clientId: string | null | undefined): Promise<{ name: string; billing: BillingProfile }> {
  if (!clientId) return { name: "", billing: {} };
  const { data, error } = await getSupabaseAdmin().from("clients").select("name, billing").eq("id", clientId).maybeSingle();
  if (error) throw new Error(`clients: ${error.message}`);
  const row = data as { name: string; billing: BillingProfile | null } | null;
  return { name: row?.name ?? "", billing: row?.billing ?? {} };
}

/** A message's documents, as the client's list and their pages have them. */
export async function loadPackage(docs: readonly BillingDocument[]): Promise<PackageItem[]> {
  const bills = docs.filter((d) => isBill(d.kind));
  if (!bills.length) return [];
  const { billing } = await clientProfile(bills[0].clientId);
  if (!billing.attachments?.length) return [];
  const exhibits = await Promise.all(bills.map((d) => listExhibits(d.id)));
  return packageItems(billing.attachments, bills.map((d, i) => ({ id: d.id, number: d.number, kind: d.kind, exhibits: exhibits[i] })));
}

/** A waiver that went with its invoice is on the register, so it isn't also a task to chase. */
export async function noteWaiversSent(docs: readonly BillingDocument[], actor: string): Promise<void> {
  const bills = docs.filter((d) => isBill(d.kind));
  if (!bills.length) return;
  const { name, billing } = await clientProfile(bills[0].clientId);
  const wants = (billing.attachments ?? []).filter(isWaiver);
  if (!wants.length) return;
  const db = getSupabaseAdmin();
  for (const d of bills) {
    if (!(await listExhibits(d.id)).some((x) => LOOKS_LIKE.conditional_waiver.test(x.label))) continue;
    const { data, error } = await db.from("lien_waivers").select("id, status").eq("direction", "out").eq("document_id", d.id).neq("status", "void");
    if (error) throw new Error(`lien_waivers: ${error.message}`);
    const held = (data ?? []) as { id: number; status: string }[];
    if (held.some((w) => w.status === "sent" || w.status === "received")) continue;
    const write = held.length
      ? db.from("lien_waivers").update({ status: "sent" }).eq("id", held[0].id)
      : db.from("lien_waivers").insert({
          direction: "out",
          kind: wants.includes("conditional_waiver") ? "conditional_progress" : "conditional_final",
          document_id: d.id,
          party: name.slice(0, 200),
          amount_cents: d.totalCents,
          status: "sent",
          created_by: actor,
        });
    const { error: failed } = await write;
    if (failed) throw new Error(`lien_waivers: ${failed.message}`);
  }
}
