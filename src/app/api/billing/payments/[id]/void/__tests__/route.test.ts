import { beforeEach, describe, expect, it, vi } from "vitest";

const authorizeOps = vi.fn();
vi.mock("@/lib/ops/auth", () => ({ authorizeOps: (...a: unknown[]) => authorizeOps(...a) }));
const readState = vi.fn();
vi.mock("@/lib/bot/queries", () => ({ readState: (...a: unknown[]) => readState(...a) }));
const voidPayment = vi.fn();
vi.mock("@/lib/billing/payments", () => ({ voidPayment: (...a: unknown[]) => voidPayment(...a) }));

import { POST } from "../route";

const ID = "11111111-2222-3333-4444-555555555555";
const OWNERS = {
  "marco@saddlewoodcontracting.com": { name: "Marco", role: "owner" },
  "bot@saddlewoodcontracting.com": { name: "Bot", role: "requester" },
};

function call(body: unknown) {
  return POST(
    new Request(`http://localhost/api/billing/payments/${ID}/void`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never,
    { params: Promise.resolve({ id: ID }) },
  );
}

beforeEach(() => {
  authorizeOps.mockReset().mockResolvedValue({ actor: "marco@saddlewoodcontracting.com", via: "session" });
  readState.mockReset().mockResolvedValue({ sections: { people: OWNERS }, bridge: {} });
  voidPayment.mockReset().mockResolvedValue(true);
});

describe("POST /api/billing/payments/[id]/void", () => {
  it("voids for an owner who is signed in, and names them", async () => {
    expect((await call({ reason: "entered twice" })).status).toBe(200);
    expect(voidPayment).toHaveBeenCalledWith(ID, "entered twice (marco@saddlewoodcontracting.com)");
  });

  it("refuses the agent token and staff who are not owners", async () => {
    authorizeOps.mockResolvedValue({ actor: "billing_send", via: "token" });
    expect((await call({ reason: "x" })).status).toBe(403);
    authorizeOps.mockResolvedValue({ actor: "bot@saddlewoodcontracting.com", via: "session" });
    expect((await call({ reason: "x" })).status).toBe(403);
    authorizeOps.mockResolvedValue(null);
    expect((await call({ reason: "x" })).status).toBe(401);
    expect(voidPayment).not.toHaveBeenCalled();
  });

  it("answers 503 when it cannot tell who the owners are", async () => {
    readState.mockRejectedValue(new Error("db down"));
    expect((await call({ reason: "x" })).status).toBe(503);
    expect(voidPayment).not.toHaveBeenCalled();
  });
});
