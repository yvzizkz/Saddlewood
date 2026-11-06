import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { RunLine } from "./payrollRun";

// payroll_runs (0065), with the service role. Callers have checked the seat.

export type PayrollRun = { payDate: string; lines: RunLine[]; updatedBy: string; updatedAt: string };

type Row = { pay_date: string; lines: RunLine[]; updated_by: string; updated_at: string };
const toRun = (r: Row): PayrollRun => ({ payDate: r.pay_date, lines: r.lines, updatedBy: r.updated_by, updatedAt: r.updated_at });

export async function loadRun(payDate: string): Promise<PayrollRun | null> {
  const { data, error } = await getSupabaseAdmin().from("payroll_runs").select("pay_date,lines,updated_by,updated_at").eq("pay_date", payDate).maybeSingle();
  if (error) throw new Error(`payroll_runs: ${error.message}`);
  return data ? toRun(data as Row) : null;
}

/** The newest run before this pay date, for the new one to start from. */
export async function runBefore(payDate: string): Promise<PayrollRun | null> {
  const { data, error } = await getSupabaseAdmin().from("payroll_runs").select("pay_date,lines,updated_by,updated_at").lt("pay_date", payDate).order("pay_date", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`payroll_runs: ${error.message}`);
  return data ? toRun(data as Row) : null;
}

export async function saveRun(payDate: string, lines: RunLine[], by: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("payroll_runs").upsert({ pay_date: payDate, lines, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: "pay_date" });
  if (error) throw new Error(`payroll_runs: ${error.message}`);
}
