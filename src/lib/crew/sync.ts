import { sendPush } from "@/lib/bot/push";
import { MSG } from "./messages";
import { notifyCrew, ownerAddresses } from "./notify";
import {
  getEntry,
  getJob,
  getShift,
  insertQuestion,
  insertTasks,
  listPeople,
  markAnswersSeen,
  patchEntry,
  patchShift,
  taskExists,
  upsertSchedule,
} from "./queries";
import { addDays, localDay } from "./time";
import type { CrewSync } from "./types";

// What the office Mac sends back after reading the crew's day: where a
// receipt was filed, a question worth asking, a flag on a shift, and (when an
// owner told the bot to) a schedule line or a task. Every write is safe to
// repeat: the Mac sends a report again when it does not hear back.

export type CrewApplied = { entries: number; questions: number; seen: number; shifts: number; schedule: number; tasks: number; pushed: number };

export async function applyCrewSync(post: CrewSync, nowDate = new Date()): Promise<CrewApplied> {
  const applied: CrewApplied = { entries: 0, questions: 0, seen: 0, shifts: 0, schedule: 0, tasks: 0, pushed: 0 };
  const today = localDay(nowDate);
  const people = await listPeople();
  const active = new Map(people.filter((p) => p.active).map((p) => [p.email, p]));

  for (const e of post.entries) {
    const entry = await getEntry(e.id);
    // A time fix is an owner's decision, never the bot's.
    if (!entry || entry.kind === "timefix") continue;
    await patchEntry(entry.id, { status: e.status, bot: e.bot, bot_at: nowDate.toISOString() });
    applied.entries += 1;
  }

  for (const q of post.questions) {
    const person = active.get(q.email);
    if (!person) continue;
    const made = await insertQuestion({
      email: q.email,
      body: q.body,
      bodyEs: q.bodyEs,
      options: q.options,
      kind: q.kind,
      ref: q.ref,
      askedBy: "bot",
      dedupe: q.dedupe,
    });
    if (!made) continue; // already asked
    applied.questions += 1;
    await notifyCrew(person, MSG.newQuestion(q.body, q.bodyEs, true), `crew-q-${made.id}`);
  }

  applied.seen = await markAnswersSeen(post.seen);

  for (const s of post.shifts) {
    const shift = await getShift(s.id);
    if (!shift || shift.status !== "ok" || shift.review.includes(s.review)) continue;
    await patchShift(shift.id, { review: [shift.review, s.review].filter(Boolean).join("; ").slice(0, 300) });
    applied.shifts += 1;
  }

  for (const s of post.schedule) {
    const person = active.get(s.email);
    const job = await getJob(s.jobId);
    if (!person || !job || !job.active || s.day < today) continue;
    const rows = await upsertSchedule([
      { day: s.day, email: s.email, jobId: job.id, jobName: job.name, startTime: s.startTime, note: s.note, createdBy: s.by },
    ]);
    applied.schedule += rows.length;
    if (rows.length && (s.day === today || s.day === addDays(today, 1))) {
      await notifyCrew(person, MSG.scheduled(job.name, s.day, today, s.startTime), `crew-sched-${s.day}`);
    }
  }

  for (const t of post.tasks) {
    const person = active.get(t.email);
    if (!person || (await taskExists(t.email, t.title))) continue;
    let job = { id: "", name: "" };
    if (t.jobId) {
      const found = await getJob(t.jobId);
      if (found) job = { id: found.id, name: found.name };
    }
    await insertTasks([{ email: t.email, title: t.title, detail: t.detail, jobId: job.id, jobName: job.name, due: t.due || null, createdBy: t.by }]);
    applied.tasks += 1;
    await notifyCrew(person, MSG.newTask(t.title), "crew-task");
  }

  if (post.notify.length) {
    try {
      const owners = await ownerAddresses();
      for (const n of post.notify) {
        // Only owners and people with an active seat are ever notified, whatever the list says.
        const to = n.to === "owners" ? owners : n.to.filter((email) => active.has(email) || owners.includes(email));
        const res = await sendPush(to, { title: n.title, body: n.body, url: n.url, tag: n.tag });
        applied.pushed += res.sent;
      }
    } catch (e) {
      console.error("[crew/sync] push failed:", (e as Error).message);
    }
  }

  return applied;
}
