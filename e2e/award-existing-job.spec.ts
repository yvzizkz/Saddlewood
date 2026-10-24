// Award on a job that already exists with its own client details and no
// contact (0058, Ship's review of #60). Award adds the person typed on the lead
// (a name, no email or phone) and links the job to them; the job's own email
// and phone must stand, not be wiped by the record's empty ones.
// Local stack only (support/env.ts).

import { execSync } from "node:child_process";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

test("Award linking an existing job to a contact with no email or phone keeps the job's", async ({ owner: page }) => {
  const uid = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
  const jobName = `8${uid.slice(0, 4)} E Mirror Ln`;
  const address = `${jobName}, Scottsdale, AZ 85251`;
  const company = `Mirror Homes ${uid} (Synth)`;
  const email = `own.${uid}@example.com`;
  const jobId = sql(`insert into public.jobs (name, address, client_email, client_phone) values ('${jobName}', '${address}', '${email}', '480-555-0177') returning id`).split("\n")[0];

  let oppId = "";
  try {
    const oppRes = await page.request.post("/api/sales", {
      data: { title: `Mirror ${uid} remodel`, kind: "remodel", source: "referral", address, valueCents: 2_500_000, contact: { name: `Dana ${uid}`, company, email: "", phone: "" } },
    });
    expect(oppRes.status()).toBe(201);
    oppId = (await oppRes.json()).opportunity.id;
    expect((await page.request.patch(`/api/sales/${oppId}`, { data: { stage: "won", why: "Signed" } })).ok()).toBeTruthy();

    const awardRes = await page.request.post(`/api/sales/${oppId}/award`, { data: { jobName, template: "both", deposit: false } });
    expect(awardRes.ok(), await awardRes.text()).toBeTruthy();
    expect((await awardRes.json()).jobId).toBe(jobId);

    // Linked to Dana (no email, no phone on her record), and the job's details stand.
    expect(sql(`select cc.name, cc.email, cc.phone, j.client_email, j.client_phone from public.jobs j join public.client_contacts cc on cc.id = j.contact_id where j.id = '${jobId}'`)).toBe(
      `Dana ${uid}|||${email}|480-555-0177`,
    );
  } finally {
    // Sales events are append-only, so the synthetic lead and job stay (as sales-week.spec.ts
    // leaves its own); close the watches Award opened so repeated runs don't fill the task feed.
    const detail = oppId ? await page.request.get(`/api/sales/${oppId}`) : null;
    for (const w of detail?.ok() ? ((await detail.json()).job?.watches ?? []) : []) {
      await page.request.post(`/api/sales/${oppId}/watches`, { data: { id: w.id, done: true } });
    }
  }
});
