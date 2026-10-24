import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { recordBotPayment } = vi.hoisted(() => ({ recordBotPayment: vi.fn() }));
vi.mock("@/lib/billing/botPayments", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/botPayments")>()), recordBotPayment }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }),
}));

import { POST } from "../payments/route";

const TOKEN = "test-token-with-enough-length-1234";
const P = { pNumber: 12, invoice: "8009-14", amountCents: 50_000, receivedOn: "2026-10-20", method: "melio" };
const PAYMENT = { id: "p1", amountCents: 50_000, source: "bot", externalRef: "P12" };

const post = (body: unknown, auth = true) =>
  new NextRequest("http://localhost:3000/api/bot/payments", {
    method: "POST",
    headers: { ...(auth ? { authorization: `Bearer ${TOKEN}` } : {}), "Content-Type": "application/json", "X-Ops-Actor": "bot" },
    body: JSON.stringify(body),
  });

describe("POST /api/bot/payments", () => {
  beforeEach(() => {
    vi.stubEnv("OPS_AGENT_TOKEN", TOKEN);
    recordBotPayment.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("the bot's token only", async () => {
    expect((await POST(post(P, false))).status).toBe(401);
    expect(recordBotPayment).not.toHaveBeenCalled();
  });

  it("refuses a malformed payment before anything is read", async () => {
    const res = await POST(post({ ...P, amountCents: -5 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/amountCents/);
    expect(recordBotPayment).not.toHaveBeenCalled();
  });

  it("answers each outcome with its own status", async () => {
    const cases: [unknown, number][] = [
      [{ status: "recorded", payment: PAYMENT }, 201],
      [{ status: "already", payment: PAYMENT }, 200],
      [{ status: "voided", paymentId: "p1" }, 200],
      [{ status: "no_invoice", detail: "no issued invoice 8009-14 in the app" }, 404],
      [{ status: "ambiguous", detail: "2 issued invoices" }, 409],
      [{ status: "overpays", detail: "would overpay" }, 409],
      [{ status: "possible_duplicate", detail: "possible duplicate: 8009-14 already has 500.00 received 2026-10-19 entered on Money" }, 409],
    ];
    for (const [result, code] of cases) {
      recordBotPayment.mockResolvedValueOnce(result);
      const res = await POST(post(P));
      expect(res.status, JSON.stringify(result)).toBe(code);
      expect((await res.json()).status).toBe((result as { status: string }).status);
    }
    expect(recordBotPayment).toHaveBeenCalledWith(expect.objectContaining({ pNumber: 12, invoice: "8009-14", method: "melio" }), expect.any(String));
  });

  it("says what failed", async () => {
    recordBotPayment.mockRejectedValueOnce(new Error("payments read failed: boom"));
    const res = await POST(post(P));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/boom/);
  });
});
