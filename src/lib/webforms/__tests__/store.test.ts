import { beforeEach, describe, expect, it, vi } from "vitest";

const { insert, broken } = vi.hoisted(() => ({ insert: vi.fn(), broken: { on: false } }));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => {
    if (broken.on) throw new Error("no database");
    return { from: () => ({ insert }) };
  },
}));

import { keepSubmission } from "../store";

beforeEach(() => {
  broken.on = false;
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
