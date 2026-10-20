import { describe, expect, it, vi } from "vitest";

import { DEFAULT_TRADES } from "@/lib/accounting/trades";

type Row = Record<string, unknown>;

const tables: Record<string, Row[]> = {
  crew_shifts: [
    {
      id: 42,
      email: "tacho.framing@example.com",
      job_id: "8009-n-ironwood-dr",
      job_name: "8009 N Ironwood Dr",
      day: "2026-10-20",
      started_at: "2026-10-20T14:00:00.000Z",
      ended_at: "2026-10-20T22:30:00.000Z",
      break_min: 30,
      // ~111 m north of 33.5535, -111.9261
      start_geo: { lat: 33.5545, lng: -111.9261, acc: 10 },
      end_geo: { lat: 33.5535, lng: -111.9261, acc: 10 },
      note: "Furring and hang",
      source: "app",
      end_source: "app",
      review: "",
      status: "ok",
      edits: [],
      client_in: null,
      client_out: null,
      trade: "drywall",
    },
  ],
  crew_people: [
    {
      email: "tacho.framing@example.com",
      auth_id: null,
      name: 'Mateo "Tacho" Mujica',
      lang: "es",
      phone: "555-0111",
      trade: "framing",
      group_id: "lead",
      crew_groups: { name: "Lead", perms: ["clock"] },
      pay_rate: 38,
      active: true,
      added_by: "seed",
      created_at: "2026-10-01T00:00:00.000Z",
      last_seen_at: null,
    },
  ],
  crew_jobs: [
    {
      id: "8009-n-ironwood-dr",
      name: "8009 N Ironwood Dr",
      address: "8009 N Ironwood Dr",
      note: "",
      active: true,
      promised: null,
      promise_note: "",
      geo: { lat: 33.5535, lng: -111.9261, source: "owner", at: "2026-10-01T00:00:00.000Z" },
    },
  ],
  trades: DEFAULT_TRADES.map((t, i) => ({
    slug: t.key,
    label: t.label,
    cost_code: t.code,
    sort_order: i + 1,
    active: true,
  })),
};

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const b = {
    select: () => b,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    order: () => b,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("@/lib/crew/auth", () => ({
  getViewer: async () => ({ kind: "staff", email: "lando@saddlewoodcontracting.com", role: "owner" }),
  viewerIsOwner: async () => true,
}));
vi.mock("@/components/accounting/AccountingFrame", () => ({
  default: ({ children }: { children: unknown }) => children,
}));

import EntryPage from "../page";
import { getShift } from "@/lib/crew/queries";

function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  if (typeof node === "object" && "props" in (node as Record<string, unknown>)) {
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (typeof el.type === "function") {
      try {
        return collectText((el.type as (p: Record<string, unknown>) => unknown)(el.props ?? {}));
      } catch {
        // Ignore client components that use hooks
      }
    }
    return collectText(el.props?.children);
  }
  return "";
}

describe("Payroll EntryPage and toShift trade/distance", () => {
  it("maps shift.trade in getShift/toShift and renders the shift's override trade and clock-in distance on EntryPage", async () => {
    const shift = await getShift(42);
    expect(shift?.trade).toBe("drywall");

    const tree = await EntryPage({ params: Promise.resolve({ id: "42" }) });
    const text = collectText(tree);

    // Shift override trade ('drywall' -> 'Drywall') wins over person default trade ('framing' -> 'Framing')
    expect(text).toContain("Trade Drywall");
    expect(text).not.toContain("Trade Framing");

    // Clock-in distance computed via withJobDistance (~111 m) renders
    expect(text).toMatch(/Clock-in distance\s+111\s+m from the job/);
  });
});
