import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JobRef } from "@/lib/jobs/hub";

// What a job's contact write does. The email and phone on the job are the
// database's (jobs_client_mirror, 0058, e2e/job-contact.spec.ts): this only
// ever writes contact_id, whatever the record is missing.

type Row = Record<string, unknown>;

const { state } = vi.hoisted(() => ({
  state: { job: {} as Row, contacts: [] as Row[], found: null as string | null, updates: [] as Row[], inserts: [] as Row[] },
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const rows = () => (table === "jobs" ? [state.job] : state.contacts).filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
      const chain = {
        select: () => chain,
        eq(col: string, value: unknown) {
          filters[col] = value;
          return chain;
        },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => ({ data: { id: "made" }, error: null }),
        update(patch: Row) {
          state.updates.push(patch);
          return chain;
        },
        insert(row: Row) {
          state.inserts.push(row);
          return chain;
        },
        then: (done: (v: { error: null }) => void) => done({ error: null }),
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/clients/contacts", () => ({ findContact: async () => state.found }));

import { addJobContact, setJobContact } from "../jobClient";

const ref = { key: "job", billingId: "j1" } as JobRef;
const person = { name: "Ana", email: "ana@x.com", phone: "", role: "other" as const };

beforeEach(() => {
  state.job = { id: "j1", client_id: "c1", contact_id: null, client_name: "Client", client_email: "", client_phone: "602-555-0101" };
  state.contacts = [{ id: "ana", client_id: "c1", email: "ana@x.com", phone: "", active: true }];
  state.found = null;
  state.updates = [];
  state.inserts = [];
});

describe("setJobContact", () => {
  it("links a contact with no phone to a job that has one", async () => {
    await setJobContact(ref, "ana");
    expect(state.updates).toEqual([{ contact_id: "ana" }]);
  });
  it("links a contact with no email to a job that has one", async () => {
    state.job.client_email = "kept@x.com";
    state.contacts = [{ id: "bare", client_id: "c1", email: "", phone: "", active: true }];
    await setJobContact(ref, "bare");
    expect(state.updates).toEqual([{ contact_id: "bare" }]);
  });
  it("won't take someone off another client, or someone no longer active", async () => {
    state.contacts = [
      { id: "other", client_id: "c2", email: "", phone: "", active: true },
      { id: "gone", client_id: "c1", email: "", phone: "", active: false },
    ];
    await expect(setJobContact(ref, "other")).rejects.toMatchObject({ status: 404 });
    await expect(setJobContact(ref, "gone")).rejects.toMatchObject({ status: 404 });
    expect(state.updates).toEqual([]);
  });
  it("needs a client first", async () => {
    state.job.client_id = null;
    await expect(setJobContact(ref, "ana")).rejects.toMatchObject({ status: 409 });
  });
});

describe("addJobContact", () => {
  it("uses someone already on the client, and never makes a second one or edits them", async () => {
    state.found = "ana";
    await addJobContact(ref, { ...person, phone: "480-555-0102" });
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([{ contact_id: "ana" }]);
  });
  it("adds a new person with no phone to a job that has one, and links them", async () => {
    await addJobContact(ref, person);
    expect(state.inserts).toEqual([{ client_id: "c1", ...person }]);
    expect(state.updates).toEqual([{ contact_id: "made" }]);
  });
});
