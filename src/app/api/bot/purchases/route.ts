import { NextRequest, NextResponse } from "next/server";

import { requireBridge, unauthorized } from "@/lib/bot/auth";
import { listAliases, listTradeMap, upsertPurchases } from "@/lib/crew/purchaseQueries";
import { MAX_PURCHASE_LINES, linkLines, purchaseLineSchema, type PurchaseLine } from "@/lib/crew/purchases";

// The Mac's door for Home Depot purchases (Saddlewood-KB, the Pro Xtra
// history). OPS_AGENT_TOKEN only, like /api/bot/crew; a portal session is
// refused. Safe to send twice: every line is upserted on its source key.
//
//   POST  { lines: [{ source, sourceKey, purchasedOn, vendor?, store?,
//                     orderRef?, jobNameRaw?, department?, class?, sku?,
//                     description?, qty?, lineTotalCents, meta? }] }
//         up to MAX_PURCHASE_LINES a call. Strings are trimmed and clipped; a
//         line that does not parse is dropped and counted, not refused. Each
//         line gets its job from job_aliases by the normalized register name
//         and its trade from trade_map.
//   ->    { ok, upserted, linked, dropped, unmatched: [{ name, lines, cents }] }
//         `unmatched` is this post's lines on no job that nobody set aside,
//         by register name, biggest first: what "Which job is this?" will ask.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The site can be live before supabase/migrations/0022_purchases.sql is applied: say so (503), not a database error. */
function failure(e: unknown) {
  const message = (e as Error).message ?? "";
  if (/does not exist|schema cache|could not find the (table|function)/i.test(message)) {
    return NextResponse.json({ ok: false, error: "purchase tables are missing (migration 0022 is not applied)" }, { status: 503 });
  }
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
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
    const [aliases, rules] = await Promise.all([listAliases(), listTradeMap()]);
    const { rows, linked, unmatched } = linkLines(lines, aliases, rules);
    const upserted = await upsertPurchases(rows);
    return NextResponse.json({ ok: true, upserted, linked, dropped, unmatched });
  } catch (e) {
    return failure(e);
  }
}
