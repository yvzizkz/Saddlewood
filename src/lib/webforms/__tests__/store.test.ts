import { beforeEach, describe, expect, it, vi } from "vitest";

const { insert, broken, read } = vi.hoisted(() => ({ insert: vi.fn(), broken: { on: false }, read: { rows: [] as { status: string; created_at: string }[], error: null as { message: string } | null } }));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => {
    if (broken.on) throw new Error("no database");
    const chain = { select: () => chain, in: () => chain, gte: () => chain, order: () => chain, limit: async () => ({ data: read.rows, error: read.error }) };
    return { from: () => ({ insert, ...chain }) };
  },
}));

import { applicationsWaiting, keepSubmission, listApplications } from "../store";

beforeEach(() => {
  broken.on = false;
  read.rows = [];
  read.error = null;
  insert.mockReset().mockResolvedValue({ error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("keepSubmission", () => {
  it("keeps it, trimmed and bounded, because the forms are public", async () => {
    expect(await keepSubmission({ form: "contact", name: "  Ana  ", email: "a@x.com", phone: 4805550123, summary: "x".repeat(9000) })).toBe(true);
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({ form: "contact", name: "Ana", email: "a@x.com", phone: "" });
    expect(row.summary).toHaveLength(8000);
  });

  it("answers false instead of throwing, so the form's other channels still count", async () => {
    insert.mockResolvedValue({ error: { message: "relation does not exist" } });
    expect(await keepSubmission({ form: "careers", summary: "s" })).toBe(false);
    broken.on = true;
    expect(await keepSubmission({ form: "careers", summary: "s" })).toBe(false);
  });
});

describe("listApplications", () => {
  it("reads as none, not a crash, before 0067 is applied", async () => {
    read.error = { message: 'relation "web_submissions" does not exist' };
    expect(await listApplications()).toEqual([]);
    expect(await applicationsWaiting()).toBe(0);
    expect(console.error).toHaveBeenCalled();
  });

  it("counts the ones nobody has closed", async () => {
    read.rows = [
      { status: "new", created_at: "2026-11-01T00:00:00Z" },
      { status: "dismissed", created_at: "2026-11-01T00:00:00Z" },
    ];
    expect(await listApplications()).toHaveLength(2);
    expect(await applicationsWaiting()).toBe(1);
  });
});
