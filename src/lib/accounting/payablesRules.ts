// The rules for paying a bill and clearing its holds (SOP-004). Pure, so the
// route and its tests share them. A sub is paid only with its lien waiver in
// hand, an active COI and the PM's sign-off; paying never records a waiver,
// and clearing one hold never clears another.

export const BILL_STATUSES = ["draft", "needs_approval", "hold_waiver", "hold_coi", "open", "scheduled", "partial", "paid", "disputed", "void"] as const;
export type BillStatusValue = (typeof BILL_STATUSES)[number];

/** Statuses an owner may set by hand (putting a bill on hold included); paid and partial come from payments. */
export const SETTABLE_STATUSES: BillStatusValue[] = ["draft", "needs_approval", "hold_waiver", "hold_coi", "open", "scheduled", "disputed", "void"];

export type Hold = "waiver" | "coi" | "approval";

export type BillFacts = { kind: string; status: string; waiverStatus: string; coiExpired: boolean; coiMissing?: boolean };

/** Why this bill can't be paid now, or null when it can. */
export function paymentBlock(b: BillFacts): string | null {
  if (b.status === "void") return "This bill is void.";
  if (b.status === "paid") return "This bill is already paid.";
  if (b.status === "draft") return "This bill is still a draft.";
  if (b.status === "disputed") return "This bill is disputed.";
  if (b.status === "needs_approval") return "The PM hasn't approved this bill yet.";
  if (b.status === "hold_waiver" || b.waiverStatus === "missing") return "The lien waiver hasn't been received (SOP-004).";
  if (b.status === "hold_coi" || b.coiExpired || b.coiMissing) {
    return b.coiMissing ? "The sub's COI is missing; add it before paying." : "The sub's COI is expired; renew it before paying.";
  }
  return null;
}

/**
 * What goes in bill_payments.waiver_collected: for a sub bill, only the payer's
 * statement that the waiver for this payment is in hand. Null when a sub bill
 * is paid without it (0031's guard would refuse it).
 */
export function waiverCollectedFor(kind: string, attested: unknown): boolean | null {
  if (kind !== "sub") return false;
  return attested === true ? true : null;
}

/** The holds standing on a bill. */
export function holdsOf(b: BillFacts): Hold[] {
  const out: Hold[] = [];
  if (b.status === "needs_approval") out.push("approval");
  if (b.status === "hold_waiver" || b.waiverStatus === "missing") out.push("waiver");
  if (b.status === "hold_coi" || b.coiExpired || b.coiMissing) out.push("coi");
  return out;
}

const STATUS_OF: Record<Hold, BillStatusValue> = { approval: "needs_approval", waiver: "hold_waiver", coi: "hold_coi" };

/**
 * Clear one hold. A COI hold clears only once the sub's COI is current; the
 * bill is scheduled for the pay run only when no other hold stands, else it
 * moves to the hold that is left.
 */
export function clearHold(b: BillFacts, hold: Hold): { patch: { status: BillStatusValue; waiver_status?: string } } | { error: string } {
  const standing = holdsOf(b);
  if (!standing.includes(hold)) return { error: "That hold isn't on this bill." };
  if (hold === "coi" && (b.coiExpired || b.coiMissing)) {
    return { error: b.coiMissing ? "The sub's COI is still missing. Add it on the sub first." : "The sub's COI is still expired. Renew it on the sub first." };
  }
  const after: BillFacts = {
    ...b,
    waiverStatus: hold === "waiver" ? "conditional_received" : b.waiverStatus,
    status: hold === "approval" || STATUS_OF[hold] === b.status ? "open" : b.status,
  };
  const left = holdsOf(after);
  // Nothing left: a held or open bill goes on the pay run; a partly paid one stays partly paid.
  const status: BillStatusValue = left.length ? STATUS_OF[left[0]] : b.status === "partial" || b.status === "scheduled" ? b.status : "scheduled";
  return { patch: { status, ...(hold === "waiver" ? { waiver_status: "conditional_received" } : {}) } };
}

/**
 * What a bill owes, split: what is payable now (the bill less retainage less
 * what was paid) and the retainage still held. Retainage is paid only when an
 * owner releases it; until then the pay run, Open AP and the pay form count
 * payable-now only. A paid or void bill owes nothing.
 */
export function splitBalance(b: { amountCents: number; retainageCents: number; paidCents: number; status: string }): { payableNowCents: number; retainageHeldCents: number; balanceCents: number } {
  if (b.status === "paid" || b.status === "void") return { payableNowCents: 0, retainageHeldCents: 0, balanceCents: 0 };
  const retainage = Math.max(0, Math.min(b.retainageCents, b.amountCents));
  const balanceCents = Math.max(0, b.amountCents - b.paidCents);
  const payableNowCents = Math.max(0, b.amountCents - retainage - b.paidCents);
  return { payableNowCents, retainageHeldCents: balanceCents - payableNowCents, balanceCents };
}
