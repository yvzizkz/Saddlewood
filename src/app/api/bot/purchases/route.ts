import { NextRequest, NextResponse } from "next/server";

import { requireBridge, unauthorized } from "@/lib/bot/auth";
import { listAliases, listTradeMap, upsertPurchases } from "@/lib/crew/purchaseQueries";
import { SEARCH_MAX_QUERY, SEARCH_MAX_TRIPS, missingSearch, searchPurchases } from "@/lib/crew/purchaseSearch";
import { MAX_PURCHASE_LINES, TRADES, linkLines, purchaseLineSchema, type PurchaseLine } from "@/lib/crew/purchases";
import { listJobs } from "@/lib/crew/queries";
import { isDay } from "@/lib/crew/time";

// The Mac's door for Home Depot purchases (Saddlewood-KB, the Pro Xtra
// history). OPS_AGENT_TOKEN only, like /api/bot/crew; a portal session is
// refused. Safe to send twice: every line is upserted on its source key.
//
//   POST  { lines: [{ source, sourceKey, purchasedOn, vendor?, store?,
//                     orderRef?, jobNameRaw?, department?, class?, sku?,
//                     description?, qty?, lineTotalCents, jobId?, meta? }] }
//         up to MAX_PURCHASE_LINES a call. Strings are trimmed and clipped; a
//         line that does not parse is dropped and counted, not refused. Each
//         line gets its job from its own jobId (a receipt filed in the app:
//         source "app", sourceKey "app:<entryId>") when that is a job, else
//         from job_aliases by the normalized register name, else from a
//         register name that is a job's name or id; and its trade from
//         trade_map.
//   ->    { ok, upserted, linked, dropped, unmatched: [{ name, lines, cents }] }
//         `unmatched` is this post's lines on no job that nobody set aside,
//         by register name, biggest first: what "Which job is this?" will ask.
//
//   GET   ?q=<words>&job=&trade=&from=&to=&limit=   find a purchase for an
//         owner who asked the bot (migration 0026). The Mac sees every job.
//         Same answer as GET /api/crew/purchases/search:
//   ->    { ok, trips, total, took, filters }

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CREW_ID = /^[A-Za-z0-9-]{1,60}$/;

/** The site can be live before a migration is applied: say so (503), not a database error. */
function failure(e: unknown, migration: string) {
  if (missingSearch(e)) {
    return NextResponse.json({ ok: false, error: `purchase tables are missing (migration ${migration} is not applied)` }, { status: 503 });
  }
  return NextResponse.json({ ok: false, error: (e as Error).message ?? "" }, { status: 500 });
}

export async function POST(request: NextRequest) {
  if (!(await requireBridge(request))) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const sent = (body as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(sent)) return NextResponse.json({ ok: false, error: "lines must be an array" }, { status: 400 });
  if (sent.length > MAX_PURCHASE_LINES) {
    return NextResponse.json({ ok: false, error: `at most ${MAX_PURCHASE_LINES} lines a call` }, { status: 400 });
  }
  const lines: PurchaseLine[] = [];
  for (const raw of sent) {
    const parsed = purchaseLineSchema.safeParse(raw);
    if (parsed.success) lines.push(parsed.data);
  }
  const dropped = sent.length - lines.length;
  try {
    const [aliases, rules, jobs] = await Promise.all([listAliases(), listTradeMap(), listJobs()]);
    const { rows, linked, unmatched } = linkLines(lines, aliases, rules, jobs.filter((j) => j.active));
    const upserted = await upsertPurchases(rows);
    return NextResponse.json({ ok: true, upserted, linked, dropped, unmatched });
  } catch (e) {
    return failure(e, "0022");
  }
}

export async function GET(request: NextRequest) {
  if (!(await requireBridge(request))) return unauthorized();
  const p = new URL(request.url).searchParams;
  const q = (p.get("q") ?? "").trim().slice(0, SEARCH_MAX_QUERY);
  if (!q) return NextResponse.json({ ok: false, error: "q is required" }, { status: 400 });
  const job = (p.get("job") ?? "").trim();
  const trade = (p.get("trade") ?? "").trim();
  const from = (p.get("from") ?? "").trim();
  const to = (p.get("to") ?? "").trim();
  const limit = Number(p.get("limit") ?? SEARCH_MAX_TRIPS);
  if (job && !CREW_ID.test(job)) return NextResponse.json({ ok: false, error: "job must be a field job id" }, { status: 400 });
  if (trade && !(TRADES as readonly string[]).includes(trade)) return NextResponse.json({ ok: false, error: `trade must be one of ${TRADES.join(", ")}` }, { status: 400 });
  if ((from && !isDay(from)) || (to && !isDay(to))) return NextResponse.json({ ok: false, error: "from and to are YYYY-MM-DD" }, { status: 400 });
  try {
    const result = await searchPurchases({ q, jobIds: null, jobId: job || null, trade, from: from || null, to: to || null, limit: Number.isFinite(limit) ? limit : SEARCH_MAX_TRIPS });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e, "0026");
  }
}
