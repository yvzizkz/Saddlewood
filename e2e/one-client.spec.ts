// One client record (T119, migration 0056): the client is the source of a
// job's client name, and a job written with only a name is linked to the
// client of that name. Seeded on the local database only (clients and jobs;
// no contact rows are written here), removed after.

import { execSync } from "node:child_process";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

test("A job takes its client's name, follows a rename, and links by name", async ({ owner: page }) => {
  const n = Date.now().toString().slice(-7);
  const client = sql(`insert into public.clients (name, kind) values ('E2E One ${n} LLC', 'gc') returning id`);
  // Written the way ingest_estimate writes a bid job: a name, no client.
  const job = sql(`insert into public.jobs (name, client_name) values ('E2E ${n} One Client Way', '  e2e one ${n} llc ') returning id`);
  const read = () => sql(`select coalesce(client_id::text, 'none') || '|' || coalesce(client_name, '') from public.jobs where id = '${job}'`);
  try {
    expect(read()).toBe(`${client}|E2E One ${n} LLC`);

    // A write to the mirror is the record's again.
    sql(`update public.jobs set client_name = 'Typo Builders' where id = '${job}'`);
    expect(read()).toBe(`${client}|E2E One ${n} LLC`);

    // Renaming the client moves its jobs.
    sql(`update public.clients set name = 'E2E One ${n} Inc' where id = '${client}'`);
    expect(read()).toBe(`${client}|E2E One ${n} Inc`);

    // And the job page shows the client's name.
    await page.goto(`/app/jobs/${job}`);
    await expect(page.getByText(`E2E One ${n} Inc`).first()).toBeVisible();
  } finally {
    sql(`delete from public.jobs where id = '${job}'; delete from public.clients where id = '${client}'`);
  }
});
