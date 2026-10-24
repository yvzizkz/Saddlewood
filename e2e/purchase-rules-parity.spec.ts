// The purchase rules live in two places by necessity (cleanup Batch 4): the
// trip key is a generated column in the database (0044) and a function the
// site groups incoming lines with (tripKey); the trade lookup runs in the
// site when lines arrive (tradeFor) and in SQL when a register alias relinks
// them (purchases_relink, 0042). This holds each pair to the same answers on
// this worktree's local database. Rows are removed after.

import { execSync } from "node:child_process";

import { tradeFor, tripKey, type TradeRule } from "../src/lib/crew/purchases";
import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

test.describe("Purchase rules: the site and the database agree", () => {
  test("trip key and trade come out the same in TypeScript and SQL", async () => {
    const n = Date.now().toString().slice(-7);
    const keys = [`hd:20240301:674:0:6220:${n}`, `hd:20240301:674:0:${n}`, `app:${n}`, `app:${n}x:1`, `plain${n}`, `:${n}`, `zelle:${n}:a:b`];
    const rules = sql("select coalesce(json_agg(json_build_object('department', department, 'class', class, 'trade', trade)), '[]') from public.trade_map");
    const map = JSON.parse(rules) as TradeRule[];
    const depts = [...new Set(map.map((r) => r.department))];
    const cases: [string, string][] = [
      ...map.map((r): [string, string] => [r.department, r.class]),
      ...depts.map((d): [string, string] => [d, "NOT A CLASS"]),
      ...depts.slice(0, 3).map((d): [string, string] => [d.toLowerCase(), ""]),
      ["NO SUCH DEPARTMENT", ""],
      ["", ""],
    ];
    const jobKey = `e2e parity ${n}`;
    try {
      keys.forEach((k, i) =>
        sql(`insert into public.purchases (source, source_key, purchased_on, description, job_key) values ('hd', ${lit(k)}, '2024-03-01', 'E2E parity ${n}', ${lit(`${jobKey} key ${i}`)})`),
      );
      for (const k of keys) expect(sql(`select trip_key from public.purchases where source_key = ${lit(k)}`), k).toBe(tripKey(k));

      cases.forEach(([d, c], i) =>
        sql(`insert into public.purchases (source, source_key, purchased_on, description, department, class, job_key) values ('hd', ${lit(`e2e-parity:${n}:${i}`)}, '2024-03-01', 'E2E parity ${n}', ${lit(d)}, ${lit(c)}, ${lit(jobKey)})`),
      );
      sql(`select public.purchases_relink(${lit(jobKey)}, null)`);
      cases.forEach(([d, c], i) => {
        expect(sql(`select trade from public.purchases where source_key = ${lit(`e2e-parity:${n}:${i}`)}`), `${d} / ${c}`).toBe(tradeFor(map, d, c));
      });
    } finally {
      sql(`delete from public.purchases where description = 'E2E parity ${n}'`);
    }
  });
});
