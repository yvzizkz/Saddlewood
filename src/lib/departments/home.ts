// A department's home (docs/COHESIVE-APP-PLAN.md §6.2): the same blocks for
// every department, each with its own figures, read from the sections that
// already own them. A department is a role seen through its work: its tasks
// come from the one task feed, its week from the one schedule. Server only.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { addDays, localDay, weekStart } from "@/lib/crew/time";
import { loadLabor } from "@/lib/accounting/labor";
import { loadPayables } from "@/lib/accounting/payables";
import { loadOpenReceivables } from "@/lib/accounting/receivables";
import { OWNER_CALLS_DAY } from "@/lib/billing/ladder";
import { loadChangeOrders, loadWaivers } from "@/lib/billing/registers";
import type { JobRef } from "@/lib/jobs/hub";
import type { ValueKind } from "@/lib/analytics/format";
import type { Role } from "@/lib/roles/seats";
import type { FeedItem } from "@/lib/tasks/feed";

export type DeptTile = { label: string; value: number | null; kind: ValueKind; hint?: string; href?: string; alert?: boolean };

const OPEN_STAGES = ["lead", "qualified", "site_visit", "estimating", "proposal_sent", "negotiating"];
const SOURCE_LABEL: Record<string, string> = { call: "Call", website: "Website", referral: "Referral", repeat: "Repeat client", bid_invite: "Bid invite", field: "Field", walk_in: "Walk-in", other: "Other" };

export async function departmentTiles(role: Role, refs: JobRef[], feed: FeedItem[], today = localDay()): Promise<{ tiles: DeptTile[]; table?: { title: string; rows: Record<string, string | number | null>[] } }> {
  const db = getSupabaseAdmin();
  const mine = feed.filter((i) => i.nowRole === role);
  const kindCount = (k: FeedItem["kind"]) => mine.filter((i) => i.kind === k).length;

  if (role === "decisions") {
    const [open, cos] = await Promise.all([loadOpenReceivables(today), loadChangeOrders(refs, today)]);
    const ownerCalls = open.rows.filter((r) => (r.daysLate ?? 0) >= OWNER_CALLS_DAY && !r.payWhenPaid);
    const awaiting = cos.filter((c) => c.status === "requested");
    return {
      tiles: [
        { label: "Decisions waiting", value: kindCount("decision"), kind: "count", href: "/app/tasks?kind=decision", alert: kindCount("decision") > 0 },
        { label: "Change orders to price", value: awaiting.length, kind: "count", hint: awaiting.length ? `oldest ${Math.max(...awaiting.map((c) => c.ageDays ?? 0))} days` : undefined, href: "/app/accounting/billing#changes", alert: awaiting.length > 0 },
        { label: `Owed ${OWNER_CALLS_DAY}+ days late`, value: ownerCalls.reduce((a, r) => a + r.balanceCents, 0), kind: "money", hint: `${ownerCalls.length} invoice${ownerCalls.length === 1 ? "" : "s"} · the owner calls (SOP-007)`, href: "/app/accounting/receivables?by=age" },
        { label: "Moved up to you", value: mine.filter((i) => i.escalated).length, kind: "count", hint: "overdue elsewhere" },
      ],
    };
  }

  if (role === "sales") {
    const { data } = await db.from("sales_opportunities").select("stage,source,value_cents,next_step_on,created_at,closed_at");
    const opps = (data ?? []) as { stage: string; source: string; value_cents: number; next_step_on: string | null; created_at: string; closed_at: string | null }[];
    const open = opps.filter((o) => OPEN_STAGES.includes(o.stage));
    const year = `${today.slice(0, 4)}-01-01`;
    const closed = opps.filter((o) => (o.stage === "won" || o.stage === "lost") && (o.closed_at ?? o.created_at).slice(0, 10) >= year);
    const won = closed.filter((o) => o.stage === "won");
    const stale = open.filter((o) => !o.next_step_on || o.next_step_on < today);
    const bySource = new Map<string, { won: number; closed: number; open: number }>();
    for (const o of opps) {
      const s = bySource.get(o.source) ?? { won: 0, closed: 0, open: 0 };
      if (o.stage === "won") s.won++;
      if (o.stage === "won" || o.stage === "lost") s.closed++;
      if (OPEN_STAGES.includes(o.stage)) s.open++;
      bySource.set(o.source, s);
    }
    return {
      tiles: [
        { label: "Open pipeline", value: open.reduce((a, o) => a + Number(o.value_cents), 0), kind: "money", hint: `${open.length} open`, href: "/app/sales" },
        { label: "Win rate this year", value: closed.length ? won.length / closed.length : null, kind: "percent", hint: `${won.length} of ${closed.length} decided` },
        { label: "No next step or past it", value: stale.length, kind: "count", hint: "SOP-005: follow up within 5 business days", href: "/app/sales", alert: stale.length > 0 },
        { label: "Leads this month", value: opps.filter((o) => o.created_at.slice(0, 7) === today.slice(0, 7)).length, kind: "count" },
      ],
      table: {
        title: "By source",
        rows: [...bySource.entries()].map(([source, s]) => ({ id: source, source: SOURCE_LABEL[source] ?? source, open: s.open, won: s.won, rate: s.closed ? s.won / s.closed : null })),
      },
    };
  }

  if (role === "finance") {
    const wk = weekStart(today);
    const [open, payables, labor, waivers] = await Promise.all([loadOpenReceivables(today), loadPayables(today), loadLabor(wk, today, { withPay: true }), loadWaivers(refs)]);
    // The Friday run pays what is payable now on bills not on hold (retainage waits for its release).
    const due = payables.rows.filter((b) => b.dueByFriday);
    return {
      tiles: [
        { label: "Owed to us", value: open.rows.reduce((a, r) => a + r.balanceCents, 0), kind: "money", hint: `${open.rows.filter((r) => (r.daysLate ?? 0) > 0).length} past due`, href: "/app/accounting/receivables" },
        { label: "Friday pay run", value: due.reduce((a, b) => a + b.payableNowCents, 0), kind: "money", hint: `${due.length} bills by ${payables.fridayCutoff.slice(5)}`, href: "/app/accounting/payables" },
        { label: "Payroll this week", value: labor.rows.reduce((a, r) => a + (r.costCents ?? 0), 0), kind: "money", hint: `${(labor.rows.reduce((a, r) => a + r.minutes, 0) / 60).toFixed(1)} h`, href: "/app/accounting/payroll?p=wtd" },
        { label: "Waivers missing", value: waivers.filter((w) => w.status === "missing").length, kind: "count", href: "/app/accounting/billing#waivers", alert: waivers.some((w) => w.status === "missing") },
      ],
    };
  }

  if (role === "ops") {
    const { data } = await db.from("ops_cards").select("col").is("archived_at", null);
    const cols = (data ?? []) as { col: string }[];
    const n = (c: string) => cols.filter((x) => x.col === c).length;
    return {
      tiles: [
        { label: "On the board", value: n("backlog") + n("drafting") + n("review"), kind: "count", hint: `${n("drafting")} drafting · ${n("review")} in review`, href: "/internal/ops" },
        { label: "Live", value: n("live"), kind: "count", hint: `${n("measured")} measured` },
        { label: "Moved up company-wide", value: feed.filter((i) => i.escalated).length, kind: "count", hint: "work past due + grace", href: "/app/tasks?view=all" },
        { label: "Open tasks company-wide", value: feed.length, kind: "count", href: "/app/tasks?view=all" },
      ],
    };
  }

  if (role === "pm") {
    const [phases, labor, cos] = await Promise.all([
      db.from("crew_job_phases").select("job_id,name,planned_to,verified_at"),
      loadLabor(weekStart(today), today, { withPay: false }),
      loadChangeOrders(refs, today),
    ]);
    const behind = ((phases.data ?? []) as { job_id: string; planned_to: string | null; verified_at: string | null }[]).filter((p) => p.planned_to && p.planned_to < today && !p.verified_at);
    const jobsBehind = new Set(behind.map((p) => p.job_id)).size;
    return {
      tiles: [
        { label: "Jobs behind plan", value: jobsBehind, kind: "count", hint: `${behind.length} phases past their window`, href: "/app/schedule", alert: jobsBehind > 0 },
        { label: "Hours this week", value: labor.rows.reduce((a, r) => a + r.minutes, 0), kind: "hours", href: "/app/accounting/payroll?p=wtd" },
        { label: "Open punch", value: feed.filter((i) => i.kind === "punch").length, kind: "count" },
        { label: "Changes in motion", value: cos.filter((c) => ["requested", "priced", "sent", "signed"].includes(c.status)).length, kind: "count", href: "/app/accounting/billing#changes" },
      ],
    };
  }

  // Field lead: the crew's day.
  const [openShifts, labor] = await Promise.all([db.from("crew_shifts").select("id").eq("status", "ok").is("ended_at", null), loadLabor(today, today, { withPay: false })]);
  return {
    tiles: [
      { label: "On the clock now", value: (openShifts.data ?? []).length, kind: "count", href: "/app/crew" },
      { label: "Hours today", value: labor.rows.reduce((a, r) => a + r.minutes, 0), kind: "hours", href: "/app/accounting/payroll?p=today" },
      { label: "Crew tasks open", value: feed.filter((i) => i.source === "crew").length, kind: "count", href: "/app/crew?view=plan" },
      { label: "Daily logs missing", value: feed.filter((i) => i.kind === "daily_log").length, kind: "count", hint: "due 6 PM", alert: feed.some((i) => i.kind === "daily_log") },
    ],
  };
}

export function nextWeek(today = localDay()): { from: string; to: string } {
  return { from: today, to: addDays(today, 7) };
}
