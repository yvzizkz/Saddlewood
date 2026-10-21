import { generateSignInLink, LINK_HOURS, sendEmail } from "@/lib/auth/magicLink";
import { buildSignInEmail } from "@/lib/auth/signInEmail";
import { unpassedChecklistsForPhase } from "@/lib/field/ops";
import { isAllowedEmail } from "@/lib/ops/allowlist";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ActResult } from "./act";
import type { Manager } from "./auth";
import { geocodeAddress } from "./geocode";
import { MSG } from "./messages";
import { notifyCrew, notifyOwners } from "./notify";
import { buildPlan } from "./plan";
import { relinkPurchases, upsertAlias } from "./purchaseQueries";
import { normalizeJobName } from "./purchases";
import { getRequest } from "./requestQueries";
import { mirrorPickupToRequest, runRequestAct } from "./requests";
import {
  answerReport,
  cancelQuestion,
  deleteSchedule,
  getEntry,
  getJob,
  getJobPhase,
  deleteGroup,
  getGroup,
  getPerson,
  getPickup,
  getReport,
  getScheduleItem,
  getShift,
  getTask,
  insertGroup,
  insertJob,
  insertJobPhases,
  insertPickup,
  insertQuestion,
  insertReport,
  insertShift,
  insertTasks,
  linkBillingJob,
  listJobPhases,
  listJobs,
  listPeople,
  listPickups,
  listSchedule,
  listShifts,
  listTasks,
  patchEntry,
  patchGroup,
  patchJob,
  patchJobPhase,
  patchPerson,
  patchPickup,
  patchShift,
  patchTask,
  replaceJobPhases,
  savePerson,
  setJobPeople,
  upsertSchedule,
  type CrewPersonRow,
  type CrewShiftRow,
} from "./queries";
import { planPhaseSet, templatePhases } from "./phases";
import { CREW_ROLE, FORMER_ROLE } from "./role";
import { inScope, visibleCrewJobs, type ScopeCaller } from "./scope";
import { addDays, clock12, dayShort, localClock, localDay, localInstant } from "./time";
import { OTHER_JOB, firstNameOf, isPlaceholderEmail, jobSlug, normalizePerms, type AdminAct, type ShiftEdit } from "./types";

/** Whoever is acting from the Crew screens: an owner, or a member (limited by their group's switches in the route). */
type Owner = Pick<Manager, "email" | "name"> & { role?: Manager["role"]; perms?: readonly string[] };

// Everything an owner can do to the crew side: seats, jobs, the schedule,
// tasks, time corrections, questions. Every change to someone's time keeps
// what the row said before and who changed it.

export type AdminResult = ActResult | { ok: true; note?: string; code?: string; link?: string; hours?: number; set?: number; linked?: number };

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

/**
 * Put a job on the map from its address and keep the point on the row (0021).
 * Nothing found, or a service down, leaves it null; the save it follows has
 * already happened, so nothing here can block it. -> whether it was placed
 */
export async function placeJob(id: string, address: string, nowDate: Date): Promise<boolean> {
  try {
    const hit = address.trim() ? await geocodeAddress(address) : null;
    await patchJob(id, { geo: hit ? { lat: hit.lat, lng: hit.lng, source: hit.source, at: nowDate.toISOString() } : null });
    return !!hit;
  } catch (e) {
    console.error("[crew/admin] place job:", (e as Error).message);
    return false;
  }
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

/** A supervisor's own task is checked by an owner, never by the supervisor. */
const OWN_WORK = "Someone else checks your own work: Marco or Lando will check this one.";

const NOT_YOURS = "That job is not one of yours. Marco or Lando can add you to it.";

/** A phase's note keeps what was said at each check, newest last; the oldest goes when it gets long. */
function phaseNote(before: string, line: string): string {
  const next = before ? `${before}\n${line}` : line;
  return next.length > 1500 ? next.slice(next.length - 1500) : next;
}

/**
 * The jobs an act touches, read from the rows it names when it names a row.
 * null when it is not about a job (a question, a group, a seat).
 */
async function jobsOfAct(act: AdminAct): Promise<(string | null | undefined)[] | null> {
  switch (act.kind) {
    case "job.update":
    case "job.people":
    case "job.link":
      return [act.id];
    case "job.geocode":
      return act.id ? [act.id] : null;
    case "job.phases.set":
    case "job.phases.template":
    case "schedule.set":
    case "shift.add":
      return [act.jobId];
    case "phase.verify":
    case "phase.unverify":
    case "phase.plan":
      return [(await getJobPhase(act.id))?.jobId];
    case "task.add":
    case "pickup.add":
      return [act.jobId];
    case "schedule.remove":
      return [(await getScheduleItem(act.id))?.jobId];
    case "task.update":
    case "task.verify":
      return [(await getTask(act.id))?.jobId];
    case "pickup.update":
      return [(await getPickup(act.id))?.jobId];
    case "shift.edit":
      return [(await getShift(act.id))?.jobId, act.jobId];
    case "shift.void":
    case "shift.ok":
      return [(await getShift(act.id))?.jobId];
    case "fix.decide":
      return [(await getEntry(act.id))?.jobId];
    case "purchase.assign":
      return act.jobId ? [act.jobId] : null;
    // Material requests (0023): a PM decides and orders only on the jobs they are on.
    case "request.add":
      return [act.jobId];
    case "request.decide":
    case "request.order":
    case "request.cancel":
      return [(await getRequest(act.id))?.jobId];
    default:
      return null;
  }
}

export async function runAdminAct(owner: Owner, act: AdminAct, nowDate = new Date()): Promise<AdminResult> {
  const now = nowDate.getTime();
  const today = localDay(now);
  // A project manager (projects.mine) acts only on the jobs they are on.
  const caller: ScopeCaller = { role: owner.role ?? "owner", email: owner.email, perms: owner.perms ?? [] };
  const scope = await visibleCrewJobs(caller);
  if (scope !== null) {
    const touched = await jobsOfAct(act);
    if (touched && !touched.every((j) => inScope(scope, j))) return bad(403, NOT_YOURS);
  }

  switch (act.kind) {
    case "person.add": {
      if (isAllowedEmail(act.email)) {
        return bad(400, "That address already has the full portal. A crew seat is for someone who should only have the app.");
      }
      // Look the seat up first. If the crew tables are not there yet (the site
      // was deployed before migration 0011), this throws and no sign-in is made:
      // a crew sign-in must never exist without the locks that migration puts on.
      await getPerson(act.email);
      if (!(await getGroup(act.group))) return bad(400, "That group does not exist.");
      const authId = await ensureCrewUser(act.email);
      const person = await savePerson({
        email: act.email,
        authId,
        name: act.name,
        lang: act.lang,
        phone: act.phone,
        trade: act.trade,
        group: act.group,
        payRate: act.payRate,
        addedBy: owner.name,
      });
      if (isPlaceholderEmail(person.email)) {
        return ok(`${person.name} has a seat. There is no real email behind it: use "Get a code" to sign them in on their phone.`);
      }
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
        ...(act.group !== undefined ? { group_id: act.group } : {}),
        ...(act.payRate !== undefined ? { pay_rate: act.payRate } : {}),
      };
      if (act.group !== undefined && !(await getGroup(act.group))) return bad(400, "That group does not exist.");
      if (Object.keys(patch).length) await patchPerson(person.email, patch);
      return ok();
    }

    case "person.invite": {
      const person = await getPerson(act.email);
      if (!person || !person.active) return bad(404, "That person does not have a seat.");
      if (isPlaceholderEmail(person.email)) return bad(400, 'There is no real email behind this seat. Use "Get a code" and type it on their phone.');
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
        const job = await insertJob({
          id,
          name: act.name,
          address: act.address,
          note: act.note,
          promised: act.promised || null,
          promiseNote: act.promiseNote,
          createdBy: owner.name,
        });
        if (job) {
          if (scope !== null) await setJobPeople(job.id, [{ email: owner.email, role: "pm" }], owner.name);
          if (act.address.trim()) await placeJob(job.id, act.address, nowDate);
          return ok();
        }
        const taken = await getJob(id);
        if (taken && taken.name.toLowerCase() === act.name.toLowerCase()) {
          if (taken.active) return bad(409, "That job is already on the list.");
          const address = act.address || taken.address;
          await patchJob(id, { active: true, address, note: act.note || taken.note });
          if (address.trim() && (address !== taken.address || !taken.geo)) await placeJob(id, address, nowDate);
          return ok("That job was archived. It is back on the list.");
        }
      }
      return bad(409, "A job with a name that close already exists. Use a different name.");
    }

    case "job.update": {
      const { kind: _kind, id, promised, promiseNote, ...rest } = act;
      void _kind;
      // Keeping the promise, the address and the site note current is jobs.promise.
      // The name (receipts and hours are filed under it) and the list need jobs.manage.
      if (owner.role === "member" && !owner.perms?.includes("jobs.manage") && (rest.name !== undefined || rest.active !== undefined)) {
        return bad(403, "Renaming or closing a job needs the jobs switch. Marco or Lando can turn it on.");
      }
      // A new address is placed again (and one never placed, placed): the old point must not stand for it.
      let place = false;
      if (rest.address !== undefined) {
        const before = await getJob(id);
        place = rest.address !== (before?.address ?? "") || (!!rest.address.trim() && !before?.geo);
      }
      const job = await patchJob(id, {
        ...rest,
        ...(promised !== undefined ? { promised: promised || null } : {}),
        ...(promiseNote !== undefined ? { promise_note: promiseNote } : {}),
      });
      if (!job) return bad(404, "That job is not on the list.");
      if (place && rest.address !== undefined) await placeJob(job.id, rest.address, nowDate);
      return ok();
    }

    case "job.geocode": {
      let targets: { id: string; name: string; address: string }[];
      if (act.id) {
        const job = await getJob(act.id);
        if (!job) return bad(404, "That job is not on the list.");
        if (!job.address.trim()) return bad(400, "Give the job an address first.");
        targets = [job];
      } else {
        targets = (await listJobs()).filter((j) => j.active && !j.geo && j.address.trim() && inScope(scope, j.id));
      }
      // One at a time: Nominatim asks for no more than one call a second.
      let set = 0;
      for (const job of targets) if (await placeJob(job.id, job.address, nowDate)) set++;
      if (act.id) {
        return set ? { ok: true, set, note: `${targets[0].name} is on the map.` } : { ok: true, set, note: `Could not find ${targets[0].name} on the map. Check the address.` };
      }
      const missed = targets.length - set;
      return {
        ok: true,
        set,
        note: targets.length ? `${set} of ${targets.length} ${targets.length === 1 ? "job" : "jobs"} on the map.${missed ? ` ${missed} not found: check the address.` : ""}` : "Every job with an address is on the map already.",
      };
    }

    case "job.people": {
      const job = await getJob(act.id);
      if (!job) return bad(404, "That job is not on the list.");
      const seats = new Set((await listPeople()).filter((p) => p.active).map((p) => p.email));
      const people = act.people.filter((p, i) => seats.has(p.email) && act.people.findIndex((q) => q.email === p.email) === i);
      if (people.length !== act.people.length) return bad(400, "Someone on that list has no active seat.");
      const onJob = await setJobPeople(job.id, people, owner.name);
      return ok(onJob.length ? `${onJob.length} ${onJob.length === 1 ? "person" : "people"} on ${job.name}.` : `Nobody is on ${job.name} now.`);
    }

    case "job.link": {
      const job = await getJob(act.id);
      if (!job) return bad(404, "That job is not on the list.");
      const res = await linkBillingJob(job.id, act.billingJobId || null);
      if (res === "missing") return bad(404, "That billing job is gone.");
      if (res === "taken") return bad(409, "That billing job is already linked to another field job. Unlink it there first.");
      return ok(act.billingJobId ? `${job.name} is linked to its billing job.` : `${job.name} has no billing job now.`);
    }

    case "job.phases.set": {
      const job = await getJob(act.jobId);
      if (!job) return bad(404, "That job is not on the list.");
      for (const p of act.phases) {
        if (p.plannedFrom && p.plannedTo && p.plannedFrom > p.plannedTo) return bad(400, `"${p.name}": the plan ends before it starts.`);
      }
      const plan = planPhaseSet(
        await listJobPhases({ jobId: job.id }),
        act.phases.map((p) => ({ name: p.name, trade: p.trade, plannedFrom: p.plannedFrom || null, plannedTo: p.plannedTo || null })),
      );
      if (!plan.ok) return bad(409, plan.error);
      const rows = await replaceJobPhases(
        job.id,
        plan.keep,
        plan.add.map((a) => ({ jobId: job.id, ...a, createdBy: owner.name })),
      );
      return ok(rows.length ? `${rows.length} ${rows.length === 1 ? "phase" : "phases"} on ${job.name}.` : `${job.name} has no phases now.`);
    }

    case "job.phases.template": {
      const job = await getJob(act.jobId);
      if (!job) return bad(404, "That job is not on the list.");
      const have = await listJobPhases({ jobId: job.id });
      const start = have.reduce((m, p) => Math.max(m, p.ord), 0);
      const specs = templatePhases(act.template);
      await insertJobPhases(specs.map((s, i) => ({ jobId: job.id, ord: start + i + 1, ...s, createdBy: owner.name })));
      const what = act.template === "both" ? "framing and drywall" : act.template;
      return ok(`${specs.length} ${what} phases on ${job.name}${have.length ? ", after the ones it had" : ""}.`);
    }

    case "phase.verify": {
      const phase = await getJobPhase(act.id);
      if (!phase) return bad(404, "That phase is gone.");
      if (phase.verifiedAt) return bad(409, `${phase.verifiedBy || "Someone"} already verified it.`);
      const openGates = await unpassedChecklistsForPhase(phase.id);
      if (openGates.length) {
        const names = openGates.map((g) => `${g.stageLabel}${g.locationLabel ? ` (${g.locationLabel})` : ""}`).join(", ");
        return bad(409, `Pre-cover quality gate still open on ${phase.name}: ${names}. Pass the checklist first (SOP-009).`);
      }
      const line = `Verified by ${firstNameOf(owner.name)} (${dayShort(today)})${act.note.trim() ? `: ${act.note.trim()}` : ""}`;
      const saved = await patchJobPhase(
        phase.id,
        { verified_at: nowDate.toISOString(), verified_by: owner.name, note: phaseNote(phase.note, line) },
        { verified: false },
      );
      if (!saved) return bad(409, "Someone else just verified it.");
      return ok(`${phase.name}: verified.`);
    }

    case "phase.unverify": {
      const phase = await getJobPhase(act.id);
      if (!phase) return bad(404, "That phase is gone.");
      if (!phase.verifiedAt) return bad(409, "That phase is not verified.");
      const line = `Unverified by ${firstNameOf(owner.name)} (${dayShort(today)}): ${act.note.trim()}`;
      const saved = await patchJobPhase(phase.id, { verified_at: null, verified_by: "", note: phaseNote(phase.note, line) }, { verified: true });
      if (!saved) return bad(409, "Someone else just changed it.");
      return ok(`${phase.name} is open again.`);
    }

    case "phase.plan": {
      const phase = await getJobPhase(act.id);
      if (!phase) return bad(404, "That phase is gone.");
      const from = act.plannedFrom || null;
      const to = act.plannedTo || null;
      if (from && to && from > to) return bad(400, "The plan ends before it starts.");
      const saved = await patchJobPhase(phase.id, { planned_from: from, planned_to: to });
      return saved ? ok() : bad(404, "That phase is gone.");
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
          priority: act.priority,
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
      const rows = from.filter((r) => active.has(r.email) && inScope(scope, r.jobId));
      if (!rows.length) return bad(400, "Nobody was scheduled that day.");
      const made = await upsertSchedule(
        rows.map((r) => ({
          day: act.to,
          email: r.email,
          jobId: r.jobId,
          jobName: r.jobName,
          startTime: r.startTime,
          note: r.note,
          priority: r.priority,
          createdBy: owner.name,
        })),
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
        people.map((p) => ({
          email: p.email,
          title: act.title,
          detail: act.detail,
          jobId: job.id,
          jobName: job.name,
          due: act.due || null,
          priority: act.priority,
          createdBy: owner.name,
        })),
      );
      for (const p of people) await notifyCrew(p, MSG.newTask(act.title), "crew-task");
      return ok();
    }

    case "task.update": {
      const task = await getTask(act.id);
      if (!task) return bad(404, "That task is gone.");
      // Done from here means checked and verified: never by the person who did it.
      if (act.status === "done" && task.email === owner.email) return bad(403, OWN_WORK);
      const closing = act.status === "done" || act.status === "dropped";
      const at = nowDate.toISOString();
      await patchTask(task.id, {
        ...(act.status !== undefined ? { status: act.status, closed_at: closing ? at : null } : {}),
        // Marked done by whoever checks the work: that is verified done.
        ...(act.status === "done" ? { verified_at: at, verified_by: owner.name } : {}),
        ...(act.status === "open" ? { verified_at: null, verified_by: "", reported_at: null } : {}),
        ...(act.title !== undefined ? { title: act.title } : {}),
        ...(act.detail !== undefined ? { detail: act.detail } : {}),
        ...(act.due !== undefined ? { due: act.due || null } : {}),
        ...(act.priority !== undefined ? { priority: act.priority } : {}),
      });
      return ok();
    }

    case "task.verify": {
      const task = await getTask(act.id);
      if (!task || task.status !== "done") return bad(404, "That task is not waiting on a check.");
      if (task.verifiedAt) return bad(409, `${task.verifiedBy || "Someone"} already checked it.`);
      if (task.email === owner.email) return bad(403, OWN_WORK);
      const at = nowDate.toISOString();
      const person = await getPerson(task.email);
      if (act.ok) {
        const saved = await patchTask(task.id, { verified_at: at, verified_by: owner.name }, { status: "done", unverified: true });
        if (!saved) return bad(409, "Someone else just checked it.");
        if (person?.active && person.email !== owner.email) await notifyCrew(person, MSG.verified(task.title, firstNameOf(owner.name)), `crew-task-${task.id}`);
        return ok("Verified done.");
      }
      if (act.note.trim().length < 3) return bad(400, "Say what is left, so they know what to come back for.");
      const saved = await patchTask(
        task.id,
        {
          status: "open",
          closed_at: null,
          reported_at: null,
          sent_back: task.sentBack + 1,
          detail: `${task.detail ? `${task.detail}\n\n` : ""}Sent back by ${firstNameOf(owner.name)} (${dayShort(today)}): ${act.note.trim()}`.slice(0, 1500),
        },
        { status: "done", unverified: true },
      );
      if (!saved) return bad(409, "Someone else just checked it.");
      if (person?.active) await notifyCrew(person, MSG.sentBack(task.title, firstNameOf(owner.name), act.note.trim()), `crew-task-${task.id}`);
      return ok("Sent back. It is open again on their list.");
    }

    case "pickup.add": {
      let job = { id: "", name: "" };
      if (act.jobId) {
        const found = await getJob(act.jobId);
        if (!found) return bad(400, "That job is not on the list.");
        job = { id: found.id, name: found.name };
      }
      if (act.day < today) return bad(400, "That day has passed.");
      const people = await listPeople();
      if (act.email && !people.some((p) => p.active && p.email === act.email)) return bad(400, "That person does not have a seat.");
      const pickup = await insertPickup({
        day: act.day,
        jobId: job.id,
        jobName: job.name,
        supplier: act.supplier,
        place: act.place,
        orderRef: act.orderRef,
        items: act.items,
        note: act.note,
        email: act.email,
        createdBy: owner.name,
      });
      const to = people.filter((p) => p.active && (act.email ? p.email === act.email : p.perms.includes("pickups.run")));
      for (const p of to) await notifyCrew(p, MSG.newPickup(pickup.supplier, pickup.jobName, pickup.day, today), `crew-pickup-${pickup.id}`);
      return ok(to.length ? `On ${to.map((p) => firstNameOf(p.name)).join(", ")}'s list.` : "Staged. Nobody has a runner seat yet, so nobody was told.");
    }

    case "pickup.update": {
      const pickup = await getPickup(act.id);
      if (!pickup) return bad(404, "That pickup is gone.");
      const at = nowDate.toISOString();
      const saved = await patchPickup(pickup.id, {
        ...(act.status !== undefined ? { status: act.status } : {}),
        ...(act.status === "staged" ? { picked_at: null, picked_by: "", delivered_at: null, runner_note: "" } : {}),
        ...(act.status === "delivered" && !pickup.deliveredAt ? { delivered_at: at } : {}),
        ...(act.email !== undefined ? { email: act.email } : {}),
        ...(act.note !== undefined ? { note: act.note } : {}),
        ...(act.day !== undefined ? { day: act.day } : {}),
      });
      if (!saved) return bad(404, "That pickup is gone.");
      // A pickup made from a material request (0023) carries its status back to it.
      if (act.status !== undefined) await mirrorPickupToRequest(pickup.id, act.status);
      return ok();
    }

    case "group.save": {
      const perms = normalizePerms(act.perms);
      if (act.id) {
        const saved = await patchGroup(act.id, { name: act.name, description: act.description, perms });
        return saved ? ok(`${saved.name} saved. Everyone in it has the new switches on their next tap.`) : bad(404, "That group is gone.");
      }
      const base = jobSlug(act.name).replace(/^job-/, "group-").slice(0, 36).replace(/-+$/, "");
      for (const id of [base, `${base}-2`, `${base}-3`]) {
        const made = await insertGroup({ id, name: act.name, description: act.description, perms, createdBy: owner.name });
        if (made) return ok(`${made.name} made. Put people in it from their seat.`);
      }
      return bad(409, "A group with a name that close already exists.");
    }

    case "group.delete": {
      const group = await getGroup(act.id);
      if (!group) return ok();
      if (group.builtin) return bad(400, `${group.name} is one of the three the app starts with. Change its switches instead.`);
      const members = (await listPeople()).filter((p) => p.group === group.id);
      if (members.length) return bad(409, `Move ${members.map((p) => firstNameOf(p.name)).join(", ")} to another group first.`);
      await deleteGroup(group.id);
      return ok(`${group.name} deleted.`);
    }

    case "report.answer": {
      const report = await getReport(act.id);
      if (!report) return bad(404, "That plan is gone.");
      if (report.answer) return bad(409, `${firstNameOf(report.answer.name) || "Someone"} already answered it.`);
      const answered = await answerReport(report, { text: act.text, by: owner.email, name: owner.name, at: nowDate.toISOString() });
      if (!answered) return bad(409, "Someone else just answered it.");
      const sender = await getPerson(report.sentBy);
      if (sender?.active) {
        await notifyCrew(sender, MSG.planAnswered(firstNameOf(owner.name), act.text), `crew-plan-answer-${report.id}`, `/app/crew?view=plan&day=${report.day}`);
      }
      return ok(`Sent to ${firstNameOf(report.sentName) || "the supervisor"}.`);
    }

    case "report.send": {
      const [people, jobs, schedule, tasks, pickups] = await Promise.all([
        listPeople(),
        listJobs(),
        listSchedule({ fromDay: today, toDay: addDays(act.day, 7) }),
        listTasks({ closedSince: new Date(now - 24 * 3600_000).toISOString() }),
        listPickups({ fromDay: today }),
      ]);
      const mine = <T extends { jobId: string }>(rows: T[]) => rows.filter((r) => inScope(scope, r.jobId));
      const plan = buildPlan({
        day: act.day,
        today,
        people,
        jobs: jobs.filter((j) => inScope(scope, j.id)),
        schedule: mine(schedule),
        tasks: mine(tasks),
        pickups: mine(pickups),
        note: act.note,
      });
      const report = await insertReport({ day: act.day, sentBy: owner.email, sentName: owner.name, body: plan.text, data: plan.counts });
      await notifyOwners({
        title: `${firstNameOf(owner.name)}'s plan for ${dayShort(act.day)}`,
        body: `${plan.counts.scheduled} scheduled · ${plan.counts.open} open tasks${plan.counts.toCheck ? ` · ${plan.counts.toCheck} to check` : ""}${act.note ? ` · needs you: ${act.note}` : ""}`,
        tag: `crew-plan-${report.day}`,
      }, "decisions");
      return ok("Sent to Marco.");
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

    case "purchase.assign": {
      // The screen sends the key it was shown; a raw name normalizes to the same thing.
      const key = normalizeJobName(act.alias);
      if (!key) return bad(400, "Which name?");
      if (act.jobId === null && owner.role === "member") {
        return bad(403, "Setting a name aside is for the owners. Pick a job, or leave it for Marco or Lando.");
      }
      const job = act.jobId ? await getJob(act.jobId) : null;
      if (act.jobId && !job) return bad(404, "That job is not on the list.");
      await upsertAlias(key, act.jobId, owner.name);
      const linked = await relinkPurchases(key, act.jobId);
      const lines = `${linked} ${linked === 1 ? "line" : "lines"}`;
      return { ok: true, linked, note: job ? `"${act.alias}" is ${job.name}: ${lines} filed.` : `"${act.alias}" set aside: ${lines} ignored.` };
    }
    // Material requests and the owners' settings (0023) live in requests.ts.
    case "request.add":
    case "request.decide":
    case "request.order":
    case "request.cancel":
    case "settings.set":
      return runRequestAct(owner, act, nowDate);
  }
}
