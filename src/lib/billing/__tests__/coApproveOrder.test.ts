import { beforeEach, describe, expect, it, vi } from "vitest";

// The client's approval keeps its proof first: the signature is saved before the
// register moves, so a change order never reads signed with no signature. A
// failure in either step leaves the link open, and the retry keeps one signature.

const { state, recordEvent, listEvents, coEventsAfter, queueJoist } = vi.hoisted(() => ({
  state: { status: "sent", failMove: false, calls: [] as string[] },
  recordEvent: vi.fn(),
  listEvents: vi.fn(),
  coEventsAfter: vi.fn(),
  queueJoist: vi.fn(),
}));

function from() {
  const read = { eq: () => read, maybeSingle: async () => ({ data: { id: 7, status: state.status, amount_cents: 48500, signed_on: null }, error: null }) };
  const write = {
    eq: () => write,
    in: () => write,
    select: async () => {
      state.calls.push("move");
      if (state.failMove) return { data: null, error: { message: "connection lost" } };
      state.status = "signed";
      return { data: [{ id: 7 }], error: null };
    },
  };
  return { select: () => read, update: () => write };
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("../coEvents", () => ({ coEventsAfter: (...a: unknown[]) => coEventsAfter(...a) }));
vi.mock("../joistSyncStore", () => ({ queueJoist: (...a: unknown[]) => queueJoist(...a) }));
vi.mock("../exhibits", () => ({ addFileExhibit: vi.fn(), removeExhibit: vi.fn() }));
vi.mock("../documents", () => ({
  DocumentError: class DocumentError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
  listEvents: (...a: unknown[]) => listEvents(...a),
  recordEvent: (...a: unknown[]) => recordEvent(...a),
}));
vi.mock("@/lib/sales/signing", () => ({
  snapshotHash: () => "hash",
  signaturesOf: () => [{ role: "client", name: "Chris Turner", at: "2026-11-03T20:00:00Z" }],
}));

import { approveChangeOrder } from "../coApprove";
import type { BillingDocument } from "../types";

const doc = { id: "doc-1", kind: "change_order", status: "issued", number: "8009-CO7", snapshot: {}, totalCents: 48500 } as unknown as BillingDocument;
const sig = { name: "Chris Turner", method: "type", typed: "Chris Turner", font: "dancing", image: "data:image/png;base64,x" } as Parameters<typeof approveChangeOrder>[1];
const approve = () => approveChangeOrder(doc, sig, { ip: "1.2.3.4", ua: "phone", today: "2026-11-03" });

beforeEach(() => {
  state.status = "sent";
  state.failMove = false;
  state.calls = [];
  recordEvent.mockReset().mockImplementation(async () => {
    state.calls.push("signature");
    return true;
  });
  listEvents.mockReset().mockResolvedValue([]);
  coEventsAfter.mockReset();
  queueJoist.mockReset();
});

describe("approveChangeOrder", () => {
  it("saves the signature, then moves the register", async () => {
    const r = await approve();
    expect(state.calls).toEqual(["signature", "move"]);
    expect(r).toMatchObject({ changeOrderId: 7, signedOn: "2026-11-03" });
    expect(queueJoist).toHaveBeenCalledWith(7, "signed");
  });

  it("leaves the change order unsigned when the signature cannot be saved", async () => {
    recordEvent.mockRejectedValue(new Error("record event: connection lost"));
    await expect(approve()).rejects.toThrow(/connection lost/);
    expect(state.calls).toEqual([]);
    expect(state.status).toBe("sent");
    expect(queueJoist).not.toHaveBeenCalled();
  });

  it("takes the client's retry when the move failed: the same dedupe key, then signed", async () => {
    state.failMove = true;
    await expect(approve()).rejects.toThrow(/change_orders approve/);
    expect(state.status).toBe("sent");

    state.failMove = false;
    recordEvent.mockResolvedValue(false); // the unique dedupe key: the first signature stands
    await expect(approve()).resolves.toMatchObject({ changeOrderId: 7 });
    expect(state.status).toBe("signed");
    expect(recordEvent.mock.calls.map((c) => (c[0] as { dedupe: string }).dedupe)).toEqual(["signed:client:doc-1", "signed:client:doc-1"]);
  });
});
