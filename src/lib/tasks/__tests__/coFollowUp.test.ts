import { describe, expect, it, vi } from "vitest";

// The follow-up clock on a sent change order (policy "co-pace"). It runs from
// the last time the change order went out: the first send, or a follow-up.
// So doing the follow-up clears the task until the next one is due. One with
// no send line on its register still runs from its document's issue day.
// Against a stand-in for the three tables loadChangeOrders reads.

type Row = Record<string, unknown>;

const { db } = vi.hoisted(() => ({ db: { tables: {} as Record<string, Row[]>, reads: [] as string[] } }));

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  db.reads.push(table);
  const b = {
    select: () => b,
    eq(col: string, v: unknown) {
      filters.push((r) => r[col] === v);
      return b;
    },
    neq(col: string, v: unknown) {
      filters.push((r) => r[col] !== v);
      return b;
    },
    order: () => b,
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }).then(ok),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));

import { loadChangeOrders } from "@/lib/billing/registers";
import { changeOrderItems } from "../feed";

const PACE = { priceWithinDays: 2, followUpDays: 5 };
const TODAY = "2026-11-02";
const co = (id: number, doc: string) => ({ id, job_id: null, crew_job_id: null, number: `8009-CO${id}`, title: "Shear wall", status: "sent", amount_cents: 300050, requested_on: "2026-10-10", document_id: doc, billed_document_id: null, source: "client" });

async function followUps(events: Row[]) {
  db.reads = [];
  db.tables = {
    change_orders: [co(1, "doc-1"), co(2, "doc-2")],
    // Both went out on October 15: 18 days ago, far past 5 days and the 2-day grace.
    documents: [
      { id: "doc-1", number: "8009-CO1", title: "Shear wall", job_id: null, status: "issued", total_cents: 300050, issued_at: "2026-10-15T17:00:00Z", kind: "change_order" },
      { id: "doc-2", number: "8009-CO2", title: "Shear wall", job_id: null, status: "issued", total_cents: 300050, issued_at: "2026-10-15T17:00:00Z", kind: "change_order" },
    ],
    change_order_events: events,
  };
  const cos = await loadChangeOrders([], TODAY);
  return Object.fromEntries(changeOrderItems(cos, PACE, TODAY).map((i) => [i.id, i]));
}

describe("the follow-up clock on a sent change order", () => {
  it("restarts from a follow-up: due five days after it, not overdue, not escalated", async () => {
    const items = await followUps([
      { change_order_id: 1, kind: "sent", at: "2026-10-15T17:00:01Z" },
      { change_order_id: 1, kind: "sent", at: "2026-11-01T16:00:00Z" }, // the follow-up, yesterday
      { change_order_id: 1, kind: "viewed", at: "2026-11-02T15:00:00Z" },
    ]);
    expect(items.co1).toMatchObject({ kind: "follow_up", since: "2026-11-01", dueOn: "2026-11-06", overdueDays: 0, escalated: false, nowRole: "decisions" });
  });

  it("without a send line it still falls due five days after its document was issued, and escalates past the grace", async () => {
    const items = await followUps([{ change_order_id: 1, kind: "sent", at: "2026-11-01T16:00:00Z" }]);
    expect(items.co2).toMatchObject({ since: "2026-10-15", dueOn: "2026-10-20", overdueDays: 13, escalated: true });
    expect(items.co2.nowRole).not.toBe("decisions");
  });

  it("reads the send lines once for every change order", async () => {
    await followUps([]);
    expect(db.reads.filter((t) => t === "change_order_events")).toHaveLength(1);
  });
});

describe("a signed change order", () => {
  const signed = { registerId: 7, status: "signed", jobKey: "8009-n-ironwood-dr", job: "8009 N Ironwood Dr", number: "8009-CO7", title: "Shear wall", amountCents: 124000, requestedOn: "2026-10-30", sentOn: null } as unknown as Parameters<typeof changeOrderItems>[0][number];

  it("tells Finance to bill it, and the task opens the job's Money tab, where it is billed", () => {
    const [item] = changeOrderItems([signed], PACE, TODAY);
    expect(item).toMatchObject({ title: "Bill 8009-CO7 Shear wall", role: "finance", href: "/app/jobs/8009-n-ironwood-dr?tab=money" });
  });
});
