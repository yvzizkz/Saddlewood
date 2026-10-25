// Who can open what (plan Phase 3 step 4, docs/SCENARIOS.md "Who can open
// what"): every seat against every app section and the main write APIs, in one
// grid. A page is "open" (it renders where it was asked), "home" (sent back to
// /app), or moved to another page ("→/app/…"). Each page is read once its
// client fetches settle (networkidle). A seat without money sees no dollar
// figure on anything it opens, except an office seat on its own work: the
// pipeline and rates on Sales, and the dollar limits written in Policies. The writes are probed with an empty body,
// so a seat that may write gets a 400 and nothing changes; a seat that may not
// is refused before the body is read.
//
// The finance and sales admin rows are an office person who is not an owner:
// locally Ilene is an owner, so the run makes her a "requester" holding the
// Finance seat, then the Sales seat, and puts both back after. The field lead
// is the local crew lead on one job. Local stack only (support/env.ts).

import { execSync } from "node:child_process";

import { expect, signIn, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();
const DOLLARS = /\$\s?\d/;

const JOB = "8009-n-ironwood-dr";
const OFFICE = "ilene8a@gmail.com";
const LEAD = "tacho.framing@example.com";

type Seat = "owner" | "finance" | "sales" | "pm" | "field_lead" | "crew";
// `dollars`: true for a seat with money; otherwise the only pages where a dollar figure may show.
const OFFICE_DOLLARS = ["/app/sales", "/app/sales/settings", "/app/policies"];
const SEATS: { seat: Seat; email: string; crew: boolean; dollars: true | string[] }[] = [
  { seat: "owner", email: "lando@saddlewoodcontracting.com", crew: false, dollars: true },
  { seat: "finance", email: OFFICE, crew: false, dollars: OFFICE_DOLLARS },
  { seat: "sales", email: OFFICE, crew: false, dollars: OFFICE_DOLLARS },
  { seat: "pm", email: "eli.pm@example.com", crew: true, dollars: true },
  // Finding 3 (docs/SCENARIOS.md): the lead group's Crew page lists receipts with their amounts. Open, the owner's call.
  { seat: "field_lead", email: LEAD, crew: true, dollars: ["/app/crew"] },
  { seat: "crew", email: "jesus.paint@example.com", crew: true, dollars: [] },
];

const O = "open";
const H = "home";
// Columns: owner, finance, sales, pm, field_lead, crew.
const PAGES: [string, string[]][] = [
  ["/app", [O, O, O, O, O, O]],
  ["/app/jobs", [O, H, H, O, O, H]],
  [`/app/jobs/${JOB}`, [O, H, H, O, O, H]],
  // A field lead asking for the Money tab gets the job page with no money on it.
  [`/app/jobs/${JOB}?tab=money`, [O, H, H, O, O, H]],
  [`/app/jobs/${JOB}?tab=schedule`, [O, H, H, O, O, H]],
  ["/app/tasks", [O, H, H, O, O, H]],
  ["/app/schedule", [O, H, H, O, O, H]],
  // Gap (docs/SCENARIOS.md): an office Finance seat who is not an owner has no Accounting.
  ["/app/accounting", [O, H, H, O, H, H]],
  ["/app/accounting/payroll", [O, H, H, O, H, H]],
  ["/app/accounting/purchases", [O, H, H, O, H, H]],
  ["/app/accounting/payables", [O, H, H, H, H, H]],
  ["/app/accounting/receivables", [O, H, H, O, H, H]],
  ["/app/accounting/billing", [O, H, H, O, H, H]],
  ["/app/accounting/job-costing", [O, H, H, H, H, H]],
  ["/app/money", ["→/app/accounting/receivables", H, H, "→/app/accounting/receivables", H, H]],
  ["/app/subs", [O, O, O, H, H, H]],
  ["/app/sales", [O, O, O, H, H, H]],
  ["/app/sales/settings", [O, O, O, H, H, H]],
  ["/app/policies", [O, O, O, H, H, H]],
  ["/app/policies/rights", [O, H, H, H, H, H]],
  ["/app/departments", [O, H, H, H, H, H]],
  ["/app/projects", [O, O, O, O, H, H]],
  ["/app/duties", [O, O, O, H, H, H]],
  ["/app/bill", [O, H, H, H, H, H]],
  ["/app/ask", [O, O, O, H, H, H]],
  ["/app/crew", [O, H, H, O, O, H]],
  ["/app/week", ["→/app/crew", H, H, O, O, O]],
  ["/app/hours", ["→/app/crew", H, H, O, O, O]],
  ["/app/more", [O, O, O, O, O, O]],
];

// Reads, and writes with an empty body: 2xx/400 is let in, 401/403/404 refused.
const IN = "in";
const NO = "no";
const APIS: [string, string, string[]][] = [
  ["GET", "/api/tasks/mine", [IN, NO, NO, IN, IN, NO]],
  ["GET", `/api/jobs/${JOB}/progress`, [IN, NO, NO, IN, NO, NO]],
  ["POST", "/api/tasks", [IN, NO, NO, IN, IN, NO]],
  ["POST", "/api/schedule", [IN, NO, NO, IN, IN, NO]],
  ["PATCH", "/api/accounting/payables", [IN, NO, NO, NO, NO, NO]],
  ["PUT", "/api/policies", [IN, NO, NO, NO, NO, NO]],
  ["PUT", "/api/sales/settings", [IN, NO, NO, NO, NO, NO]],
  ["PATCH", "/api/roles/seats", [IN, NO, NO, NO, NO, NO]],
];

let people = "";
let seats = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  people = sql("select data::text from public.bot_state where key = 'people'");
  seats = sql("select json_agg(json_build_object('role', role, 'holder', holder))::text from public.role_seats");
  sql(`update public.bot_state set data = jsonb_set(data, '{${OFFICE},role}', '"requester"') where key = 'people'`);
  sql(`update public.role_seats set holder = '${LEAD}' where role = 'field_lead'`);
  sql(`insert into public.crew_job_people (job_id, email, role, created_by) values ('${JOB}', '${LEAD}', 'supervisor', 'e2e') on conflict do nothing`);
});

test.afterAll(() => {
  // The seats and the office person's role first: whatever else failed, they go back.
  for (const s of JSON.parse(seats) as { role: string; holder: string }[]) {
    sql(`update public.role_seats set holder = '${s.holder.replace(/'/g, "''")}' where role = '${s.role}'`);
  }
  sql(`update public.bot_state set data = '${people.replace(/'/g, "''")}'::jsonb where key = 'people'`);
  sql(`delete from public.crew_job_people where job_id = '${JOB}' and email = '${LEAD}' and created_by = 'e2e'`);
});

test.describe("Who can open what", () => {
  SEATS.forEach(({ seat, email, crew, dollars }, col) => {
    test(`${seat}: pages, money and writes`, async ({ browser }) => {
      test.setTimeout(300_000);
      if (seat === "finance") sql(`update public.role_seats set holder = 'Ilene' where role = 'finance'`);
      if (seat === "sales") {
        sql(`update public.role_seats set holder = '' where role = 'finance'`);
        sql(`update public.role_seats set holder = 'Ilene' where role = 'sales'`);
      }
      const ctx = await browser.newContext();
      await signIn(ctx, email, { crew });
      const page = await ctx.newPage();

      const got: string[] = [];
      for (const [path, want] of PAGES) {
        await page.goto(path, { waitUntil: "networkidle", timeout: 60_000 });
        const at = new URL(page.url());
        const asked = new URL(path, page.url());
        const cell = at.pathname === asked.pathname ? O : at.pathname === "/app" ? H : `→${at.pathname}`;
        got.push(`${path} ${cell}`);
        expect.soft(cell, `${seat} ${path}`).toBe(want[col]);
        if (dollars !== true && cell !== H && !dollars.includes(path)) {
          const text = await page.locator("main").first().innerText({ timeout: 5000 }).catch(() => page.locator("body").innerText({ timeout: 5000 }));
          expect.soft(text, `${seat} ${path}: no dollars`).not.toMatch(DOLLARS);
        }
      }

      for (const [method, path, want] of APIS) {
        const res = await page.request.fetch(path, { method, data: method === "GET" ? undefined : {} });
        const cell = res.status() < 300 || res.status() === 400 ? IN : NO;
        got.push(`${method} ${path} ${res.status()}`);
        expect.soft(cell, `${seat} ${method} ${path} (${res.status()})`).toBe(want[col]);
      }
      await test.info().attach(`${seat}.txt`, { body: got.join("\n"), contentType: "text/plain" });
      await ctx.close();
    });
  });
});
