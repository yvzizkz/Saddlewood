import { randomBytes, randomUUID } from "node:crypto";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { snapshotHash } from "@/lib/sales/signing";
import { SubsError } from "./access";
import { bidFingerprintInput, bidLinesFor, level, type Leveling } from "./rules";
import type {
  Addendum,
  BidEvent,
  BidEventKind,
  BidInvite,
  BidLine,
  BidPackage,
  BidResponse,
  BidSignature,
  PackageLine,
  StoredFile,
  Sub,
  SubContact,
  SubStatus,
} from "./types";
import { isOpenForBids } from "./types";

// The sub directory and the bid-out in the database (0028). Server only.
// Bids and the proof record are append-only in the database itself; this file
// never tries to change them.

export const SUBS_BUCKET = "subs";
const UNIQUE_VIOLATION = "23505";

function fail(what: string, message: string): never {
  throw new Error(`subs: ${what} failed: ${message}`);
}

export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

// ---- rows -------------------------------------------------------------------------

type SubRow = {
  id: string;
  name: string;
  trades: string[];
  status: SubStatus;
  phone: string;
  email: string;
  address: string;
  roc_license: string;
  roc_verified_at: string | null;
  roc_verified_by: string;
  coi_expires_on: string | null;
  w9_on_file: boolean;
  msa_signed_on: string | null;
  ach_confirmed_at: string | null;
  ach_confirmed_by: string;
  note: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type ContactRow = { id: string; sub_id: string; name: string; email: string; phone: string; role: string; is_primary: boolean; active: boolean };

function toContact(r: ContactRow): SubContact {
  return { id: r.id, subId: r.sub_id, name: r.name, email: r.email, phone: r.phone, role: r.role, isPrimary: r.is_primary, active: r.active };
}

function toSub(r: SubRow, contacts: SubContact[]): Sub {
  return {
    id: r.id,
    name: r.name,
    trades: r.trades ?? [],
    status: r.status,
    phone: r.phone,
    email: r.email,
    address: r.address,
    rocLicense: r.roc_license,
    rocVerifiedAt: r.roc_verified_at,
    rocVerifiedBy: r.roc_verified_by,
    coiExpiresOn: r.coi_expires_on,
    w9OnFile: r.w9_on_file,
    msaSignedOn: r.msa_signed_on,
    achConfirmedAt: r.ach_confirmed_at,
    achConfirmedBy: r.ach_confirmed_by,
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    contacts: contacts.filter((c) => c.subId === r.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name)),
  };
}

type PackageRow = {
  id: string;
  job_id: string | null;
  opportunity_id: string | null;
  trade: string;
  title: string;
  scope: string;
  lines: PackageLine[];
  exclusions: string[];
  files: StoredFile[];
  work_from: string | null;
  work_to: string | null;
  site_walk: string;
  due_at: string | null;
  terms: string;
  status: BidPackage["status"];
  awarded_invite_id: string | null;
  awarded_at: string | null;
  awarded_by: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

function toPackage(r: PackageRow): BidPackage {
  return {
    id: r.id,
    jobId: r.job_id,
    opportunityId: r.opportunity_id,
    trade: r.trade,
    title: r.title,
    scope: r.scope,
    lines: Array.isArray(r.lines) ? r.lines : [],
    exclusions: r.exclusions ?? [],
    files: Array.isArray(r.files) ? r.files : [],
    workFrom: r.work_from,
    workTo: r.work_to,
    siteWalk: r.site_walk,
    dueAt: r.due_at,
    terms: r.terms,
    status: r.status,
    awardedInviteId: r.awarded_invite_id,
    awardedAt: r.awarded_at,
    awardedBy: r.awarded_by,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

type InviteRow = {
  id: string;
  package_id: string;
  sub_id: string;
  contact_name: string;
  contact_email: string;
  token: string;
  status: BidInvite["status"];
  sent_at: string | null;
  viewed_at: string | null;
  declined_at: string | null;
  decline_note: string;
  level_add_cents: number;
  level_note: string;
  created_by: string;
  created_at: string;
};

function toInvite(r: InviteRow): BidInvite {
  return {
    id: r.id,
    packageId: r.package_id,
    subId: r.sub_id,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    token: r.token,
    status: r.status,
    sentAt: r.sent_at,
    viewedAt: r.viewed_at,
    declinedAt: r.declined_at,
    declineNote: r.decline_note,
    levelAddCents: Number(r.level_add_cents ?? 0),
    levelNote: r.level_note,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

type ResponseRow = {
  id: number;
  invite_id: string;
  revision: number;
  lines: BidLine[];
  total_cents: number;
  inclusions: string;
  exclusions: string;
  start_on: string | null;
  duration: string;
  valid_days: number;
  deviations: string;
  note: string;
  files: StoredFile[];
  signer_name: string;
  signer_title: string;
  signature: BidSignature;
  consent: string;
  fingerprint: string;
  submitted_at: string;
};

function toResponse(r: ResponseRow): BidResponse {
  return {
    id: r.id,
    inviteId: r.invite_id,
    revision: r.revision,
    lines: Array.isArray(r.lines) ? r.lines : [],
    totalCents: Number(r.total_cents),
    inclusions: r.inclusions,
    exclusions: r.exclusions,
    startOn: r.start_on,
    duration: r.duration,
    validDays: r.valid_days,
    deviations: r.deviations,
    note: r.note,
    files: Array.isArray(r.files) ? r.files : [],
    signerName: r.signer_name,
    signerTitle: r.signer_title,
    signature: r.signature,
    consent: r.consent,
    fingerprint: r.fingerprint,
    submittedAt: r.submitted_at,
  };
}

// ---- the directory -----------------------------------------------------------------

export async function listSubs(): Promise<Sub[]> {
  const db = getSupabaseAdmin();
  const [{ data, error }, { data: c, error: cErr }] = await Promise.all([
    db.from("subs").select("*").order("name", { ascending: true }).limit(2000),
    db.from("sub_contacts").select("*").eq("active", true).limit(5000),
  ]);
  if (error || cErr) fail("list subs", (error ?? cErr)!.message);
  const contacts = ((c ?? []) as ContactRow[]).map(toContact);
  return ((data ?? []) as SubRow[]).map((r) => toSub(r, contacts));
}

export async function getSub(id: string): Promise<Sub | null> {
  const db = getSupabaseAdmin();
  const [{ data, error }, { data: c, error: cErr }] = await Promise.all([
    db.from("subs").select("*").eq("id", id).maybeSingle(),
    db.from("sub_contacts").select("*").eq("sub_id", id).eq("active", true),
  ]);
  if (error || cErr) fail("read sub", (error ?? cErr)!.message);
  return data ? toSub(data as SubRow, ((c ?? []) as ContactRow[]).map(toContact)) : null;
}

export type SubInput = {
  name: string;
  trades: string[];
  status: SubStatus;
  phone: string;
  email: string;
  address: string;
  rocLicense: string;
  coiExpiresOn: string | null;
  w9OnFile: boolean;
  msaSignedOn: string | null;
  note: string;
  /** Set or clear: who checked the license on the ROC portal, who confirmed the bank details by phone. */
  rocVerified?: boolean;
  achConfirmed?: boolean;
  contacts: { id?: string; name: string; email: string; phone: string; role: string; isPrimary: boolean }[];
};

function cleanTrades(trades: string[]): string[] {
  return [...new Set(trades.map((t) => t.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean))].slice(0, 20);
}

/** Add a sub, or change one; its contacts are replaced as a whole (the screen sends the full list). */
export async function saveSub(id: string | null, input: SubInput, actor: string, now: Date = new Date()): Promise<Sub> {
  const db = getSupabaseAdmin();
  const before = id ? await getSub(id) : null;
  if (id && !before) throw new SubsError("not found", 404);
  const row: Record<string, unknown> = {
    name: input.name.trim().replace(/\s+/g, " "),
    trades: cleanTrades(input.trades),
    status: input.status,
    phone: input.phone.trim(),
    email: input.email.trim().toLowerCase(),
    address: input.address.trim(),
    roc_license: input.rocLicense.trim().toUpperCase(),
    coi_expires_on: input.coiExpiresOn,
    w9_on_file: input.w9OnFile,
    msa_signed_on: input.msaSignedOn,
    note: input.note.trim(),
  };
  if (input.rocVerified !== undefined) {
    if (input.rocVerified && !before?.rocVerifiedAt) Object.assign(row, { roc_verified_at: now.toISOString(), roc_verified_by: actor });
    if (!input.rocVerified) Object.assign(row, { roc_verified_at: null, roc_verified_by: "" });
  }
  // A changed license number is checked again.
  if (before && before.rocLicense !== row.roc_license && input.rocVerified !== true) Object.assign(row, { roc_verified_at: null, roc_verified_by: "" });
  if (input.achConfirmed !== undefined) {
    if (input.achConfirmed && !before?.achConfirmedAt) Object.assign(row, { ach_confirmed_at: now.toISOString(), ach_confirmed_by: actor });
    if (!input.achConfirmed) Object.assign(row, { ach_confirmed_at: null, ach_confirmed_by: "" });
  }
  let subId = id;
  if (!id) {
    const { data, error } = await db.from("subs").insert({ ...row, created_by: actor }).select("id").single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new SubsError(`${row.name} is already in the directory`, 409);
      fail("add sub", error.message);
    }
    subId = (data as { id: string }).id;
  } else {
    const { error } = await db.from("subs").update(row).eq("id", id);
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new SubsError(`another sub is already named ${row.name}`, 409);
      fail("update sub", error.message);
    }
  }
  // Contacts: keep the ids sent, add the new ones, retire the rest.
  const keep = input.contacts.filter((c) => c.name.trim() || c.email.trim());
  const primary = keep.findIndex((c) => c.isPrimary);
  const rows = keep.map((c, i) => ({
    ...(c.id ? { id: c.id } : {}),
    sub_id: subId,
    name: c.name.trim(),
    email: c.email.trim().toLowerCase(),
    phone: c.phone.trim(),
    role: c.role.trim(),
    is_primary: primary < 0 ? i === 0 : i === primary,
    active: true,
  }));
  const ids = rows.map((r) => (r as { id?: string }).id).filter((x): x is string => !!x);
  let retire = db.from("sub_contacts").update({ active: false }).eq("sub_id", subId!);
  if (ids.length) retire = retire.not("id", "in", `(${ids.join(",")})`);
  const r1 = await retire;
  if (r1.error) fail("retire contacts", r1.error.message);
  const withId = rows.filter((r) => (r as { id?: string }).id);
  const fresh = rows.filter((r) => !(r as { id?: string }).id);
  if (withId.length) {
    const { error } = await db.from("sub_contacts").upsert(withId, { onConflict: "id" });
    if (error) fail("save contacts", error.message);
  }
  if (fresh.length) {
    const { error } = await db.from("sub_contacts").insert(fresh);
    if (error) fail("add contacts", error.message);
  }
  return (await getSub(subId!))!;
}

// ---- packages ------------------------------------------------------------------------

export type PackageInput = {
  jobId: string | null;
  opportunityId: string | null;
  trade: string;
  title: string;
  scope: string;
  lines: PackageLine[];
  exclusions: string[];
  workFrom: string | null;
  workTo: string | null;
  siteWalk: string;
  dueAt: string | null;
  terms: string;
};

export async function listPackages(filter: { jobId?: string; opportunityId?: string } = {}): Promise<BidPackage[]> {
  const db = getSupabaseAdmin();
  let q = db.from("bid_packages").select("*").order("created_at", { ascending: false }).limit(500);
  if (filter.jobId) q = q.eq("job_id", filter.jobId);
  if (filter.opportunityId) q = q.eq("opportunity_id", filter.opportunityId);
  const { data, error } = await q;
  if (error) fail("list packages", error.message);
  return ((data ?? []) as PackageRow[]).map(toPackage);
}

export async function getPackage(id: string): Promise<BidPackage | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("bid_packages").select("*").eq("id", id).maybeSingle();
  if (error) fail("read package", error.message);
  return data ? toPackage(data as PackageRow) : null;
}

function cleanLines(lines: PackageLine[]): PackageLine[] {
  return lines
    .filter((l) => l.description.trim())
    .slice(0, 200)
    .map((l) => ({
      id: l.id || randomUUID(),
      description: l.description.trim().slice(0, 300),
      qty: l.qty === null || !Number.isFinite(l.qty) ? null : l.qty,
      unit: l.unit.trim().slice(0, 20),
      note: l.note.trim().slice(0, 500),
      ourCents: l.ourCents === null || !Number.isFinite(l.ourCents) ? null : Math.max(0, Math.round(l.ourCents)),
    }));
}

function packageRow(input: PackageInput): Record<string, unknown> {
  return {
    job_id: input.jobId,
    opportunity_id: input.opportunityId,
    trade: input.trade.trim().toLowerCase(),
    title: input.title.trim(),
    scope: input.scope.trim(),
    lines: cleanLines(input.lines),
    exclusions: input.exclusions.map((x) => x.trim()).filter(Boolean).slice(0, 50),
    work_from: input.workFrom,
    work_to: input.workTo,
    site_walk: input.siteWalk.trim(),
    due_at: input.dueAt,
    terms: input.terms.trim(),
  };
}

export async function createPackage(input: PackageInput, actor: string): Promise<BidPackage> {
  if (!input.jobId && !input.opportunityId) throw new SubsError("a package belongs to a job or an opportunity", 400);
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("bid_packages").insert({ ...packageRow(input), created_by: actor }).select("*").single();
  if (error) fail("create package", error.message);
  const p = toPackage(data as PackageRow);
  await recordBidEvent(p.id, null, "created", actor, { trade: p.trade, lines: p.lines.length });
  return p;
}

/**
 * A change to a package. Once it is out, what the subs priced may not change
 * under them silently: a change to the scope, lines, exclusions or dates
 * needs an addendum, which every invitee sees on their link.
 */
export async function updatePackage(id: string, input: PackageInput, actor: string, addendum: string): Promise<BidPackage> {
  const before = await getPackage(id);
  if (!before) throw new SubsError("not found", 404);
  if (before.status === "awarded" || before.status === "cancelled") throw new SubsError(`this package is ${before.status}`, 409);
  const row = packageRow(input);
  const db = getSupabaseAdmin();
  if (before.status !== "draft") {
    const changed =
      JSON.stringify(before.lines.map(({ ourCents: _o, ...l }) => (void _o, l))) !==
        JSON.stringify((row.lines as PackageLine[]).map(({ ourCents: _o, ...l }) => (void _o, l))) ||
      before.scope !== row.scope ||
      JSON.stringify(before.exclusions) !== JSON.stringify(row.exclusions) ||
      before.workFrom !== row.work_from ||
      before.workTo !== row.work_to ||
      before.dueAt !== row.due_at ||
      before.siteWalk !== row.site_walk ||
      before.terms !== row.terms;
    if (changed && !addendum.trim()) throw new SubsError("the subs already have this package: say what changed (an addendum)", 400);
    if (changed) await addAddendum(id, addendum, actor);
  }
  const { data, error } = await db.from("bid_packages").update(row).eq("id", id).select("*").single();
  if (error) fail("update package", error.message);
  return toPackage(data as PackageRow);
}

export async function setPackageStatus(id: string, status: "out" | "closed" | "cancelled" | "draft", actor: string): Promise<BidPackage> {
  const before = await getPackage(id);
  if (!before) throw new SubsError("not found", 404);
  if (before.status === "awarded") throw new SubsError("this package was awarded", 409);
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("bid_packages").update({ status }).eq("id", id).select("*").single();
  if (error) fail("package status", error.message);
  if (status === "cancelled") await recordBidEvent(id, null, "cancelled", actor);
  if (status === "out" && before.status === "closed") await recordBidEvent(id, null, "reopened", actor);
  return toPackage(data as PackageRow);
}

export async function listAddenda(packageId: string): Promise<Addendum[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("bid_addenda").select("*").eq("package_id", packageId).order("n", { ascending: true });
  if (error) fail("list addenda", error.message);
  return ((data ?? []) as { id: number; package_id: string; n: number; text: string; created_by: string; created_at: string }[]).map((r) => ({
    id: r.id,
    packageId: r.package_id,
    n: r.n,
    text: r.text,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

export async function addAddendum(packageId: string, text: string, actor: string): Promise<Addendum> {
  const db = getSupabaseAdmin();
  for (let attempt = 0; attempt < 3; attempt++) {
    const n = (await listAddenda(packageId)).reduce((m, a) => Math.max(m, a.n), 0) + 1;
    const { data, error } = await db.from("bid_addenda").insert({ package_id: packageId, n, text: text.trim().slice(0, 4000), created_by: actor }).select("*").single();
    if (!error) {
      await recordBidEvent(packageId, null, "addendum", actor, { n });
      const r = data as { id: number; package_id: string; n: number; text: string; created_by: string; created_at: string };
      return { id: r.id, packageId: r.package_id, n: r.n, text: r.text, createdBy: r.created_by, createdAt: r.created_at };
    }
    if (error.code !== UNIQUE_VIOLATION) fail("add addendum", error.message);
  }
  throw new SubsError("someone else added an addendum at the same time; try again", 409);
}

/** Add an uploaded file to the package once it is in storage. */
export async function attachPackageFile(packageId: string, file: Omit<StoredFile, "id" | "at" | "by">, actor: string, now: Date = new Date()): Promise<BidPackage> {
  const p = await getPackage(packageId);
  if (!p) throw new SubsError("not found", 404);
  if (!file.path.startsWith(`p/${packageId}/`)) throw new SubsError("that file is not this package's", 400);
  await assertStored(file.path);
  const files = [...p.files.filter((f) => f.path !== file.path), { ...file, id: randomUUID(), at: now.toISOString(), by: actor }];
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("bid_packages").update({ files }).eq("id", packageId).select("*").single();
  if (error) fail("attach file", error.message);
  return toPackage(data as PackageRow);
}

export async function removePackageFile(packageId: string, fileId: string): Promise<BidPackage> {
  const p = await getPackage(packageId);
  if (!p) throw new SubsError("not found", 404);
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("bid_packages").update({ files: p.files.filter((f) => f.id !== fileId) }).eq("id", packageId).select("*").single();
  if (error) fail("remove file", error.message);
  return toPackage(data as PackageRow);
}

// ---- files ------------------------------------------------------------------------------

export function safeName(name: string): string {
  return name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(-100) || "file";
}

/** A one-time upload slot in the private bucket: p/<package>/ for our plans, b/<invite>/ for a sub's quote. */
export async function signSubsUpload(folder: string, name: string): Promise<{ path: string; token: string }> {
  const db = getSupabaseAdmin();
  const path = `${folder}/${randomBytes(6).toString("hex")}-${safeName(name)}`;
  const { data, error } = await db.storage.from(SUBS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) fail("prepare upload", error?.message ?? "no url");
  return { path: data.path, token: data.token };
}

async function assertStored(path: string): Promise<void> {
  const db = getSupabaseAdmin();
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await db.storage.from(SUBS_BUCKET).list(dir, { search: name, limit: 5 });
  if (error) fail("check upload", error.message);
  if (!(data ?? []).some((o) => o.name === name)) throw new SubsError("the upload did not arrive; try again", 400);
}

export async function signSubsDownload(path: string, seconds = 120, downloadName?: string): Promise<string> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.storage.from(SUBS_BUCKET).createSignedUrl(path, seconds, downloadName ? { download: downloadName } : undefined);
  if (error || !data?.signedUrl) fail("open file", error?.message ?? "no url");
  return data.signedUrl;
}

// ---- invites -------------------------------------------------------------------------------

export async function listInvites(filter: { packageId?: string; subId?: string }): Promise<BidInvite[]> {
  const db = getSupabaseAdmin();
  let q = db.from("bid_invites").select("*").order("created_at", { ascending: true }).limit(2000);
  if (filter.packageId) q = q.eq("package_id", filter.packageId);
  if (filter.subId) q = q.eq("sub_id", filter.subId);
  const { data, error } = await q;
  if (error) fail("list invites", error.message);
  return ((data ?? []) as InviteRow[]).map(toInvite);
}

/** Put subs on a package, each with its own link; a sub already on it is left as it is. */
export async function inviteSubs(packageId: string, picks: { subId: string; contactId?: string | null }[], actor: string): Promise<BidInvite[]> {
  const p = await getPackage(packageId);
  if (!p) throw new SubsError("not found", 404);
  if (p.status === "awarded" || p.status === "cancelled") throw new SubsError(`this package is ${p.status}`, 409);
  const have = new Set((await listInvites({ packageId })).map((i) => i.subId));
  const db = getSupabaseAdmin();
  for (const pick of picks) {
    if (have.has(pick.subId)) continue;
    const sub = await getSub(pick.subId);
    if (!sub) throw new SubsError("one of those subs is not in the directory", 404);
    if (sub.status === "inactive") throw new SubsError(`${sub.name} is marked inactive`, 409);
    const contact = sub.contacts.find((c) => c.id === pick.contactId) ?? sub.contacts.find((c) => c.isPrimary && c.email) ?? sub.contacts.find((c) => c.email);
    const email = contact?.email || sub.email;
    if (!email) throw new SubsError(`${sub.name} has no email to send the invite to`, 400);
    const { data, error } = await db
      .from("bid_invites")
      .insert({ package_id: packageId, sub_id: sub.id, contact_name: contact?.name ?? "", contact_email: email, token: newInviteToken(), created_by: actor })
      .select("id")
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) continue;
      fail("invite", error.message);
    }
    await recordBidEvent(packageId, (data as { id: string }).id, "invited", actor, { sub: sub.name, email });
  }
  return listInvites({ packageId });
}

export async function withdrawInvite(packageId: string, inviteId: string, actor: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("bid_invites").update({ status: "withdrawn" }).eq("id", inviteId).eq("package_id", packageId).in("status", ["invited", "declined", "submitted"]).select("id");
  if (error) fail("withdraw invite", error.message);
  if (!data?.length) throw new SubsError("that invite cannot be withdrawn now", 409);
  await recordBidEvent(packageId, inviteId, "note", actor, { text: "Invite withdrawn" });
}

/** What the office adds to a bid for the cost to us of what it leaves out (the leveling sheet). */
export async function setLevelAdd(packageId: string, inviteId: string, cents: number, note: string, actor: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("bid_invites").update({ level_add_cents: Math.round(cents), level_note: note.trim().slice(0, 500) }).eq("id", inviteId).eq("package_id", packageId).select("id");
  if (error) fail("level add", error.message);
  if (!data?.length) throw new SubsError("not found", 404);
  await recordBidEvent(packageId, inviteId, "note", actor, { text: `Leveling add ${(cents / 100).toFixed(2)}${note ? `: ${note}` : ""}` });
}

export async function markSent(inviteIds: string[], now: Date = new Date()): Promise<void> {
  if (!inviteIds.length) return;
  const db = getSupabaseAdmin();
  const { error } = await db.from("bid_invites").update({ sent_at: now.toISOString() }).in("id", inviteIds).is("sent_at", null);
  if (error) fail("mark sent", error.message);
}

// ---- the sub's link ----------------------------------------------------------------------

export type InviteView = { invite: BidInvite; pkg: BidPackage; sub: Sub; addenda: Addendum[]; latest: BidResponse | null; job: { name: string; address: string } };

export async function inviteByToken(token: string): Promise<InviteView | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("bid_invites").select("*").eq("token", token).maybeSingle();
  if (error) fail("read invite", error.message);
  if (!data) return null;
  const invite = toInvite(data as InviteRow);
  if (invite.status === "withdrawn") return null;
  const [pkg, sub, addenda, responses] = await Promise.all([getPackage(invite.packageId), getSub(invite.subId), listAddenda(invite.packageId), listResponses([invite.id])]);
  if (!pkg || !sub || pkg.status === "draft") return null;
  return { invite, pkg, sub, addenda, latest: responses[0] ?? null, job: await packageJob(pkg) };
}

/** Where the work is, as a sub is told: the job's name and address, or the opportunity's. */
export async function packageJob(p: Pick<BidPackage, "jobId" | "opportunityId">): Promise<{ name: string; address: string }> {
  const db = getSupabaseAdmin();
  if (p.jobId) {
    const { data } = await db.from("jobs").select("name, address").eq("id", p.jobId).maybeSingle();
    if (data) return { name: (data as { name: string }).name, address: (data as { address: string | null }).address ?? "" };
  }
  if (p.opportunityId) {
    const { data } = await db.from("sales_opportunities").select("title, address").eq("id", p.opportunityId).maybeSingle();
    if (data) {
      const o = data as { title: string; address: string };
      return { name: o.address.split(",")[0]?.trim() || o.title, address: o.address };
    }
  }
  return { name: "", address: "" };
}

export async function noteViewed(view: InviteView, meta: { ip: string; ua: string }, now: Date = new Date()): Promise<void> {
  const db = getSupabaseAdmin();
  if (!view.invite.viewedAt) {
    const { error } = await db.from("bid_invites").update({ viewed_at: now.toISOString() }).eq("id", view.invite.id).is("viewed_at", null);
    if (error) fail("mark viewed", error.message);
  }
  await recordBidEvent(view.pkg.id, view.invite.id, "viewed", "sub link", { ip: meta.ip.slice(0, 64), ua: meta.ua.slice(0, 300) });
}

export async function listResponses(inviteIds: string[]): Promise<BidResponse[]> {
  if (!inviteIds.length) return [];
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("bid_responses").select("*").in("invite_id", inviteIds).order("revision", { ascending: false });
  if (error) fail("list bids", error.message);
  return ((data ?? []) as ResponseRow[]).map(toResponse);
}

export type BidSubmission = {
  lines: { lineId: string; cents: number | null; note?: string }[];
  inclusions: string;
  exclusions: string;
  startOn: string | null;
  duration: string;
  validDays: number;
  deviations: string;
  note: string;
  files: { path: string; name: string; size: number; type: string }[];
  signerName: string;
  signerTitle: string;
  signature: BidSignature;
  consent: string;
};

/** A sub's bid on their link: a new revision each time, until the due time. */
export async function submitBid(view: InviteView, s: BidSubmission, meta: { ip: string; ua: string }, now: Date = new Date()): Promise<BidResponse> {
  if (!isOpenForBids(view.pkg, now)) throw new SubsError(view.pkg.status === "out" ? "bids on this package closed at the due time" : "this package is not taking bids", 409);
  const priced = bidLinesFor(view.pkg.lines, s.lines);
  if ("error" in priced) throw new SubsError(priced.error, 400);
  for (const f of s.files) {
    if (!f.path.startsWith(`b/${view.invite.id}/`)) throw new SubsError("that file is not part of this bid", 400);
    await assertStored(f.path);
  }
  const files: StoredFile[] = s.files.slice(0, 10).map((f) => ({ id: randomUUID(), name: f.name.slice(0, 160), path: f.path, size: f.size, type: f.type, at: now.toISOString(), by: "sub link" }));
  const body = {
    lines: priced.lines,
    totalCents: priced.totalCents,
    inclusions: s.inclusions.trim().slice(0, 4000),
    exclusions: s.exclusions.trim().slice(0, 4000),
    startOn: s.startOn,
    duration: s.duration.trim().slice(0, 200),
    validDays: Math.max(1, Math.min(365, Math.round(s.validDays))),
    deviations: s.deviations.trim().slice(0, 4000),
    note: s.note.trim().slice(0, 2000),
    signerName: s.signerName.trim().replace(/\s+/g, " ").slice(0, 120),
  };
  const fingerprint = snapshotHash(bidFingerprintInput({ packageId: view.pkg.id, addenda: view.addenda.length, lines: view.pkg.lines }, body));
  const db = getSupabaseAdmin();
  for (let attempt = 0; attempt < 3; attempt++) {
    const revision = (view.latest?.revision ?? 0) + 1 + attempt;
    const { data, error } = await db
      .from("bid_responses")
      .insert({
        invite_id: view.invite.id,
        revision,
        lines: body.lines,
        total_cents: body.totalCents,
        inclusions: body.inclusions,
        exclusions: body.exclusions,
        start_on: body.startOn,
        duration: body.duration,
        valid_days: body.validDays,
        deviations: body.deviations,
        note: body.note,
        files,
        signer_name: body.signerName,
        signer_title: s.signerTitle.trim().slice(0, 80),
        signature: s.signature,
        consent: s.consent.slice(0, 1000),
        fingerprint,
        ip: meta.ip.slice(0, 64),
        ua: meta.ua.slice(0, 300),
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) continue;
      fail("save bid", error.message);
    }
    const { error: sErr } = await db.from("bid_invites").update({ status: "submitted", declined_at: null, decline_note: "" }).eq("id", view.invite.id).in("status", ["invited", "declined", "submitted"]);
    if (sErr) fail("mark submitted", sErr.message);
    await recordBidEvent(view.pkg.id, view.invite.id, "submitted", `sub: ${body.signerName}`, { revision, totalCents: body.totalCents, fingerprint, ip: meta.ip.slice(0, 64) });
    return toResponse(data as ResponseRow);
  }
  throw new SubsError("that bid crossed with another; send it again", 409);
}

export async function declineBid(view: InviteView, note: string, now: Date = new Date()): Promise<void> {
  if (!isOpenForBids(view.pkg, now)) throw new SubsError("this package is no longer taking answers", 409);
  if (view.invite.status === "submitted") throw new SubsError("you already sent a bid; send a new one or call us to withdraw it", 409);
  const db = getSupabaseAdmin();
  const { error } = await db.from("bid_invites").update({ status: "declined", declined_at: now.toISOString(), decline_note: note.trim().slice(0, 1000) }).eq("id", view.invite.id);
  if (error) fail("decline", error.message);
  await recordBidEvent(view.pkg.id, view.invite.id, "declined", "sub link", { note: note.trim().slice(0, 1000) });
}

// ---- the office's view ------------------------------------------------------------------

export type InviteRowView = BidInvite & { sub: Pick<Sub, "id" | "name" | "status" | "trades" | "coiExpiresOn" | "w9OnFile" | "msaSignedOn" | "rocVerifiedAt" | "achConfirmedAt">; latest: BidResponse | null; revisions: number };

export type PackageDetail = {
  pkg: BidPackage;
  job: { name: string; address: string };
  addenda: Addendum[];
  invites: InviteRowView[];
  events: BidEvent[];
  leveling: Leveling;
};

export async function packageDetail(id: string): Promise<PackageDetail | null> {
  const pkg = await getPackage(id);
  if (!pkg) return null;
  const [invites, addenda, events, job] = await Promise.all([listInvites({ packageId: id }), listAddenda(id), listBidEvents(id), packageJob(pkg)]);
  const live = invites.filter((i) => i.status !== "withdrawn");
  const [responses, subs] = await Promise.all([listResponses(live.map((i) => i.id)), listSubs()]);
  const subById = new Map(subs.map((s) => [s.id, s]));
  const rows: InviteRowView[] = live.map((i) => {
    const mine = responses.filter((r) => r.inviteId === i.id);
    const s = subById.get(i.subId)!;
    return {
      ...i,
      sub: { id: s.id, name: s.name, status: s.status, trades: s.trades, coiExpiresOn: s.coiExpiresOn, w9OnFile: s.w9OnFile, msaSignedOn: s.msaSignedOn, rocVerifiedAt: s.rocVerifiedAt, achConfirmedAt: s.achConfirmedAt },
      latest: mine[0] ?? null,
      revisions: mine.length,
    };
  });
  const leveling = level(
    pkg.lines,
    rows.filter((r) => r.latest).map((r) => ({ inviteId: r.id, lines: r.latest!.lines, addCents: r.levelAddCents })),
  );
  return { pkg, job, addenda, invites: rows, events, leveling };
}

export async function listBidEvents(packageId: string): Promise<BidEvent[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("bid_events").select("*").eq("package_id", packageId).order("at", { ascending: false }).limit(500);
  if (error) fail("list events", error.message);
  return ((data ?? []) as { id: number; package_id: string; invite_id: string | null; kind: BidEventKind; at: string; actor: string; detail: Record<string, unknown> }[]).map((r) => ({
    id: r.id,
    packageId: r.package_id,
    inviteId: r.invite_id,
    kind: r.kind,
    at: r.at,
    actor: r.actor,
    detail: r.detail ?? {},
  }));
}

export async function recordBidEvent(packageId: string, inviteId: string | null, kind: BidEventKind, actor: string, detail: Record<string, unknown> = {}): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("bid_events").insert({ package_id: packageId, invite_id: inviteId, kind, actor, detail });
  if (error) fail("record event", error.message);
}

/** The award: this bid wins, the package is done, the rest are told by a person (thank-yous). */
export async function awardBid(packageId: string, inviteId: string, actor: string, detail: Record<string, unknown>, now: Date = new Date()): Promise<void> {
  const db = getSupabaseAdmin();
  const p = await getPackage(packageId);
  if (!p) throw new SubsError("not found", 404);
  if (p.status === "awarded") throw new SubsError("this package was already awarded", 409);
  if (p.status === "cancelled" || p.status === "draft") throw new SubsError(`this package is ${p.status}`, 409);
  const { data: won, error } = await db.from("bid_invites").update({ status: "awarded" }).eq("id", inviteId).eq("package_id", packageId).eq("status", "submitted").select("id");
  if (error) fail("award", error.message);
  if (!won?.length) throw new SubsError("only a submitted bid can be awarded", 409);
  const { error: pErr } = await db.from("bid_packages").update({ status: "awarded", awarded_invite_id: inviteId, awarded_at: now.toISOString(), awarded_by: actor }).eq("id", packageId);
  if (pErr) fail("award package", pErr.message);
  // Only the ones who bid were "not chosen"; a sub who passed or never answered keeps that answer.
  const { error: oErr } = await db.from("bid_invites").update({ status: "not_awarded" }).eq("package_id", packageId).neq("id", inviteId).eq("status", "submitted");
  if (oErr) fail("close others", oErr.message);
  await recordBidEvent(packageId, inviteId, "awarded", actor, detail);
}
