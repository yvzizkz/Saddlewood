import { ownerEmails } from "@/lib/bot/home";
import { laneOwners, type Lane } from "@/lib/owner/lanes";
import { sendPush } from "@/lib/bot/push";
import { readState } from "@/lib/bot/queries";
import { say } from "./messages";
import { listPeople } from "./queries";
import type { CrewLang } from "./types";

// Notifications on the crew side. They never fail the thing that caused them:
// the punch, the entry or the assignment is already recorded.

type Both = { en: string; es: string };

export async function ownerAddresses(): Promise<string[]> {
  const { sections } = await readState();
  return ownerEmails(sections.people);
}

/** The owner who holds a lane (src/lib/owner/lanes.ts), or every owner if nobody does. */
export async function laneAddresses(lane: Lane): Promise<string[]> {
  const { sections } = await readState();
  return laneOwners(lane, sections.people);
}

/**
 * To the phone of the owner whose lane this is: field escalations and the
 * supervisor's plan to Marco ("decisions"), hours to whoever runs payroll
 * ("money"). Opens the Crew tab.
 */
export async function notifyOwners(note: { title: string; body: string; tag: string }, lane: Lane): Promise<void> {
  try {
    await sendPush(await laneAddresses(lane), {
      title: note.title.slice(0, 80),
      body: note.body.replace(/\s+/g, " ").slice(0, 240),
      url: "/app/crew",
      tag: note.tag.slice(0, 60),
    });
  } catch (e) {
    console.error("[crew/notify] owners:", (e as Error).message);
  }
}

/**
 * To whoever runs the field: every seat whose group has "updates" switched on
 * (the supervisor), so updates from the crew land with them and not with
 * Marco. With nobody in such a group, the owner of the "decisions" lane (Marco). `alsoOwners` for what he must hear either way (safety).
 * The person who caused it is never told about their own act.
 */
export async function notifySupervisors(
  note: { title: string; body: string; tag: string },
  opts: { alsoOwners?: boolean; except?: string } = {},
): Promise<void> {
  let leads: string[] = [];
  try {
    leads = (await listPeople()).filter((p) => p.active && p.perms.includes("updates") && p.email !== opts.except).map((p) => p.email);
  } catch (e) {
    console.error("[crew/notify] leads:", (e as Error).message);
  }
  if (!leads.length || opts.alsoOwners) await notifyOwners(note, "decisions");
  if (!leads.length) return;
  try {
    await sendPush(leads, {
      title: note.title.slice(0, 80),
      body: note.body.replace(/\s+/g, " ").slice(0, 240),
      url: "/app/crew",
      tag: note.tag.slice(0, 60),
    });
  } catch (e) {
    console.error("[crew/notify] leads:", (e as Error).message);
  }
}

/** To one crew member, in their language. */
export async function notifyCrew(person: { email: string; lang: CrewLang }, text: { title: Both; body: Both }, tag: string): Promise<void> {
  try {
    await sendPush([person.email], {
      title: say(person.lang, text.title).slice(0, 80),
      body: say(person.lang, text.body).replace(/\s+/g, " ").slice(0, 240),
      url: "/app",
      tag: tag.slice(0, 60),
    });
  } catch (e) {
    console.error("[crew/notify] crew:", (e as Error).message);
  }
}
