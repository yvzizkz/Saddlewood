import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listMock, createMock } = vi.hoisted(() => ({ listMock: vi.fn(), createMock: vi.fn() }));
vi.mock("@/lib/ops/goals", () => ({ listGoals: listMock, createGoal: createMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }),
}));

import { GET, POST } from "../route";

const TOKEN = "test-token-with-enough-length-1234";

function req(method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/ops/goals", {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  listMock.mockReset();
  createMock.mockReset();
  listMock.mockResolvedValue([]);
  createMock.mockImplementation(async (input: { title: string }, actor: string) => ({ id: "x", title: input.title, updatedBy: actor }));
  vi.stubEnv("OPS_AGENT_TOKEN", TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("goals API", () => {
  it("refuses anonymous reads", async () => {
    expect((await GET(req("GET") as never)).status).toBe(401);
  });

  it("creates a dated goal for the agent token", async () => {
    const res = await POST(req("POST", { title: "Operations grade C", kind: "goal", owner: "Team", dueDate: "2026-12-31", horizon: "quarter" }, { Authorization: `Bearer ${TOKEN}` }) as never);
    expect(res.status).toBe(201);
    expect(createMock.mock.calls[0][0].dueDate).toBe("2026-12-31");
  });

  it("rejects a bad weekday", async () => {
    const res = await POST(req("POST", { title: "AR call", kind: "recurring", recurWeekday: 9 }, { Authorization: `Bearer ${TOKEN}` }) as never);
    expect(res.status).toBe(400);
  });
});
