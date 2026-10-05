// The shapes behind our own estimates, change orders and invoices
// (supabase/migrations/0012_billing_foundation.sql).

export type ClientKind = "gc" | "homeowner" | "other";
export type ContactRole = "ap" | "pm" | "principal" | "other";

// How one client wants to be billed. Every field is optional: what is missing
// falls back to the company default, and a job may override any of it.
export type BillingProfile = {
  /** How the invoice reaches them. "portal" means we upload it to their system by hand. */
  delivery?: "email" | "portal";
  /** Their portal's name, when delivery is "portal" (e.g. "Built"). */
  portalName?: string;
  /** Day of the month their billing closes. */
  cutoffDay?: number;
  /** Days from the invoice date to the due date. */
  netDays?: number;
  /** Paid only after their own client pays them, and how many days after. */
  payWhenPaidDays?: number;
  /** Percent held back until the end. */
  retainagePct?: number;
  /** What must go out with every invoice, or they reject it. */
  attachments?: BillingAttachment[];
  /** How they pay. */
  payMethods?: ("check" | "wire" | "melio" | "zelle" | "ach")[];
  /** What they want in front of our number, e.g. their job code. */
  referencePrefix?: string;
  note?: string;
};

export type BillingAttachment =
  | "conditional_waiver"
  | "final_waiver"
  | "tracker_workbook"
  | "schedule_of_values"
  | "insurance_certificate"
  | "w9";

export type DocumentKind = "estimate" | "change_order" | "invoice" | "statement" | "notice";
export type DocumentStatus = "draft" | "issued" | "void";

export type DocumentLine = {
  description: string;
  /** Whole cents. */
  amountCents: number;
  quantity?: number;
  unit?: string;
  note?: string;
};

// What the client sees. Frozen when the document is issued.
export type DocumentSnapshot = {
  /** Who it is addressed to, as printed. */
  billTo?: { name: string; attention?: string; address?: string };
  job?: { name: string; address?: string };
  date?: string;
  lines?: DocumentLine[];
  /** Printed under the lines: terms, how to pay, reference to the contract or estimate. */
  terms?: string;
  note?: string;
};

export type BillingDocument = {
  id: string;
  kind: DocumentKind;
  jobId: string | null;
  clientId: string | null;
  number: string;
  title: string;
  status: DocumentStatus;
  revision: number;
  supersedes: string | null;
  snapshot: DocumentSnapshot;
  totalCents: number;
  dueDate: string | null;
  token: string | null;
  issuedAt: string | null;
  issuedBy: string;
  voidReason: string;
  createdAt: string;
};

export type DocumentEventKind =
  | "sent"
  | "delivered"
  | "bounced"
  | "complained"
  | "viewed"
  | "downloaded"
  | "portal_submitted"
  | "note";

export type DocumentEvent = {
  id: number;
  documentId: string;
  kind: DocumentEventKind;
  at: string;
  actor: string;
  automatic: boolean;
  emailId: string | null;
  detail: Record<string, unknown>;
};
