import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { addMock, listMock } = vi.hoisted(() => ({ addMock: vi.fn(), listMock: vi.fn() }));
vi.mock("@/lib/ops/queries", () => ({ addComment: addMock, listComments: listMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }),
}));

import { GET, POST } from "../route";

const TOKEN = "test-token-with-enough-length-1234";
const ctx = { params: Promise.resolve({ id: "daily-log" }) };

function req(method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/ops/cards/daily-log/comments", {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  addMock.mockReset();
  listMock.mockReset();
  listMock.mockResolvedValue([]);
  addMock.mockImplementation(async (cardId: string, body: string, actor: string) => ({ id: 1, cardId, author: actor, body, at: "2026-09-04T00:00:00Z" }));
  vi.stubEnv("OPS_AGENT_TOKEN", TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("card responses", () => {
  it("refuses anonymous reads", async () => {
    const res = await GET(req("GET") as never, ctx);
    expect(res.status).toBe(401);
  });

  it("records a response under the agent's name", async () => {
    const res = await POST(req("POST", { body: "shipped, nag runs at 17:00" }, { Authorization: `Bearer ${TOKEN}`, "X-Ops-Actor": "saddlewoodbot" }) as never, ctx);
    expect(res.status).toBe(201);
    expect(addMock).toHaveBeenCalledWith("daily-log", "shipped, nag runs at 17:00", "saddlewoodbot");
  });

  it("rejects an empty response", async () => {
    const res = await POST(req("POST", { body: "   " }, { Authorization: `Bearer ${TOKEN}` }) as never, ctx);
    expect(res.status).toBe(400);
    expect(addMock).not.toHaveBeenCalled();
  });

  it("404s a card that does not exist", async () => {
    addMock.mockResolvedValueOnce(null);
    const res = await POST(req("POST", { body: "hello" }, { Authorization: `Bearer ${TOKEN}` }) as never, ctx);
    expect(res.status).toBe(404);
  });
});
