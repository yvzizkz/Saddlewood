// Sign-in for the scenarios: a real Supabase session on this worktree's own
// local stack, set as the app's auth cookie. Local only: the stack's URL and
// keys come from `supabase status`, and anything but 127.0.0.1:55321 stops
// the run before a request is made.

import { execSync } from "node:child_process";
import { test as base, type BrowserContext, type Page } from "@playwright/test";

const LOCAL = "http://127.0.0.1:55321";
const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const PASSWORD = "local-only-pass-1";

type Env = { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };

let cached: Env | null = null;
function stack(): Env {
  if (cached) return cached;
  const out = execSync("supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const env = Object.fromEntries(
    out
      .split("\n")
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2]]),
  ) as Env;
  if (env.API_URL !== LOCAL) throw new Error(`refusing: the scenarios run only on this worktree's stack (${LOCAL}), not ${env.API_URL}`);
  cached = env;
  return env;
}

/** A session cookie for a local user, created if missing. Crew seats carry the crew mark. */
export async function sessionCookie(email: string, opts: { crew?: boolean } = {}): Promise<string> {
  const env = stack();
  const admin = { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
  await fetch(`${env.API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, ...(opts.crew ? { app_metadata: { sw_role: "crew" } } : {}) }),
  });
  const res = await fetch(`${env.API_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const session = await res.json();
  if (!session.access_token) throw new Error(`local sign-in failed for ${email}`);
  return "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
}

export async function signIn(context: BrowserContext, email: string, opts: { crew?: boolean } = {}) {
  const value = await sessionCookie(email, opts);
  await context.addCookies([{ name: "sb-127-auth-token", value, domain: "localhost", path: "/" }]);
  // The first-run tour is seen once per address.
  await context.addInitScript((e) => localStorage.setItem(`sw_onboarded:${e}`, "1"), email);
}

export const OWNER = "lando@saddlewoodcontracting.com";
export const PM = "eli.pm@example.com";

/** The page as an owner (Lando's local seat). */
export const test = base.extend<{ owner: Page }>({
  owner: async ({ context, page }, provide) => {
    await signIn(context, OWNER);
    await provide(page);
  },
});
export { expect } from "@playwright/test";

/** "$1,234.56" -> 123456 (cents); "–" -> null. */
export function cents(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/[^0-9.\-]/g, "");
  if (!m) return null;
  return Math.round(Number(m) * 100);
}

/** "481.5 h" -> 481.5 */
export function hours(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/[^0-9.]/g, "");
  return m ? Number(m) : null;
}

/** Day-of-month `days` ahead of Phoenix today, so a client's cutoff is always within the 7-day prep window regardless of what day the suite runs. */
export function cutoffInDays(days = 3): number {
  const phoenixToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const d = new Date(`${phoenixToday}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.getUTCDate();
}

/** A job's SOV line keys ("line:<id>", migration 0055), in schedule order. */
export async function sovKeys(page: Page, job: string): Promise<string[]> {
  const res = await page.request.get(`/api/jobs/${job}/progress`);
  if (!res.ok()) throw new Error(`progress for ${job}: ${res.status()}`);
  const body = (await res.json()) as { lines: { key: string }[] };
  return body.lines.map((l) => l.key).filter((k) => k.startsWith("line:"));
}

const sqlLit = (v: string) => `'${v.replace(/'/g, "''")}'`;

export function sql(q: string): string {
  stack();
  return execSync(`psql "${LOCAL_DB}" -qAtc ${JSON.stringify(q.replace(/\s+/g, " "))}`, { encoding: "utf8" }).trim();
}

/** Remove a test change order and its events, Joist queue rows, and draft/issued document. */
export function cleanChangeOrder(id: number | null | undefined): void {
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return;
  sql(`
    begin;
    set local session_replication_role = replica;
    create temp table co_docs on commit drop as
      select document_id from public.change_orders where id = ${id} and document_id is not null;
    delete from public.document_exhibits where document_id in (select document_id from co_docs);
    delete from public.document_events where document_id in (select document_id from co_docs);
    delete from public.change_order_events where change_order_id = ${id};
    delete from public.joist_jobs where change_order_id = ${id};
    delete from public.change_orders where id = ${id};
    delete from public.documents where id in (select document_id from co_docs);
    commit;
  `);
}

/**
 * Remove a synthetic lead/award created by an E2E test: its opportunity,
 * estimates, proposal & deposit documents, billing job, field job, watches,
 * SOV lines, and (when no other job uses it) its synthetic client & contacts.
 */
export function cleanAward(ids: { oppId?: string | null; jobId?: string | null; crewJobId?: string | null; clientId?: string | null }): void {
  const opp = ids.oppId?.trim() || "";
  const job = ids.jobId?.trim() || "";
  const crew = ids.crewJobId?.trim() || "";
  const client = ids.clientId?.trim() || "";
  if (!opp && !job && !crew && !client) return;

  sql(`
    begin;
    set local session_replication_role = replica;
    create temp table clean_opps on commit drop as
      select id, job_id, client_id from public.sales_opportunities
      where ${opp ? `id = ${sqlLit(opp)}` : "false"}
         or ${job ? `job_id = ${sqlLit(job)}` : "false"};
    create temp table clean_jobs on commit drop as
      select id, crew_job_id, client_id from public.jobs
      where ${job ? `id = ${sqlLit(job)}` : "false"}
         or ${crew ? `crew_job_id = ${sqlLit(crew)}` : "false"}
         or id in (select job_id from clean_opps where job_id is not null);
    create temp table clean_crew_jobs on commit drop as
      select id from public.crew_jobs
      where ${crew ? `id = ${sqlLit(crew)}` : "false"}
         or id in (select crew_job_id from clean_jobs where crew_job_id is not null);
    create temp table clean_clients on commit drop as
      select id from public.clients
      where ${client ? `id = ${sqlLit(client)}` : "false"}
         or id in (select client_id from clean_jobs where client_id is not null)
         or id in (select client_id from clean_opps where client_id is not null);
    create temp table clean_docs on commit drop as
      select id from public.documents
      where job_id in (select id from clean_jobs)
         or id in (
           select document_id from public.sales_estimates
           where opportunity_id in (select id from clean_opps) and document_id is not null
         );
    delete from public.document_exhibits where document_id in (select id from clean_docs);
    delete from public.document_events where document_id in (select id from clean_docs);
    delete from public.sov_progress where document_id in (select id from clean_docs) or job_id in (select id from clean_jobs);
    delete from public.sov_lines where job_id in (select id from clean_jobs);
    delete from public.job_watches where job_id in (select id from clean_jobs);
    delete from public.work_items where job_id in (select id from clean_jobs) or crew_job_id in (select id from clean_crew_jobs);
    delete from public.schedule_items where job_id in (select id from clean_jobs) or crew_job_id in (select id from clean_crew_jobs);
    delete from public.sales_events where opportunity_id in (select id from clean_opps);
    delete from public.sales_estimates where opportunity_id in (select id from clean_opps);
    delete from public.sales_opportunities where id in (select id from clean_opps);
    delete from public.documents where id in (select id from clean_docs);
    delete from public.jobs where id in (select id from clean_jobs);
    delete from public.crew_job_people where job_id in (select id from clean_crew_jobs);
    delete from public.crew_job_phases where job_id in (select id from clean_crew_jobs);
    delete from public.checklists where job_id in (select id from clean_crew_jobs);
    delete from public.job_aliases where job_id in (select id from clean_crew_jobs);
    delete from public.job_history where crew_job_id in (select id from clean_crew_jobs);
    delete from public.crew_jobs where id in (select id from clean_crew_jobs);
    delete from public.client_contacts
      where client_id in (select id from clean_clients)
        and not exists (select 1 from public.jobs j where j.client_id = public.client_contacts.client_id)
        and not exists (select 1 from public.sales_opportunities o where o.client_id = public.client_contacts.client_id);
    delete from public.clients
      where id in (select id from clean_clients)
        and not exists (select 1 from public.jobs j where j.client_id = public.clients.id)
        and not exists (select 1 from public.sales_opportunities o where o.client_id = public.clients.id);
    commit;
  `);
}
