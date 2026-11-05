// What a client's link may show. Pure: the page, the job's card and the tests
// share it. Nothing here reads a cost, a margin, a person's pay or a draft.

export const PORTAL_SECTIONS = ["timeline", "payments", "documents", "log", "complaint"] as const;
export type PortalSection = (typeof PORTAL_SECTIONS)[number];

export const SECTION_INFO: Record<PortalSection, { label: string; hint: string }> = {
  timeline: { label: "Timeline", hint: "The job's phases with their planned and done dates, and the finish date we promised." },
  payments: { label: "Payments", hint: "Contract, billed, paid and open from this app. Anything billed only in Joist isn't counted." },
  documents: { label: "Documents", hint: "Proposals, agreements, change orders and invoices we issued on this job." },
  log: { label: "Daily log", hint: "The last 14 end-of-day logs: the day, the weather and the crew's work done, in their words." },
  complaint: { label: "Complaint form", hint: "Goes to the job's PM on the Policies clock, like one logged on the job." },
};

/** How many complaints one link takes in a day, so a pasted link can't flood a PM. */
export const COMPLAINTS_PER_DAY = 5;

export const LOG_DAYS = 14;

const CLIENT_KINDS = ["estimate", "agreement", "change_order", "invoice"] as const;
export type ClientDocKind = (typeof CLIENT_KINDS)[number];

export const KIND_LABEL: Record<ClientDocKind, string> = {
  estimate: "Proposal",
  agreement: "Agreement",
  change_order: "Change order",
  invoice: "Invoice",
};

export type PortalDocRow = {
  id: string;
  kind: string;
  number: string;
  title: string;
  status: string;
  total_cents: number | string;
  token: string | null;
  issued_at: string | null;
  supersedes: string | null;
};

export type PortalDoc = { id: string; kind: ClientDocKind; number: string; title: string; totalCents: number; token: string; issuedAt: string };

const isClientKind = (k: string): k is ClientDocKind => (CLIENT_KINDS as readonly string[]).includes(k);

/** Issued and current, newest first: never a draft, a void, or a revision a newer issued one replaced. */
export function clientDocuments(rows: readonly PortalDocRow[]): PortalDoc[] {
  const issued = rows.filter((r) => r.status === "issued");
  const replaced = new Set(issued.map((r) => r.supersedes).filter(Boolean));
  return issued
    .flatMap((r) =>
      isClientKind(r.kind) && r.token && r.issued_at && !replaced.has(r.id)
        ? [{ id: r.id, kind: r.kind, number: r.number, title: r.title, totalCents: Number(r.total_cents), token: r.token, issuedAt: r.issued_at }]
        : [],
    )
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

export type Approval = "needed" | "approved" | null;
export type ClientDoc = PortalDoc & { approval: Approval };

const CO_GONE = ["rejected", "void"];
const CO_OPEN = ["sent", "priced"];
const CO_APPROVED = ["signed", "billed"];

/**
 * Where each change order stands, by the register's status. One rejected or
 * voided there keeps its issued document, so it leaves the list here; one with
 * no register row (an old import) stays, with no badge.
 */
export function withApprovals(docs: readonly PortalDoc[], coStatus: ReadonlyMap<string, string>): ClientDoc[] {
  return docs.flatMap((d) => {
    const status = d.kind === "change_order" ? coStatus.get(d.id) : undefined;
    if (status && CO_GONE.includes(status)) return [];
    return [{ ...d, approval: status && CO_OPEN.includes(status) ? ("needed" as const) : status && CO_APPROVED.includes(status) ? ("approved" as const) : null }];
  });
}

export type ClientMoney = { contractCents: number | null; billedCents: number; paidCents: number; openCents: number };

/**
 * The job's totals, or null with nothing billed or paid here yet. Money still
 * in Joist isn't in the app, so a job with none here shows no section at all,
 * never "Paid $0" to a client who has paid. The same with money received that
 * sits on no job yet and could be this one's (`unplacedCents`): Paid would be
 * short and Open too high, so nothing shows until it's placed.
 */
export function clientMoney(m: { contractCents: number | null; billedCents: number; paidCents: number; owedCents: number }, unplacedCents = 0): ClientMoney | null {
  if (unplacedCents > 0 || (!m.billedCents && !m.paidCents)) return null;
  return { contractCents: m.contractCents, billedCents: m.billedCents, paidCents: m.paidCents, openCents: m.owedCents };
}

export type PhaseRow = { name: string; planned_from: string | null; planned_to: string | null; verified_at: string | null };
export type ClientTimeline = { promised: string | null; phases: { name: string; from: string | null; to: string | null; done: boolean }[] };

/** Null unless something says when: phases with no dates don't answer the question a client is asking. */
export function clientTimeline(rows: readonly PhaseRow[], promised: string | null): ClientTimeline | null {
  if (!promised && !rows.some((r) => r.planned_from || r.planned_to || r.verified_at)) return null;
  return { promised, phases: rows.map((r) => ({ name: r.name, from: r.planned_from, to: r.planned_to, done: !!r.verified_at })) };
}

/** Names only: a person with no name on file comes through as their email, and that stays ours. */
export function clientPeople(names: readonly string[]): string[] {
  return names.filter((n) => !n.includes("@"));
}

/** The crew's work done, without the ASK: lines they write to the office. */
export function clientLogText(body: string): string {
  return body
    .split("\n")
    .filter((l) => !/^\s*ask\s*:/i.test(l))
    .join("\n")
    .trim();
}

/** Only sections this build knows, each once, in a fixed order. */
export function cleanSections(input: readonly string[]): PortalSection[] {
  return PORTAL_SECTIONS.filter((s) => input.includes(s));
}
