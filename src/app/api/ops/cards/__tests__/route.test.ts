import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listMock, createMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  createMock: vi.fn(),
}));
vi.mock("@/lib/ops/queries", () => ({
  listCards: listMock,
  createCard: createMock,
}));

// No session in tests: the server client reports no user.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

import { GET, POST } from "../route";

const TOKEN = "test-token-with-enough-length-1234";

function req(method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/ops/cards", {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  listMock.mockReset();
  createMock.mockReset();
  listMock.mockResolvedValue([]);
  createMock.mockImplementation(
    async (input: { title: string; col?: string; owner?: string }, actor: string) => ({
      id: "x",
      title: input.title,
      owner: input.owner ?? "Lando",
      col: input.col ?? "backlog",
      note: "",
      sort: 0,
      updatedAt: "2026-09-04T00:00:00Z",
      updatedBy: actor,
      archivedAt: null,
    }),
  );
  vi.stubEnv("OPS_AGENT_TOKEN", TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Ops cards API auth", () => {
  it("refuses anonymous reads", async () => {
    const res = await GET(req("GET") as never);
    expect(res.status).toBe(401);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("refuses a wrong token", async () => {
    const res = await GET(
      req("GET", undefined, { Authorization: "Bearer nope-nope-nope-nope-nope-nope" }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("lists cards for the agent token", async () => {
    const res = await GET(req("GET", undefined, { Authorization: `Bearer ${TOKEN}` }) as never);
    expect(res.status).toBe(200);
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it("records the actor from X-Ops-Actor on create", async () => {
    const res = await POST(
      req(
        "POST",
        { title: "Daily log nag", owner: "Lando", col: "drafting" },
        { Authorization: `Bearer ${TOKEN}`, "X-Ops-Actor": "saddlewoodbot" },
      ) as never,
    );
    expect(res.status).toBe(201);
    expect(createMock.mock.calls[0][1]).toBe("saddlewoodbot");
  });

  it("rejects a bad column", async () => {
    const res = await POST(
      req("POST", { title: "Daily log nag", col: "someday" }, { Authorization: `Bearer ${TOKEN}` }) as never,
    );
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a title that is too short", async () => {
    const res = await POST(req("POST", { title: "ab" }, { Authorization: `Bearer ${TOKEN}` }) as never);
    expect(res.status).toBe(400);
  });
});
