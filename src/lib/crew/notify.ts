import { ownerEmails } from "@/lib/bot/home";
import { sendPush } from "@/lib/bot/push";
import { readState } from "@/lib/bot/queries";
import { say } from "./messages";
import type { CrewLang } from "./types";

// Notifications on the crew side. They never fail the thing that caused them:
// the punch, the entry or the assignment is already recorded.

type Both = { en: string; es: string };

export async function ownerAddresses(): Promise<string[]> {
  const { sections } = await readState();
  return ownerEmails(sections.people);
}

/** To every owner's phone. Opens the Crew tab. */
export async function notifyOwners(note: { title: string; body: string; tag: string }): Promise<void> {
  try {
    await sendPush(await ownerAddresses(), {
      title: note.title.slice(0, 80),
      body: note.body.replace(/\s+/g, " ").slice(0, 240),
      url: "/app/crew",
      tag: note.tag.slice(0, 60),
    });
  } catch (e) {
    console.error("[crew/notify] owners:", (e as Error).message);
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
