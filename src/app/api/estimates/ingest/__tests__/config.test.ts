import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The point of this file: importing the route must not require a production
// secret. It used to build its Supabase client at module scope, so a missing
// SUPABASE_SERVICE_ROLE_KEY failed `next build` for the entire site -- not
// just this route. If that regresses, this import throws and every test here
// fails at once.
import { POST } from "../route";

function req(token: string | null, body: unknown = {}): Request {
  return new Request("http://localhost/api/estimates/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("PIPELINE_INGEST_SECRET", "s3cret");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/estimates/ingest configuration", () => {
  it("rejects a missing token before looking at configuration", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const res = await POST(req(null) as never);
    expect(res.status).toBe(401);
    // An unauthenticated caller must not learn how the env is configured.
    expect(await res.json()).toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("reports a missing service-role key at request time, not build time", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const res = await POST(req("s3cret") as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "CONFIG_ERROR" });
  });
});
