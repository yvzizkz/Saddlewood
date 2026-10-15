import { describe, expect, it } from "vitest";

import { localDay } from "@/lib/crew/time";
import { dayOf, ladderClock } from "../ladder";
import { buildOverview, type DocRow } from "../overview";

// Money days are Phoenix days (Lando, 2026-10-15). The server runs on UTC, which
// is seven hours ahead, so from 5 PM Phoenix on, the UTC date is already
// tomorrow: a bill due tomorrow showed as past due that evening.

const AFT = "435e8af8-09da-4e3d-ab54-bf3d73c04cf6";
const evening = new Date("2026-10-15T00:30:00Z"); // 5:30 PM on Oct 14 in Phoenix

const bill: DocRow = {
  id: "jury",
  kind: "invoice",
  job_id: null,
  client_id: AFT,
  number: "8009-14",
  title: "",
  status: "issued",
  revision: 1,
  snapshot: {},
  total_cents: 1988186,
  due_date: "2026-10-15",
  token: "t",
  issued_at: "2026-10-12T20:00:00Z",
  created_at: "2026-10-12T20:00:00Z",
};

function nextFor(today: string) {
  const o = buildOverview({ today, rows: [bill], paid: new Map(), events: new Map(), clients: new Map([[AFT, { name: "AFT", billing: {} }]]), jobs: new Map() });
  return o.clients[0].documents[0];
}

describe("Phoenix money days", () => {
  it("reads the evening as today, not tomorrow's UTC date", () => {
    expect(evening.toISOString().slice(0, 10)).toBe("2026-10-15");
    expect(localDay(evening)).toBe("2026-10-14");
  });

  it("dates a timestamp by Phoenix day and leaves a bare day alone", () => {
    expect(dayOf("2026-10-15T00:30:00Z")).toBe("2026-10-14");
    expect(dayOf("2026-10-15T07:00:00Z")).toBe("2026-10-15");
    expect(dayOf("2026-10-15")).toBe("2026-10-15");
  });

  it("starts a no-due-date bill's clock on the Phoenix day it was sent", () => {
    expect(ladderClock(null, "2026-10-06T01:15:00Z", false)).toBe("2026-10-05");
  });

  it("a bill due tomorrow is not late at 5:30 PM, and is the day after", () => {
    expect(nextFor(localDay(evening)).next?.daysLate).toBe(-1);
    expect(nextFor("2026-10-16").next?.daysLate).toBe(1);
  });
});
