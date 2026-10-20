import { describe, expect, it, vi } from "vitest";

const { fromMock, getViewerMock, viewerIsOwnerMock, getJobRefMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getViewerMock: vi.fn(),
  viewerIsOwnerMock: vi.fn(),
  getJobRefMock: vi.fn(),
}));

vi.mock("@/lib/crew/auth", () => ({
  getViewer: getViewerMock,
  viewerIsOwner: viewerIsOwnerMock,
}));
vi.mock("@/lib/jobs/hub", () => ({
  getJobRef: getJobRefMock,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

import { PATCH, POST } from "../route";

describe("POST/PATCH /api/field — punch items", () => {
  it("allows creating two open punches on the same job with source = '' (bypassing work_items_source_uidx)", async () => {
    getViewerMock.mockResolvedValue({ kind: "staff", email: "lando@saddlewoodcontracting.com" });
    viewerIsOwnerMock.mockResolvedValue(true);
    getJobRefMock.mockResolvedValue({
      key: "9146-w-hutton-dr",
      name: "9146 W Hutton Dr",
      crewId: "9146-w-hutton-dr",
      billingId: "20000000-0000-0000-0000-000000000001",
    });

    const inserted: Record<string, unknown>[] = [];
    let nextId = 500;
    fromMock.mockImplementation((table: string) => {
      if (table === "work_items") {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                // Simulate work_items_source_uidx: unique (source) WHERE source <> '' AND status = 'open'
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

    const req1 = new Request("http://localhost/api/field", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "punch.add",
        job: "9146-w-hutton-dr",
        title: "Touch up corner bead at kitchen island",
        location: "Kitchen",
      }),
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);

    const req2 = new Request("http://localhost/api/field", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "punch.add",
        job: "9146-w-hutton-dr",
        title: "Skim coat nick at hallway soffit",
        location: "Hallway",
      }),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);

    expect(inserted).toHaveLength(2);
    expect(inserted[0].source).toBe("");
    expect(inserted[1].source).toBe("");
  });

  it("writes done_at and done_by (not completed_at/completed_by) when closing or dropping a punch", async () => {
    getViewerMock.mockResolvedValue({ kind: "staff", email: "lando@saddlewoodcontracting.com" });
    viewerIsOwnerMock.mockResolvedValue(true);

    const updates: { id: number; patch: Record<string, unknown> }[] = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "work_items") {
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: async (_col: string, id: number) => {
              if ("completed_at" in patch || "completed_by" in patch) {
                return { error: { message: "column completed_at of relation work_items does not exist" } };
              }
              updates.push({ id, patch });
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const closeRes = await PATCH(
      new Request("http://localhost/api/field", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "punch.status", id: 501, status: "done" }),
      }),
    );
    expect(closeRes.status).toBe(200);
    expect(updates[0].id).toBe(501);
    expect(updates[0].patch.status).toBe("done");
    expect(typeof updates[0].patch.done_at).toBe("string");
    expect(updates[0].patch.done_by).toBe("lando@saddlewoodcontracting.com");
    expect(updates[0].patch).not.toHaveProperty("completed_at");
    expect(updates[0].patch).not.toHaveProperty("completed_by");

    const dropRes = await PATCH(
      new Request("http://localhost/api/field", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "punch.status", id: 502, status: "dropped" }),
      }),
    );
    expect(dropRes.status).toBe(200);
    expect(updates[1].patch.status).toBe("dropped");
    expect(typeof updates[1].patch.done_at).toBe("string");
    expect(updates[1].patch.done_by).toBe("lando@saddlewoodcontracting.com");
  });
});
