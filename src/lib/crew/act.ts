import { threadKey } from "@/lib/bot/queries";
import type { BotFileRef } from "@/lib/bot/types";
import { MSG, say } from "./messages";
import { notifyOwners } from "./notify";
import {
  ackSchedule,
  answerQuestion,
  closeQuestions,
  closeShift,
  countEntries,
  getEntry,
  getJob,
  getQuestion,
  getShift,
  getTask,
  insertEntry,
  insertShift,
  lastShift,
  openShift,
  patchEntry,
  patchPerson,
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
  parseAmount,
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

export async function runCrewAct(person: CrewPersonRow, act: CrewAct, nowDate = new Date()): Promise<ActResult> {
  const { email, lang } = person;
  const now = nowDate.getTime();
  const first = firstNameOf(person.name);

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
      return addEntry(person, nowDate, {
        kind: "receipt",
        day: localDay(now),
        jobId: job.id,
        jobName: job.name,
        body: act.note,
        data: { amount: act.amount, vendor: act.vendor, paidBy: act.paidBy },
        files: act.files,
        clientId: act.clientId,
      });
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
      const res = await addEntry(person, nowDate, {
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
        },
        files: act.files,
        clientId: act.clientId,
      });
      // The form is the answer to "how did today go?".
      if (res.ok) await closeQuestions(email, "eod", "filed", day).catch(() => 0);
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
        await notifyOwners({
          title: `${first} answered`,
          body: `${q.body.slice(0, 90)} → ${act.answer}`,
          tag: `crew-answer-${q.id}`,
        });
      }
      return ok();
    }

    case "task.update": {
      if (!ownFiles(act.files, email)) return bad(400, say(lang, MSG.notYours));
      const task = await getTask(act.id);
      if (!task || task.email !== email || task.status === "dropped") return bad(404, say(lang, MSG.noTask));
      const wasBlocked = task.status === "blocked";
      const updated = await patchTask(
        task.id,
        {
          status: act.status,
          done_note: act.note,
          files: act.files.length ? act.files : task.files,
          closed_at: act.status === "done" ? nowDate.toISOString() : null,
        },
        { email },
      );
      if (!updated) return bad(404, say(lang, MSG.noTask));
      if (act.status === "blocked" && !wasBlocked) {
        await notifyOwners({
          title: `${first} is blocked`,
          body: `${task.title}${act.note ? `: ${act.note}` : ""}`,
          tag: `crew-task-${task.id}`,
        });
      }
      return ok();
    }

    case "schedule.ack": {
      const item = await ackSchedule(act.id, email, act.ack, act.note);
      if (!item) return bad(404, say(lang, MSG.noSchedule));
      if (act.ack === "cant") {
        await notifyOwners({
          title: `${first} cannot make it`,
          body: `${item.jobName}, ${dayShort(item.day)}${act.note ? `: ${act.note}` : ""}`,
          tag: `crew-cant-${item.id}`,
        });
      }
      return ok();
    }

    case "prefs": {
      await patchPerson(email, { lang: act.lang });
      return ok();
    }
  }
}

async function addEntry(person: CrewPersonRow, nowDate: Date, e: Omit<NewEntry, "email">): Promise<ActResult> {
  const { email, lang } = person;
  if (!ownFiles(e.files, email)) return bad(400, say(lang, MSG.notYours));
  if ((await countEntries(email, localDay(nowDate))) >= MAX_ENTRIES_PER_DAY) return bad(429, say(lang, MSG.tooMany));
  const { entry, existed } = await insertEntry({ ...e, email });
  if (!existed) await announce(person, entry);
  return ok();
}

/** What an owner should hear about the moment it is sent, without waiting for the evening brief. */
async function announce(person: CrewPersonRow, entry: CrewEntry): Promise<void> {
  const first = firstNameOf(person.name);
  const at = entry.jobName ? ` · ${entry.jobName}` : "";
  const field = (k: string) => (typeof entry.data[k] === "string" ? (entry.data[k] as string) : "");
  if (entry.kind === "eod") {
    // Safety first, then scope ("someone asked for work that is not on the
    // plans" has to be written up the same day), then a decision for tomorrow.
    const [title, text] = field("safety")
      ? ["Safety report", field("safety")]
      : field("asked")
        ? ["Extra work asked for", field("asked")]
        : field("decision")
          ? ["Needs your call", field("decision")]
          : ["", ""];
    if (title) await notifyOwners({ title: `${title}${at}`, body: `${first}: ${text}`, tag: `crew-eod-${entry.id}` });
    return;
  }
  if (entry.kind === "note") {
    await notifyOwners({ title: `Note from ${first}${at}`, body: entry.body, tag: `crew-note-${entry.id}` });
    return;
  }
  if (entry.kind === "timefix") {
    await notifyOwners({
      title: `Time fix from ${first}`,
      body: `${dayShort(entry.day)}${at}: ${entry.body}`,
      tag: `crew-fix-${entry.id}`,
    });
  }
}
