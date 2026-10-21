// Payroll and labor: every time entry in a range, with its person, job, trade,
// hours and (for owners) cost. Server only.
//
// Hours are the clock's (crew_shifts, status ok) less the unpaid break, the
// same as the timesheet and the payroll CSV (crew/time.ts workedMinutes). An
// open shift counts up to now. The trade is the shift's own (0029) when set,
// else the person's. Cost is minutes × the person's current pay rate: there is
// no rate history yet, so a changed rate re-prices past weeks (the screen says
// so).

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { workedMinutes } from "@/lib/crew/time";
import { listTrades, resolveTrade, type Trade } from "./trades";

export type LaborRow = {
  id: string;
  day: string;
  email: string;
  person: string;
  jobId: string;
  job: string;
  trade: string;
  tradeLabel: string;
  minutes: number;
  /** Null when the person has no rate, or the viewer may not see pay. */
  costCents: number | null;
  startedAt: string;
  endedAt: string | null;
  open: boolean;
  source: string;
  edited: boolean;
};

type ShiftRow = {
  id: number;
  email: string;
  job_id: string;
  job_name: string | null;
  day: string;
  started_at: string;
  ended_at: string | null;
  break_min: number;
  source: string;
  edits: unknown;
  trade?: string | null;
};

type PersonRow = { email: string; name: string | null; trade: string | null; pay_rate: number | string | null };

async function allShifts(fromDay: string, toDay: string): Promise<ShiftRow[]> {
  const db = getSupabaseAdmin();
  const out: ShiftRow[] = [];
  const size = 1000;
  for (let page = 0; page < 50; page++) {
    const { data, error } = await db
      .from("crew_shifts")
      .select("*")
      .eq("status", "ok")
      .gte("day", fromDay)
      .lte("day", toDay)
      .order("started_at", { ascending: true })
      .range(page * size, page * size + size - 1);
    if (error) throw new Error(`crew_shifts: ${error.message}`);
    out.push(...((data ?? []) as ShiftRow[]));
    if (!data || data.length < size) break;
  }
  return out;
}

export async function loadLabor(fromDay: string, toDay: string, opts: { withPay: boolean; now?: Date }): Promise<{ rows: LaborRow[]; trades: Trade[]; ratesMissing: number }> {
  const db = getSupabaseAdmin();
  const [shifts, peopleRes, jobsRes, trades] = await Promise.all([
    allShifts(fromDay, toDay),
    db.from("crew_people").select("email,name,trade,pay_rate"),
    db.from("crew_jobs").select("id,name"),
    listTrades(),
  ]);
  if (peopleRes.error) throw new Error(`crew_people: ${peopleRes.error.message}`);
  const people = new Map(((peopleRes.data ?? []) as PersonRow[]).map((p) => [p.email, p]));
  const jobs = new Map(((jobsRes.data ?? []) as { id: string; name: string }[]).map((j) => [j.id, j.name]));
  const now = opts.now ?? new Date();
  const missing = new Set<string>();

  const rows = shifts.map((s): LaborRow => {
    const p = people.get(s.email);
    const minutes = workedMinutes({ startedAt: s.started_at, endedAt: s.ended_at, breakMin: s.break_min ?? 0 }, now);
    const t = resolveTrade(s.trade || p?.trade, trades);
    const rate = p?.pay_rate === null || p?.pay_rate === undefined || p?.pay_rate === "" ? null : Number(p.pay_rate);
    if (opts.withPay && rate === null) missing.add(s.email);
    return {
      id: String(s.id),
      day: s.day,
      email: s.email,
      person: p?.name || s.email.split("@")[0],
      jobId: s.job_id,
      job: jobs.get(s.job_id) ?? s.job_name ?? s.job_id,
      trade: t?.key ?? "",
      tradeLabel: t?.label ?? "No trade",
      minutes,
      costCents: opts.withPay && rate !== null ? Math.round((minutes / 60) * rate * 100) : null,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      open: !s.ended_at,
      source: s.source,
      edited: Array.isArray(s.edits) && s.edits.length > 0,
    };
  });
  return { rows, trades, ratesMissing: missing.size };
}
