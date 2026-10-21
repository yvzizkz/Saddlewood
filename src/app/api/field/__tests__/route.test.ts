import { describe, expect, it, vi } from "vitest";

const { fromMock, workSeatMock, jobForWriteMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  workSeatMock: vi.fn(),
  jobForWriteMock: vi.fn(),
}));

vi.mock("@/lib/jobs/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jobs/access")>();
  return {
    ...actual,
    workSeat: workSeatMock,
    jobForWrite: jobForWriteMock,
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

import { PATCH, POST } from "../route";

describe("POST/PATCH /api/field — punch items & PM authorization (T44)", () => {
  it("allows creating two open punches on the same job with source = '' (bypassing work_items_source_uidx)", async () => {
    workSeatMock.mockResolvedValue({
      email: "eli@saddlewoodcontracting.com",
      owner: false,
      crewJobs: ["8009-n-ironwood-dr"],
      billingJobs: ["20000000-0000-0000-0000-000000000002"],
      laborCost: false,
      margin: false,
      sections: ["overview"],
    });
    jobForWriteMock.mockResolvedValue({
      key: "8009-n-ironwood-dr",
      name: "8009 N Ironwood Dr",
      crewId: "8009-n-ironwood-dr",
      billingId: "20000000-0000-0000-0000-000000000002",
    });

    const inserted: Record<string, unknown>[] = [];
    let nextId = 500;
    fromMock.mockImplementation((table: string) => {
      if (table === "work_items") {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                if (
                  row.source !== "" &&
                  inserted.some((r) => r.source === row.source && r.status !== "done" && r.status !== "dropped")
                ) {
                  return { data: null, error: { message: "duplicate key value violates unique constraint work_items_source_uidx" } };
                }
                inserted.push(row);
                return { data: { id: ++nextId }, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const res1 = await POST(
      new Request("http://localhost/api/field", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "punch.add",
          job: "8009-n-ironwood-dr",
          title: "Touch up corner bead at kitchen island",
          location: "Kitchen",
        }),
      }),
    );
    expect(res1.status).toBe(200);

    const res2 = await POST(
      new Request("http://localhost/api/field", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "punch.add",
          job: "8009-n-ironwood-dr",
          title: "Skim coat nick at hallway soffit",
          location: "Hallway",
        }),
      }),
    );
    expect(res2.status).toBe(200);
    expect(inserted).toHaveLength(2);
    expect(inserted[0].source).toBe("");
    expect(inserted[1].source).toBe("");
  });

  it("refuses a PM closing an owner's finance task on their own job via punch.status, while allowing closing a field_lead punch with done_at/done_by", async () => {
    workSeatMock.mockResolvedValue({
      email: "eli@saddlewoodcontracting.com",
      owner: false,
      crewJobs: ["8009-n-ironwood-dr"],
      billingJobs: ["20000000-0000-0000-0000-000000000002"],
      laborCost: false,
      margin: false,
      sections: ["overview"],
    });

    const rowsById: Record<
      number,
      { kind: string; role: string; created_by: string; job_id: string | null; crew_job_id: string | null }
    > = {
      701: {
        kind: "task",
        role: "finance",
        created_by: "lando@saddlewoodcontracting.com",
        job_id: "20000000-0000-0000-0000-000000000002",
        crew_job_id: "8009-n-ironwood-dr",
      },
      702: {
        kind: "punch",
        role: "finance",
        created_by: "lando@saddlewoodcontracting.com",
        job_id: "20000000-0000-0000-0000-000000000002",
        crew_job_id: "8009-n-ironwood-dr",
      },
      703: {
        kind: "punch",
        role: "field_lead",
        created_by: "lando@saddlewoodcontracting.com",
        job_id: "20000000-0000-0000-0000-000000000002",
        crew_job_id: "8009-n-ironwood-dr",
      },
    };

    const updates: { id: number; kindFilter: string; patch: Record<string, unknown> }[] = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "work_items") {
        return {
          select: () => ({
            eq: (_col: string, id: number) => ({
              maybeSingle: async () => ({ data: rowsById[id] ?? null, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (_c1: string, id: number) => ({
              eq: async (_c2: string, kindVal: string) => {
                updates.push({ id, kindFilter: kindVal, patch });
                return { error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    // 1. Non-punch finance task on the PM's own job -> 404 (not a punch item)
    const finTaskRes = await PATCH(
      new Request("http://localhost/api/field", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "punch.status", id: 701, status: "done" }),
      }),
    );
    expect(finTaskRes.status).toBe(404);
    expect(updates).toHaveLength(0);

    // 2. Punch row assigned to finance and created by owner -> 403
    const finPunchRes = await PATCH(
      new Request("http://localhost/api/field", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "punch.status", id: 702, status: "done" }),
      }),
    );
    expect(finPunchRes.status).toBe(403);
    expect(updates).toHaveLength(0);

    // 3. Real field_lead punch on PM's own job -> 200, writes done_at/done_by and chains .eq("kind", "punch")
    const validPunchRes = await PATCH(
      new Request("http://localhost/api/field", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "punch.status", id: 703, status: "done" }),
      }),
    );
    expect(validPunchRes.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe(703);
    expect(updates[0].kindFilter).toBe("punch");
    expect(updates[0].patch.status).toBe("done");
    expect(typeof updates[0].patch.done_at).toBe("string");
    expect(updates[0].patch.done_by).toBe("eli@saddlewoodcontracting.com");
  });
});
