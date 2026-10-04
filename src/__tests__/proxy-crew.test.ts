import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The gate, for the second kind of signed-in person. Crew (a field worker an
// owner gave a seat) get the app and their own API and nothing else on the
// site. A session that is neither staff nor crew gets nothing at all.

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
const to = (res: Response) => {
  const url = new URL(res.headers.get("location")!);
  return url.pathname + url.search;
};

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

describe("crew", () => {
  beforeEach(() => {
    user.current = { email: "arnold@example.com", app_metadata: { sw_role: "crew" } };
  });

  it("get every screen of the app and their own API", async () => {
    for (const path of ["/app", "/app/week", "/app/hours", "/app/more", "/api/crew/me", "/api/crew/act", "/api/crew/uploads"]) {
      expect((await go(path)).status).toBe(200);
    }
  });

  it("are turned back to the app from everywhere else on the portal, still signed in", async () => {
    for (const path of ["/internal", "/internal/ops", "/internal/expenses", "/internal/trackers/abc", "/r/batch-1", "/review/batch-1"]) {
      const res = await go(path);
      expect(res.status).toBe(307);
      expect(to(res)).toBe("/app");
    }
    expect(signedOut.count).toBe(0);
  });

  it("cannot call the bot's API, the portal's APIs, or anything a token opens", async () => {
    for (const path of ["/api/bot/home", "/api/bot/actions", "/api/bot/messages", "/api/bot/files", "/api/bot/crew", "/api/ops/cards", "/api/ops/invite", "/api/expenses", "/api/estimates", "/api/trackers", "/api/review"]) {
      expect((await go(path)).status).toBe(401);
    }
  });

  it("land in the app when they open the sign-in page already signed in", async () => {
    const res = await go("/login?next=/internal/ops");
    expect(res.status).toBe(307);
    expect(to(res)).toBe("/app");
  });
});

describe("everyone else", () => {
  it("anonymous: the crew API answers 401, the app goes to sign-in", async () => {
    expect((await go("/api/crew/me")).status).toBe(401);
    expect((await go("/api/crew/admin")).status).toBe(401);
    const res = await go("/app/week");
    expect(to(res)).toBe("/login?next=%2Fapp%2Fweek");
  });

  it("the agent token is not a way into the crew API", async () => {
    expect((await go("/api/crew/act", { authorization: `Bearer ${TOKEN}` })).status).toBe(401);
    expect((await go("/api/crew/admin", { authorization: `Bearer ${TOKEN}` })).status).toBe(401);
    expect((await go("/api/bot/crew", { authorization: `Bearer ${TOKEN}` })).status).toBe(200);
  });

  it("a session that is neither staff nor crew is signed out", async () => {
    user.current = { email: "stranger@example.com" };
    expect((await go("/api/crew/me")).status).toBe(401);
    const res = await go("/app");
    expect(to(res)).toBe("/login?error=unauthorized");
    expect(signedOut.count).toBe(1);
  });

  it("a seat that was taken away is a stranger again", async () => {
    user.current = { email: "gone@example.com", app_metadata: { sw_role: "former" } };
    expect((await go("/api/crew/me")).status).toBe(401);
    const res = await go("/app");
    expect(to(res)).toBe("/login?error=unauthorized");
    expect(signedOut.count).toBe(1);
  });

  it("a mark the person could have set themselves does not count", async () => {
    // user_metadata is the person's to edit; only app_metadata is the server's.
    user.current = { email: "stranger@example.com", user_metadata: { sw_role: "crew" } } as never;
    expect((await go("/api/crew/me")).status).toBe(401);
    user.current = { email: "stranger@example.com", app_metadata: { sw_role: "owner" } };
    expect((await go("/api/crew/me")).status).toBe(401);
  });

  it("staff reach the owners' side of the crew API, and stay staff even if marked crew", async () => {
    user.current = { email: "lando@saddlewoodcontracting.com", app_metadata: { sw_role: "crew" } };
    expect((await go("/api/crew/admin")).status).toBe(200);
    expect((await go("/internal/ops")).status).toBe(200);
    expect((await go("/api/bot/home")).status).toBe(200);
  });

  it("the old no-sign-in punch link goes to the app", async () => {
    const res = await go("/crew/punch?t=eyJ3b3JrZXJJZCI6ImFybm9sZCJ9");
    expect(res.status).toBe(307);
    expect(to(res)).toBe("/app");
  });
});
