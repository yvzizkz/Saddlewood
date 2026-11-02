import { describe, expect, it } from "vitest";

import { draftHash, readIntake, snapshotFor } from "../coIntake";

const REQUEST = {
  sourceRef: "thread-aft-1030",
  job: "8009-n-ironwood-dr",
  requestedBy: "Chris Turner (AFT)",
  requestedOn: "2026-10-30",
  subject: "Sheer wall change at garage",
  items: [
    {
      key: "shear-wall",
      title: "Shear Wall Revision at Studio / Garage Door",
      refs: "Broderick Engineering SK8, SK9 and SK10 dated 10/29/26",
      lines: [
        { description: "Hold-Downs at Revised Shear Wall", quantity: 10, unit: "ea", note: "Set in epoxy at the locations on SK8." },
        { description: "3/4\" Plywood at Hallway", note: "Approximately ______ sq ft." },
      ],
      notIncluded: [{ description: "Paneling, finishes and door supply", note: "By others" }],
    },
    { key: "lvl", title: "LVL at Door and Window Openings", lines: [{ description: "Single LVL, 4 openings, about 48 LF" }] },
  ],
};

describe("change-order intake: reading a request", () => {
  it("takes a request with several changes", () => {
    const r = readIntake(REQUEST);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items.map((i) => i.key)).toEqual(["shear-wall", "lvl"]);
    expect(r.value.items[0].lines[0]).toEqual({ description: "Hold-Downs at Revised Shear Wall", quantity: 10, unit: "ea", note: "Set in epoxy at the locations on SK8." });
  });

  it("never takes a price", () => {
    const r = readIntake({ ...REQUEST, items: [{ ...REQUEST.items[1], lines: [{ description: "LVL", amountCents: 120000 }] }] });
    expect(r).toEqual({ ok: false, error: "items[0].lines[0].amountCents is not part of a change-order request" });
  });

  it("refuses what it cannot place: no items, no lines, two items with one key, a bad date, an unknown field", () => {
    expect(readIntake({ ...REQUEST, items: [] })).toMatchObject({ ok: false, error: "items needs at least 1" });
    expect(readIntake({ ...REQUEST, items: [{ key: "a", title: "A", lines: [] }] })).toMatchObject({ ok: false, error: "items[0].lines needs at least 1" });
    expect(readIntake({ ...REQUEST, items: [REQUEST.items[1], REQUEST.items[1]] })).toMatchObject({ ok: false, error: "each item needs its own key" });
    expect(readIntake({ ...REQUEST, requestedOn: "2026-02-30" })).toMatchObject({ ok: false, error: "requestedOn must be a date like 2026-10-30" });
    expect(readIntake({ ...REQUEST, from: "chris@aft.example" })).toMatchObject({ ok: false, error: "body.from is not part of a change-order request" });
    expect(readIntake({ ...REQUEST, items: [{ ...REQUEST.items[1], key: "lvl at doors" }] })).toMatchObject({ ok: false });
  });

  it("keys are compared without case, so a re-sent request finds the same item", () => {
    const r = readIntake({ ...REQUEST, items: [{ ...REQUEST.items[1], key: "LVL" }] });
    expect(r.ok && r.value.items[0].key).toBe("lvl");
  });
});

describe("change-order intake: the draft", () => {
  const read = readIntake(REQUEST);
  if (!read.ok) throw new Error(read.error);
  const ctx = { jobName: "Jury Residence (AFT 123)", jobAddress: "8009 N. Ironwood Drive", client: "AFT", requestedBy: "Chris Turner (AFT)", requestedOn: "2026-10-30", subject: "Sheer wall change at garage" };

  it("puts every line at $0, addressed to the client, and names the request and the drawings", () => {
    const s = snapshotFor(read.value.items[0], ctx);
    expect(s.lines?.map((l) => l.amountCents)).toEqual([0, 0]);
    expect(s.billTo).toEqual({ name: "AFT", attention: "Chris Turner (AFT)" });
    expect(s.date).toBe("2026-10-30");
    expect(s.notIncluded).toEqual([{ description: "Paneling, finishes and door supply", note: "By others" }]);
    expect(s.note).toBe('Requested by Chris Turner (AFT), email "Sheer wall change at garage", October 30, 2026. Per Broderick Engineering SK8, SK9 and SK10 dated 10/29/26.');
  });

  it("hashes the same whatever order jsonb gives the keys back in, and differently when the words change", () => {
    const s = snapshotFor(read.value.items[0], ctx);
    const reordered = JSON.parse(JSON.stringify({ note: s.note, lines: s.lines, date: s.date, job: s.job, notIncluded: s.notIncluded, billTo: s.billTo }));
    expect(draftHash("Shear wall", reordered)).toBe(draftHash("Shear wall", s));
    expect(draftHash("Shear wall", { ...s, note: "edited" })).not.toBe(draftHash("Shear wall", s));
    expect(draftHash("Shear wall, revised", s)).not.toBe(draftHash("Shear wall", s));
  });
});
