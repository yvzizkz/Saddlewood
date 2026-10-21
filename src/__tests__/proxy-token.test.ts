import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The gate, for callers that send a token instead of signing in: the agent
// token (OPS_AGENT_TOKEN, the bot and Claude sessions), the estimate
// pipeline's own secret (checked by the ingest route itself), and the
// service-role key, which is no longer a way in.

const { user, signedOut } = vi.hoisted(() => ({
  user: { current: null as { email: string; app_metadata?: Record<string, unknown> } | null },
  signedOut: { count: 0 },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: user.current } }),
      signOut: async () => {
        signedOut.count += 1;
        return {};
      },
    },
  }),
}));

import { proxy } from "../proxy";

const TOKEN = "test-token-with-enough-length-1234";

function go(path: string, headers: Record<string, string> = {}) {
  return proxy(new NextRequest(`https://saddlewoodcontracting.com${path}`, { headers }));
}

beforeEach(() => {
  user.current = null;
  signedOut.count = 0;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("OPS_AGENT_TOKEN", TOKEN);
  vi.stubEnv("INTERNAL_ALLOWED_EMAILS", "lando@saddlewoodcontracting.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const SERVICE_ROLE = "service-role-key-that-must-not-open-anything";

beforeEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE);
});

describe("token callers", () => {
  const guarded = ["/api/ops/board", "/api/review/batch-1", "/api/trackers", "/api/expenses", "/api/bot/state", "/api/sales/inbox", "/api/subs"];

  it("the agent token opens the guarded APIs", async () => {
    for (const path of guarded) {
      expect((await go(path, { authorization: `Bearer ${TOKEN}` })).status, path).toBe(200);
    }
  });

  it("the service-role key does not", async () => {
    for (const path of guarded) {
      expect((await go(path, { authorization: `Bearer ${SERVICE_ROLE}` })).status, path).toBe(401);
    }
  });

  it("a wrong token, a token one character short, or no Bearer prefix does not", async () => {
    for (const header of [`Bearer ${TOKEN}x`, `Bearer ${TOKEN.slice(0, -1)}`, TOKEN, "Bearer "]) {
      expect((await go("/api/ops/board", { authorization: header })).status, header).toBe(401);
    }
  });

  it("a too-short OPS_AGENT_TOKEN opens nothing, even when it matches", async () => {
    vi.stubEnv("OPS_AGENT_TOKEN", "short");
    expect((await go("/api/ops/board", { authorization: "Bearer short" })).status).toBe(401);
  });

  it("the estimate pipeline's ingest reaches its route, which checks its own secret", async () => {
    expect((await go("/api/estimates/ingest", { authorization: "Bearer pipeline-secret" })).status).toBe(200);
    expect((await go("/api/estimates/ingest")).status).toBe(200);
  });

  it("the rest of /api/estimates stays guarded", async () => {
    expect((await go("/api/estimates/abc")).status).toBe(401);
    expect((await go("/api/estimates/ingest/other")).status).toBe(401);
  });
});
