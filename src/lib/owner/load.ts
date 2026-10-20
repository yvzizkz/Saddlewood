import { moneyOverview } from "@/lib/billing/overview";
import { listUnmatchedPurchases } from "@/lib/crew/purchaseQueries";
import { listJobPeople, listJobs, listPeople, listReports, listTasks } from "@/lib/crew/queries";
import { listRequests } from "@/lib/crew/requestQueries";
import { readSettings, SETTING_DEFAULTS } from "@/lib/crew/settings";
import { addDays, localDay } from "@/lib/crew/time";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildWaiting, type WaitingItem } from "./waiting";

// Reads what "Waiting on you" is built from. Server only. Each source is read
// on its own and a failed one is left out, so a problem in billing never
// hides the crew's items or the other way round.

async function hoursCounts(): Promise<{ timefixes: number; reviews: number }> {
  const db = getSupabaseAdmin();
  const head = { count: "exact" as const, head: true };
  const [fixes, review] = await Promise.all([
    db.from("crew_entries").select("id", head).eq("kind", "timefix").eq("status", "new"),
    db.from("crew_shifts").select("id", head).eq("status", "ok").neq("review", ""),
  ]);
  if (fixes.error || review.error) throw new Error((fixes.error ?? review.error)?.message);
  return { timefixes: fixes.count ?? 0, reviews: review.count ?? 0 };
}

function quiet<T>(what: string, p: Promise<T>, fallback: T): Promise<T> {
  return p.catch((e) => {
    console.error(`[owner/waiting] ${what}:`, (e as Error).message);
    return fallback;
  });
}

export async function loadWaiting(owners: string[], now: Date = new Date()): Promise<WaitingItem[]> {
  const today = localDay(now);
  const [people, reports, tasks, jobs, hours, money, purchases, requests, jobPeople, settings] = await Promise.all([
    quiet("crew people", listPeople(), []),
    quiet("plans", listReports(addDays(today, -1)), []),
    quiet("tasks", listTasks({ closedSince: now.toISOString() }), []),
    quiet("jobs", listJobs(), []),
    quiet("hours", hoursCounts(), { timefixes: 0, reviews: 0 }),
    quiet("money", moneyOverview(today), null),
    quiet("purchases", listUnmatchedPurchases(), { names: [], older: 0, olderCents: 0, newestOn: null }),
    quiet("requests", listRequests({ since: now.toISOString() }), []),
    quiet("job people", listJobPeople(), []),
    quiet("settings", readSettings(), { ...SETTING_DEFAULTS }),
  ]);
  return buildWaiting({
    now,
    people,
    reports,
    tasks,
    jobs,
    timefixes: hours.timefixes,
    reviews: hours.reviews,
    money,
    owners,
    purchases: purchases.names,
    olderPurchases: purchases.older ? { count: purchases.older, cents: purchases.olderCents } : undefined,
    requests,
    jobPeople,
    pmLimitCents: settings["requests.pmLimitCents"],
    answersFirst: settings["requests.answersFirst"],
  });
}
