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
  now?: Date;
}): BotHome {
  const now = input.now ?? new Date();
  const { people, ...rest } = input.sections;
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
    // One seat per person: info@ and lando@ are both Lando.
    const seen = new Set<string>();
    const team = Object.entries(people)
      .filter(([, p]) => (seen.has(p.name) ? false : (seen.add(p.name), true)))
      .map(([email, p]) => ({ email, name: p.name }));
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
    return { ...base, sections: { ...rest, health }, team, names, inFlight, actions };
  }

  // Everyone else starts from an empty picture and is given only what is
  // theirs. Built from nothing, not by removing things: a section added later
  // stays hidden until someone decides a requester may see it.
  const { people: _none, ...empty } = emptySections();
  void _none;
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
  };
}
