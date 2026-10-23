import { beforeEach, describe, expect, it, vi } from "vitest";

// A lead linked to a person on its client (0056): what is typed in Details
// stands (SHIP review of #60). The database mirrors the record's non-empty
// name, email and phone onto a linked lead, so a name or phone typed that
// differs from the record unlinks it rather than being put back while the
// save says it worked. Through the real updateOpportunity, against stand-in
// tables whose update does what 0056's opportunities_contact_mirror does.

type Row = Record<string, unknown>;
const { db } = vi.hoisted(() => ({ db: { opp: {} as Row, contacts: [] as Row[] } }));

function mirror(r: Row): Row {
  const c = db.contacts.find((x) => x.id === r.contact_id);
  if (!c) return r;
  const contact = { ...(r.contact as Row) };
  for (const k of ["name", "email", "phone"]) if (c[k] !== "") contact[k] = c[k];
  return { ...r, contact };
}

function from(table: string) {
  let patch: Row | null = null;
  const b = {
    select: () => b,
    eq: () => b,
    update: (p: Row) => ((patch = p), b),
    maybeSingle: async () => ({ data: { ...db.opp }, error: null }),
    single: async () => {
      db.opp = mirror({ ...db.opp, ...patch });
      return { data: { ...db.opp }, error: null };
    },
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === "client_contacts" ? db.contacts : [], error: null }).then(ok),
  };
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));

import { linkableContact, type ContactRow } from "@/lib/clients/contacts";
import { updateOpportunity } from "../store";

const CLIENT = "00000000-0000-4000-8000-0000000000c1";
const DANA = { id: "dana", name: "Dana Patrick", email: "dana@example.com", phone: "480-555-0101", active: true, created_at: "2026-10-01T00:00:00Z" };

function seed(contact: Row, record: Partial<typeof DANA> = {}) {
  db.contacts = [{ ...DANA, client_id: CLIENT, ...record }];
  db.opp = mirror({
    id: "o1", number: "L-1", title: "Kitchen", stage: "lead", kind: "remodel", source: "referral", contact, address: "", client_id: CLIENT, contact_id: "dana",
    job_id: null, value_cents: 0, probability: null, owner: "", next_step: "", next_step_on: null, bid_due: null, lost_reason: "", notes: "", tags: [],
    external_ref: null, created_by: "Marco", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", stage_at: "2026-10-01T00:00:00Z", closed_at: null,
  });
}

const typed = { name: "Dana Patrick", email: "dana@example.com", phone: "480-555-0101", company: "Patrick Homes" };

beforeEach(() => seed({ ...typed }));

describe("Details on a lead linked to its client's contact", () => {
  it("an unchanged save stays linked", async () => {
    const o = await updateOpportunity("o1", { contact: { ...typed }, notes: "called" }, "Marco");
    expect(o.contactId).toBe("dana");
    expect(o.contact).toEqual(typed);
  });

  it("a name edit stands, and unlinks it", async () => {
    const o = await updateOpportunity("o1", { contact: { ...typed, name: "Dana P. Ruiz" } }, "Marco");
    expect(o.contact.name).toBe("Dana P. Ruiz");
    expect(o.contactId).toBeNull();
  });

  it("a phone edit stands, and unlinks it", async () => {
    const o = await updateOpportunity("o1", { contact: { ...typed, phone: "602-555-0199" } }, "Marco");
    expect(o.contact.phone).toBe("602-555-0199");
    expect(o.contactId).toBeNull();
  });

  it("emptying a phone the record has is an edit too", async () => {
    const o = await updateOpportunity("o1", { contact: { ...typed, phone: "" } }, "Marco");
    expect(o.contact.phone).toBe("");
    expect(o.contactId).toBeNull();
  });

  it("where the record has no phone, the one typed stands and the lead stays linked", async () => {
    seed({ ...typed, phone: "" }, { phone: "" });
    const o = await updateOpportunity("o1", { contact: { ...typed, phone: "602-555-0199" } }, "Marco");
    expect(o.contact.phone).toBe("602-555-0199");
    expect(o.contactId).toBe("dana");
  });

  it("the same phone written another way stays linked", async () => {
    const o = await updateOpportunity("o1", { contact: { ...typed, phone: "(480) 555-0101" } }, "Marco");
    expect(o.contactId).toBe("dana");
  });
});

describe("linkableContact", () => {
  const rows: ContactRow[] = [DANA, { ...DANA, id: "sam", name: "Sam Lee", email: "", phone: "", created_at: "2026-10-02T00:00:00Z" }];

  it("a new lead with nothing typed but the email may take the record's name and phone", () => {
    expect(linkableContact(rows, { email: "dana@example.com" }, { fillEmpty: true })).toBe("dana");
    expect(linkableContact(rows, { email: "dana@example.com" }, { fillEmpty: false })).toBeNull();
  });

  it("a record with no name or phone never conflicts", () => {
    expect(linkableContact(rows, { name: "Sam Lee", phone: "602-555-0199" }, { fillEmpty: false })).toBe("sam");
  });

  it("no match, no link", () => {
    expect(linkableContact(rows, { name: "Nobody", email: "nobody@example.com" }, { fillEmpty: true })).toBeNull();
  });
});
