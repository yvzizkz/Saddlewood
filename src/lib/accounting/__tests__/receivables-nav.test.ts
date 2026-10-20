import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  orFilters: [] as string[],
  docs: [] as Record<string, unknown>[],
};

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "documents") {
        const chain: Record<string, unknown> = {
          select: () => chain,
          in: () => chain,
          neq: () => chain,
          or: (expr: string) => {
            state.orFilters.push(expr);
            return chain;
          },
          order: async () => {
            // Simulate PostgREST .or('issued_at.gte.<fromIso>,and(issued_at.is.null,created_at.gte.<fromIso>)')
            const filter = state.orFilters[state.orFilters.length - 1] ?? "";
            const m = filter.match(/issued_at\.gte\.([^,]+),and\(issued_at\.is\.null,created_at\.gte\.([^)]+)\)/);
            const fromIso = m?.[1] ?? "";
            const fromTs = fromIso ? Date.parse(fromIso) : 0;
            const filtered = state.docs.filter((d) => {
              const issuedAt = typeof d.issued_at === "string" ? Date.parse(d.issued_at) : null;
              const createdAt = typeof d.created_at === "string" ? Date.parse(d.created_at) : 0;
              if (issuedAt !== null) return issuedAt >= fromTs;
              return createdAt >= fromTs;
            });
            return { data: filtered, error: null };
          },
        };
        return chain;
      }
      if (table === "clients") {
        return {
          select: async () => ({
            data: [{ id: "c-1", name: "A Finer Touch Construction (Synthetic)" }],
            error: null,
          }),
        };
      }
      if (table === "jobs") {
        return {
          select: async () => ({
            data: [{ id: "j-1", job_number: "8009", address: "8009 N Ironwood Dr", crew_job_id: "8009-n-ironwood-dr", client_id: "c-1" }],
            error: null,
          }),
        };
      }
      if (table === "crew_jobs") {
        return {
          select: async () => ({
            data: [{ id: "8009-n-ironwood-dr", name: "8009 N Ironwood Dr (Jury AFT 123)", address: "8009 N Ironwood Dr" }],
            error: null,
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import { morePortalLinks, PORTAL } from "@/components/bot/MoreScreen";
import { phoneTabs, visibleNav } from "@/components/layout/nav";
import { loadIssued } from "../receivables";

describe("MoreScreen mobile navigation coverage (T43)", () => {
  it("lists /app/duties and every non-tab visibleNav item for owners and staff", () => {
    expect(PORTAL.some((p) => p.href === "/app/duties" && p.label === "Duties")).toBe(true);

    for (const viewer of [
      { owner: true, crewAdmin: true },
      { owner: false, crewAdmin: false },
    ]) {
      const tabs = new Set(phoneTabs(viewer).map((t) => t.href));
      const more = new Set(morePortalLinks(viewer).map((m) => m.href));
      expect(more.has("/app/duties")).toBe(true);
      for (const navItem of visibleNav(viewer)) {
        expect(tabs.has(navItem.href) || more.has(navItem.href)).toBe(true);
      }
    }
  });
});

describe("loadIssued period filter (T43)", () => {
  beforeEach(() => {
    state.orFilters = [];
    state.docs = [
      {
        id: "doc-issued-in-period",
        number: "8009-14",
        title: "Draw #14 (drafted in Sept, issued in Oct)",
        kind: "invoice",
        status: "sent",
        client_id: "c-1",
        job_id: "j-1",
        created_at: "2026-09-24T16:00:00Z",
        issued_at: "2026-10-05T18:00:00Z",
        due_date: "2026-10-20",
        total_cents: 1975000,
      },
      {
        id: "doc-draft-in-period",
        number: "",
        title: "Draft created in Oct",
        kind: "invoice",
        status: "draft",
        client_id: "c-1",
        job_id: "j-1",
        created_at: "2026-10-12T16:00:00Z",
        issued_at: null,
        due_date: null,
        total_cents: 450000,
      },
      {
        id: "doc-old-draft",
        number: "",
        title: "Old unissued Sept draft",
        kind: "invoice",
        status: "draft",
        client_id: "c-1",
        job_id: "j-1",
        created_at: "2026-09-10T16:00:00Z",
        issued_at: null,
        due_date: null,
        total_cents: 120000,
      },
    ];
  });

  it("includes a draft created before fromDay when issued_at falls inside [fromDay, toDay]", async () => {
    const rows = await loadIssued("2026-10-01", "2026-10-31");
    expect(state.orFilters).toEqual([
      "issued_at.gte.2026-10-01T00:00:00-07:00,and(issued_at.is.null,created_at.gte.2026-10-01T00:00:00-07:00)",
    ]);
    expect(rows.map((r) => r.id)).toEqual(["doc-issued-in-period", "doc-draft-in-period"]);
    expect(rows[0]?.day).toBe("2026-10-05");
    expect(rows[1]?.day).toBe("2026-10-12");
  });
});
