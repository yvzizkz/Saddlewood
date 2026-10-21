import { ownerEmails } from "@/lib/bot/home";
import { sendPush } from "@/lib/bot/push";
import { readState } from "@/lib/bot/queries";
import { MSG } from "./messages";
import { notifyCrew } from "./notify";
import { getEntry, getJob, getPerson, insertPickup, listJobPeople, listPeople, type CrewPersonRow } from "./queries";
import { getRequest, insertRequest, patchRequest, syncRequestToPickup } from "./requestQueries";
import { decideRule, dollars, ownersFirst, pmsOnJob, requestDetail, requestTitle } from "./requestRules";
import { isSettingKey, parseSettingValue, readSettings, writeSetting, type AppSettings } from "./settings";
import { addDays, localDay } from "./time";
import { OTHER_JOB, firstNameOf, type AdminAct, type CrewEntry, type CrewPickupStatus, type CrewRequest, type CrewSync } from "./types";

// Material requests from the field (migration 0023): where they come from
// (an end of day, the Mac's reading of a voice memo, a PM or owner by hand),
// who is asked, how they are decided under the owners' limits, and how an
// order becomes a will-call pickup for the runner. The rules themselves are
// pure, in requestRules.ts; this file is the server side of them.

export type RequestResult = { ok: true; note?: string } | { ok: false; status: number; error: string };

const ok = (note?: string): RequestResult => ({ ok: true, ...(note ? { note } : {}) });
const bad = (status: number, error: string): RequestResult => ({ ok: false, status, error });

/** Whoever is acting from the Crew screens, as admin.ts passes them. */
export type Actor = { email: string; name: string; role?: "owner" | "member"; perms?: readonly string[] };

type RequestAct = Extract<AdminAct, { kind: "request.add" | "request.decide" | "request.order" | "request.cancel" | "settings.set" }>;

/** A field job for a request: a job on the list, or none ("other" and unknown ids keep the name only). */
async function requestJob(jobId: string, jobName: string): Promise<{ id: string; name: string }> {
  if (!jobId || jobId === OTHER_JOB) return { id: "", name: jobName };
  const job = await getJob(jobId);
  return job ? { id: job.id, name: job.name } : { id: "", name: jobName || jobId };
}

// ---- who hears about a new request --------------------------------------------------

/** To the owners' phones: whoever answers first (requests.answersFirst), or every owner when `all`. Opens Home. */
async function askOwners(note: { title: string; body: string; tag: string }, settings: AppSettings, all = false): Promise<void> {
  try {
    const { sections } = await readState();
    const to = all ? ownerEmails(sections.people) : ownersFirst(sections.people, settings["requests.answersFirst"]);
    await sendPush(to, { title: note.title.slice(0, 80), body: note.body.replace(/\s+/g, " ").slice(0, 240), url: "/app", tag: note.tag.slice(0, 60) });
  } catch (e) {
    console.error("[crew/requests] owners:", (e as Error).message);
  }
}

/**
 * A new request goes to the project manager(s) on its job when there is one
 * and it is within their limit; otherwise to the owners, both of them when it
 * is over the owners' limit. The asker is never told about their own ask.
 */
export async function notifyNewRequest(r: CrewRequest, asker: string, opts: { skipOwners?: boolean } = {}): Promise<void> {
  try {
    const settings = await readSettings();
    const overPm = r.estCents !== null && r.estCents > settings["requests.pmLimitCents"];
    const overOwner = r.estCents !== null && r.estCents > settings["requests.ownerLimitCents"];
    const pmEmails = new Set(pmsOnJob(r, await listJobPeople()));
    const pms = (await listPeople()).filter((p) => p.active && pmEmails.has(p.email) && p.perms.includes("requests.approve"));
    if (pms.length && !overPm) {
      for (const p of pms) await notifyCrew(p, MSG.newRequest(asker, r.jobName, requestDetail(r)), `crew-req-${r.id}`, "/app/crew");
      return;
    }
    if (opts.skipOwners && !overOwner) return;
    await askOwners({ title: requestTitle(r, asker), body: requestDetail(r), tag: `crew-req-${r.id}` }, settings, overOwner);
  } catch (e) {
    console.error("[crew/requests] notify:", (e as Error).message);
  }
}

// ---- where requests come from -------------------------------------------------------

/**
 * The site: an end of day whose "needs" is not empty becomes one request
 * (once per entry, however often the form is re-sent). The entry is already
 * recorded; a problem here is logged, never raised.
 */
export async function createRequestFromEntry(person: Pick<CrewPersonRow, "email" | "name">, entry: Pick<CrewEntry, "id" | "jobId" | "jobName">, needs: string): Promise<CrewRequest | null> {
  const items = needs.trim();
  if (items.length < 2) return null;
  try {
    const job = await requestJob(entry.jobId, entry.jobName);
    const { request, existed } = await insertRequest({ jobId: job.id, jobName: job.name, trade: "", items, qty: "", estCents: null, askedBy: person.email, entryId: entry.id });
    if (!existed) await notifyNewRequest(request, firstNameOf(person.name));
    return request;
  } catch (e) {
    console.error("[crew/requests] from entry:", (e as Error).message);
    return null;
  }
}

/** The Mac: needs it read out of a voice memo. Same one-per-entry rule. -> how many were new */
export async function applyMacRequests(items: CrewSync["requests"], active: Map<string, CrewPersonRow>): Promise<number> {
  let made = 0;
  for (const it of items) {
    const entry = await getEntry(it.entryId);
    if (!entry || entry.kind !== "eod") continue;
    const job = await requestJob(it.jobId || entry.jobId, it.jobName || entry.jobName);
    const { request, existed } = await insertRequest({ jobId: job.id, jobName: job.name, trade: it.trade, items: it.items.trim(), qty: "", estCents: null, askedBy: entry.email, entryId: entry.id });
    if (existed) continue;
    made += 1;
    const person = active.get(entry.email);
    await notifyNewRequest(request, firstNameOf(person?.name ?? "") || entry.email.split("@")[0]);
  }
  return made;
}

// ---- the acts ----------------------------------------------------------------------

/** A crew member takes back a request of their own while it is still asked. */
export async function cancelOwnRequest(person: Pick<CrewPersonRow, "email" | "name">, id: number, note: string, nowDate = new Date()): Promise<RequestResult> {
  const r = await getRequest(id);
  if (!r || r.askedBy !== person.email || r.status !== "asked") return bad(404, "no request");
  const saved = await patchRequest(r.id, { status: "cancelled", decided_by: person.name, decided_at: nowDate.toISOString(), decision_note: note }, { statusIn: ["asked"] });
  return saved ? ok() : bad(409, "no request");
}

/**
 * The Crew screens' acts. The route has already checked the switch
 * (ACT_NEEDS) and runAdminAct the job scope; what is left is the limit and
 * the request's state.
 */
export async function runRequestAct(owner: Actor, act: RequestAct, nowDate = new Date()): Promise<RequestResult> {
  const today = localDay(nowDate);
  const at = nowDate.toISOString();
  const who = { role: owner.role ?? "owner", email: owner.email, perms: owner.perms ?? [] } as const;
  const first = firstNameOf(owner.name);

  switch (act.kind) {
    case "request.add": {
      const job = await getJob(act.jobId);
      if (!job || !job.active) return bad(400, "That job is not on the list.");
      const { request } = await insertRequest({ jobId: job.id, jobName: job.name, trade: act.trade, items: act.items, qty: act.qty, estCents: act.estCents ?? null, askedBy: owner.email, entryId: null });
      // An owner's own ask needs no owner's push: they can approve it on the spot.
      await notifyNewRequest(request, first, { skipOwners: who.role === "owner" });
      return ok(who.role === "owner" ? "Asked. Approve it below when you are ready." : "Asked. Marco or Lando will see it.");
    }

    case "request.decide": {
      const r = await getRequest(act.id);
      if (!r) return bad(404, "That request is gone.");
      const settings = await readSettings();
      const limit = settings["requests.pmLimitCents"];
      const rule = decideRule(who, r, act.decision, act.estCents, limit);
      if (!rule.ok) return bad(rule.status, rule.error);
      const est = act.estCents ?? r.estCents;
      const asker = await getPerson(r.askedBy);
      const askerFirst = firstNameOf(asker?.name ?? "") || r.askedBy.split("@")[0];
      const tellAsker = async (text: { title: { en: string; es: string }; body: { en: string; es: string } }) => {
        if (asker?.active && asker.email !== owner.email) await notifyCrew(asker, text, `crew-req-${r.id}`);
      };

      if (act.decision === "talk") {
        const saved = await patchRequest(r.id, { talk: true, decided_by: owner.name, decision_note: act.note, est_cents: est }, { statusIn: ["asked"] });
        if (!saved) return bad(409, "Someone else just decided it.");
        await tellAsker(MSG.requestTalk(first, r.items, act.note));
        return ok(`${askerFirst} was told you want to talk. It stays open.`);
      }

      if (rule.overLimit) {
        // A yes above the PM limit: keep the number, hand it up, leave it asked.
        await patchRequest(r.id, { est_cents: est }, { statusIn: ["asked"] });
        await askOwners(
          { title: `${requestTitle(r, askerFirst)} · over ${first}'s limit`, body: `${requestDetail({ ...r, estCents: est })} · ${first} says yes`, tag: `crew-req-${r.id}` },
          settings,
          est !== null && est > settings["requests.ownerLimitCents"],
        );
        return ok(`Over your limit (${dollars(limit)}): sent to the owners with your yes.`);
      }

      if (act.decision === "deny" && act.note.trim().length < 2) return bad(400, "Say why, so they know what to do instead.");
      const approved = act.decision === "approve";
      const saved = await patchRequest(
        r.id,
        { status: approved ? "approved" : "denied", decided_by: owner.name, decided_at: at, decision_note: act.note, talk: false, est_cents: est },
        { statusIn: ["asked"] },
      );
      if (!saved) return bad(409, "Someone else just decided it.");
      await tellAsker(MSG.requestDecided(approved, first, r.items, act.note));
      if (approved) {
        // Whoever runs the job places the order: the PMs on it, if the decider is not one of them.
        const pmEmails = new Set(pmsOnJob(r, await listJobPeople()).filter((e) => e !== owner.email));
        for (const p of (await listPeople()).filter((p) => p.active && pmEmails.has(p.email))) {
          await notifyCrew(p, MSG.requestToOrder(askerFirst, r.items), `crew-req-${r.id}`, "/app/crew");
        }
      }
      return ok(approved ? "Approved. Place the order, then mark it ordered so the runner gets it." : "Not approved. They were told.");
    }

    case "request.order": {
      const r = await getRequest(act.id);
      if (!r) return bad(404, "That request is gone.");
      // An owner's order is the approval; a member orders what was approved.
      const from: CrewRequest["status"][] = who.role === "owner" ? ["asked", "approved"] : ["approved"];
      if (!from.includes(r.status)) return bad(409, r.status === "asked" ? "Approve it first." : `That request was already ${r.status}.`);
      const day = act.day ?? addDays(today, 1);
      if (day < today) return bad(400, "That day has passed.");
      const pickup = await insertPickup({
        day,
        jobId: r.jobId,
        jobName: r.jobName,
        supplier: act.supplier,
        place: act.store,
        orderRef: act.orderRef,
        items: `${r.items}${r.qty ? ` (${r.qty})` : ""}`,
        note: `request #${r.id}`,
        email: "",
        createdBy: owner.name,
      });
      const saved = await patchRequest(
        r.id,
        {
          status: "ordered",
          supplier: act.supplier,
          store: act.store,
          order_ref: act.orderRef,
          pickup_id: pickup.id,
          ...(r.status === "asked" ? { decided_by: owner.name, decided_at: at, est_cents: r.estCents } : {}),
        },
        { statusIn: from },
      );
      if (!saved) return bad(409, "Someone else just changed it.");
      const people = await listPeople();
      const runners = people.filter((p) => p.active && p.perms.includes("pickups.run"));
      for (const p of runners) await notifyCrew(p, MSG.newPickup(pickup.supplier, pickup.jobName, pickup.day, today), `crew-pickup-${pickup.id}`);
      const asker = people.find((p) => p.email === r.askedBy);
      if (asker?.active && asker.email !== owner.email) await notifyCrew(asker, MSG.requestOrdered(r.items, act.supplier, day, today), `crew-req-${r.id}`);
      return ok(runners.length ? `Ordered. On ${runners.map((p) => firstNameOf(p.name)).join(", ")}'s list for ${day === today ? "today" : day === addDays(today, 1) ? "tomorrow" : day}.` : "Ordered and staged. Nobody has a runner seat yet, so nobody was told.");
    }

    case "request.cancel": {
      const r = await getRequest(act.id);
      if (!r) return bad(404, "That request is gone.");
      if (r.status !== "asked" && r.status !== "approved") return bad(409, r.status === "ordered" || r.status === "picked" ? "It is already ordered: cancel the pickup instead." : `That request was already ${r.status}.`);
      const saved = await patchRequest(r.id, { status: "cancelled", decided_by: owner.name, decided_at: at, decision_note: act.note }, { statusIn: ["asked", "approved"] });
      if (!saved) return bad(409, "Someone else just changed it.");
      const asker = await getPerson(r.askedBy);
      if (asker?.active && asker.email !== owner.email) await notifyCrew(asker, MSG.requestCancelled(first, r.items, act.note), `crew-req-${r.id}`);
      return ok("Cancelled.");
    }

    case "settings.set": {
      if (who.role !== "owner") return bad(403, "Settings are the owners'.");
      if (!isSettingKey(act.key)) return bad(400, "That is not a setting.");
      const value = parseSettingValue(act.key, act.value);
      if (value === null) return bad(400, "That value does not fit this setting.");
      const current = await readSettings();
      const pm = act.key === "requests.pmLimitCents" ? (value as number) : current["requests.pmLimitCents"];
      const own = act.key === "requests.ownerLimitCents" ? (value as number) : current["requests.ownerLimitCents"];
      if (pm > own) return bad(400, "The PM limit cannot be above the owners' limit.");
      await writeSetting(act.key, value as never, owner.name);
      return ok("Saved. It applies to the next request.");
    }
  }
}

// ---- the pickup carries back ---------------------------------------------------------

/**
 * A pickup made from a request carries its status back: staged again,
 * picked, delivered, or cancelled. Reads work it out from the pickup anyway
 * (requestFromPickup); this keeps the stored column the same. Never fails the pickup.
 */
export async function mirrorPickupToRequest(pickupId: number, status: CrewPickupStatus): Promise<void> {
  try {
    await syncRequestToPickup(pickupId, status);
  } catch (e) {
    console.error("[crew/requests] mirror:", (e as Error).message);
  }
}
