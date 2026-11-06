import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Who may set a job's client and contact, and what each body does.

const { state, JobClientError } = vi.hoisted(() => {
  class JobClientError extends Error {
    constructor(
      message: string,
      readonly status = 409,
    ) {
      super(message);
    }
  }
  return { JobClientError, state: { seat: null as null | { owner: boolean; email: string }, calls: [] as unknown[][], fail: null as Error | null } };
});

vi.mock("@/lib/jobs/access", () => ({
  workSeat: async () => state.seat,
  jobForWrite: async (_seat: unknown, key: string) => (key === "job" ? { key } : null),
}));
vi.mock("@/lib/clients/jobClient", () => {
  const call =
    (name: string) =>
    async (...args: unknown[]) => {
      if (state.fail) throw state.fail;
      state.calls.push([name, ...args.slice(1)]);
    };
  return {
    CLIENT_KINDS: ["gc", "homeowner", "other"],
    CONTACT_ROLES: ["ap", "pm", "principal", "other"],
    JobClientError,
    setJobContact: call("setJobContact"),
    setJobClient: call("setJobClient"),
    addJobContact: call("addJobContact"),
    createJobClient: call("createJobClient"),
  };
});

import { PATCH } from "../route";

const ID = "11111111-1111-4111-8111-111111111111";
const patch = (body: unknown, job = "job") => PATCH(new NextRequest(`http://localhost/api/jobs/${job}/client`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: job }) });

beforeEach(() => {
  state.seat = { owner: true, email: "marco@x.com" };
  state.calls = [];
  state.fail = null;
});

describe("PATCH /api/jobs/[id]/client", () => {
  it("is owners only: a PM, a field lead and no seat are refused before anything is read", async () => {
    state.seat = { owner: false, email: "eli@x.com" };
    expect((await patch({ contactId: ID })).status).toBe(403);
    state.seat = null;
    expect((await patch({ contactId: ID })).status).toBe(403);
    expect(state.calls).toEqual([]);
  });
  it("answers 404 for a job it can't find", async () => {
    expect((await patch({ contactId: ID }, "nope")).status).toBe(404);
  });
  it("refuses a body that isn't exactly one of the four", async () => {
    for (const body of [{}, { contactId: "x" }, { contactId: ID, clientId: ID }, { contactId: ID, client_email: "a@x.com" }, { newClient: { name: " ", kind: "gc" } }, { newClient: { name: "A", kind: "vendor" } }, { newContact: {} }, { newContact: { name: " " } }, { newContact: { name: "A", email: "nope" } }, { newContact: { name: "A", role: "owner" } }]) {
      expect((await patch(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(state.calls).toEqual([]);
  });
  it("sets a contact, links a client, makes a client under the caller's name", async () => {
    expect((await patch({ contactId: ID })).status).toBe(200);
    expect((await patch({ clientId: ID })).status).toBe(200);
    expect((await patch({ newClient: { name: " Lindsay McHugh ", kind: "homeowner" } })).status).toBe(200);
    expect(state.calls).toEqual([
      ["setJobContact", ID],
      ["setJobClient", ID],
      ["createJobClient", { name: "Lindsay McHugh", kind: "homeowner" }, "marco@x.com"],
    ]);
  });
  it("adds a contact with a name or an email, and tidies it", async () => {
    expect((await patch({ newContact: { email: " Ana@X.com " } })).status).toBe(200);
    expect(state.calls).toEqual([["addJobContact", { name: "", email: "ana@x.com", phone: "", role: "other" }]]);
  });
  it("answers a refusal in the caller's words, and hides anything else", async () => {
    state.fail = new JobClientError("This job already has a client.");
    const refused = await patch({ clientId: ID });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toBe("This job already has a client.");
    state.fail = new Error("job client: password in a connection string");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await patch({ clientId: ID });
    expect(failed.status).toBe(500);
    expect((await failed.json()).error).toBe("Could not save.");
  });
});
