import { describe, expect, it, vi } from "vitest";

// The old handler created a Supabase session for any allowlisted email. If
// this route ever reaches for the admin client again, these tests fail first.
const { adminMock } = vi.hoisted(() => ({ adminMock: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: adminMock }));

import { GET, POST } from "../route";

describe("passkey sign-in stays off", () => {
  it("refuses a login for an allowlisted address", async () => {
    const res = await POST();
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(adminMock).not.toHaveBeenCalled();
  });

  it("answers GET the same way", async () => {
    const res = await GET();
    expect(res.status).toBe(410);
  });
});
