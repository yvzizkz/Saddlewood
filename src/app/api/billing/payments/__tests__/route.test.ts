import { beforeEach, describe, expect, it, vi } from "vitest";

const authorizeOps = vi.fn();
vi.mock("@/lib/ops/auth", () => ({ authorizeOps: (...a: unknown[]) => authorizeOps(...a) }));

const getDocument = vi.fn();
vi.mock("@/lib/billing/documents", () => ({ getDocument: (...a: unknown[]) => getDocument(...a) }));

const paidByDocument = vi.fn();
const recordPayment = vi.fn();
vi.mock("@/lib/billing/payments", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    paidByDocument: (...a: unknown[]) => paidByDocument(...a),
    recordPayment: (...a: unknown[]) => recordPayment(...a),
  };
});

import { POST } from "../route";
import { checkPaymentInput } from "@/lib/billing/payments";
import { addBusinessDays, nextStep } from "@/lib/billing/ladder";

const ID = "11111111-2222-3333-4444-555555555555";
const DOC = {
  id: ID,
  clientId: "c1",
  status: "issued",
  number: "AFT-100526",
  totalCents: 6093019,
  snapshot: { lines: [{ description: "5203-12", amountCents: 2542300 }, { description: "8009-08", amountCents: 2225719 }, { description: "4125-03", amountCents: 1325000 }] },
};
const GOOD = { documentId: ID, lineIndex: 0, amountCents: 2542300, method: "melio", receivedOn: "2026-10-06", feeCents: 25423, reference: "AFT125-5203-12" };

function call(body: unknown) {
  return POST(new Request("http://localhost/api/billing/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never);
}

beforeEach(() => {
  authorizeOps.mockReset().mockResolvedValue({ actor: "ilene@saddlewoodcontracting.com", via: "session" });
  getDocument.mockReset().mockResolvedValue(DOC);
  paidByDocument.mockReset().mockResolvedValue(new Map());
  recordPayment.mockReset().mockResolvedValue({ id: "p1" });
});

describe("POST /api/billing/payments", () => {
  it("answers 401 to anyone who is not staff", async () => {
    authorizeOps.mockResolvedValue(null);
    expect((await call({ ...GOOD, confirm: true })).status).toBe(401);
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it("shows the balance it would leave and records nothing until confirmed", async () => {
    const res = await call(GOOD);
    const json = await res.json();
    expect(json.recorded).toBe(false);
    expect(json.preview).toMatchObject({ balanceBefore: 6093019, balanceAfter: 3550719, overpaysBy: 0, line: { index: 0, amountCents: 2542300 } });
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it("records the gross amount against the line, with the fee kept apart", async () => {
    const res = await call({ ...GOOD, confirm: true });
    expect((await res.json()).recorded).toBe(true);
    expect(recordPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "c1",
        amountCents: 2542300,
        feeCents: 25423,
        method: "melio",
        receivedOn: "2026-10-06",
        recordedBy: "ilene@saddlewoodcontracting.com",
        allocations: [{ documentId: ID, lineIndex: 0, amountCents: 2542300 }],
      }),
    );
  });

  it("stops an overpayment unless told to allow it", async () => {
    paidByDocument.mockResolvedValue(new Map([[ID, { total: 2000000, byLine: new Map([[0, 2000000]]) }]]));
    const res = await call({ ...GOOD, amountCents: 600000, confirm: true });
    expect(res.status).toBe(409);
    expect((await res.json()).preview.overpaysBy).toBe(57700);
    expect(recordPayment).not.toHaveBeenCalled();
    const ok = await call({ ...GOOD, amountCents: 600000, confirm: true, allowOverpayment: true });
    expect(ok.status).toBe(200);
  });

  it("refuses bad input and documents that cannot take a payment", async () => {
    for (const body of [
      { ...GOOD, amountCents: 0 },
      { ...GOOD, amountCents: 12.5 },
      { ...GOOD, feeCents: -1 },
      { ...GOOD, method: "bitcoin" },
      { ...GOOD, receivedOn: "yesterday" },
      { ...GOOD, lineIndex: 3 },
      { ...GOOD, documentId: "nope" },
    ]) {
      expect((await call({ ...body, confirm: true })).status).toBe(400);
    }
    getDocument.mockResolvedValue({ ...DOC, status: "draft" });
    expect((await call({ ...GOOD, confirm: true })).status).toBe(409);
    getDocument.mockResolvedValue(null);
    expect((await call({ ...GOOD, confirm: true })).status).toBe(404);
    expect(recordPayment).not.toHaveBeenCalled();
  });
});

describe("payment input", () => {
  it("refuses a fee at or above the amount, and allocations beyond the payment", () => {
    const base = { clientId: null, receivedOn: "2026-10-06", amountCents: 1000, method: "check" as const, recordedBy: "x", allocations: [{ documentId: ID, lineIndex: null, amountCents: 1000 }] };
    expect(checkPaymentInput(base)).toBeNull();
    expect(checkPaymentInput({ ...base, feeCents: 1000 })).toMatch(/fee/);
    expect(checkPaymentInput({ ...base, allocations: [{ documentId: ID, lineIndex: null, amountCents: 1001 }] })).toMatch(/more than the payment/);
    expect(checkPaymentInput({ ...base, allocations: [] })).toMatch(/at least one/);
  });
});

describe("the ladder", () => {
  it("counts business days for the confirm-receipt window", () => {
    expect(addBusinessDays("2026-10-05", 2)).toBe("2026-10-07"); // Monday → Wednesday
    expect(addBusinessDays("2026-10-08", 2)).toBe("2026-10-12"); // Thursday → Monday
  });

  it("names the next step from the clock", () => {
    expect(nextStep("2026-10-10", "2026-10-05")).toMatchObject({ on: "2026-10-07", label: "Heads-up", daysLate: -5 });
    expect(nextStep("2026-10-10", "2026-10-11")).toMatchObject({ on: "2026-10-17", daysLate: 1 });
    expect(nextStep("2026-10-10", "2026-10-24")).toMatchObject({ on: "2026-10-31", who: "marco", daysLate: 14 });
    expect(nextStep("2026-10-10", "2026-12-01")).toMatchObject({ label: "Attorney; lien calendar", daysLate: 52 });
  });
});
