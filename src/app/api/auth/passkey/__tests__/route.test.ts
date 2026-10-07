import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The 2026-09 handler created a session for any allowlisted email. These
// tests pin the new rules: no session without a server challenge, a known
// credential, and a verified signature; and nothing reaches the admin
// client before those checks.
const { adminMock, cookieStore } = vi.hoisted(() => ({
  adminMock: vi.fn(),
  cookieStore: { getAll: () => [], set: vi.fn() },
}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: adminMock }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";

import { POST, PUT } from "../route";
import { CHALLENGE_COOKIE, newChallenge, readChallenge, signChallenge } from "@/lib/auth/passkeys";

function put(body: unknown, cookie?: string) {
  return new NextRequest("https://saddlewoodcontracting.com/api/auth/passkey", {
    method: "PUT",
    headers: { "content-type": "application/json", ...(cookie ? { cookie: `${CHALLENGE_COOKIE}=${cookie}` } : {}) },
    body: JSON.stringify(body),
  });
}

describe("passkey challenge cookie", () => {
  it("round-trips a signed challenge and refuses tampering", () => {
    const c = newChallenge("login");
    const raw = signChallenge(c);
    expect(readChallenge(raw, "login")?.challenge).toBe(c.challenge);
    expect(readChallenge(raw, "register")).toBeNull();
    expect(readChallenge(raw.slice(0, -2) + "zz", "login")).toBeNull();
    expect(readChallenge(undefined, "login")).toBeNull();
  });

  it("expires", () => {
    const c = { ...newChallenge("login"), exp: Date.now() - 1 };
    expect(readChallenge(signChallenge(c), "login")).toBeNull();
  });
});

describe("passkey sign-in", () => {
  beforeEach(() => adminMock.mockReset());

  it("starts with a fresh challenge in an httpOnly cookie", async () => {
    const res = await POST();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.options.rpId).toBe("saddlewoodcontracting.com");
    expect(json.options.userVerification).toBe("required");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${CHALLENGE_COOKIE}=`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(adminMock).not.toHaveBeenCalled();
  });

  it("refuses an answer with no challenge cookie", async () => {
    const res = await PUT(put({ response: { id: "abc" } }));
    expect(res.status).toBe(400);
    expect(adminMock).not.toHaveBeenCalled();
  });

  it("refuses an unknown credential without touching sessions", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    adminMock.mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
      auth: { admin: { generateLink: vi.fn(), getUserById: vi.fn() } },
    });
    const cookie = signChallenge(newChallenge("login"));
    const res = await PUT(put({ response: { id: "not-enrolled" } }, cookie));
    expect(res.status).toBe(401);
    expect(maybeSingle).toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("refuses a bad signature for a known credential", async () => {
    const generateLink = vi.fn();
    adminMock.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "row",
                user_id: "u1",
                email: "info@saddlewoodcontracting.com",
                credential_id: "known",
                public_key: Buffer.from("not a key").toString("base64url"),
                counter: 0,
                transports: [],
              },
              error: null,
            }),
          }),
        }),
      }),
      auth: { admin: { generateLink, getUserById: vi.fn() } },
    });
    const cookie = signChallenge(newChallenge("login"));
    const res = await PUT(
      put(
        {
          response: {
            id: "known",
            rawId: "known",
            type: "public-key",
            clientExtensionResults: {},
            response: { clientDataJSON: "e30", authenticatorData: "AA", signature: "AA" },
          },
        },
        cookie,
      ),
    );
    expect(res.status).toBe(401);
    expect(generateLink).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
