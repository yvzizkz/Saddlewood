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
  /**
   * Paid only after their own client pays them, and how many days after. Set
   * (any number) = pay-when-paid: the past-due ladder does not start until an
   * owner gives the bill a due date. A job's null overrides its client's mark.
   */
  payWhenPaidDays?: number | null;
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

export type DocumentKind = "estimate" | "change_order" | "invoice" | "statement" | "notice" | "agreement";
export type DocumentStatus = "draft" | "issued" | "void";

export type DocumentLine = {
  description: string;
  /** Whole cents. */
  amountCents: number;
  quantity?: number;
  unit?: string;
  note?: string;
  /** The pieces that make up this line's amount, each shown with its own price; 0 shows as "No charge". */
  parts?: { description: string; amountCents: number; label?: string }[];
};

// What the client sees. Frozen when the document is issued.
export type DocumentSnapshot = {
  /** Who it is addressed to, as printed. */
  billTo?: { name: string; attention?: string; address?: string };
  job?: { name: string; address?: string };
  date?: string;
  lines?: DocumentLine[];
  /** Work named on the document but not in its total (priced later, by others, ...); shown apart so no one reads it as included. */
  notIncluded?: { description: string; note?: string }[];
  /** Printed under the lines: terms, how to pay, reference to the contract or estimate. */
  terms?: string;
  note?: string;
  /** An agreement's words and where its price and scope came from (kind agreement; src/lib/agreements/draft.ts). */
  agreement?: AgreementSnapshot;
};

/** Frozen with the agreement: the text as drafted, and the proposal it was drafted from. */
export type AgreementSnapshot = {
  v: 1;
  type: "prime_residential" | "prime_commercial" | "subcontractor";
  /** Markdown, contract.py's words filled for this job. Never edited by hand. */
  text: string;
  proposal: { documentId: string; number: string; revision: number; packageName: string; options: string[] };
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
  /**
   * The draft's own preview link, /d/p/<previewToken> (migration 0019). Never
   * shown to a client. Absent where a reader does not load it.
   */
  previewToken?: string | null;
  /** The send group it goes out with (0019), if any. */
  sendGroupId?: string | null;
  updatedAt?: string;
};

/** The working email of a send group (supabase/migrations/0020). Edited until the group is sent. */
export type SendGroupMessage = {
  subject?: string;
  body?: string;
  to?: string[];
  cc?: string[];
  intro?: string;
  updatedAt?: string;
  updatedBy?: string;
  /** Set when the group went out. */
  sentAt?: string;
  emailId?: string;
};

export type SendGroup = {
  id: string;
  name: string;
  clientId: string | null;
  note: string;
  createdBy: string;
  createdAt: string;
  message: SendGroupMessage;
};

export type DocumentEventKind =
  | "sent"
  | "delivered"
  | "bounced"
  | "complained"
  | "viewed"
  | "downloaded"
  | "portal_submitted"
  | "note"
  // A client's answer on a proposal link (0025).
  | "accepted"
  | "selected"
  // A signature on a proposal, the client's or ours (0025; src/lib/sales/signing.ts).
  | "signed";

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
