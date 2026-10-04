import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The real proxy, with Supabase stubbed to "nobody is signed in" or to a named
// user. What matters here: /app and /api/bot/* are behind the gate, and the
// public files that only LOOK like /app (the service worker, the manifest)
// are not.

const { user } = vi.hoisted(() => ({ user: { current: null as { email: string } | null } }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: user.current } }),
      signOut: async () => ({}),
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
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("OPS_AGENT_TOKEN", TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the app is staff only", () => {
  it("sends a stranger from every app screen to sign-in, and back afterwards", async () => {
    for (const path of ["/app", "/app/ask", "/app/duties", "/app/more"]) {
      const res = await go(path);
      expect(res.status).toBe(307);
      const to = new URL(res.headers.get("location")!);
      expect(to.pathname).toBe("/login");
      expect(to.searchParams.get("next")).toBe(path);
    }
  });

  it("answers 401 on the app's API without a session or the agent token", async () => {
    for (const path of ["/api/bot/home", "/api/bot/messages", "/api/bot/actions", "/api/bot/sync", "/api/bot/files"]) {
      expect((await go(path)).status).toBe(401);
    }
    expect((await go("/api/bot/sync", { authorization: "Bearer wrong-wrong-wrong-wrong-wrong" })).status).toBe(401);
  });

  it("lets the Mac's token through to the API", async () => {
    const res = await go("/api/bot/sync", { authorization: `Bearer ${TOKEN}` });
    expect(res.status).toBe(200);
  });

  it("turns away a signed-in address that is not on the allowlist", async () => {
    user.current = { email: "someone@example.com" };
    const page = await go("/app");
    expect(page.status).toBe(307);
    expect(new URL(page.headers.get("location")!).searchParams.get("error")).toBe("unauthorized");
    expect((await go("/api/bot/home")).status).toBe(401);
  });

  it("lets staff in", async () => {
    user.current = { email: "marco@saddlewoodcontracting.com" };
    expect((await go("/app")).status).toBe(200);
    expect((await go("/api/bot/home")).status).toBe(200);
  });

  it("leaves the public files that share the prefix alone", async () => {
    for (const path of ["/app-sw.js", "/saddlewood-app.webmanifest", "/apple-touch-icon.png", "/", "/login"]) {
      expect((await go(path)).status).toBe(200);
    }
  });
});
