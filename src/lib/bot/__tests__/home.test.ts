import { describe, expect, it } from "vitest";

import { buildHome, ownerEmails } from "../home";
import { emptySections, parseSection, type BotAction, type BotSections } from "../types";
import { canApprove, needsYouCount } from "../view";

const NOW = new Date("2026-10-03T18:00:00Z");
const LANDO = "lando@saddlewoodcontracting.com";
const MARCO = "marco@saddlewoodcontracting.com";
const ELI = "eli@saddlewoodcontracting.com";

function sections(): BotSections {
  const s = emptySections();
  s.people = {
    [LANDO]: { name: "Lando", role: "owner" },
    "info@saddlewoodcontracting.com": { name: "Lando", role: "owner" },
    [MARCO]: { name: "Marco", role: "owner" },
    "ilene8a@gmail.com": { name: "Ilene Ochoa", role: "owner" },
    [ELI]: { name: "Eli", role: "requester" },
  };
  s.drafts = parseSection("drafts", [
    { n: 18, subject: "Powell payment 10", to: "mark@example.com", created: "2026-09-30T04:28:02Z", status: "open", requestedBy: "Lando", approvers: ["Lando", "Marco"], held: false },
    { n: 21, subject: "COI to McCully", to: "office@mccully.example", created: "2026-10-02T15:00:00Z", status: "open", requestedBy: "Eli", approvers: ["Lando", "Marco"], held: false },
    { n: 22, subject: "Jon settlement wire", to: "jon@example.com", created: "2026-10-02T16:00:00Z", status: "open", requestedBy: "Marco", approvers: ["Lando", "Marco"], held: true },
  ]);
  s.tasks = parseSection("tasks", [
    { id: "jon-6602-pay-2", title: "Jon Wright settlement, payment 2 of 3", owner: MARCO },
    { id: "ac938-cmp-vehicles", title: "Get CMP029338 onto the vehicles", owner: ELI },
  ]);
  s.ledger = parseSection("ledger", [{ id: 7, title: "awaiting reply: pay bands", ageDays: 15, tier: 2 }]);
  s.payments = parseSection("payments", [{ n: 3, client: "AFT", invoice: "5203-12", amount: 25423 }]);
  s.health = { ...s.health, problems: { claude: "Claude is signed out." } };
  return s;
}

const bridge = { seenAt: "2026-10-03T17:59:40Z", agentSeenAt: "2026-10-03T17:59:30Z", reportedAt: "2026-10-03T17:58:00Z" };

function home(email: string, over: Partial<Parameters<typeof buildHome>[0]> = {}) {
  return buildHome({
    email,
    sections: sections(),
    bridge,
    inFlight: [
      { id: 1, thread: ELI, who: ELI, preview: "where is the gate code", status: "working", createdAt: "2026-10-03T17:55:00Z", mine: false },
      { id: 2, thread: MARCO, who: MARCO, preview: "draft the Powell follow-up", status: "queued", createdAt: "2026-10-03T17:58:00Z", mine: false },
    ],
    actions: [
      { id: 9, actor: MARCO, kind: "draft.approve", payload: { n: 20 }, status: "done", result: "Sent #20", createdAt: "2026-10-03T17:00:00Z", doneAt: "2026-10-03T17:00:20Z" } satisfies BotAction,
    ],
    push: { available: false, publicKey: null },
    now: NOW,
    ...over,
  });
}

describe("who sees what", () => {
  it("shows an owner everything, with one seat per person", () => {
    const h = home(LANDO);
    expect(h.me).toEqual({ email: LANDO, name: "Lando", role: "owner" });
    expect(h.sections.drafts.map((d) => d.n)).toEqual([18, 21, 22]);
    expect(h.sections.tasks).toHaveLength(2);
    expect(h.sections.ledger).toHaveLength(1);
    expect(h.sections.health.problems.claude).toBeTruthy();
    expect(h.team.map((t) => t.name)).toEqual(["Lando", "Marco", "Ilene Ochoa", "Eli"]);
    expect(h.inFlight.map((m) => m.who)).toEqual(["Eli", "Marco"]);
    expect(h.actions[0].who).toBe("Marco");
    expect("people" in h.sections).toBe(false);
  });

  it("shows a requester only what is theirs", () => {
    const h = home(ELI);
    expect(h.me.role).toBe("requester");
    expect(h.sections.drafts.map((d) => d.n)).toEqual([21]);
    expect(h.sections.tasks.map((t) => t.id)).toEqual(["ac938-cmp-vehicles"]);
    expect(h.sections.ledger).toEqual([]);
    expect(h.sections.payments).toEqual([]);
    expect(h.sections.health.problems).toEqual({});
    expect(h.team).toEqual([]);
    expect(h.inFlight.map((m) => m.id)).toEqual([1]);
    expect(h.actions).toEqual([]);
  });

  it("shows nothing to an allowlisted address the bot has no seat for", () => {
    const h = home("bot@saddlewoodcontracting.com");
    expect(h.me).toEqual({ email: "bot@saddlewoodcontracting.com", name: null, role: null });
    expect(h.sections.drafts).toEqual([]);
    expect(h.sections.tasks).toEqual([]);
    expect(h.inFlight).toEqual([]);
    expect(needsYouCount(h)).toBe(0);
  });
});

describe("a requester's view is built from nothing", () => {
  it("keeps every section empty except their own drafts, to-dos and duties", () => {
    const full = sections();
    full.bids = parseSection("bids", [{ n: 2, project: "Lot 346", gc: "JK" }]);
    full.fixes = parseSection("fixes", [{ id: "F13", status: "open", what: "x" }]);
    full.automations = parseSection("automations", [{ label: "com.saddlewood.bot", name: "Email requests" }]);
    full.activity = parseSection("activity", [{ at: "2026-10-03T17:00:00Z", text: "Answered Marco by text", kind: "reply" }]);
    full.expenses = parseSection("expenses", [{ label: "Z1", amount: 4700, recipient: "Someone" }]);
    const h = buildHome({ email: ELI, sections: full, bridge, inFlight: [], actions: [], push: { available: false, publicKey: null }, now: NOW });
    const own = new Set(["drafts", "tasks", "duties"]);
    for (const [key, value] of Object.entries(h.sections)) {
      if (own.has(key) || key === "health") continue;
      expect(value, key).toEqual([]);
    }
    expect(h.sections.health).toEqual({ problems: {}, downSince: null, checkedAt: null, mailReadAt: null, textsReadAt: null, autosend: { on: false, note: "" }, holds: [] });
    expect(h.names).toEqual({ [ELI]: "Eli" });
  });
});

describe("is the bot there", () => {
  it("tells owners when requests from the app are not being picked up", () => {
    const quiet = home(LANDO, { bridge: { ...bridge, agentSeenAt: "2026-10-03T16:00:00Z" } });
    expect(quiet.sections.health.problems.requests).toMatch(/not being picked up/);
    expect(home(LANDO).sections.health.problems.requests).toBeUndefined();
    // Mac off altogether: one message (offline), not two.
    const off = home(LANDO, { bridge: { seenAt: "2026-10-03T16:00:00Z", agentSeenAt: "2026-10-03T16:00:00Z", reportedAt: null } });
    expect(off.bridge.online).toBe(false);
    expect(off.sections.health.problems.requests).toBeUndefined();
  });

  it("is online when the Mac checked in within the last 75 seconds", () => {
    expect(home(LANDO).bridge.online).toBe(true);
    expect(home(LANDO, { bridge: { ...bridge, seenAt: "2026-10-03T17:55:00Z" } }).bridge.online).toBe(false);
    expect(home(LANDO, { bridge: { ...bridge, seenAt: null } }).bridge.online).toBe(false);
  });
});

describe("what needs you", () => {
  it("counts drafts you can send now plus payments, never a held draft", () => {
    const h = home(LANDO);
    expect(h.sections.drafts.filter((d) => canApprove(d, "Lando")).map((d) => d.n)).toEqual([18, 21]);
    expect(needsYouCount(h)).toBe(3);
  });

  it("names the owners for a notification to owners", () => {
    expect(ownerEmails(sections().people)).not.toContain(ELI);
    expect(ownerEmails(sections().people)).toContain(MARCO);
  });
});
