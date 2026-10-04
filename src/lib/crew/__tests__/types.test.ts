import { describe, expect, it } from "vitest";

import { adminActSchema, crewActSchema, crewSyncSchema, jobSlug, parseAmount } from "../types";

const ID = "3f6c1a2e-0000-4000-8000-000000000001";
const file = { path: "u/0123456789abcdef/202610/a1b2c3d4e5f6-receipt.jpg", name: "receipt.jpg", type: "image/jpeg", size: 1000 };

describe("what a crew member can send", () => {
  it("takes a clock-in with the job and nothing else required", () => {
    const act = crewActSchema.parse({ kind: "punch.in", jobId: "powell", clientId: ID });
    expect(act).toMatchObject({ kind: "punch.in", jobId: "powell", jobName: "", geo: null, note: "" });
  });

  it("refuses a punch with no way to tell a retry from a second tap", () => {
    expect(crewActSchema.safeParse({ kind: "punch.in", jobId: "powell" }).success).toBe(false);
    expect(crewActSchema.safeParse({ kind: "punch.out", clientId: "short" }).success).toBe(false);
  });

  it("refuses a location that is not on the planet, and a break longer than four hours", () => {
    expect(crewActSchema.safeParse({ kind: "punch.in", jobId: "p", clientId: ID, geo: { lat: 133, lng: -111 } }).success).toBe(false);
    expect(crewActSchema.safeParse({ kind: "punch.out", clientId: ID, breakMin: 600 }).success).toBe(false);
    expect(crewActSchema.safeParse({ kind: "punch.out", clientId: ID, breakMin: 30 }).success).toBe(true);
  });

  it("needs a photo for a receipt, and only a file this app issued", () => {
    expect(crewActSchema.safeParse({ kind: "receipt.add", jobId: "p", files: [], clientId: ID }).success).toBe(false);
    expect(crewActSchema.safeParse({ kind: "receipt.add", jobId: "p", files: [{ ...file, path: "../../etc/passwd" }], clientId: ID }).success).toBe(false);
    const ok = crewActSchema.parse({ kind: "receipt.add", jobId: "p", files: [file], clientId: ID });
    expect(ok).toMatchObject({ amount: null, paidBy: "company", vendor: "" });
  });

  it("needs to hear what got done before it closes a day", () => {
    expect(crewActSchema.safeParse({ kind: "eod.add", jobId: "p", done: " ", clientId: ID }).success).toBe(false);
    const ok = crewActSchema.parse({ kind: "eod.add", jobId: "p", done: "North wall framed", clientId: ID });
    expect(ok).toMatchObject({ stuck: "", needs: "", asked: "", safety: "", files: [] });
  });

  it("takes a time fix only with real clock times and a reason", () => {
    const base = { kind: "timefix.add", day: "2026-10-05", start: "06:00", end: "14:30", jobId: "p", clientId: ID };
    expect(crewActSchema.safeParse({ ...base, note: "forgot to clock out" }).success).toBe(true);
    expect(crewActSchema.safeParse({ ...base, note: "" }).success).toBe(false);
    expect(crewActSchema.safeParse({ ...base, start: "6am", note: "forgot" }).success).toBe(false);
    expect(crewActSchema.safeParse({ ...base, day: "10/05/2026", note: "forgot" }).success).toBe(false);
  });

  it("has no way to name another person, a shift time, or an approval", () => {
    // Nothing in the union lets a crew member write a time directly or act for someone else.
    for (const kind of ["shift.edit", "shift.add", "fix.decide", "person.add", "schedule.set", "task.add", "question.ask"]) {
      expect(crewActSchema.safeParse({ kind, id: 1, email: "x@example.com", clientId: ID }).success).toBe(false);
    }
    const out = crewActSchema.parse({ kind: "punch.out", clientId: ID, email: "someone@else.com", startedAt: "2020-01-01T00:00:00Z" });
    expect(out).not.toHaveProperty("email");
    expect(out).not.toHaveProperty("startedAt");
  });
});

describe("what an owner can send", () => {
  it("adds a person in English by default and emails them", () => {
    expect(adminActSchema.parse({ kind: "person.add", name: "Arnold Mujica", email: " Arnold@Example.com " })).toMatchObject({
      email: "arnold@example.com",
      lang: "en",
      invite: true,
    });
  });

  it("will not change a shift without a reason", () => {
    expect(adminActSchema.safeParse({ kind: "shift.edit", id: 4, end: "14:30", why: "" }).success).toBe(false);
    expect(adminActSchema.safeParse({ kind: "shift.edit", id: 4, end: "14:30", why: "forgot to clock out" }).success).toBe(true);
    expect(adminActSchema.safeParse({ kind: "shift.void", id: 4, why: "x" }).success).toBe(false);
  });

  it("puts between one and forty people on a job", () => {
    const base = { kind: "schedule.set", day: "2026-10-06", jobId: "powell" };
    expect(adminActSchema.safeParse({ ...base, emails: [] }).success).toBe(false);
    expect(adminActSchema.parse({ ...base, emails: ["a@example.com"] })).toMatchObject({ startTime: "", note: "" });
    expect(adminActSchema.safeParse({ ...base, emails: ["a@example.com"], startTime: "6:00" }).success).toBe(false);
  });
});

describe("what the Mac sends back", () => {
  it("keeps the items that parse and drops the rest", () => {
    const post = crewSyncSchema.parse({
      entries: [{ id: 1, status: "filed", bot: { amount: 146.61 } }, { id: "two", status: "filed" }, { id: 3, status: "approved" }],
      questions: [
        { email: "A@Example.com", body: "What was the total?", dedupe: "amount-1", kind: "amount", ref: { entry: 1 } },
        { email: "a@example.com", body: "No dedupe key" },
        { email: "not an email", body: "x", dedupe: "k" },
      ],
      seen: [4, 5],
      notify: [
        { to: "owners", title: "Arnold has not clocked in", url: "/app/crew" },
        { to: ["a@example.com"], title: "Tomorrow", url: "https://evil.example/" },
      ],
    });
    expect(post.entries).toEqual([{ id: 1, status: "filed", bot: { amount: 146.61 } }]);
    expect(post.questions).toHaveLength(1);
    expect(post.questions[0]).toMatchObject({ email: "a@example.com", kind: "amount", dedupe: "amount-1", bodyEs: "", options: [] });
    expect(post.seen).toEqual([4, 5]);
    expect(post.notify).toHaveLength(1);
    expect(post.shifts).toEqual([]);
    expect(post.tasks).toEqual([]);
  });

  it("treats a report with nothing in it as nothing", () => {
    expect(crewSyncSchema.parse({})).toEqual({ entries: [], questions: [], seen: [], shifts: [], schedule: [], tasks: [], notify: [] });
  });
});

describe("small helpers", () => {
  it("reads a dollar figure the way a person types one", () => {
    expect(parseAmount("146.61")).toBe(146.61);
    expect(parseAmount("$1,204.50")).toBe(1204.5);
    expect(parseAmount(" 31 ")).toBe(31);
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("about 40")).toBeNull();
    expect(parseAmount("1e5")).toBeNull();
    expect(parseAmount("999999")).toBeNull();
  });

  it("makes a job id out of a job name", () => {
    expect(jobSlug("Powell Residence")).toBe("powell-residence");
    expect(jobSlug("  6602 N. 40th St. ")).toBe("6602-n-40th-st");
    expect(jobSlug("Other")).toBe("job-other"); // "other" is the "not on the list" choice
    expect(jobSlug("!!!")).toBe("job-x");
  });
});
