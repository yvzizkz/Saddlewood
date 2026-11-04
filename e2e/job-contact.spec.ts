// Who the job is for (docs/SCENARIOS.md): an owner gives a job with only a
// typed name a client record, adds its contact, and moves the job to another
// contact; the database mirrors them onto the job. A PM reads it and can't
// write it. Clients and jobs are seeded on the local database only and removed
// after. Contacts are never seeded: they decide who a client's documents may be
// mailed to, so they only come in through the owner's form, as here.

import { execSync } from "node:child_process";

import { PM, expect, signIn, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

const WITH_PM = "8009-n-ironwood-dr";

test.describe("Who the job is for", () => {
  test("an owner makes the client, adds the contact and changes it; the job follows", async ({ owner: page }) => {
    const n = Date.now().toString().slice(-8);
    const typed = `E2E Contact ${n} Homes`;
    const job = sql(`insert into public.jobs (name, client_name) values ('E2E ${n} Contact Way', '${typed}') returning id`);
    const read = () => sql(`select coalesce(c.name, '') || '|' || coalesce(j.client_email, '') || '|' || coalesce(j.client_phone, '') from public.jobs j left join public.clients c on c.id = j.client_id where j.id = '${job}'`);
    try {
      await page.goto(`/app/jobs/${job}`, { waitUntil: "networkidle" });
      const card = page.locator("#job-client");
      await expect(card).toContainText(`No client record yet. The job says ${typed}.`);

      // The name comes from the job; the client is made and linked.
      await expect(card.getByLabel("New client name")).toHaveValue(typed);
      await card.getByRole("button", { name: "Create client" }).click();
      await expect(card).toContainText("No contact on this job yet.");
      expect(read()).toBe(`${typed}||`);

      // A client with nobody on it: the first contact is added here.
      await card.getByRole("button", { name: "Add a contact" }).click();
      await card.getByLabel("Name").fill("Ana Reyes");
      await card.getByRole("textbox", { name: "Email" }).fill("ana.e2e@example.com");
      await card.getByLabel("Phone").fill("602-555-0101");
      await card.getByRole("button", { name: "Save contact" }).click();
      await expect(card).toContainText("Ana Reyes · ana.e2e@example.com · 602-555-0101");
      expect(read()).toBe(`${typed}|ana.e2e@example.com|602-555-0101`);

      // Someone else takes over: their details, never the last person's.
      await card.getByRole("button", { name: "Add a contact" }).click();
      await card.getByLabel("Name").fill("Ben Ortiz");
      await card.getByRole("button", { name: "Save contact" }).click();
      await expect(card).toContainText("Ben Ortiz");
      expect(read()).toBe(`${typed}||`);

      // And back again from the list.
      await card.getByLabel("Contact on this job").selectOption({ label: "Ana Reyes · ana.e2e@example.com" });
      await card.getByRole("button", { name: "Use this contact" }).click();
      await expect(card).toContainText("Ana Reyes · ana.e2e@example.com · 602-555-0101");
      expect(read()).toBe(`${typed}|ana.e2e@example.com|602-555-0101`);

      // A job's client is set once.
      const other = sql(`select id from public.clients where lower(name) <> lower('${typed}') limit 1`);
      const moved = await page.request.patch(`/api/jobs/${job}/client`, { data: { clientId: other } });
      expect(moved.status()).toBe(409);
    } finally {
      sql(`delete from public.jobs where id = '${job}'; delete from public.clients where lower(name) = lower('${typed}')`);
    }
  });

  test("a job with only a name links to a client on file, and a first contact keeps what the job has", async ({ owner: page }) => {
    const n = Date.now().toString().slice(-8);
    const client = sql(`insert into public.clients (name, kind) values ('E2E Filed ${n} LLC', 'gc') returning id`);
    const job = sql(`insert into public.jobs (name, client_name, client_email) values ('E2E ${n} Link Way', 'E2E Typed ${n}', 'kept.e2e@example.com') returning id`);
    const phoned = sql(`insert into public.jobs (name, client_id, client_phone) values ('E2E ${n} Phone Way', '${client}', '602-555-0199') returning id`);
    const read = (id: string) => sql(`select (contact_id is not null)::text || '|' || coalesce(client_email, '') || '|' || coalesce(client_phone, '') from public.jobs where id = '${id}'`);
    try {
      await page.goto(`/app/jobs/${job}`, { waitUntil: "networkidle" });
      const card = page.locator("#job-client");
      await card.getByLabel("Client on file").selectOption({ label: `E2E Filed ${n} LLC` });
      await card.getByRole("button", { name: "Link this client" }).click();
      await expect(card).toContainText("No contact on this job yet.");

      // A record with no email: linked, and the job's email stays.
      await card.getByRole("button", { name: "Add a contact" }).click();
      await card.getByLabel("Name").fill("No Details");
      await card.getByRole("button", { name: "Save contact" }).click();
      await expect(card).toContainText("No Details · kept.e2e@example.com");
      expect(read(job)).toBe("true|kept.e2e@example.com|");

      // A contact on file with an email and no phone, on a job with a phone:
      // picked from the list, the record's email comes over and the phone stays.
      await card.getByRole("button", { name: "Add a contact" }).click();
      await card.getByLabel("Name").fill("Email Only");
      await card.getByRole("textbox", { name: "Email" }).fill("only.e2e@example.com");
      await card.getByRole("button", { name: "Save contact" }).click();
      await expect(card).toContainText("Email Only · only.e2e@example.com");

      await page.goto(`/app/jobs/${phoned}`, { waitUntil: "networkidle" });
      await card.getByLabel("Contact on this job").selectOption({ label: "Email Only · only.e2e@example.com" });
      await card.getByRole("button", { name: "Use this contact" }).click();
      await expect(card).toContainText("Email Only · only.e2e@example.com · 602-555-0199");
      expect(read(phoned)).toBe("true|only.e2e@example.com|602-555-0199");
      await expect(card.getByRole("alert")).toHaveCount(0);

      // Adding that same person again uses the record: no second one, no refusal.
      await card.getByRole("button", { name: "Add a contact" }).click();
      await card.getByLabel("Name").fill("Email Only");
      await card.getByRole("textbox", { name: "Email" }).fill("only.e2e@example.com");
      await card.getByLabel("Phone").fill("480-555-0100");
      await card.getByRole("button", { name: "Save contact" }).click();
      await expect(card.getByRole("button", { name: "Add a contact" })).toBeVisible();
      await expect(card.getByRole("alert")).toHaveCount(0);
      await expect(card.getByLabel("Contact on this job").getByRole("option", { name: "Email Only" })).toHaveCount(1);
      expect(read(phoned)).toBe("true|only.e2e@example.com|602-555-0199");
    } finally {
      sql(`delete from public.jobs where id in ('${job}', '${phoned}'); delete from public.clients where id = '${client}'`);
    }
  });

  test("a PM reads who the job is for and can't change it", async ({ browser }) => {
    const ctx = await browser.newContext();
    await signIn(ctx, PM, { crew: true });
    const pm = await ctx.newPage();
    try {
      await pm.goto(`/app/jobs/${WITH_PM}`, { waitUntil: "networkidle" });
      const card = pm.locator("#job-client");
      await expect(card).toBeVisible();
      await expect(card.getByRole("button")).toHaveCount(0);
      await expect(card.getByRole("combobox")).toHaveCount(0);
      const res = await pm.request.patch(`/api/jobs/${WITH_PM}/client`, { data: { newClient: { name: "E2E never made", kind: "other" } } });
      expect(res.status()).toBe(403);
    } finally {
      await ctx.close();
    }
  });
});
