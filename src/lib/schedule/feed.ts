// One schedule feed over every dated source in the app (docs/COHESIVE-APP-PLAN.md §6.3).
// Server only.
//
// Sources read in place:
//   schedule_items (0034)   inspections, site visits, deliveries, meetings, sub mobilizations
//   crew_schedule           crew assignments (who, where, start time, ack)
//   crew_job_phases         phase windows (planned_from..planned_to, verified_at)
//   bid_packages            sub bid due dates; an award's start (work window, or the winning bid's start) as a sub mobilization
//   clients/jobs billing    client billing cutoffs + PM % complete due (-3 business days, SOP-006 Gate 3)
//   receivables             AR collection ladder steps
//   job_watches             contract watches (agreement, deposit, 20-day prelim notice, COI to GC, permit)
//   subs                    COI expiry dates & missing W-9 / MSA compliance watches
//   payables + payroll      Friday 4:30 PM payroll cutoff, Friday Melio run & bill due dates
//   ops_goals               company dates and milestones

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadPayables, nextFridayDay } from "@/lib/accounting/payables";
import { loadBillingCalendar, loadOpenReceivables } from "@/lib/accounting/receivables";
import { addDays, localDay } from "@/lib/crew/time";
import { jobHref, jobKeyOf, type JobRef } from "@/lib/jobs/hub";
import { seatHolder, type Role } from "@/lib/roles/seats";
import { settleWatches } from "@/lib/sales/watchRecords";
import { readiness, type Readiness } from "@/lib/subs/rules";
import type { SubStatus } from "@/lib/subs/types";
import { loadPeople, loadSeats } from "@/lib/roles/store";

export type ScheduleKind =
  | "crew"
  | "phase"
  | "inspection"
  | "site_visit"
  | "delivery"
  | "meeting"
  | "sub_mobilization"
  | "bid_due"
  | "billing_cutoff"
  | "ar_ladder"
  | "watch"
  | "compliance"
  | "pay_day"
  | "goal";

export const SCHEDULE_KIND_LABEL: Record<ScheduleKind, string> = {
  crew: "Crew dispatch",
  phase: "Phase window",
  inspection: "Inspection",
  site_visit: "Site visit",
  delivery: "Delivery",
  meeting: "Meeting",
  sub_mobilization: "Sub mobilization",
  bid_due: "Bids due",
  billing_cutoff: "Billing cutoff",
  ar_ladder: "AR follow-up",
  watch: "Contract watch",
  compliance: "COI / compliance",
  pay_day: "Pay run & cutoff",
  goal: "Company milestone",
};

export const EDITABLE_SCHEDULE_KINDS: { value: ScheduleKind; label: string }[] = [
  { value: "inspection", label: "Inspection" },
  { value: "site_visit", label: "Site visit" },
  { value: "delivery", label: "Delivery" },
  { value: "meeting", label: "Meeting" },
  { value: "sub_mobilization", label: "Sub mobilization" },
];

export type ScheduleEvent = {
  id: string;
  source: "item" | "crew" | "phase" | "bid" | "billing" | "ar" | "watch" | "sub" | "pay" | "goal";
  kind: ScheduleKind;
  kindLabel: string;
  jobKey: string | null;
  job: string;
  client: string;
  title: string;
  detail: string;
  startDay: string;
  endDay: string;
  startTime: string;
  who: string;
  whoEmail: string;
  role: Role;
  status: "scheduled" | "done" | "overdue" | "cancelled";
  href: string;
  editable: boolean;
  itemId?: number;
};

export function eventFallsOn(ev: Pick<ScheduleEvent, "startDay" | "endDay">, day: string): boolean {
  return ev.startDay <= day && (ev.endDay || ev.startDay) >= day;
}

export function eventOverlaps(ev: Pick<ScheduleEvent, "startDay" | "endDay">, fromDay: string, toDay: string): boolean {
  const end = ev.endDay || ev.startDay;
  return ev.startDay <= toDay && end >= fromDay;
}

/** Monday..Sunday of the week containing `anchorDay` (YYYY-MM-DD). */
export function weekDays(anchorDay: string): string[] {
  const d = new Date(`${anchorDay}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const offsetToMon = dow === 0 ? -6 : 1 - dow;
  const mon = addDays(anchorDay, offsetToMon);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/** Calendar grid (weeks of 7 YYYY-MM-DD days, Monday-first) covering `anchorDay`'s month. */
export function monthGrid(anchorDay: string): { monthLabel: string; monthPrefix: string; weeks: string[][] } {
  const [y, m] = anchorDay.split("-").map(Number);
  const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDate = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastDay = `${y}-${String(m).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`;
  const startWeek = weekDays(firstDay);
  const weeks: string[][] = [];
  let cursor = startWeek[0];
  while (cursor <= lastDay || weeks.length < 4) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
    if (weeks.length >= 6) break;
  }
  const monthLabel = new Date(`${firstDay}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { monthLabel, monthPrefix: firstDay.slice(0, 7), weeks };
}

/** Where a project manager's links can go: their job pages and Billing (accounting/access.ts). */
const PM_OPENS = ["/app/jobs/", "/app/accounting/billing"];

/**
 * A project manager's cut of the schedule (jobs/access.ts): their jobs, and the
 * billing dates of those jobs' clients, as the job's Schedule tab shows them.
 * Never pay runs or bills due (Payables), company dates or compliance. A link
 * to a screen they cannot open goes to the job's Schedule tab (or this one). An
 * owner (jobs null) gets every event as it is. A seat with no money (a field
 * lead) also loses billing dates and AR calls, which carry dollars, and Billing.
 */
export function scheduleForSeat(events: ScheduleEvent[], jobs: Set<string> | null, refs: Pick<JobRef, "key" | "client">[], money = true): ScheduleEvent[] {
  if (jobs === null) return events;
  const clients = new Set(refs.filter((r) => jobs.has(r.key) && r.client).map((r) => r.client));
  const opens = money ? PM_OPENS : PM_OPENS.filter((p) => p.startsWith("/app/jobs/"));
  return events
    .filter((e) => e.source !== "pay" && (money || (e.source !== "billing" && e.source !== "ar")))
    .filter((e) => (e.jobKey ? jobs.has(e.jobKey) : !!e.client && clients.has(e.client)))
    .map((e) => (opens.some((p) => e.href.startsWith(p)) ? e : { ...e, href: e.jobKey ? jobHref(e.jobKey, "schedule") : "/app/schedule" }));
}

export type GcLookAheadDraft = {
  client: string;
  fromDay: string;
  toDay: string;
  subject: string;
  body: string;
  jobs: string[];
  eventCount: number;
};

/**
 * Builds the Wednesday two-week look-ahead email draft per client/GC (plan §6.3).
 * Drafted for review only — never sent automatically.
 */
export function buildGcLookAheadDrafts(
  events: ScheduleEvent[],
  refs: JobRef[],
  fromDay: string,
): GcLookAheadDraft[] {
  const toDay = addDays(fromDay, 13);
  const byClient = new Map<string, { jobs: Map<string, JobRef>; events: ScheduleEvent[] }>();
  for (const r of refs) {
    if (!r.active || !r.client) continue;
    if (!byClient.has(r.client)) byClient.set(r.client, { jobs: new Map(), events: [] });
    byClient.get(r.client)!.jobs.set(r.key, r);
  }
  for (const ev of events) {
    if (ev.status === "cancelled" || !ev.client) continue;
    if (!eventOverlaps(ev, fromDay, toDay)) continue;
    if (!byClient.has(ev.client)) continue;
    byClient.get(ev.client)!.events.push(ev);
  }

  const drafts: GcLookAheadDraft[] = [];
  for (const [client, group] of byClient.entries()) {
    const jobNames = [...group.jobs.values()].map((j) => j.name);
    const lines: string[] = [
      `Hi ${client.replace(/\s*\(Synthetic\)\s*/i, "")} team,`,
      "",
      `Here is Saddlewood Contracting's two-week look-ahead (${fromDay} through ${toDay}) across ${jobNames.join(", ")}:`,
      "",
    ];
    for (const j of group.jobs.values()) {
      const jobEvs = group.events
        .filter((e) => e.jobKey === j.key || (!e.jobKey && e.client === client))
        .sort((a, b) => a.startDay.localeCompare(b.startDay) || a.startTime.localeCompare(b.startTime));
      lines.push(`• ${j.name}${j.address ? ` (${j.address})` : ""}`);
      if (!jobEvs.length) {
        lines.push(`  - No scheduled milestones in this 14-day window.`);
      } else {
        for (const e of jobEvs.slice(0, 12)) {
          const span = e.endDay && e.endDay !== e.startDay ? `${e.startDay} → ${e.endDay}` : e.startDay;
          const time = e.startTime ? ` @ ${e.startTime}` : "";
          lines.push(`  - [${e.kindLabel}] ${span}${time}: ${e.title}${e.detail ? ` — ${e.detail}` : ""}`);
        }
      }
      lines.push("");
    }
    lines.push("Please let us know if any inspection times, site walks, or material drops need adjustment.");
    lines.push("");
    lines.push("Thank you,");
    lines.push("Saddlewood Contracting LLC (DRAFT — review before sending)");

    drafts.push({
      client,
      fromDay,
      toDay,
      subject: `Saddlewood Two-Week Look-Ahead (${fromDay} – ${toDay}) · ${client.replace(/\s*\(Synthetic\)\s*/i, "")}`,
      body: lines.join("\n"),
      jobs: jobNames,
      eventCount: group.events.length,
    });
  }
  return drafts.sort((a, b) => b.eventCount - a.eventCount || a.client.localeCompare(b.client));
}

/**
 * When an awarded sub starts on site: the package's work window, else the
 * winning bid's start (bid_packages.work_from/work_to, bid_responses.start_on).
 * Overdue while the window is open and the mobilization gate still holds them
 * (subs/rules.ts readiness: COI, W-9, MSA, license, ACH); done once the window
 * has passed, since an award never closes and readiness is read against today,
 * so a lapsed COI on finished work is not a missed start. Null with no start.
 */
export function mobilizationOf(
  pkg: { workFrom: string | null; workTo: string | null },
  bidStartOn: string | null,
  gate: Readiness,
  today: string,
): { startDay: string; endDay: string; status: "scheduled" | "overdue" | "done"; detail: string } | null {
  const startDay = pkg.workFrom ?? bidStartOn;
  if (!startDay) return null;
  const endDay = pkg.workTo && pkg.workTo >= startDay ? pkg.workTo : startDay;
  return {
    startDay,
    endDay,
    status: endDay < today ? "done" : !gate.ready && startDay <= today ? "overdue" : "scheduled",
    detail: gate.ready ? "Cleared to mobilize" : `Not cleared to mobilize: ${gate.missing.join(", ")}`,
  };
}

type Awarded = { id: string; job_id: string | null; trade: string; title: string; work_from: string | null; work_to: string | null; awarded_invite_id: string | null };
type AwardedSub = { id: string; name: string; status: string; coi_expires_on: string | null; w9_on_file: boolean; msa_signed_on: string | null; roc_verified_at: string | null; ach_confirmed_at: string | null };

/** Awarded packages with the sub that won each and that bid's latest start. */
async function loadAwards(): Promise<{ pkg: Awarded; sub: AwardedSub | null; startOn: string | null }[]> {
  const db = getSupabaseAdmin();
  const { data } = await db.from("bid_packages").select("id,job_id,trade,title,work_from,work_to,awarded_invite_id").eq("status", "awarded").limit(500);
  const pkgs = (data ?? []) as Awarded[];
  const inviteIds = pkgs.flatMap((p) => (p.awarded_invite_id ? [p.awarded_invite_id] : []));
  if (!inviteIds.length) return pkgs.map((pkg) => ({ pkg, sub: null, startOn: null }));
  const [invitesRes, responsesRes] = await Promise.all([
    db.from("bid_invites").select("id,sub_id").in("id", inviteIds),
    db.from("bid_responses").select("invite_id,revision,start_on").in("invite_id", inviteIds),
  ]);
  const subOf = new Map(((invitesRes.data ?? []) as { id: string; sub_id: string }[]).map((i) => [i.id, i.sub_id]));
  const latest = new Map<string, { revision: number; start_on: string | null }>();
  for (const r of (responsesRes.data ?? []) as { invite_id: string; revision: number; start_on: string | null }[]) {
    if ((latest.get(r.invite_id)?.revision ?? -1) < r.revision) latest.set(r.invite_id, r);
  }
  const subIds = [...new Set(subOf.values())];
  const { data: subRows } = subIds.length
    ? await db.from("subs").select("id,name,status,coi_expires_on,w9_on_file,msa_signed_on,roc_verified_at,ach_confirmed_at").in("id", subIds)
    : { data: [] };
  const subs = new Map(((subRows ?? []) as AwardedSub[]).map((s) => [s.id, s]));
  return pkgs.map((pkg) => {
    const inv = pkg.awarded_invite_id;
    return { pkg, sub: (inv && subs.get(subOf.get(inv) ?? "")) || null, startOn: (inv && latest.get(inv)?.start_on) || null };
  });
}

export async function loadScheduleFeed(refs: JobRef[], today = localDay()): Promise<ScheduleEvent[]> {
  const db = getSupabaseAdmin();
  const [
    itemsRes,
    crewSchedRes,
    phasesRes,
    peopleRes,
    bidsRes,
    watchesRes,
    subsRes,
    goalsRes,
    awards,
    billingCal,
    openAr,
    payables,
    seats,
    rolePeople,
  ] = await Promise.all([
    db.from("schedule_items").select("*").neq("status", "cancelled").order("start_day", { ascending: true }).limit(1000),
    db.from("crew_schedule").select("id,day,email,job_id,job_name,start_time,note,ack,priority").order("day", { ascending: true }).limit(1000),
    db.from("crew_job_phases").select("id,job_id,ord,name,trade,planned_from,planned_to,verified_at,verified_by,note").order("ord", { ascending: true }),
    db.from("crew_people").select("email,name,trade"),
    // Out to bid, or drafted with a due date (0028's statuses); closed and awarded are past bidding.
    db.from("bid_packages").select("id,job_id,trade,title,status,due_at").in("status", ["draft", "out"]),
    settleWatches().then(() => db.from("job_watches").select("id,job_id,kind,title,due_on,note,done_at").is("done_at", null)),
    db.from("subs").select("id,name,trades,status,coi_expires_on,w9_on_file,msa_signed_on").in("status", ["approved", "onboarding"]),
    db.from("ops_goals").select("id,title,horizon,owner,status,due_date,note").not("due_date", "is", null).neq("status", "done"),
    loadAwards().catch(() => []),
    loadBillingCalendar(today).catch(() => []),
    loadOpenReceivables(today).catch(() => ({ rows: [], today })),
    loadPayables(today).catch(() => ({ rows: [], payments: [], trades: [], fridayCutoff: nextFridayDay(today) })),
    loadSeats().catch(() => []),
    loadPeople().catch(() => []),
  ]);

  const holderOf = (r: Role) => seatHolder(r, seats, rolePeople).name;

  const refByKey = new Map(refs.map((r) => [r.key, r]));
  const personName = new Map(
    ((peopleRes.data ?? []) as { email: string; name: string | null; trade: string | null }[]).map((p) => [
      p.email,
      p.name || p.email,
    ]),
  );

  const resolveJobMeta = (billingId?: string | null, crewId?: string | null, fallbackName = "") => {
    const key = jobKeyOf({ billingId, crewId }, refs);
    const ref = key ? refByKey.get(key) : undefined;
    return {
      jobKey: key,
      job: ref?.name || fallbackName || "Company-wide",
      client: ref?.client || "",
    };
  };

  const out: ScheduleEvent[] = [];

  // 1. schedule_items (inspections, site visits, deliveries, meetings, sub mobilizations)
  type SRow = {
    id: number;
    kind: ScheduleKind;
    title: string;
    detail: string;
    job_id: string | null;
    crew_job_id: string | null;
    start_day: string;
    end_day: string | null;
    start_time: string;
    role: Role;
    who: string;
    status: "scheduled" | "done" | "cancelled";
  };
  for (const s of (itemsRes.data ?? []) as SRow[]) {
    const meta = resolveJobMeta(s.job_id, s.crew_job_id);
    const endDay = s.end_day || s.start_day;
    const status = s.status === "done" ? "done" : endDay < today ? "overdue" : "scheduled";
    out.push({
      id: `si:${s.id}`,
      source: "item",
      kind: s.kind,
      kindLabel: SCHEDULE_KIND_LABEL[s.kind] ?? s.kind,
      jobKey: meta.jobKey,
      job: meta.job,
      client: meta.client,
      title: s.title,
      detail: s.detail,
      startDay: s.start_day,
      endDay,
      startTime: s.start_time || "",
      who: personName.get(s.who) ?? (s.who || s.role.toUpperCase()),
      whoEmail: s.who.includes("@") ? s.who : "",
      role: s.role,
      status,
      href: meta.jobKey ? jobHref(meta.jobKey, "schedule") : "/app/schedule",
      editable: true,
      itemId: s.id,
    });
  }

  // 2. crew_schedule (who, where, when)
  type CRow = {
    id: number;
    day: string;
    email: string;
    job_id: string;
    job_name: string;
    start_time: string;
    note: string;
    ack: string;
  };
  for (const c of (crewSchedRes.data ?? []) as CRow[]) {
    const meta = resolveJobMeta(null, c.job_id, c.job_name);
    const who = personName.get(c.email) ?? c.email;
    const ackText = c.ack === "ok" ? "Confirmed" : c.ack === "cant" ? "Cannot make it" : "Unconfirmed";
    out.push({
      id: `cs:${c.id}`,
      source: "crew",
      kind: "crew",
      kindLabel: SCHEDULE_KIND_LABEL.crew,
      jobKey: meta.jobKey,
      job: meta.job,
      client: meta.client,
      title: `${who} → ${meta.job}`,
      detail: [c.note, ackText].filter(Boolean).join(" · "),
      startDay: c.day,
      endDay: c.day,
      startTime: c.start_time || "07:00",
      who,
      whoEmail: c.email,
      role: "field_lead",
      status: c.day < today ? "done" : "scheduled",
      href: meta.jobKey ? jobHref(meta.jobKey, "crew") : "/app/crew",
      editable: false,
    });
  }

  // 3. crew_job_phases (planned_from..planned_to, verified_at)
  type PRow = {
    id: number;
    job_id: string;
    ord: number;
    name: string;
    trade: string;
    planned_from: string | null;
    planned_to: string | null;
    verified_at: string | null;
    verified_by: string;
    note: string;
  };
  for (const p of (phasesRes.data ?? []) as PRow[]) {
    const startDay = p.planned_from || p.planned_to || (p.verified_at ? localDay(p.verified_at) : null);
    if (!startDay) continue;
    const endDay = p.planned_to || startDay;
    const meta = resolveJobMeta(null, p.job_id);
    const status = p.verified_at ? "done" : endDay < today ? "overdue" : "scheduled";
    out.push({
      id: `ph:${p.id}`,
      source: "phase",
      kind: "phase",
      kindLabel: SCHEDULE_KIND_LABEL.phase,
      jobKey: meta.jobKey,
      job: meta.job,
      client: meta.client,
      title: `Phase ${p.ord}: ${p.name}`,
      detail: [p.trade, p.verified_at ? `Verified by ${p.verified_by}` : p.note].filter(Boolean).join(" · "),
      startDay,
      endDay,
      startTime: "",
      who: (meta.jobKey ? refByKey.get(meta.jobKey)?.pm[0] : undefined) ?? holderOf("pm"),
      whoEmail: "",
      role: "pm",
      status,
      href: meta.jobKey ? jobHref(meta.jobKey, "schedule") : "/app/jobs",
      editable: false,
    });
  }

  // 4. bid_packages (due_at)
  type BRow = { id: string; job_id: string | null; trade: string; title: string; status: string; due_at: string | null };
  for (const b of (bidsRes.data ?? []) as BRow[]) {
    if (!b.due_at) continue;
    const day = localDay(b.due_at);
    const meta = resolveJobMeta(b.job_id, null);
    out.push({
      id: `bp:${b.id}`,
      source: "bid",
      kind: "bid_due",
      kindLabel: SCHEDULE_KIND_LABEL.bid_due,
      jobKey: meta.jobKey,
      job: meta.job,
      client: meta.client,
      title: `Bids due: ${b.title || b.trade}`,
      detail: `${b.trade} package (${b.status})`,
      startDay: day,
      endDay: day,
      startTime: "17:00",
      who: holderOf("pm"),
      whoEmail: "",
      role: "pm",
      status: day < today ? "overdue" : "scheduled",
      href: `/app/subs/bids/${b.id}`,
      editable: false,
    });
  }

  // 4b. Awards: the sub's start on site (bid_packages work window or the winning bid's start)
  for (const { pkg, sub, startOn } of awards) {
    const gate = sub
      ? readiness({ status: sub.status as SubStatus, coiExpiresOn: sub.coi_expires_on, w9OnFile: sub.w9_on_file, msaSignedOn: sub.msa_signed_on, rocVerifiedAt: sub.roc_verified_at, achConfirmedAt: sub.ach_confirmed_at }, today)
      : { ready: false, missing: ["no awarded sub on file"] };
    const mob = mobilizationOf({ workFrom: pkg.work_from, workTo: pkg.work_to }, startOn, gate, today);
    if (!mob) continue;
    const meta = resolveJobMeta(pkg.job_id, null);
    out.push({
      id: `mob:${pkg.id}`,
      source: "bid",
      kind: "sub_mobilization",
      kindLabel: SCHEDULE_KIND_LABEL.sub_mobilization,
      jobKey: meta.jobKey,
      job: meta.job,
      client: meta.client,
      title: `${sub?.name ?? "Sub"} starts: ${pkg.title || pkg.trade}`,
      detail: `${pkg.trade} · ${mob.detail}`,
      startDay: mob.startDay,
      endDay: mob.endDay,
      startTime: "",
      who: sub?.name ?? holderOf("pm"),
      whoEmail: "",
      role: "pm",
      status: mob.status,
      href: `/app/subs/bids/${pkg.id}`,
      editable: false,
    });
  }

  // 5. Client billing cutoffs & PM % complete due (-3 business days, SOP-006 Gate 3)
  for (const c of billingCal) {
    out.push({
      id: `bc:prep:${c.clientId}:${c.prepOn}`,
      source: "billing",
      kind: "billing_cutoff",
      kindLabel: SCHEDULE_KIND_LABEL.billing_cutoff,
      jobKey: null,
      job: `${c.client} (${c.openJobs} open ${c.openJobs === 1 ? "job" : "jobs"})`,
      client: c.client,
      title: `PM % complete due for ${c.client}`,
      detail: `3 business days before ${c.label} (${c.delivery})`,
      startDay: c.prepOn,
      endDay: c.prepOn,
      startTime: "16:00",
      who: holderOf("pm"),
      whoEmail: "",
      role: "pm",
      status: c.prepOn < today ? "overdue" : "scheduled",
      href: "/app/accounting/billing",
      editable: false,
    });
    out.push({
      id: `bc:cut:${c.clientId}:${c.day}`,
      source: "billing",
      kind: "billing_cutoff",
      kindLabel: SCHEDULE_KIND_LABEL.billing_cutoff,
      jobKey: null,
      job: `${c.client} (${c.openJobs} open ${c.openJobs === 1 ? "job" : "jobs"})`,
      client: c.client,
      title: `Billing cutoff: ${c.client}`,
      detail: [c.label, c.delivery, c.attachments.length ? `Attach: ${c.attachments.join(", ")}` : ""].filter(Boolean).join(" · "),
      startDay: c.day,
      endDay: c.day,
      startTime: "17:00",
      who: holderOf("finance"),
      whoEmail: "",
      role: "finance",
      status: c.day < today ? "overdue" : "scheduled",
      href: "/app/accounting/billing",
      editable: false,
    });
  }

  // 6. AR collection ladder steps
  for (const r of openAr.rows) {
    if (!r.next || !r.dueOn) continue;
    const stepDay = r.daysLate && r.daysLate > 0 ? today : r.dueOn;
    const meta = resolveJobMeta(r.jobId, null, r.job);
    const role: Role = r.next.includes("marco") ? "decisions" : "finance";
    out.push({
      id: `ar:${r.id}`,
      source: "ar",
      kind: "ar_ladder",
      kindLabel: SCHEDULE_KIND_LABEL.ar_ladder,
      jobKey: meta.jobKey,
      job: meta.job,
      client: r.client,
      title: `AR ${r.number} (${r.client}): ${r.next}`,
      detail: `${r.ageLabel} · ${(r.balanceCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} open`,
      startDay: stepDay,
      endDay: stepDay,
      startTime: "09:00",
      who: holderOf(role),
      whoEmail: "",
      role,
      status: (r.daysLate ?? 0) > 0 ? "overdue" : "scheduled",
      href: `/app/money/${r.id}`,
      editable: false,
    });
  }

  // 7. Contract watches (job_watches)
  type WRow = { id: number; job_id: string; kind: string; title: string; due_on: string | null; note: string };
  for (const w of (watchesRes.data ?? []) as WRow[]) {
    if (!w.due_on) continue;
    const meta = resolveJobMeta(w.job_id, null);
    out.push({
      id: `jw:${w.id}`,
      source: "watch",
      kind: "watch",
      kindLabel: SCHEDULE_KIND_LABEL.watch,
      jobKey: meta.jobKey,
      job: meta.job,
      client: meta.client,
      title: `${w.title} · ${meta.job}`,
      detail: w.note,
      startDay: w.due_on,
      endDay: w.due_on,
      startTime: "",
      who: holderOf("finance"),
      whoEmail: "",
      role: "finance",
      status: w.due_on < today ? "overdue" : "scheduled",
      href: meta.jobKey ? jobHref(meta.jobKey) : "/app/jobs",
      editable: false,
    });
  }

  // 8. Sub COI expiries & W-9 / MSA watches
  type SubRow = {
    id: string;
    name: string;
    trades: string[];
    status: string;
    coi_expires_on: string | null;
    w9_on_file: boolean;
    msa_signed_on: string | null;
  };
  for (const s of (subsRes.data ?? []) as SubRow[]) {
    if (s.coi_expires_on) {
      out.push({
        id: `coi:${s.id}`,
        source: "sub",
        kind: "compliance",
        kindLabel: SCHEDULE_KIND_LABEL.compliance,
        jobKey: null,
        job: s.name,
        client: "",
        title: `COI ${s.coi_expires_on < today ? "expired" : "expires"}: ${s.name}`,
        detail: `Trades: ${(s.trades ?? []).join(", ") || "general"}`,
        startDay: s.coi_expires_on,
        endDay: s.coi_expires_on,
        startTime: "",
        who: holderOf("finance"),
        whoEmail: "",
        role: "finance",
        status: s.coi_expires_on < today ? "overdue" : "scheduled",
        href: "/app/subs",
        editable: false,
      });
    }
  }

  // 9. Pay days: Friday 4:30 PM payroll cutoff + Friday Melio AP run + open bill due dates
  const fri = payables.fridayCutoff || nextFridayDay(today);
  out.push({
    id: `pay:payroll:${fri}`,
    source: "pay",
    kind: "pay_day",
    kindLabel: SCHEDULE_KIND_LABEL.pay_day,
    jobKey: null,
    job: "Company-wide",
    client: "",
    title: "Friday 4:30 PM Payroll & Timecard Cutoff (SOP-001)",
    detail: "Verify all crew shifts, trades, and time-fix requests before payroll export",
    startDay: fri,
    endDay: fri,
    startTime: "16:30",
    who: holderOf("finance"),
    whoEmail: "",
    role: "finance",
    status: "scheduled",
    href: "/app/accounting/payroll",
    editable: false,
  });
  out.push({
    id: `pay:melio:${fri}`,
    source: "pay",
    kind: "pay_day",
    kindLabel: SCHEDULE_KIND_LABEL.pay_day,
    jobKey: null,
    job: "Company-wide",
    client: "",
    title: "Friday Sub & Vendor Melio Pay Run (SOP-004)",
    detail: "Release approved bills with verified COI and conditional lien waivers",
    startDay: fri,
    endDay: fri,
    startTime: "17:00",
    who: holderOf("finance"),
    whoEmail: "",
    role: "finance",
    status: "scheduled",
    href: "/app/accounting/payables",
    editable: false,
  });
  for (const b of payables.rows) {
    // What is payable on the due day: retainage waits for its release.
    if (b.payableNowCents <= 0 || !b.dueOn) continue;
    const meta = resolveJobMeta(b.billingJobId, b.rawCrewJobId, b.job);
    out.push({
      id: `ap:${b.id}`,
      source: "pay",
      kind: "pay_day",
      kindLabel: SCHEDULE_KIND_LABEL.pay_day,
      jobKey: meta.jobKey,
      job: meta.job,
      client: meta.client,
      title: `Bill due: ${b.vendorName} (${b.billNumber})`,
      detail: `${(b.payableNowCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} · ${b.statusLabel}`,
      startDay: b.dueOn,
      endDay: b.dueOn,
      startTime: "",
      who: holderOf("finance"),
      whoEmail: "",
      role: "finance",
      status: b.dueOn < today ? "overdue" : "scheduled",
      href: `/app/accounting/payables/bill/${b.id}`,
      editable: false,
    });
  }

  // 10. Company dates & goals (ops_goals)
  type GRow = { id: string; title: string; horizon: string; owner: string; status: string; due_date: string | null; note: string };
  for (const g of (goalsRes.data ?? []) as GRow[]) {
    if (!g.due_date) continue;
    out.push({
      id: `goal:${g.id}`,
      source: "goal",
      kind: "goal",
      kindLabel: SCHEDULE_KIND_LABEL.goal,
      jobKey: null,
      job: "Company-wide",
      client: "",
      title: g.title,
      detail: [g.horizon, g.note].filter(Boolean).join(" · "),
      startDay: g.due_date,
      endDay: g.due_date,
      startTime: "",
      who: g.owner || holderOf("ops"),
      whoEmail: "",
      role: "ops",
      status: g.due_date < today ? "overdue" : "scheduled",
      href: "/internal/ops/calendar",
      editable: false,
    });
  }

  return out.sort(
    (a, b) =>
      a.startDay.localeCompare(b.startDay) ||
      (a.startTime || "99:99").localeCompare(b.startTime || "99:99") ||
      a.title.localeCompare(b.title),
  );
}
