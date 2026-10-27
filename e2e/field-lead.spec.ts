// The field-lead seat (plan Phase 2 step 10, jobs/access.ts): a crew lead
// without money.view who holds the Field lead seat opens My jobs and Tasks
// for the jobs they are on, closes the field lead's work there, and sees no
// money anywhere. The seat and the job assignment are set for the run and put
// back after. Local stack only (support/env.ts); synthetic rows titled E2E.

import { execSync } from "node:child_process";
import type { Page } from "@playwright/test";

import { expect, OWNER, PM, signIn, test as base } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

const LEAD = "tacho.framing@example.com";
const JOB = "8009-n-ironwood-dr";
const CREW = "jesus.paint@example.com";
const n = Date.now();
const DOLLARS = /\$\s?\d/;

let before = "";
let mine = "";
let other = "";
let pmFree = "";
const extra: string[] = [];
const extraSched: string[] = [];

const test = base.extend<{ lead: Page }>({
  lead: async ({ context, page }, provide) => {
    await signIn(context, LEAD, { crew: true });
    await provide(page);
  },
});

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  before = sql("select holder from public.role_seats where role = 'field_lead'");
  sql(`update public.role_seats set holder = '${LEAD}' where role = 'field_lead'`);
  sql(`insert into public.crew_job_people (job_id, email, role, created_by) values ('${JOB}', '${LEAD}', 'supervisor', 'e2e') on conflict do nothing`);
  mine = sql(`insert into public.work_items (title, role, crew_job_id, created_by) values ('E2E field lead ${n}', 'field_lead', '${JOB}', 'e2e') returning id`);
  // Field-lead work on a job they are not on.
  other = sql(`insert into public.work_items (title, role, crew_job_id, created_by) values ('E2E field lead other ${n}', 'field_lead', '9146-w-hutton-dr', 'e2e') returning id`);
  // The PM's own work with no job, with dollars in it (chr(36) is "$", kept out of the shell): not the field's.
  pmFree = sql(`insert into public.work_items (title, detail, role, created_by) values ('E2E PM no job ${n}', 'Chase the ' || chr(36) || '4,800 deposit', 'pm', 'e2e') returning id`);
});

test.afterAll(() => {
  // The seat first: whatever else failed, the Field lead seat goes back.
  sql(`update public.role_seats set holder = '${before.replace(/'/g, "''")}' where role = 'field_lead'`);
  sql(`delete from public.crew_job_people where job_id = '${JOB}' and email = '${LEAD}'`);
  if (extraSched.length) sql(`update public.schedule_items set status = 'cancelled' where id in (${extraSched.join(", ")})`);
  const ids = [mine, other, pmFree, ...extra].filter(Boolean);
  if (ids.length) sql(`update public.work_items set status = 'dropped', done_by = 'e2e' where id in (${ids.join(", ")}) and status = 'open'`);
});

test.describe("Field lead: their jobs and tasks, no money", () => {
  test("More opens My jobs and Tasks for them", async ({ lead: page }) => {
    const me = await (await page.request.get("/api/crew/me")).json();
    expect(me.me.fieldLead).toBe(true);
  });

  test("My jobs lists only the job they are on, with no dollars", async ({ lead: page }) => {
    expect((await page.goto("/app/jobs"))?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "My jobs" })).toBeVisible();
    const rows = page.locator('[data-table="jobs-field"] tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("8009 N Ironwood");
    expect(await page.locator("main").innerText()).not.toMatch(DOLLARS);
  });

  test("the job page has no money tabs and no dollars on the tabs it has", async ({ lead: page }) => {
    await page.goto(`/app/jobs/${JOB}`);
    const tabs = await page.getByRole("navigation", { name: "Job sections" }).getByRole("link").allTextContents();
    expect(tabs.join(" ")).toContain("Tasks");
    for (const t of ["Money", "Purchases", "Documents"]) expect(tabs.join(" ")).not.toContain(t);
    for (const tab of ["overview", "schedule", "log", "labor", "subs", "changes", "tasks", "crew"]) {
      expect((await page.goto(`/app/jobs/${JOB}?tab=${tab}`))?.status(), tab).toBe(200);
      expect(await page.locator("main").innerText(), tab).not.toMatch(DOLLARS);
    }
    // Asking for the Money tab lands on the overview.
    await page.goto(`/app/jobs/${JOB}?tab=money`);
    expect(await page.locator("main").innerText()).not.toMatch(DOLLARS);
  });

  test("the PM on the same job still sees its money", async ({ browser }) => {
    const ctx = await browser.newContext();
    await signIn(ctx, PM, { crew: true });
    const pm = await ctx.newPage();
    await pm.goto(`/app/jobs/${JOB}`);
    expect(await pm.locator("main").innerText()).toMatch(DOLLARS);
    const tabs = await pm.getByRole("navigation", { name: "Job sections" }).getByRole("link").allTextContents();
    expect(tabs.join(" ")).toContain("Money");
    await ctx.close();
  });

  test("another job is not there, and the schedule of values is refused", async ({ lead: page, browser }) => {
    const ctx = await browser.newContext();
    await signIn(ctx, OWNER);
    const owner = await ctx.newPage();
    await owner.goto("/app/jobs");
    const hrefs = await owner.locator('[data-table^="jobs-"] tbody tr a[href^="/app/jobs/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    const elsewhere = hrefs.find((h) => !h.endsWith(JOB))!;
    await ctx.close();
    expect((await page.goto(elsewhere))?.status()).toBe(404);
    expect((await page.request.get(`/api/jobs/${JOB}/progress`)).status()).toBe(403);
    await page.goto("/app/accounting");
    expect(new URL(page.url()).pathname).toBe("/app");
  });

  test("Tasks shows the field lead's work under Mine, closes it, and not work on another job", async ({ lead: page }) => {
    expect((await page.goto("/app/tasks"))?.status()).toBe(200);
    await expect(page.getByText(`E2E field lead ${n}`, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`E2E field lead other ${n}`)).toHaveCount(0);
    expect(await page.locator("main").innerText()).not.toMatch(DOLLARS);
    expect((await page.request.patch("/api/tasks", { data: { id: Number(other), status: "done" } })).status()).toBe(404);
    expect((await page.request.patch("/api/tasks", { data: { id: Number(mine), status: "done" } })).status()).toBe(200);
    expect(sql(`select status || ':' || done_by from public.work_items where id = ${mine}`)).toBe(`done:${LEAD}`);
  });

  test("the PM's work with no job is not on the lead's Tasks, and the lead cannot change it", async ({ lead: page }) => {
    await page.goto("/app/tasks?view=all");
    await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
    await expect(page.getByText(`E2E PM no job ${n}`)).toHaveCount(0);
    expect(await page.locator("main").innerText()).not.toMatch(DOLLARS);
    for (const change of [{ status: "done" }, { status: "dropped" }, { status: "open" }, { role: "field_lead" }]) {
      expect((await page.request.patch("/api/tasks", { data: { id: Number(pmFree), ...change } })).status(), JSON.stringify(change)).toBe(404);
    }
    expect(sql(`select status || ':' || role from public.work_items where id = ${pmFree}`)).toBe("open:pm");
  });

  test("the PM still sees their work with no job", async ({ browser }) => {
    const ctx = await browser.newContext();
    await signIn(ctx, PM, { crew: true });
    const pm = await ctx.newPage();
    await pm.goto("/app/tasks?view=all");
    await expect(pm.getByText(`E2E PM no job ${n}`).first()).toBeVisible();
    await ctx.close();
  });

  test("Home's Your tasks counts the same Mine as Tasks", async ({ lead: page }) => {
    const fresh = sql(`insert into public.work_items (title, role, crew_job_id, created_by) values ('E2E field lead home ${n}', 'field_lead', '${JOB}', 'e2e') returning id`);
    extra.push(fresh);
    const api = await (await page.request.get("/api/tasks/mine")).json();
    expect(api.ok).toBe(true);
    await page.goto("/app");
    const card = page.getByRole("region", { name: "Your tasks" });
    await expect(card).toBeVisible();
    const count = Number(await card.getByRole("heading").locator("span").textContent());
    expect(count).toBe(api.count);
    await page.goto("/app/tasks");
    const label = await page.getByRole("group", { name: "Whose" }).getByRole("link").first().textContent();
    expect(Number(label?.match(/\((\d+)\)/)?.[1])).toBe(count);
    expect(count).toBeGreaterThan(0);
    expect(JSON.stringify(api)).not.toMatch(DOLLARS);
  });

  test("the Schedule shows their job with no dollars, and they add and cancel an item on it", async ({ lead: page }) => {
    expect((await page.goto("/app/schedule?view=month"))?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/app/schedule");
    expect(await page.locator("main").innerText()).not.toMatch(DOLLARS);
    const title = `E2E field lead inspection ${n}`;
    const day = "2026-11-03";
    const add = await page.request.post("/api/schedule", { data: { kind: "inspection", title, startDay: day, role: "field_lead", job: JOB } });
    expect(add.status()).toBe(200);
    const id = sql(`select id from public.schedule_items where title = '${title}'`);
    extraSched.push(id);
    await page.goto(`/app/schedule?view=day&day=${day}`);
    await expect(page.getByText(title).first()).toBeVisible();
    expect((await page.request.patch("/api/schedule", { data: { id: Number(id), status: "cancelled" } })).status()).toBe(200);
    // Not on a job they are not on, and not company-wide.
    expect((await page.request.post("/api/schedule", { data: { kind: "inspection", title, startDay: "2026-11-02", role: "field_lead", job: "9146-w-hutton-dr" } })).status()).toBe(404);
    expect((await page.request.post("/api/schedule", { data: { kind: "inspection", title, startDay: "2026-11-02", role: "field_lead" } })).status()).toBe(404);
  });

  test("crew who hold no seat still have no Tasks or job pages", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await signIn(ctx, CREW, { crew: true });
    const p = await ctx.newPage();
    for (const path of ["/app/jobs", "/app/tasks", `/app/jobs/${JOB}`]) {
      await p.goto(path);
      expect(new URL(p.url()).pathname, path).toBe("/app");
    }
    await ctx.close();
  });
});
