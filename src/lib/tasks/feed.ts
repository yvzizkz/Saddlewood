// One task feed over every place work waits (docs/COHESIVE-APP-PLAN.md §6.5).
// Server only.
//
// It reads each source where it lives and adds nothing to them:
//   work_items (0033)        tasks with no other home, handed to a role
//   Waiting on you           the owners' list (owner/waiting.ts): plans, time
//                            fixes, requests, unmatched purchases, money,
//                            contract watches, unchecked work
//   crew_tasks               work handed to a worker, open
//   ops_cards                the ops board, not yet live
//   bills (0031)             sub and vendor bills waiting on approval or a hold
//
// Every item has a role (role_seats, 0032). Whoever holds the role sees it as
// theirs; past its due date plus its grace it moves up one role (escalationOf).

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ownerNames } from "@/lib/bot/home";
import { readState } from "@/lib/bot/queries";
import { addDays, localDay } from "@/lib/crew/time";
import { loadWaiting } from "@/lib/owner/load";
import type { Lane } from "@/lib/owner/lanes";
import type { WaitingItem } from "@/lib/owner/waiting";
import { loadPayables } from "@/lib/accounting/payables";
import { loadBillingCalendar } from "@/lib/accounting/receivables";
import { loadChangeOrders, loadWaivers } from "@/lib/billing/registers";
import { loadMissingDailyLogs } from "@/lib/field/ops";
import { jobHref, jobKeyOf, type JobRef } from "@/lib/jobs/hub";
import { escalationOf, ROLE_INFO, seatHolder, type Person, type Role, type Seat } from "@/lib/roles/seats";

export type TaskKind = "task" | "punch" | "follow_up" | "approval" | "co_price" | "decision" | "compliance" | "billing" | "daily_log" | "friction";

export const KIND_LABEL: Record<TaskKind, string> = {
  task: "Task",
  punch: "Punch",
  follow_up: "Follow-up",
  approval: "Approval",
  co_price: "Change order to price",
  decision: "Decision",
  compliance: "Compliance",
  billing: "Billing",
  daily_log: "Daily log",
  friction: "Friction",
};

export type FeedItem = {
  id: string;
  source: "work" | "waiting" | "crew" | "ops" | "bill" | "billing";
  kind: TaskKind;
  title: string;
  detail: string;
  role: Role;
  /** Who it sits with now: the role it moved up to when overdue. */
  nowRole: Role;
  assignee: string;
  jobKey: string | null;
  job: string;
  dueOn: string | null;
  since: string | null;
  overdueDays: number;
  escalated: boolean;
  href: string;
  /** A work item: done, dropped and reassigned in place. Others are acted on where they live. */
  editable: boolean;
};

const LANE_ROLE: Record<Lane, Role> = { sales: "sales", decisions: "decisions", money: "finance", systems: "ops" };

function daysLate(due: string | null, today: string): number {
  if (!due) return 0;
  return Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${due}T12:00:00Z`)) / 86_400_000));
}

/** Escalation: due date plus grace passed → one role up. Pure, for tests. */
export function placeItem(role: Role, dueOn: string | null, graceDays: number, today: string): { nowRole: Role; overdueDays: number; escalated: boolean } {
  const late = daysLate(dueOn, today);
  const escalated = Boolean(dueOn) && dueOn! < today && late > graceDays;
  return { nowRole: escalated ? escalationOf(role) : role, overdueDays: late, escalated };
}

/** Is this item mine? Assigned to me, or to my role with nobody named, or escalated to a role I hold. */
export function isMine(item: Pick<FeedItem, "assignee" | "role" | "nowRole" | "escalated">, me: string, seats: Seat[], people: Person[]): boolean {
  const mine = (r: Role) => seatHolder(r, seats, people).emails.includes(me);
  if (item.escalated) return mine(item.nowRole) || item.assignee === me;
  if (item.assignee) return item.assignee === me;
  return mine(item.role);
}

function roleOfOwnerName(name: string, seats: Seat[]): Role {
  const hit = seats.find((s) => s.holder.toLowerCase() === name.toLowerCase());
  return hit?.role ?? "ops";
}

/** `waiting`: the owners' list when the caller already read it (the 7 AM push reads it once). */
export async function loadFeed(refs: JobRef[], seats: Seat[], today = localDay(), pre: { waiting?: WaitingItem[] } = {}): Promise<FeedItem[]> {
  const db = getSupabaseAdmin();
  const [work, waiting, crewTasks, cards, payables, cos, calendar, waivers] = await Promise.all([
    db.from("work_items").select("*").eq("status", "open").order("due_on", { ascending: true, nullsFirst: false }).limit(1000),
    // By the owners' names, so a hand-off goes back to whoever gave it.
    pre.waiting ?? readState().then(({ sections }) => loadWaiting(ownerNames(sections.people))).catch(() => []),
    db.from("crew_tasks").select("id,email,title,detail,job_id,job_name,due,status").in("status", ["open", "doing", "blocked"]).limit(500),
    db.from("ops_cards").select("id,title,owner,col,note,updated_at").is("archived_at", null).in("col", ["backlog", "drafting", "review"]).limit(300),
    loadPayables(today).catch(() => ({ rows: [] as Awaited<ReturnType<typeof loadPayables>>["rows"] })),
    loadChangeOrders(refs, today).catch(() => []),
    loadBillingCalendar(today).catch(() => []),
    loadWaivers(refs).catch(() => []),
  ]);
  const nameOfJob = (key: string | null) => (key ? (refs.find((r) => r.key === key)?.name ?? key) : "");
  const out: FeedItem[] = [];

  type W = { id: number; kind: TaskKind; title: string; detail: string; role: Role; assignee: string; job_id: string | null; crew_job_id: string | null; due_on: string | null; escalate_days: number; href: string; created_at: string };
  for (const w of (work.data ?? []) as W[]) {
    const jobKey = w.job_id || w.crew_job_id ? jobKeyOf({ billingId: w.job_id, crewId: w.crew_job_id }, refs) : null;
    out.push({
      id: `w${w.id}`,
      source: "work",
      kind: w.kind,
      title: w.title,
      detail: w.detail,
      role: w.role,
      assignee: w.assignee,
      jobKey,
      job: nameOfJob(jobKey),
      dueOn: w.due_on,
      since: localDay(w.created_at),
      ...placeItem(w.role, w.due_on, w.escalate_days, today),
      href: w.href || (jobKey ? jobHref(jobKey, "tasks") : "/app/tasks"),
      editable: true,
    });
  }

  for (const it of waiting) {
    const role = LANE_ROLE[it.lane];
    out.push({
      id: `q${it.key}`,
      source: "waiting",
      kind: it.kind === "decision" ? "decision" : it.kind === "handoff" ? "task" : "follow_up",
      title: it.title,
      detail: it.detail,
      role,
      nowRole: role,
      assignee: "",
      jobKey: null,
      job: "",
      dueOn: null,
      since: it.at ? localDay(it.at) : null,
      overdueDays: 0,
      escalated: false,
      href: it.href,
      editable: false,
    });
  }

  type T = { id: number; email: string; title: string; detail: string; job_id: string; job_name: string; due: string | null; status: string };
  for (const t of (crewTasks.data ?? []) as T[]) {
    const jobKey = t.job_id ? jobKeyOf({ crewId: t.job_id }, refs) : null;
    out.push({
      id: `c${t.id}`,
      source: "crew",
      kind: "task",
      title: t.title,
      detail: [t.status === "blocked" ? "Blocked" : "", t.detail].filter(Boolean).join(" · "),
      role: "field_lead",
      assignee: t.email,
      jobKey,
      job: t.job_name || nameOfJob(jobKey),
      dueOn: t.due,
      since: null,
      ...placeItem("field_lead", t.due, 1, today),
      href: "/app/crew?view=plan",
      editable: false,
    });
  }

  type O = { id: string; title: string; owner: string; col: string; note: string; updated_at: string };
  for (const c of (cards.data ?? []) as O[]) {
    const role = roleOfOwnerName(c.owner, seats);
    out.push({ id: `o${c.id}`, source: "ops", kind: "friction", title: c.title, detail: `Ops board · ${c.col}`, role, nowRole: role, assignee: "", jobKey: null, job: "", dueOn: null, since: localDay(c.updated_at), overdueDays: 0, escalated: false, href: "/internal/ops", editable: false });
  }

  for (const b of payables.rows) {
    const jobKey = jobKeyOf({ billingId: b.billingJobId, crewId: b.rawCrewJobId }, refs);
    const base = { source: "bill" as const, assignee: "", jobKey, job: b.job, since: b.issuedOn, href: `/app/accounting/payables/bill/${b.id}`, editable: false };
    if (b.status === "needs_approval") {
      // SOP-004: a sub invoice unapproved after 10 days is flagged.
      const due = addDays(b.issuedOn, 10);
      out.push({ ...base, id: `b${b.id}`, kind: "approval", title: `Approve ${b.vendorName} ${b.billNumber}`, detail: `${(b.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} · ${b.tradeLabel}`, role: "pm", dueOn: due, ...placeItem("pm", due, 0, today) });
    } else if (b.isOnHold && b.payableNowCents > 0) {
      out.push({ ...base, id: `b${b.id}`, kind: "compliance", title: `Clear the hold on ${b.vendorName} ${b.billNumber}`, detail: b.holdReason ?? "On hold", role: "finance", dueOn: b.dueOn, ...placeItem("finance", b.dueOn, 0, today) });
    }
  }

  // Change orders (0040, SOP-002): awaiting a price ages from the request; a
  // priced one not sent, and a signed one not billed, are follow-ups.
  for (const c of cos) {
    if (c.registerId === null) continue;
    const base = { source: "billing" as const, assignee: "", jobKey: c.jobKey, job: c.job, since: c.requestedOn, href: c.jobKey ? jobHref(c.jobKey, "changes") : "/app/accounting/billing#changes", editable: false, detail: c.amountCents !== null ? (c.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }) : "" };
    if (c.status === "requested") {
      const due = c.requestedOn ? addDays(c.requestedOn, 2) : null;
      out.push({ ...base, id: `co${c.registerId}`, kind: "co_price", title: `Price: ${c.title}`, role: "decisions", dueOn: due, ...placeItem("decisions", due, 1, today) });
    } else if (c.status === "priced" || c.status === "sent") {
      const due = c.requestedOn ? addDays(c.requestedOn, 7) : null;
      out.push({ ...base, id: `co${c.registerId}`, kind: "follow_up", title: `${c.status === "priced" ? "Send" : "Get signed"}: ${c.number} ${c.title}`, role: "decisions", dueOn: due, ...placeItem("decisions", due, 2, today) });
    } else if (c.status === "signed") {
      out.push({ ...base, id: `co${c.registerId}`, kind: "billing", title: `Bill ${c.number} ${c.title}`, role: "finance", dueOn: null, nowRole: "finance", overdueDays: 0, escalated: false });
    }
  }

  // The invoice package at each client's cutoff (SOP-006 Gate 3, SOP-007 §4):
  // the PM's percent complete 3 business days before, then finance builds it.
  for (const c of calendar) {
    if (c.prepOn > addDays(today, 7)) continue;
    const base = { source: "billing" as const, assignee: "", jobKey: null, job: "", since: null, href: "/app/accounting/billing", editable: false };
    // Done once every open job billed by percent complete has the PM's report for this cycle (sent from the job's Money tab).
    const allIn = c.sovJobs > 0 && c.reported >= c.sovJobs;
    if (!allIn) {
      const progress = c.sovJobs ? `${c.reported} of ${c.sovJobs} reported` : `${c.openJobs} open job${c.openJobs === 1 ? "" : "s"}`;
      out.push({ ...base, id: `pc${c.clientId}:${c.day}`, kind: "billing", title: `% complete and photos for ${c.client}`, detail: `${progress} · bills ${c.day}`, role: "pm", dueOn: c.prepOn, ...placeItem("pm", c.prepOn, 0, today) });
    }
    out.push({ ...base, id: `pk${c.clientId}:${c.day}`, kind: "billing", title: `Invoice package for ${c.client}`, detail: [c.delivery, ...c.attachments].join(" · "), role: "finance", dueOn: c.day, ...placeItem("finance", c.day, 0, today) });
  }

  // Waivers owed: ours with an invoice, a sub's before we pay (S9).
  const ids = new Set(out.map((i) => i.id));
  for (const w of waivers) {
    if (w.status !== "missing") continue;
    // A sub bill already on hold for its waiver is one item, not two.
    if (w.direction === "in" && ids.has(`b${w.id.slice(1)}`)) continue;
    out.push({
      id: `wv${w.id}`,
      source: "billing",
      kind: "compliance",
      title: w.direction === "out" ? `Waiver for ${w.covers} (${w.party})` : `Collect ${w.party}'s waiver for ${w.covers}`,
      detail: `${(w.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} · ${w.kind.replace("_", " ")}`,
      role: "finance",
      nowRole: "finance",
      assignee: "",
      jobKey: w.jobKey,
      job: w.job,
      dueOn: null,
      since: null,
      overdueDays: 0,
      escalated: false,
      href: w.coversHref,
      editable: false,
    });
  }

  // Missing 6:00 PM daily log (SOP-006 App C): any job with crew shifts today
  // and no `eod` entry yet sits on `field_lead`.
  const missingLogs = await loadMissingDailyLogs(refs, today);
  out.push(...missingLogs);

  return out;
}

export function departmentOf(role: Role): string {
  return ROLE_INFO[role].department;
}

/**
 * What a project manager's Tasks shows (jobs/access.ts): work on their jobs,
 * and work with no job that is theirs or their seat's (also once it has moved up). Never the owners' waiting list, the ops
 * board or sub bills (Payables stays with the owners). `jobs` is the URL keys
 * of the jobs in their view; null = every job (an owner: the feed as is).
 */
export function feedForSeat(items: FeedItem[], jobs: Set<string> | null, mine: (i: FeedItem) => boolean): FeedItem[] {
  if (jobs === null) return items;
  // Work with no job shows when it is theirs, or was the PM's or the field's before it moved up overdue.
  const ours = (i: FeedItem) => mine(i) || i.role === "pm" || i.role === "field_lead";
  return items.filter((i) => i.source !== "waiting" && i.source !== "ops" && i.source !== "bill" && !isPayables(i) && (i.jobKey ? jobs.has(i.jobKey) : ours(i)));
}

/**
 * Payables work, owners only: a sub's waiver owed before we pay it (wvi<bill>,
 * with the sub bill's amount), or anything that opens a bill in Payables.
 */
function isPayables(i: FeedItem): boolean {
  return i.id.startsWith("wvi") || i.href.startsWith("/app/accounting/payables");
}

/** Whether this seat closes or moves the item here: owners any work item; a PM work items with the PM's or the field lead's seat. */
export function canCloseHere(item: Pick<FeedItem, "editable" | "role">, owner: boolean): boolean {
  return item.editable && (owner || item.role === "pm" || item.role === "field_lead");
}
