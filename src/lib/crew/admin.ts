import { generateSignInLink, LINK_HOURS, sendEmail } from "@/lib/auth/magicLink";
import { buildSignInEmail } from "@/lib/auth/signInEmail";
import { isAllowedEmail } from "@/lib/ops/allowlist";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ActResult } from "./act";
import type { Owner } from "./auth";
import { MSG } from "./messages";
import { notifyCrew } from "./notify";
import {
  cancelQuestion,
  deleteSchedule,
  getEntry,
  getJob,
  getPerson,
  getScheduleItem,
  getShift,
  getTask,
  insertJob,
  insertQuestion,
  insertShift,
  insertTasks,
  listPeople,
  listSchedule,
  listShifts,
  patchEntry,
  patchJob,
  patchPerson,
  patchShift,
  patchTask,
  savePerson,
  upsertSchedule,
  type CrewPersonRow,
  type CrewShiftRow,
} from "./queries";
import { CREW_ROLE, FORMER_ROLE } from "./role";
import { addDays, clock12, localClock, localDay, localInstant } from "./time";
import { OTHER_JOB, jobSlug, type AdminAct, type ShiftEdit } from "./types";

// Everything an owner can do to the crew side: seats, jobs, the schedule,
// tasks, time corrections, questions. Every change to someone's time keeps
// what the row said before and who changed it.

export type AdminResult = ActResult | { ok: true; note?: string; code?: string; link?: string; hours?: number };

const ok = (note?: string): ActResult => ({ ok: true, ...(note ? { note } : {}) });
const bad = (status: number, error: string): ActResult => ({ ok: false, status, error });

// ---- the sign-in behind a seat --------------------------------------------------

type AuthUser = { id: string; email?: string; app_metadata?: Record<string, unknown> };

async function findAuthUser(email: string): Promise<AuthUser | null> {
  const admin = getSupabaseAdmin();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`could not look up the sign-in: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit as AuthUser;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Make (or find) the Auth user for a crew member and mark it as crew. -> its id */
async function ensureCrewUser(email: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const created = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { sw_role: CREW_ROLE } });
  if (!created.error && created.data.user) return created.data.user.id;
  const existing = await findAuthUser(email);
  if (!existing) throw new Error(`could not create the sign-in: ${created.error?.message ?? "unknown error"}`);
  await setCrewMark(existing.id, true, existing.app_metadata);
  return existing.id;
}

/**
 * Give or take away the sign-in behind a seat. Taking it away marks the Auth
 * user 'former' (never unmarked: see FORMER_ROLE) and bans it, so its refresh
 * token stops working and the session dies within the hour; the site itself
 * shuts on the next request. Giving it back lifts the ban.
 */
async function setCrewMark(authId: string, on: boolean, current?: Record<string, unknown>): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.auth.admin.updateUserById(authId, {
    app_metadata: { ...(current ?? {}), sw_role: on ? CREW_ROLE : FORMER_ROLE },
    ban_duration: on ? "none" : "876000h",
  });
  if (error) throw new Error(`could not update the sign-in: ${error.message}`);
}

async function sendCrewInvite(person: CrewPersonRow): Promise<void> {
  const signIn = await generateSignInLink(person.email, "/app");
  const es = person.lang === "es";
  const { html, text } = buildSignInEmail({
    link: signIn.link,
    code: signIn.code,
    eyebrow: es ? "Saddlewood" : "Saddlewood crew",
    headline: es ? "Tu app de Saddlewood" : "Your Saddlewood app",
    paragraphs: es
      ? [
          `${person.name.split(/\s+/)[0]}, esta es la app de Saddlewood para tu teléfono: marcar entrada y salida, mandar recibos y fotos del trabajo, y ver dónde te toca.`,
          "Toca el botón para abrirla. Luego agrégala a tu pantalla de inicio para tenerla a la mano.",
        ]
      : [
          `${person.name.split(/\s+/)[0]}, this is the Saddlewood app for your phone: clock in and out, send receipts and job photos, and see where you are scheduled.`,
          "Tap the button to open it. Then add it to your home screen so it is one tap away.",
        ],
    buttonLabel: es ? "Abrir la app" : "Open the app",
    afterButton: es
      ? [`El enlace funciona una vez y vence en ${LINK_HOURS} horas. Después, entra con tu correo y te llega un código nuevo.`]
      : [`The link works once and expires in ${LINK_HOURS} hours. After that, sign in with your email and a new code arrives.`],
    footer: es
      ? "Recibes esto porque Saddlewood Contracting te dio acceso a su app. Si no lo esperabas, ignóralo."
      : "You are receiving this because Saddlewood Contracting gave you a seat in its app. If you did not expect it, ignore it.",
  });
  await sendEmail({ to: person.email, subject: es ? "Tu app de Saddlewood" : "Your Saddlewood app", html, text });
}

// ---- time ---------------------------------------------------------------------

function overlaps(a: { start: number; end: number }, b: CrewShiftRow, now: number): boolean {
  const bs = Date.parse(b.startedAt);
  const be = b.endedAt ? Date.parse(b.endedAt) : now;
  return a.start < be && bs < a.end;
}

async function overlapNote(email: string, day: string, span: { start: number; end: number }, exceptId: number | null, now: number): Promise<string | null> {
  const near = await listShifts({ email, fromDay: addDays(day, -1), toDay: addDays(day, 1) });
  const hit = near.find((s) => s.id !== exceptId && overlaps(span, s, now));
  return hit
    ? `That overlaps another shift (${hit.jobName}, ${clock12(hit.startedAt)} to ${hit.endedAt ? clock12(hit.endedAt) : "now"}). Change that one first.`
    : null;
}

/** A job from the list, or the "not on the list" job with the name the person typed. */
async function jobFor(jobId: string, jobName: string): Promise<{ id: string; name: string } | null> {
  if (jobId === OTHER_JOB) return { id: OTHER_JOB, name: jobName.trim() || "Another job" };
  const found = await getJob(jobId);
  return found ? { id: found.id, name: found.name } : null;
}

function wasOf(s: CrewShiftRow): ShiftEdit["was"] {
  return { startedAt: s.startedAt, endedAt: s.endedAt, breakMin: s.breakMin, jobName: s.jobName, status: s.status };
}

type ShiftChange = { day?: string; start?: string; end?: string; breakMin?: number; jobId?: string; jobName?: string; why: string };

async function editShift(owner: Owner, shift: CrewShiftRow, change: ShiftChange, now: number): Promise<ActResult> {
  const day = change.day ?? shift.day;
  const startAt =
    change.day !== undefined || change.start !== undefined
      ? localInstant(day, change.start ?? localClock(shift.startedAt)).getTime()
      : Date.parse(shift.startedAt);

  let endAt: number | null;
  if (change.end === "") endAt = null;
  else if (change.end !== undefined || (change.day !== undefined && shift.endedAt)) {
    endAt = localInstant(day, change.end ?? localClock(shift.endedAt as string)).getTime();
    if (endAt <= startAt) endAt += 24 * 3600_000; // worked past midnight
  } else endAt = shift.endedAt ? Date.parse(shift.endedAt) : null;

  if (startAt > now + 5 * 60_000 || (endAt !== null && endAt > now + 5 * 60_000)) return bad(400, "That time has not happened yet.");
  if (endAt !== null && endAt - startAt > 24 * 3600_000) return bad(400, "That shift would be longer than 24 hours.");
  const breakMin = change.breakMin ?? shift.breakMin;
  if (endAt !== null && breakMin >= (endAt - startAt) / 60000) return bad(400, "The break is longer than the shift.");

  let job = { id: shift.jobId, name: shift.jobName };
  if (change.jobId && (change.jobId !== shift.jobId || (change.jobId === OTHER_JOB && change.jobName && change.jobName !== shift.jobName))) {
    const found = await jobFor(change.jobId, change.jobName ?? "");
    if (!found) return bad(400, "That job is not on the list.");
    job = found;
  }

  const clash = await overlapNote(shift.email, localDay(startAt), { start: startAt, end: endAt ?? now }, shift.id, now);
  if (clash) return bad(409, clash);

  const edit: ShiftEdit = { at: new Date(now).toISOString(), by: owner.name, why: change.why, was: wasOf(shift) };
  const { shift: saved, conflict } = await patchShift(shift.id, {
    job_id: job.id,
    job_name: job.name,
    day: localDay(startAt),
    started_at: new Date(startAt).toISOString(),
    ended_at: endAt === null ? null : new Date(endAt).toISOString(),
    break_min: breakMin,
    end_source: endAt === null ? null : endAt === (shift.endedAt ? Date.parse(shift.endedAt) : null) ? shift.endSource : "office",
    review: "",
    edits: [...shift.edits, edit].slice(-20),
  });
  if (conflict) return bad(409, "They are already on the clock on another shift. Close that one first.");
  if (!saved) return bad(404, "That shift is gone.");
  return ok();
}

async function addShift(
  owner: Owner,
  input: { email: string; jobId: string; jobName?: string; day: string; start: string; end: string; breakMin: number; why: string },
  now: number,
): Promise<ActResult> {
  const person = await getPerson(input.email);
  if (!person) return bad(404, "That person does not have a seat.");
  const job = await jobFor(input.jobId, input.jobName ?? "");
  if (!job) return bad(400, "That job is not on the list.");
  const startAt = localInstant(input.day, input.start).getTime();
  let endAt = localInstant(input.day, input.end).getTime();
  if (endAt <= startAt) endAt += 24 * 3600_000;
  if (endAt > now + 5 * 60_000) return bad(400, "That time has not happened yet.");
  if (endAt - startAt > 24 * 3600_000) return bad(400, "That shift would be longer than 24 hours.");
  if (input.breakMin >= (endAt - startAt) / 60000) return bad(400, "The break is longer than the shift.");
  const clash = await overlapNote(input.email, input.day, { start: startAt, end: endAt }, null, now);
  if (clash) return bad(409, clash);
  const { conflict } = await insertShift({
    email: input.email,
    jobId: job.id,
    jobName: job.name,
    day: input.day,
    startedAt: new Date(startAt).toISOString(),
    endedAt: new Date(endAt).toISOString(),
    breakMin: input.breakMin,
    source: "office",
    endSource: "office",
    note: `Entered by ${owner.name}: ${input.why}`.slice(0, 600),
  });
  if (conflict) return bad(409, "They are already on the clock on another shift.");
  return ok();
}

// ---- the acts -----------------------------------------------------------------

export async function runAdminAct(owner: Owner, act: AdminAct, nowDate = new Date()): Promise<AdminResult> {
  const now = nowDate.getTime();
  const today = localDay(now);

  switch (act.kind) {
    case "person.add": {
      if (isAllowedEmail(act.email)) {
        return bad(400, "That address already has the full portal. A crew seat is for someone who should only have the app.");
      }
      // Look the seat up first. If the crew tables are not there yet (the site
      // was deployed before migration 0011), this throws and no sign-in is made:
      // a crew sign-in must never exist without the locks that migration puts on.
      await getPerson(act.email);
      const authId = await ensureCrewUser(act.email);
      const person = await savePerson({
        email: act.email,
        authId,
        name: act.name,
        lang: act.lang,
        phone: act.phone,
        trade: act.trade,
        addedBy: owner.name,
      });
      if (!act.invite) return ok(`${person.name} has a seat. Send them the link when you are ready.`);
      try {
        await sendCrewInvite(person);
        return ok(`${person.name} has a seat, and the sign-in link is on its way to ${person.email}.`);
      } catch (e) {
        console.error("[crew/admin] invite:", (e as Error).message);
        return ok(`${person.name} has a seat, but the email did not send. Use "Get a code" to sign them in.`);
      }
    }

    case "person.update": {
      const person = await getPerson(act.email);
      if (!person) return bad(404, "That person does not have a seat.");
      if (act.active !== undefined && act.active !== person.active) {
        // The sign-in follows the seat: taking the seat away closes the app
        // for them on their next tap, and giving it back opens it again.
        const auth = await findAuthUser(person.email);
        if (act.active) {
          let authId = auth?.id ?? null;
          if (auth) await setCrewMark(auth.id, true, auth.app_metadata);
          else authId = await ensureCrewUser(person.email);
          await patchPerson(person.email, { active: true, auth_id: authId });
        } else {
          if (auth) await setCrewMark(auth.id, false, auth.app_metadata);
          await patchPerson(person.email, { active: false });
        }
      }
      const patch = {
        ...(act.name !== undefined ? { name: act.name } : {}),
        ...(act.lang !== undefined ? { lang: act.lang } : {}),
        ...(act.trade !== undefined ? { trade: act.trade } : {}),
        ...(act.phone !== undefined ? { phone: act.phone } : {}),
      };
      if (Object.keys(patch).length) await patchPerson(person.email, patch);
      return ok();
    }

    case "person.invite": {
      const person = await getPerson(act.email);
      if (!person || !person.active) return bad(404, "That person does not have a seat.");
      await sendCrewInvite(person);
      return ok(`Sent to ${person.email}.`);
    }

    case "person.code": {
      // Only ever for a crew seat. A code for anyone on the portal allowlist
      // would be that person's whole session in someone else's hands.
      const person = await getPerson(act.email);
      if (!person || !person.active || isAllowedEmail(person.email)) return bad(404, "That person does not have a crew seat.");
      const signIn = await generateSignInLink(person.email, "/app");
      return { ok: true, code: signIn.code, link: signIn.link, hours: LINK_HOURS };
    }

    case "job.add": {
      const base = jobSlug(act.name);
      for (const id of [base, `${base}-2`, `${base}-3`, `${base}-4`]) {
        const job = await insertJob({ id, name: act.name, address: act.address, note: act.note, createdBy: owner.name });
        if (job) return ok();
        const taken = await getJob(id);
        if (taken && taken.name.toLowerCase() === act.name.toLowerCase()) {
          if (taken.active) return bad(409, "That job is already on the list.");
          await patchJob(id, { active: true, address: act.address || taken.address, note: act.note || taken.note });
          return ok("That job was archived. It is back on the list.");
        }
      }
      return bad(409, "A job with a name that close already exists. Use a different name.");
    }

    case "job.update": {
      const { kind: _kind, id, ...patch } = act;
      void _kind;
      const job = await patchJob(id, patch);
      return job ? ok() : bad(404, "That job is not on the list.");
    }

    case "schedule.set": {
      const job = await getJob(act.jobId);
      if (!job || !job.active) return bad(400, "That job is not on the list.");
      if (act.day < addDays(today, -1)) return bad(400, "That day has passed.");
      const people = (await listPeople()).filter((p) => p.active && act.emails.includes(p.email));
      if (!people.length) return bad(400, "Pick who is going.");
      const rows = await upsertSchedule(
        people.map((p) => ({
          day: act.day,
          email: p.email,
          jobId: job.id,
          jobName: job.name,
          startTime: act.startTime,
          note: act.note,
          createdBy: owner.name,
        })),
      );
      // The night-before dispatch covers the rest; today and tomorrow are news now.
      if (act.day === today || act.day === addDays(today, 1)) {
        for (const p of people) {
          await notifyCrew(p, MSG.scheduled(job.name, act.day, today, act.startTime), `crew-sched-${act.day}`);
        }
      }
      return ok(`${rows.length} ${rows.length === 1 ? "person" : "people"} on ${job.name}.`);
    }

    case "schedule.remove": {
      const item = await getScheduleItem(act.id);
      if (!item) return ok();
      await deleteSchedule(item.id);
      if (item.day === today || item.day === addDays(today, 1)) {
        const person = await getPerson(item.email);
        if (person?.active) await notifyCrew(person, MSG.unscheduled(item.jobName, item.day, today), `crew-sched-${item.day}`);
      }
      return ok();
    }

    case "schedule.copy": {
      if (act.to < today) return bad(400, "That day has passed.");
      if (act.from === act.to) return bad(400, "Pick a different day to copy to.");
      const [from, people] = await Promise.all([listSchedule({ fromDay: act.from, toDay: act.from }), listPeople()]);
      const active = new Set(people.filter((p) => p.active).map((p) => p.email));
      const rows = from.filter((r) => active.has(r.email));
      if (!rows.length) return bad(400, "Nobody was scheduled that day.");
      const made = await upsertSchedule(
        rows.map((r) => ({ day: act.to, email: r.email, jobId: r.jobId, jobName: r.jobName, startTime: r.startTime, note: r.note, createdBy: owner.name })),
      );
      if (act.to === today || act.to === addDays(today, 1)) {
        for (const r of made) {
          const p = people.find((x) => x.email === r.email);
          if (p) await notifyCrew(p, MSG.scheduled(r.jobName, r.day, today, r.startTime), `crew-sched-${r.day}`);
        }
      }
      return ok(`Copied ${made.length} ${made.length === 1 ? "assignment" : "assignments"}.`);
    }

    case "task.add": {
      let job = { id: "", name: "" };
      if (act.jobId) {
        const found = await getJob(act.jobId);
        if (!found) return bad(400, "That job is not on the list.");
        job = { id: found.id, name: found.name };
      }
      const people = (await listPeople()).filter((p) => p.active && act.emails.includes(p.email));
      if (!people.length) return bad(400, "Pick who it is for.");
      await insertTasks(
        people.map((p) => ({ email: p.email, title: act.title, detail: act.detail, jobId: job.id, jobName: job.name, due: act.due || null, createdBy: owner.name })),
      );
      for (const p of people) await notifyCrew(p, MSG.newTask(act.title), "crew-task");
      return ok();
    }

    case "task.update": {
      const task = await getTask(act.id);
      if (!task) return bad(404, "That task is gone.");
      const closing = act.status === "done" || act.status === "dropped";
      await patchTask(task.id, {
        ...(act.status !== undefined ? { status: act.status, closed_at: closing ? nowDate.toISOString() : null } : {}),
        ...(act.title !== undefined ? { title: act.title } : {}),
        ...(act.detail !== undefined ? { detail: act.detail } : {}),
        ...(act.due !== undefined ? { due: act.due || null } : {}),
      });
      return ok();
    }

    case "shift.edit": {
      const shift = await getShift(act.id);
      if (!shift || shift.status !== "ok") return bad(404, "That shift is gone.");
      return editShift(owner, shift, act, now);
    }

    case "shift.add":
      return addShift(owner, act, now);

    case "shift.void": {
      const shift = await getShift(act.id);
      if (!shift) return bad(404, "That shift is gone.");
      const edit: ShiftEdit = { at: nowDate.toISOString(), by: owner.name, why: act.why, was: wasOf(shift) };
      await patchShift(shift.id, { status: "void", review: "", edits: [...shift.edits, edit].slice(-20) });
      return ok();
    }

    case "shift.ok": {
      const { shift } = await patchShift(act.id, { review: "" });
      return shift ? ok() : bad(404, "That shift is gone.");
    }

    case "fix.decide": {
      const entry = await getEntry(act.id);
      if (!entry || entry.kind !== "timefix") return bad(404, "That request is gone.");
      if (entry.status !== "new") return bad(409, `That request was already ${entry.status}.`);
      const person = await getPerson(entry.email);
      // Claim the request first, so two owners tapping at once cannot both apply it.
      const decided = await patchEntry(
        entry.id,
        {
          status: act.approve ? "approved" : "denied",
          decided_by: owner.name,
          bot: { ...entry.bot, decisionNote: act.note },
          bot_at: nowDate.toISOString(),
        },
        { status: "new" },
      );
      if (!decided) return bad(409, "Someone else already decided that one.");
      if (act.approve) {
        const d = entry.data;
        const start = typeof d.start === "string" ? d.start : "";
        const end = typeof d.end === "string" ? d.end : "";
        const breakMin = typeof d.breakMin === "number" ? d.breakMin : 0;
        const why = `time fix asked by ${person?.name ?? entry.email}: ${entry.body}`.slice(0, 300);
        const shift = typeof d.shiftId === "number" ? await getShift(d.shiftId) : null;
        const job = { jobId: entry.jobId, jobName: entry.jobName };
        const applied = await (shift && shift.status === "ok" && shift.email === entry.email
          ? editShift(owner, shift, { day: entry.day, start, end, breakMin, ...job, why }, now)
          : addShift(owner, { email: entry.email, ...job, day: entry.day, start, end, breakMin, why }, now)
        ).catch((e: Error): ActResult => bad(500, e.message));
        if (!applied.ok) {
          // It could not be applied (an overlap, a time that has not happened): hand the request back.
          await patchEntry(entry.id, { status: "new", decided_by: "", bot: entry.bot, bot_at: null });
          return applied;
        }
      }
      if (person?.active) await notifyCrew(person, MSG.fixDecided(entry.day, act.approve, act.note), `crew-fix-${entry.id}`);
      return ok();
    }

    case "question.ask": {
      const people = (await listPeople()).filter((p) => p.active && act.emails.includes(p.email));
      if (!people.length) return bad(400, "Pick who to ask.");
      for (const p of people) {
        const q = await insertQuestion({
          email: p.email,
          body: act.body,
          bodyEs: "",
          options: act.options.map((o) => ({ v: o, en: o, es: o })),
          kind: "ask",
          ref: {},
          askedBy: owner.email,
          dedupe: null,
        });
        if (q) await notifyCrew(p, MSG.newQuestion(q.body, "", false), `crew-q-${q.id}`);
      }
      return ok(`Asked ${people.length === 1 ? people[0].name.split(/\s+/)[0] : `${people.length} people`}.`);
    }

    case "question.cancel": {
      await cancelQuestion(act.id);
      return ok();
    }
  }
}
