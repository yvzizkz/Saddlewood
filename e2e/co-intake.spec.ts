// Change-order intake (0059, docs/CO-INTAKE.md), on the AFT Jury case of
// 2026-10-30: Chris Turner's "Sheer wall change at garage" email asked for the
// shear wall and the LVL at the doors, and the day before for TV niches. The
// Mac posts the request with the agent token; each change becomes a register
// row awaiting price and a $0 draft numbered 8009-CO<n> from the start. The
// same request again changes nothing; a reworded one rewrites only a draft
// nobody touched; pricing keeps the number. Rows are removed after.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { changeOrderSequence } from "../src/lib/billing/numbering";
import { request as http } from "@playwright/test";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q.replace(/\s+/g, " "))}`, { encoding: "utf8" }).trim();
const TOKEN = /^OPS_AGENT_TOKEN=(.*)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
const JURY = "b0000001-0000-4000-8000-000000008009";
// The smallest PDF a viewer opens: what the engineer's SK8 stands in for here.
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n").toString("base64");

const items = (lvlNote = "Per Chris's markup, attached.") => [
  {
    key: "shear-wall",
    title: "Shear Wall Revision at Studio / Garage Door",
    refs: "Broderick Engineering SK8, SK9 and SK10 dated 10/29/26",
    lines: [
      { description: "Hold-Downs at Revised Shear Wall", quantity: 10, unit: "ea", note: "Ten hold-downs set in epoxy at the locations on SK8." },
      { description: "3/4\" Plywood at Hallway", note: "Hallway wall changing to paneling. Approximately ______ sq ft." },
      { description: "Materials" },
    ],
    notIncluded: [{ description: "Paneling, finishes and door supply", note: "By others" }],
  },
  {
    key: "lvl",
    title: "LVL at Door and Window Openings",
    note: lvlNote,
    lines: [{ description: "Single LVL, bottom of beam, 4 openings, about 48 LF" }, { description: "Double LVL, about 14.8 LF of run" }, { description: "Materials" }],
  },
  { key: "tv-niches", title: "TV Niches", lines: [{ description: "Master fireplace" }, { description: "Bedroom 2" }, { description: "Bedroom 3" }] },
];

test.describe("Change-order intake", () => {
  test("a client's emailed request becomes numbered $0 drafts once, and an owner's edits are never overwritten", async ({ owner: page }) => {
    expect(TOKEN.length, "OPS_AGENT_TOKEN in .env.local").toBeGreaterThanOrEqual(16);
    const ref = `e2e-co-intake-${Date.now()}`;
    const request = { sourceRef: ref, job: "8009-n-ironwood-dr", requestedBy: "Chris Turner (AFT)", requestedOn: "2026-10-30", subject: "Sheer wall change at garage", items: items() };
    const post = (body: unknown) => page.request.post("/api/change-orders/intake", { headers: { Authorization: `Bearer ${TOKEN}`, "X-Ops-Actor": "bot" }, data: body });
    const highest = () =>
      Math.max(0, ...sql(`select number from change_orders where job_id = '${JURY}' union all select number from documents where job_id = '${JURY}' and kind = 'change_order'`).split("\n").filter(Boolean).map((n) => changeOrderSequence(n) ?? 0));
    const before = highest();

    try {
      // Who may post, and what it refuses before writing anything.
      const stranger = await http.newContext({ baseURL: process.env.BASE ?? "http://localhost:3100" });
      expect((await stranger.post("/api/change-orders/intake", { data: request })).status()).toBe(401);
      await stranger.dispose();
      expect((await post({ ...request, job: "no-such-job" })).status()).toBe(404);
      expect((await post({ ...request, items: [{ ...items()[0], lines: [{ description: "x", amountCents: 100 }] }] })).status()).toBe(400);
      expect(sql(`select count(*) from change_orders where source_ref = '${ref}'`)).toBe("0");

      // The request: three changes, three rows, three drafts, numbered in a row past everything on the job.
      const first = await post(request);
      expect(first.status()).toBe(201);
      const made = (await first.json()).changeOrders as { key: string; changeOrderId: number; number: string; documentId: string; action: string; previewLink: string }[];
      expect(made.map((c) => [c.key, c.action, c.number])).toEqual([
        ["shear-wall", "created", `8009-CO${before + 1}`],
        ["lvl", "created", `8009-CO${before + 2}`],
        ["tv-niches", "created", `8009-CO${before + 3}`],
      ]);
      for (const c of made) expect(c.previewLink).toMatch(/\/d\/p\/[0-9a-f]+$/);
      const ids = made.map((c) => c.changeOrderId).join(",");
      const docs = made.map((c) => `'${c.documentId}'`).join(",");
      expect(sql(`select string_agg(source || ':' || status || ':' || coalesce(amount_cents::text, 'null') || ':' || requested_by || ':' || requested_on, ',' order by id) from change_orders where id in (${ids})`)).toBe(
        Array(3).fill("client:requested:null:Chris Turner (AFT):2026-10-30").join(","),
      );
      expect(sql(`select string_agg(d.kind || ':' || d.status || ':' || d.total_cents || ':' || (d.number = c.number)::text, ',' order by c.id) from change_orders c join documents d on d.id = c.document_id where c.id in (${ids})`)).toBe(
        Array(3).fill("change_order:draft:0:true").join(","),
      );
      expect(sql(`select string_agg(kind, ',' order by change_order_id, id) from change_order_events where change_order_id in (${ids})`)).toBe("requested,drafted,requested,drafted,requested,drafted");
      const shear = JSON.parse(sql(`select snapshot from documents where id = '${made[0].documentId}'`));
      expect(shear.billTo.attention).toBe("Chris Turner (AFT)");
      expect(shear.notIncluded).toEqual([{ description: "Paneling, finishes and door supply", note: "By others" }]);
      expect(shear.note).toContain("Per Broderick Engineering SK8, SK9 and SK10");

      // The engineer's sheet goes on its draft the way the Mac adds every file.
      const ex = await page.request.post(`/api/billing/documents/${made[0].documentId}/exhibits`, {
        headers: { Authorization: `Bearer ${TOKEN}`, "X-Ops-Actor": "bot" },
        data: { label: "SK8 Foundation Plan (Broderick, 10/29/26)", file: { filename: "SK8.pdf", content: PDF } },
      });
      expect(ex.status()).toBe(200);

      // The same request again (a retry, a re-sync): nothing new.
      const again = await post(request);
      expect(again.status()).toBe(200);
      expect(((await again.json()).changeOrders as { action: string }[]).map((c) => c.action)).toEqual(["unchanged", "unchanged", "unchanged"]);
      expect(sql(`select count(*) from change_orders where source_ref = '${ref}'`)).toBe("3");
      expect(sql(`select count(*) from documents where id in (${docs})`)).toBe("3");

      // Chris adds to the thread: the LVL note changes, and its untouched draft follows.
      const reworded = await post({ ...request, items: items("Per Chris's markup; includes the upper beam.") });
      expect(((await reworded.json()).changeOrders as { key: string; action: string }[]).map((c) => `${c.key}:${c.action}`)).toEqual(["shear-wall:unchanged", "lvl:updated", "tv-niches:unchanged"]);
      expect(JSON.parse(sql(`select snapshot from documents where id = '${made[1].documentId}'`)).note).toContain("includes the upper beam");

      // An owner rewords the TV niches draft; the next re-send leaves it as the owner left it.
      const edit = await page.request.patch(`/api/billing/documents/${made[2].documentId}`, { data: { title: "TV Niches (framing only)" } });
      expect(edit.status()).toBe(200);
      const later = items();
      later[2] = { ...later[2], lines: [...later[2].lines, { description: "Family room" }] };
      const kept = (await (await post({ ...request, items: later })).json()).changeOrders as { key: string; action: string; reason?: string }[];
      expect(kept[2]).toMatchObject({ key: "tv-niches", action: "kept", reason: "an owner has changed the draft" });
      expect(sql(`select title || ':' || jsonb_array_length(snapshot->'lines') from documents where id = '${made[2].documentId}'`)).toBe("TV Niches (framing only):3");

      // Pricing keeps the number intake gave it.
      const priced = await page.request.patch("/api/change-orders", { data: { id: made[0].changeOrderId, amountCents: 250_000, status: "priced" } });
      expect(priced.status()).toBe(200);
      expect((await priced.json()).number).toBe(made[0].number);
      // Priced now: a re-send leaves it alone.
      const after = (await (await post(request)).json()).changeOrders as { action: string; reason?: string }[];
      expect(after[0]).toMatchObject({ action: "kept", reason: "it is priced now" });
    } finally {
      // Exhibits refuse deletes (document_exhibits_guard); a test row is taken out with the guards off, locally.
      const docs = `select document_id from change_orders where source_ref = '${ref}' and document_id is not null`;
      sql(`begin; set local session_replication_role = replica;
           delete from document_exhibits where document_id in (${docs});
           delete from document_events where document_id in (${docs});
           create temp table co_docs on commit drop as ${docs};
           delete from change_orders where source_ref = '${ref}';
           delete from documents where id in (select document_id from co_docs);
           commit;`);
    }
  });
});
