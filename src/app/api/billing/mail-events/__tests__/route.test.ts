import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// A delivery report lands on every document the message carried: one for a
// single send (with the dedupe key it always had), each of them for a group.

vi.mock("@/lib/billing/mailEvents", async (orig) => ({
  ...(await orig<typeof import("@/lib/billing/mailEvents")>()),
  verifyMailSignature: () => true,
}));
const documentsForEmail = vi.fn();
const recordEvent = vi.fn();
vi.mock("@/lib/billing/documents", () => ({
  documentsForEmail: (...a: unknown[]) => documentsForEmail(...a),
  recordEvent: (...a: unknown[]) => recordEvent(...a),
}));

import { POST } from "../route";

const REPORT = { type: "email.delivered", created_at: "2026-10-16T15:00:00Z", data: { email_id: "em_1", to: ["ap@aft.com"] } };
const call = () =>
  POST(
    new NextRequest("http://localhost/api/billing/mail-events", {
      method: "POST",
      headers: { "svix-id": "msg_1", "svix-timestamp": "1", "svix-signature": "v1,x" },
      body: JSON.stringify(REPORT),
    }),
  );

beforeEach(() => {
  documentsForEmail.mockReset();
  recordEvent.mockReset().mockResolvedValue(true);
});

describe("POST /api/billing/mail-events", () => {
  it("records a single document's report with the key it always had", async () => {
    documentsForEmail.mockResolvedValue(["d1"]);
    expect(await (await call()).json()).toEqual({ ok: true, kept: true });
    expect(recordEvent).toHaveBeenCalledTimes(1);
    expect(recordEvent.mock.calls[0][0]).toMatchObject({ documentId: "d1", kind: "delivered", emailId: "em_1", dedupe: "mail:msg_1", actor: "mail service" });
  });

  it("records a group message's report on each of its documents", async () => {
    documentsForEmail.mockResolvedValue(["d1", "d2"]);
    await call();
    expect(recordEvent.mock.calls.map((c) => [c[0].documentId, c[0].dedupe])).toEqual([
      ["d1", "mail:msg_1:d1"],
      ["d2", "mail:msg_1:d2"],
    ]);
  });

  it("keeps nothing for mail that carried no document", async () => {
    documentsForEmail.mockResolvedValue([]);
    expect(await (await call()).json()).toEqual({ ok: true, kept: false });
    expect(recordEvent).not.toHaveBeenCalled();
  });
});
