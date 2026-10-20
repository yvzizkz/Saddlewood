import { threadKey } from "@/lib/bot/queries";
import type { BotFileRef } from "@/lib/bot/types";
import { syncEodDirectivesAndDecisions, syncReceiptEntryToPurchases } from "@/lib/field/ops";
import { MSG, say } from "./messages";
import { notifyOwners, notifySupervisors } from "./notify";
import { cancelOwnRequest, createRequestFromEntry, mirrorPickupToRequest } from "./requests";
import {
  ackSchedule,
  answerQuestion,
  closeQuestions,
  closeShift,
  countEntries,
  getEntry,
  getJob,
  getPickup,
  getQuestion,
  getShift,
  getTask,
  insertEntry,
  insertShift,
  lastShift,
  openShift,
  patchEntry,
  patchPerson,
  patchPickup,
  patchTask,
  type CrewPersonRow,
  type NewEntry,
} from "./queries";
import { addDays, clock12, dayShort, hoursText, isClock, localDay, localInstant } from "./time";
import {
  LATE_PUNCH_GRACE_MS,
  LATE_PUNCH_MAX_MS,
  LONG_SHIFT_MIN,
  MAX_ENTRIES_PER_DAY,
  OTHER_JOB,
  firstNameOf,
  hasPerm,
  isAudioRef,
  parseAmount,
  type Capability,
  type CrewAct,
  type CrewEntry,
  type Geo,
} from "./types";

// Everything a crew member can do, in one place. Each act is checked against
// what is theirs (their shift, their task, their question, files in their own
// folder) and written at once: nothing here waits for the office Mac.

export type ActResult = { ok: true; note?: string } | { ok: false; status: number; error: string };

const ok = (note?: string): ActResult => ({ ok: true, ...(note ? { note } : {}) });
const bad = (status: number, error: string): ActResult => ({ ok: false, status, error });

type Job = { id: string; name: string };

async function resolveJob(jobId: string, jobName: string): Promise<Job | null> {
  if (jobId === OTHER_JOB) return jobName.length >= 2 ? { id: OTHER_JOB, name: jobName } : null;
  const job = await getJob(jobId);
  return job && job.active ? { id: job.id, name: job.name } : null;
}

type PunchTime = { time: number; late: boolean; lateMin: number };

/**
 * When a punch happened. The server's clock, unless the phone saved the tap
 * with no signal and is sending it now: then it is the phone's time, marked
 * late so an owner can see the difference. A time from the future, or one too
 * old to trust, is never used.
 */
export function punchTime(at: string | undefined, now: number): PunchTime | null {
  if (!at) return { time: now, late: false, lateMin: 0 };
  const t = Date.parse(at);
  if (Number.isNaN(t) || t > now - LATE_PUNCH_GRACE_MS) return { time: now, late: false, lateMin: 0 };
  if (now - t > LATE_PUNCH_MAX_MS) return null;
  return { time: t, late: true, lateMin: Math.round((now - t) / 60000) };
}

function joinReview(...parts: string[]): string {
  return parts.filter(Boolean).join("; ").slice(0, 300);
}

function ownFiles(files: BotFileRef[], email: string): boolean {
  const prefix = `u/${threadKey(email)}/`;
  return files.every((f) => f.path.startsWith(prefix));
}

const OWN_DAY_NEEDS: Partial<Record<CrewAct["kind"], Capability>> = {
  "punch.in": "clock",
  "punch.switch": "clock",
  "timefix.add": "clock",
  "receipt.add": "receipts",
};

export async function runCrewAct(person: CrewPersonRow, act: CrewAct, nowDate = new Date()): Promise<ActResult> {
  const { email, lang } = person;
  const now = nowDate.getTime();
  const first = firstNameOf(person.name);

  // The group's switches for the person's own day. Everything else (progress,
  // the end of day, notes, tasks, answers) is always on.
  const needs = OWN_DAY_NEEDS[act.kind];
  if (needs && !hasPerm(person, needs)) return bad(403, say(lang, MSG.notAllowed));

  switch (act.kind) {
    case "punch.in": {
      const job = await resolveJob(act.jobId, act.jobName);
      if (!job) return bad(400, say(lang, MSG.jobGone));
      const open = await openShift(email);
      if (open) {
        // The same tap arriving twice (a retry on a bad connection) is not a second clock-in.
        if (open.clientIn === act.clientId) return ok();
        return bad(409, say(lang, MSG.alreadyOn(open.jobName, clock12(open.startedAt))));
      }
      const when = punchTime(act.at, now);
      if (!when) return bad(400, say(lang, MSG.tooOld));
      const prior = await lastShift(email);
      if (prior?.clientIn === act.clientId) return ok();
      // Never overlap the shift before it.
      let start = when.time;
      if (prior?.endedAt && Date.parse(prior.endedAt) >= start) start = Math.min(now, Date.parse(prior.endedAt) + 1000);
      const startedAt = new Date(start).toISOString();
      const { conflict } = await insertShift({
        email,
        jobId: job.id,
        jobName: job.name,
        day: localDay(start),
        startedAt,
        startGeo: act.geo as Geo | null,
        note: act.note,
        source: when.late ? "late" : "app",
        review: when.late ? `clock-in sent ${hoursText(when.lateMin)} after the tap` : "",
        clientIn: act.clientId,
      });
      if (conflict) {
        const other = await openShift(email);
        if (other?.clientIn === act.clientId) return ok();
        return bad(409, say(lang, other ? MSG.alreadyOn(other.jobName, clock12(other.startedAt)) : MSG.changed));
      }
      return ok();
    }

    case "punch.out": {
      const open = await openShift(email);
      if (!open) {
        const prior = await lastShift(email);
        if (prior?.clientOut === act.clientId) return ok();
        return bad(409, say(lang, MSG.notOn));
      }
      const when = punchTime(act.at, now);
      if (!when) return bad(400, say(lang, MSG.tooOld));
      const start = Date.parse(open.startedAt);
      if (when.late && when.time <= start) return bad(400, say(lang, MSG.beforeStart));
      const end = Math.max(when.time, start + 1000);
      const onClock = Math.floor((end - start) / 60000);
      const closed = await closeShift(open.id, {
        endedAt: new Date(end).toISOString(),
        // A break cannot be longer than the shift it came out of.
        breakMin: Math.min(act.breakMin, Math.max(0, onClock - 1)),
        endGeo: act.geo as Geo | null,
        note: [open.note, act.note].filter(Boolean).join(" · ").slice(0, 600),
        endSource: when.late ? "late" : "app",
        review: joinReview(
          open.review,
          when.late ? `clock-out sent ${hoursText(when.lateMin)} after the tap` : "",
          onClock > LONG_SHIFT_MIN ? `${hoursText(onClock)} on the clock` : "",
        ),
        clientOut: act.clientId,
      });
      // Not closed by us: something else closed it between the read and the write. Either way it is closed.
      void closed;
      return ok();
    }

    case "punch.switch": {
      const job = await resolveJob(act.jobId, act.jobName);
      if (!job) return bad(400, say(lang, MSG.jobGone));
      const open = await openShift(email);
      if (!open) {
        // The same tap again, after its first half (closing the old shift)
        // landed and its second half did not: finish it.
        const prior = await lastShift(email);
        if (prior?.clientOut !== act.clientId || !prior.endedAt) return bad(409, say(lang, MSG.notOn));
        const { conflict } = await insertShift({
          email,
          jobId: job.id,
          jobName: job.name,
          day: localDay(prior.endedAt),
          startedAt: prior.endedAt,
          startGeo: act.geo as Geo | null,
          source: prior.endSource === "late" ? "late" : "app",
          clientIn: act.clientId,
        });
        return conflict ? bad(409, say(lang, MSG.changed)) : ok();
      }
      if (open.clientIn === act.clientId) return ok();
      if (open.jobId === job.id && open.jobName === job.name) return bad(400, say(lang, MSG.sameJob));
      const when = punchTime(act.at, now);
      if (!when) return bad(400, say(lang, MSG.tooOld));
      const start = Date.parse(open.startedAt);
      if (when.late && when.time <= start) return bad(400, say(lang, MSG.beforeStart));
      const at = Math.max(when.time, start + 1000);
      const iso = new Date(at).toISOString();
      const lateNote = when.late ? `job change sent ${hoursText(when.lateMin)} after the tap` : "";
      const closed = await closeShift(open.id, {
        endedAt: iso,
        breakMin: 0,
        endGeo: act.geo as Geo | null,
        note: open.note,
        endSource: when.late ? "late" : "app",
        review: joinReview(open.review, lateNote),
        clientOut: act.clientId,
      });
      if (!closed) return bad(409, say(lang, MSG.changed));
      const { conflict } = await insertShift({
        email,
        jobId: job.id,
        jobName: job.name,
        day: localDay(at),
        startedAt: iso,
        startGeo: act.geo as Geo | null,
        source: when.late ? "late" : "app",
        review: lateNote,
        clientIn: act.clientId,
      });
      if (conflict) return bad(409, say(lang, MSG.changed));
      return ok();
    }

    case "receipt.add": {
      const job = await resolveJob(act.jobId, act.jobName);
      if (!job) return bad(400, say(lang, MSG.jobGone));
      const day = localDay(now);
      const { res, entry } = await saveEntry(person, nowDate, {
        kind: "receipt",
        day,
        jobId: job.id,
        jobName: job.name,
        body: act.note,
        data: { amount: act.amount, vendor: act.vendor, paidBy: act.paidBy, ...(act.trade ? { trade: act.trade } : {}) },
        files: act.files,
        clientId: act.clientId,
      });
      if (res.ok && entry) {
        await syncReceiptEntryToPurchases({
          entryId: entry.id,
          day,
          jobId: job.id,
          jobName: job.name,
          vendor: act.vendor,
          amountDollars: act.amount,
          paidBy: act.paidBy,
          note: act.note,
          trade: act.trade,
          personName: person.name,
          personEmail: person.email,
        });
      }
      return res;
    }

    case "progress.add": {
      if (!act.note && !act.files.length) return bad(400, say(lang, MSG.needNoteOrPhoto));
      const job = await resolveJob(act.jobId, act.jobName);
      if (!job) return bad(400, say(lang, MSG.jobGone));
      return addEntry(person, nowDate, {
        kind: "progress",
        day: localDay(now),
        jobId: job.id,
        jobName: job.name,
        body: act.note,
        data: {},
        files: act.files,
        clientId: act.clientId,
      });
    }

    case "eod.add": {
      const today = localDay(now);
      const day = act.day ?? today;
      if (day !== today && day !== addDays(today, -1)) return bad(400, say(lang, MSG.eodDay));
      const job = await resolveJob(act.jobId, act.jobName);
      if (!job) return bad(400, say(lang, MSG.jobGone));
      // Typed, or said: a voice memo (an audio file) stands in for the typed answer.
      const memo = act.files.find(isAudioRef) ?? null;
      if (act.done.length < 2 && !memo) return bad(400, say(lang, MSG.eodNeedDone));
      const { res, entry } = await saveEntry(person, nowDate, {
        kind: "eod",
        day,
        jobId: job.id,
        jobName: job.name,
        body: act.done,
        data: {
          stuck: act.stuck,
          needs: act.needs,
          asked: act.asked,
          deliveries: act.deliveries,
          visits: act.visits,
          safety: act.safety,
          decision: act.decision,
          ...(act.weather ? { weather: act.weather } : {}),
          ...(act.crewCount !== null && act.crewCount !== undefined ? { crewCount: act.crewCount } : {}),
          ...(act.tradesOnSite ? { tradesOnSite: act.tradesOnSite } : {}),
          ...(act.inspections ? { inspections: act.inspections } : {}),
          ...(memo ? { memo: { path: memo.path, seconds: act.memoSeconds ?? null } } : {}),
        },
        files: act.files,
        clientId: act.clientId,
      });
      // The form is the answer to "how did today go?".
      if (res.ok) await closeQuestions(email, "eod", "filed", day).catch(() => 0);
      // "What do you need for tomorrow?" is a material request (0023): one per
      // entry, so the same form sent twice asks once. Never fails the entry.
      if (res.ok && entry && act.needs.trim().length >= 2) await createRequestFromEntry(person, entry, act.needs);
      if (res.ok && entry) {
        await syncEodDirectivesAndDecisions({
          entryId: entry.id,
          day,
          jobId: job.id,
          jobName: job.name,
          done: act.done,
          asked: act.asked,
          decision: act.decision,
          stuck: act.stuck,
          createdBy: person.email,
        });
      }
      return res;
    }

    case "note.add": {
      let job: Job = { id: "", name: "" };
      if (act.jobId) {
        const found = await resolveJob(act.jobId, act.jobName);
        if (!found) return bad(400, say(lang, MSG.jobGone));
        job = found;
      }
      return addEntry(person, nowDate, {
        kind: "note",
        day: localDay(now),
        jobId: job.id,
        jobName: job.name,
        body: act.note,
        data: {},
        files: act.files,
        clientId: act.clientId,
      });
    }

    case "timefix.add": {
      const today = localDay(now);
      if (act.day > today || act.day < addDays(today, -14)) return bad(400, say(lang, MSG.fixDay));
      if (act.end <= act.start) return bad(400, say(lang, MSG.fixOrder));
      if (localInstant(act.day, act.end).getTime() > now + 5 * 60_000) return bad(400, say(lang, MSG.future));
      const job = await resolveJob(act.jobId, act.jobName);
      if (!job) return bad(400, say(lang, MSG.jobGone));
      if (act.shiftId !== null) {
        const shift = await getShift(act.shiftId);
        if (!shift || shift.email !== email || shift.status !== "ok") return bad(404, say(lang, MSG.noShift));
      }
      return addEntry(person, nowDate, {
        kind: "timefix",
        day: act.day,
        jobId: job.id,
        jobName: job.name,
        body: act.note,
        data: { start: act.start, end: act.end, breakMin: act.breakMin, shiftId: act.shiftId },
        files: [],
        clientId: act.clientId,
      });
    }

    case "answer": {
      const q = await getQuestion(act.id);
      if (!q || q.email !== email || q.status !== "open") return bad(409, say(lang, MSG.noQuestion));

      if (q.kind === "clockout" && act.answer !== "still") {
        // "I left at 3:30": close the shift at that time, flagged for an owner.
        if (!isClock(act.answer)) return bad(400, say(lang, MSG.notATime));
        const shiftId = typeof q.ref.shift === "number" ? q.ref.shift : 0;
        const shift = shiftId ? await getShift(shiftId) : null;
        if (shift && shift.email === email && shift.status === "ok" && !shift.endedAt) {
          const start = Date.parse(shift.startedAt);
          let end = localInstant(shift.day, act.answer).getTime();
          if (end <= start) end += 24 * 3600_000; // past midnight
          if (end > now + 60_000) return bad(400, say(lang, MSG.future));
          if (end - start > 20 * 3600_000) return bad(400, say(lang, MSG.tooLong));
          await closeShift(shift.id, {
            endedAt: new Date(end).toISOString(),
            breakMin: shift.breakMin,
            endGeo: null,
            note: shift.note,
            endSource: "reported",
            review: joinReview(shift.review, `clock-out time given afterwards by ${first}`),
            clientOut: null,
          });
        }
      }

      if (q.kind === "amount") {
        const amount = parseAmount(act.answer);
        if (amount === null) return bad(400, say(lang, MSG.notAnAmount));
        const entryId = typeof q.ref.entry === "number" ? q.ref.entry : 0;
        const entry = entryId ? await getEntry(entryId) : null;
        if (entry && entry.email === email && entry.kind === "receipt") {
          await patchEntry(entry.id, { data: { ...entry.data, amount } });
        }
      }

      const answered = await answerQuestion(q.id, email, act.answer);
      if (!answered) return bad(409, say(lang, MSG.noQuestion));
      if (q.askedBy !== "bot") {
        // Asked by an owner or by the lead: both hear the answer.
        await notifySupervisors(
          { title: `${first} answered`, body: `${q.body.slice(0, 90)} → ${act.answer}`, tag: `crew-answer-${q.id}` },
          { alsoOwners: true, except: email },
        );
      }
      return ok();
    }

    case "task.update": {
      if (!ownFiles(act.files, email)) return bad(400, say(lang, MSG.notYours));
      const task = await getTask(act.id);
      if (!task || task.email !== email || task.status === "dropped") return bad(404, say(lang, MSG.noTask));
      // Checked work is closed: only the person who checked it can reopen it.
      if (task.status === "done" && task.verifiedAt) return bad(409, say(lang, MSG.noTask));
      // Done means it can be checked: a photo of the finished work comes with it.
      if (act.status === "done" && !act.files.length) return bad(400, say(lang, MSG.donePhoto));
      const wasBlocked = task.status === "blocked";
      const at = nowDate.toISOString();
      const updated = await patchTask(
        task.id,
        {
          status: act.status,
          done_note: act.note,
          files: act.files.length ? act.files : task.files,
          closed_at: act.status === "done" ? at : null,
          // Reported done, not verified: the lead (or an owner) checks it.
          reported_at: act.status === "done" ? at : null,
          verified_at: null,
          verified_by: "",
        },
        { email },
      );
      if (!updated) return bad(404, say(lang, MSG.noTask));
      if (act.status === "blocked" && !wasBlocked) {
        await notifySupervisors(
          { title: `${first} is waiting`, body: `${task.title}${act.note ? `: ${act.note}` : ""}`, tag: `crew-task-${task.id}` },
          { except: email, jobId: task.jobId },
        );
      }
      if (act.status === "done") {
        await notifySupervisors(
          { title: `${first} says done: check it`, body: `${task.title}${task.jobName ? ` · ${task.jobName}` : ""}${act.note ? `: ${act.note}` : ""}`, tag: `crew-task-${task.id}` },
          { except: email, jobId: task.jobId },
        );
      }
      return ok();
    }

    case "pickup.update": {
      if (!ownFiles(act.files, email)) return bad(400, say(lang, MSG.notYours));
      const pickup = await getPickup(act.id);
      const mine = pickup && (pickup.email === email || (pickup.email === "" && hasPerm(person, "pickups.run")));
      if (!pickup || !mine || pickup.status === "cancelled" || pickup.status === "delivered") return bad(404, say(lang, MSG.noPickup));
      if (act.status === "delivered" && !act.files.length) return bad(400, say(lang, MSG.deliveredPhoto));
      if (act.status === "problem" && act.note.length < 2) return bad(400, say(lang, MSG.problemNote));
      const at = nowDate.toISOString();
      const saved = await patchPickup(
        pickup.id,
        {
          status: act.status,
          runner_note: act.note,
          files: act.files.length ? [...pickup.files, ...act.files].slice(-8) : pickup.files,
          ...(act.status === "picked" || (act.status === "delivered" && !pickup.pickedAt) ? { picked_by: email, picked_at: at } : {}),
          ...(act.status === "delivered" ? { delivered_at: at } : {}),
        },
        { statusIn: ["staged", "picked", "problem"] },
      );
      if (!saved) return bad(409, say(lang, MSG.noPickup));
      // A pickup made from a material request (0023) carries its status back to it.
      await mirrorPickupToRequest(pickup.id, act.status);
      if (act.status !== "picked") {
        const what = `${pickup.supplier}${pickup.jobName ? ` → ${pickup.jobName}` : ""}`;
        await notifySupervisors(
          act.status === "delivered"
            ? { title: `Delivered · ${pickup.jobName || pickup.supplier}`, body: `${first}: ${what}${act.note ? `. ${act.note}` : ""}`, tag: `crew-pickup-${pickup.id}` }
            : { title: `Pickup problem · ${pickup.supplier}`, body: `${first}: ${act.note}`, tag: `crew-pickup-${pickup.id}` },
          { except: email, jobId: pickup.jobId },
        );
      }
      return ok();
    }

    case "schedule.ack": {
      const item = await ackSchedule(act.id, email, act.ack, act.note);
      if (!item) return bad(404, say(lang, MSG.noSchedule));
      if (act.ack === "cant") {
        await notifySupervisors(
          { title: `${first} cannot make it`, body: `${item.jobName}, ${dayShort(item.day)}${act.note ? `: ${act.note}` : ""}`, tag: `crew-cant-${item.id}` },
          { except: email, jobId: item.jobId },
        );
      }
      return ok();
    }

    case "request.cancel": {
      const res = await cancelOwnRequest(person, act.id, act.note, nowDate);
      return res.ok ? ok() : bad(res.status, say(lang, MSG.noRequest));
    }

    case "prefs": {
      await patchPerson(email, { lang: act.lang });
      return ok();
    }
  }
}

async function addEntry(person: CrewPersonRow, nowDate: Date, e: Omit<NewEntry, "email">): Promise<ActResult> {
  return (await saveEntry(person, nowDate, e)).res;
}

/** The same, handing back the row (the end of day reads its own entry to make a material request from it). */
async function saveEntry(person: CrewPersonRow, nowDate: Date, e: Omit<NewEntry, "email">): Promise<{ res: ActResult; entry: CrewEntry | null }> {
  const { email, lang } = person;
  if (!ownFiles(e.files, email)) return { res: bad(400, say(lang, MSG.notYours)), entry: null };
  if ((await countEntries(email, localDay(nowDate))) >= MAX_ENTRIES_PER_DAY) return { res: bad(429, say(lang, MSG.tooMany)), entry: null };
  const { entry, existed } = await insertEntry({ ...e, email });
  if (!existed) await announce(person, entry);
  return { res: ok(), entry };
}

/** What an owner should hear about the moment it is sent, without waiting for the evening brief. */
async function announce(person: CrewPersonRow, entry: CrewEntry): Promise<void> {
  const first = firstNameOf(person.name);
  const at = entry.jobName ? ` · ${entry.jobName}` : "";
  const field = (k: string) => (typeof entry.data[k] === "string" ? (entry.data[k] as string) : "");
  if (entry.kind === "eod") {
    // Each flag is its own alert, so a decision sent with extra work is not
    // swallowed. Safety also reaches the owners whoever runs the field; scope
    // and decisions go to the supervisor, who passes on what needs Marco in
    // the nightly plan.
    const flags: [key: string, title: string][] = [
      ["safety", "Safety report"],
      ["asked", "Extra work asked for"],
      ["decision", "Needs a decision"],
    ];
    for (const [key, title] of flags) {
      if (!field(key)) continue;
      await notifySupervisors(
        { title: `${title}${at}`, body: `${first}: ${field(key)}`, tag: `crew-eod-${key}-${entry.id}` },
        { alsoOwners: key === "safety", except: person.email, jobId: entry.jobId },
      );
    }
    return;
  }
  if (entry.kind === "note") {
    await notifySupervisors({ title: `Note from ${first}${at}`, body: entry.body, tag: `crew-note-${entry.id}` }, { except: person.email, jobId: entry.jobId });
    return;
  }
  if (entry.kind === "timefix") {
    await notifyOwners({
      title: `Time fix from ${first}`,
      body: `${dayShort(entry.day)}${at}: ${entry.body}`,
      tag: `crew-fix-${entry.id}`,
    }, "money");
  }
}
