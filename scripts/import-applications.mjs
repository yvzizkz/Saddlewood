#!/usr/bin/env node
// One-time: trade-partner applications that came in by email before the app
// kept them (0067) go on /app/sales/applications, dated when they came in.
//
//   node --env-file=.env.local scripts/import-applications.mjs <rows.json>
//
// Prints what it would add and writes nothing. --apply writes; a database that
// isn't this machine's also needs --production. Safe to run again: a company
// already there is skipped, and of a company's repeat applications only the
// newest goes in. Prints no contact details, and rows.json stays out of the repo.
//
// rows.json: [{ date, company, contact, email, phone, trades, summary }], with
// summary in the website form's lines ("License / ROC #: ...").

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const WINDOW_DAYS = 90; // what the page shows (src/lib/webforms/store.ts)

const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** "HPM Flooring, LLC." and "hpm flooring" are one company, and so are "Piñas" and "Pinas". */
export function companyKey(name) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(llc|l l c|inc|incorporated|co|corp|corporation|company|ltd)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const keyOf = (r) => companyKey(r.company || r.name) || r.email.toLowerCase();

/** A row as web_submissions keeps it, bounded as the form's are. */
function record(row) {
  const when = new Date(row.date);
  return {
    form: "trade_partner",
    name: text(row.contact, 200),
    email: text(row.email, 200),
    phone: text(row.phone, 40),
    company: text(row.company, 200),
    about: text(Array.isArray(row.trades) ? row.trades.join(", ") : row.trades, 300),
    summary: text(row.summary, 8000),
    status: "new",
    created_at: Number.isNaN(when.getTime()) ? "" : when.toISOString(),
  };
}

/** What goes in and what doesn't, newest first. Pure: `existing` is what the table holds. */
export function planImport(rows, existing, now = new Date()) {
  const there = new Set(existing.map((r) => keyOf({ company: r.company ?? "", name: r.name ?? "", email: r.email ?? "" })));
  const from = now.getTime() - WINDOW_DAYS * 86_400_000;
  const add = [];
  const skip = [];
  const taken = new Set();
  const newestFirst = rows.map(record).sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const r of newestFirst) {
    const key = keyOf(r);
    const why = !r.created_at || !r.summary || !key
      ? "no date, company or summary"
      : there.has(key)
        ? "already in the app"
        : taken.has(key)
          ? "a newer application from them is going in"
          : Date.parse(r.created_at) < from
            ? `older than the ${WINDOW_DAYS} days the page shows`
            : "";
    if (why) skip.push({ row: r, why });
    else {
      taken.add(key);
      add.push(r);
    }
  }
  return { add, skip };
}

const line = (r) => `${r.created_at.slice(0, 10) || "no date   "}  ${r.company || r.name || "(no company)"}  [${r.about || "no trades"}]`;

async function main(argv) {
  const file = argv.find((a) => !a.startsWith("--"));
  const apply = argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!file || !url || !key) {
    console.error("Usage: node --env-file=.env.local scripts/import-applications.mjs <rows.json> [--apply [--production]]");
    return 1;
  }
  const host = new URL(url).hostname;
  const local = host === "127.0.0.1" || host === "localhost";
  if (apply && !local && !argv.includes("--production")) {
    console.error(`${host} isn't this machine's database. Writing there needs --production as well.`);
    return 1;
  }

  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await db.from("web_submissions").select("company, name, email").eq("form", "trade_partner").limit(5000);
  if (error) {
    console.error(`web_submissions: ${error.message}`);
    return 1;
  }
  const { add, skip } = planImport(JSON.parse(readFileSync(file, "utf8")), data ?? []);

  console.log(`${host}: ${add.length} to add, ${skip.length} skipped.`);
  for (const r of add) console.log(`  add   ${line(r)}`);
  for (const s of skip) console.log(`  skip  ${line(s.row)}: ${s.why}`);
  if (!apply) {
    console.log("Nothing written. --apply writes.");
    return 0;
  }
  if (add.length) {
    const { error: failed } = await db.from("web_submissions").insert(add);
    if (failed) {
      console.error(`Nothing added: ${failed.message}`);
      return 1;
    }
  }
  console.log(`Added ${add.length}.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
