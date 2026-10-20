import {
  emptySections,
  ONLINE_WITHIN_MS,
  type BotAction,
  type BotHome,
  type BotInFlight,
  type BotMe,
  type BotPeople,
  type BotSections,
  type BridgeSeen,
} from "./types";
import { laneNames, lanesOf } from "@/lib/owner/lanes";
import type { WaitingItem } from "@/lib/owner/waiting";

// Who sees what. The Mac decides who may DO something; this decides who may
// LOOK. An owner sees the whole picture. A requester (an employee who can ask
// the bot for things) sees only what is theirs: their drafts, their to-dos,
// their duties, their own requests. Someone on the portal allowlist the bot
// does not know yet sees nothing and is told to ask for a seat.

const REQUEST_LANE_QUIET_MS = 45 * 60_000;

export function whoIs(email: string, people: BotPeople): BotMe {
  const person = people[email];
  return { email, name: person?.name ?? null, role: person?.role ?? null };
}

export function ownerEmails(people: BotPeople): string[] {
  return Object.entries(people)
    .filter(([, p]) => p.role === "owner")
    .map(([email]) => email);
}

/** The owners by name, once each (lando@ and info@ are both Lando). */
export function ownerNames(people: BotPeople): string[] {
  return [...new Set(Object.values(people).filter((p) => p.role === "owner").map((p) => p.name))].sort();
}

function nameFor(email: string, people: BotPeople): string {
  return people[email]?.name ?? email.split("@")[0];
}

export function buildHome(input: {
  email: string;
  sections: BotSections;
  bridge: BridgeSeen;
  inFlight: (BotInFlight & { thread: string; lane?: string | null; claimedAt?: string | null })[];
  actions: BotAction[];
  push: BotHome["push"];
  crew?: BotHome["crew"];
  waiting?: WaitingItem[];
  settings?: BotHome["settings"];
  now?: Date;
}): BotHome {
  const now = input.now ?? new Date();
  // The owner's allowlist mirror and Joist's unsent list are for the Bill
  // screen's own door (/api/billing/bill), not for Home; the field's late
  // list is for the 7 AM push (src/lib/owner/morning.ts).
  const { people, outboundAllow: _allow, joistRecent: _recent, crewLate: _late, ...rest } = input.sections;
  void _allow;
  void _recent;
  void _late;
  const me = whoIs(input.email, people);
  const online = !!input.bridge.seenAt && now.getTime() - Date.parse(input.bridge.seenAt) < ONLINE_WITHIN_MS;

  const inFlight: BotInFlight[] = input.inFlight.map((m) => ({
    id: m.id,
    who: nameFor(m.thread, people),
    preview: m.preview,
    status: m.status,
    createdAt: m.createdAt,
    mine: m.thread === input.email,
  }));
  const actions = input.actions.map((a) => ({ ...a, who: nameFor(a.actor, people) }));

  const base = {
    ok: true as const,
    now: now.toISOString(),
    me,
    bridge: { seenAt: input.bridge.seenAt, online, reportedAt: input.bridge.reportedAt },
    push: input.push,
  };

  if (me.role === "owner") {
    // One seat per person: info@ and lando@ are both Lando. Where a person
    // has two addresses, use the one that carries their name (lando@), not the
    // shared mailbox, so a to-do or a sign-in link goes to them.
    const byName = new Map<string, string[]>();
    for (const [email, p] of Object.entries(people)) byName.set(p.name, [...(byName.get(p.name) ?? []), email]);
    const team = [...byName.entries()]
      .map(([name, emails]) => {
        const first = name.split(/\s+/)[0].toLowerCase();
        return { name, email: emails.find((e) => e.split("@")[0] === first) ?? emails.sort()[0] };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const names = Object.fromEntries(Object.entries(people).map(([email, p]) => [email, p.name]));
    const health = { ...rest.health, problems: { ...rest.health.problems } };
    // The request lane checks in between runs, and one run can take half an
    // hour. Silent for longer than that while the Mac is otherwise up: it is
    // not running, and requests from the app are piling up unanswered.
    const agentSeen = input.bridge.agentSeenAt ? Date.parse(input.bridge.agentSeenAt) : 0;
    if (online && now.getTime() - agentSeen > REQUEST_LANE_QUIET_MS) {
      health.problems.requests =
        "Requests sent from the app are not being picked up. Taps still work. Fix: on the Mac, check that the launchd job com.saddlewood.bot-app-agent is loaded.";
    }
    const lanes = { mine: lanesOf(input.email, people), holders: laneNames(people) };
    return { ...base, sections: { ...rest, health }, team, names, inFlight, actions, crew: input.crew ?? null, waiting: input.waiting ?? [], lanes, settings: input.settings ?? null };
  }

  // Everyone else starts from an empty picture and is given only what is
  // theirs. Built from nothing, not by removing things: a section added later
  // stays hidden until someone decides a requester may see it.
  const { people: _none, outboundAllow: _noAllow, joistRecent: _noRecent, crewLate: _noLate, ...empty } = emptySections();
  void _none;
  void _noAllow;
  void _noRecent;
  void _noLate;
  const mine = {
    ...empty,
    drafts: me.name ? rest.drafts.filter((d) => d.requestedBy === me.name) : [],
    tasks: me.role ? rest.tasks.filter((t) => t.owner === input.email) : [],
    duties: me.role ? rest.duties.filter((d) => d.owner === input.email) : [],
  };
  return {
    ...base,
    sections: mine,
    team: [],
    names: me.name ? { [input.email]: me.name } : {},
    inFlight: inFlight.filter((m) => m.mine),
    actions: actions.filter((a) => a.actor === input.email),
    crew: null,
    waiting: [],
    lanes: null,
    settings: null,
  };
}
