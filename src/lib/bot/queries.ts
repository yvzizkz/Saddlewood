import { createHash, randomBytes } from "crypto";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  BOT_BUCKET,
  BOT_SECTION_KEYS,
  emptySections,
  laneForAction,
  parseSection,
  safeFileName,
  type BotAction,
  type BotActionInput,
  type BotFileRef,
  type BotInFlight,
  type BotMessage,
  type BotSectionKey,
  type BotSections,
  type BridgeSeen,
  type SyncPost,
} from "./types";

// All reads and writes go through the service-role client after the route has
// authorized the actor. The tables carry RLS with no policies, so nothing
// reaches them from the anon key by accident.

const BRIDGE_KEYS = { fast: "bridge:fast", agent: "bridge:agent" } as const;
export type Lane = keyof typeof BRIDGE_KEYS;

// A claimed row the Mac never answered. Nothing is retried automatically: the
// work may have happened before the answer was lost, and a second approval or
// a second agent run is worse than asking the person to look.
const STALE_MS = { fastAction: 10 * 60_000, agentAction: 30 * 60_000, fastMessage: 10 * 60_000, agentMessage: 45 * 60_000 };

type MessageRow = {
  id: number;
  thread: string;
  role: string;
  author: string;
  body: string;
  attachments: unknown;
  status: string;
  lane: string | null;
  reply_to: number | null;
  meta: unknown;
  created_at: string;
  claimed_at: string | null;
  done_at: string | null;
};

type ActionRow = {
  id: number;
  actor: string;
  kind: string;
  payload: unknown;
  lane: string;
  status: string;
  result: string;
  created_at: string;
  claimed_at: string | null;
  done_at: string | null;
};

function asFiles(v: unknown): BotFileRef[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (f): f is BotFileRef => !!f && typeof f === "object" && typeof (f as BotFileRef).path === "string" && typeof (f as BotFileRef).name === "string",
  );
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function toMessage(r: MessageRow): BotMessage {
  return {
    id: r.id,
    thread: r.thread,
    role: r.role === "bot" || r.role === "system" ? r.role : "user",
    author: r.author,
    body: r.body,
    attachments: asFiles(r.attachments),
    status: (["queued", "working", "done", "failed"] as const).find((s) => s === r.status) ?? "done",
    replyTo: r.reply_to,
    meta: asRecord(r.meta),
    createdAt: r.created_at,
    claimedAt: r.claimed_at,
    doneAt: r.done_at,
  };
}

function toAction(r: ActionRow): BotAction {
  return {
    id: r.id,
    actor: r.actor,
    kind: r.kind,
    payload: asRecord(r.payload),
    status: (["queued", "working", "done", "failed", "refused"] as const).find((s) => s === r.status) ?? "failed",
    result: r.result,
    createdAt: r.created_at,
    doneAt: r.done_at,
  };
}

// ---- files -----------------------------------------------------------------

/** Folder for one person's files. Not the email itself: paths end up in logs. */
export function threadKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
}

export function newFilePath(who: "u" | "b", email: string, name: string, now = new Date()): string {
  const month = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${who}/${threadKey(email)}/${month}/${randomBytes(6).toString("hex")}-${safeFileName(name)}`;
}

export async function signUpload(path: string): Promise<{ path: string; token: string; signedUrl: string }> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.storage.from(BOT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`could not prepare the upload: ${error?.message ?? "no url"}`);
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

export async function signDownload(path: string, seconds = 120): Promise<string> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.storage.from(BOT_BUCKET).createSignedUrl(path, seconds);
  if (error || !data?.signedUrl) throw new Error(`could not open the file: ${error?.message ?? "no url"}`);
  return data.signedUrl;
}

// ---- the snapshot ----------------------------------------------------------

function setSection<K extends BotSectionKey>(sections: BotSections, key: K, data: unknown): void {
  sections[key] = parseSection(key, data);
}

export async function readState(): Promise<{ sections: BotSections; bridge: BridgeSeen }> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("bot_state").select("key, data, updated_at");
  if (error) throw new Error(`bot_state read failed: ${error.message}`);
  const sections = emptySections();
  const bridge: BridgeSeen = { seenAt: null, agentSeenAt: null, reportedAt: null };
  for (const row of (data ?? []) as { key: string; data: unknown; updated_at: string }[]) {
    if (row.key === BRIDGE_KEYS.fast) bridge.seenAt = row.updated_at;
    else if (row.key === BRIDGE_KEYS.agent) bridge.agentSeenAt = row.updated_at;
    else if ((BOT_SECTION_KEYS as string[]).includes(row.key)) {
      setSection(sections, row.key as BotSectionKey, row.data);
      if (!bridge.reportedAt || row.updated_at > bridge.reportedAt) bridge.reportedAt = row.updated_at;
    }
  }
  return { sections, bridge };
}

export async function writeSections(state: Record<string, unknown>): Promise<string[]> {
  const now = new Date().toISOString();
  const rows = Object.entries(state)
    .filter(([key]) => (BOT_SECTION_KEYS as string[]).includes(key))
    .map(([key, data]) => ({ key, data, updated_at: now }));
  if (!rows.length) return [];
  const db = getSupabaseAdmin();
  const { error } = await db.from("bot_state").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(`bot_state write failed: ${error.message}`);
  return rows.map((r) => r.key);
}

export async function touchBridge(lane: Lane): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("bot_state")
    .upsert({ key: BRIDGE_KEYS[lane], data: {}, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`bridge check-in failed: ${error.message}`);
}

// ---- conversations ---------------------------------------------------------

export async function listThread(thread: string, limit = 80): Promise<BotMessage[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("bot_messages")
    .select("*")
    .eq("thread", thread)
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`bot_messages list failed: ${error.message}`);
  return ((data ?? []) as MessageRow[]).map(toMessage).reverse();
}

export async function countOpenRequests(thread: string): Promise<number> {
  const db = getSupabaseAdmin();
  const { count, error } = await db
    .from("bot_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread", thread)
    .eq("role", "user")
    .in("status", ["queued", "working"]);
  if (error) throw new Error(`bot_messages count failed: ${error.message}`);
  return count ?? 0;
}

export async function createUserMessage(
  thread: string,
  body: string,
  attachments: BotFileRef[],
): Promise<BotMessage> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("bot_messages")
    .insert({
      thread,
      role: "user",
      author: thread,
      body,
      attachments,
      status: "queued",
      // A file means a photo or document for the agent to read: no text
      // command takes one, so skip the command check.
      lane: attachments.length ? "agent" : null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`bot_messages insert failed: ${error.message}`);
  return toMessage(data as MessageRow);
}

export type InFlightRow = BotInFlight & { thread: string; lane: string | null; claimedAt: string | null };

export async function listInFlight(): Promise<InFlightRow[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("bot_messages")
    .select("id, thread, body, attachments, status, lane, created_at, claimed_at")
    .eq("role", "user")
    .in("status", ["queued", "working"])
    .order("id", { ascending: true })
    .limit(30);
  if (error) throw new Error(`bot_messages in-flight failed: ${error.message}`);
  type Row = {
    id: number;
    thread: string;
    body: string;
    attachments: unknown;
    status: string;
    lane: string | null;
    created_at: string;
    claimed_at: string | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    thread: r.thread,
    who: r.thread,
    preview: r.body.trim().slice(0, 120) || `${asFiles(r.attachments).length} file(s)`,
    status: r.status === "working" ? "working" : "queued",
    createdAt: r.created_at,
    mine: false,
    lane: r.lane,
    claimedAt: r.claimed_at,
  }));
}

/** True when a claimed message has sat past the point the Mac would have answered. */
export function hasStale(inFlight: InFlightRow[], now = Date.now()): boolean {
  return inFlight.some((m) => {
    if (m.status !== "working" || !m.claimedAt) return false;
    const limit = m.lane === "agent" ? STALE_MS.agentMessage : STALE_MS.fastMessage;
    return now - Date.parse(m.claimedAt) > limit;
  });
}

// ---- button taps -----------------------------------------------------------

export async function createAction(actor: string, input: BotActionInput): Promise<BotAction> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("bot_actions")
    .insert({ actor, kind: input.kind, payload: input.payload, lane: laneForAction(input), status: "queued" })
    .select("*")
    .single();
  if (error) throw new Error(`bot_actions insert failed: ${error.message}`);
  return toAction(data as ActionRow);
}

export async function countOpenActions(actor: string): Promise<number> {
  const db = getSupabaseAdmin();
  const { count, error } = await db
    .from("bot_actions")
    .select("id", { count: "exact", head: true })
    .eq("actor", actor)
    .in("status", ["queued", "working"]);
  if (error) throw new Error(`bot_actions count failed: ${error.message}`);
  return count ?? 0;
}

export async function listRecentActions(limit = 25): Promise<BotAction[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("bot_actions").select("*").order("id", { ascending: false }).limit(limit);
  if (error) throw new Error(`bot_actions list failed: ${error.message}`);
  return ((data ?? []) as ActionRow[]).map(toAction);
}

// ---- the Mac's side --------------------------------------------------------

export type ClaimedMessage = {
  id: number;
  thread: string;
  body: string;
  createdAt: string;
  attachments: (BotFileRef & { url: string | null })[];
  context: { role: string; body: string; at: string }[];
};

export type Claim = {
  actions: { id: number; actor: string; kind: string; payload: Record<string, unknown>; createdAt: string }[];
  messages: ClaimedMessage[];
};

/**
 * Close out rows the Mac claimed and never answered. Called from Home when it
 * sees a row past its limit, so it costs nothing while nobody is looking.
 */
export async function failStale(): Promise<void> {
  const db = getSupabaseAdmin();
  const now = Date.now();
  const iso = (ms: number) => new Date(now - ms).toISOString();
  const done = new Date(now).toISOString();
  const lost = "The bot never confirmed this one. Check whether it happened before trying again.";

  for (const [lane, ms] of [
    ["fast", STALE_MS.fastAction],
    ["agent", STALE_MS.agentAction],
  ] as const) {
    await db
      .from("bot_actions")
      .update({ status: "failed", result: lost, done_at: done })
      .eq("status", "working")
      .eq("lane", lane)
      .lt("claimed_at", iso(ms));
  }

  for (const [lane, ms] of [
    ["fast", STALE_MS.fastMessage],
    ["agent", STALE_MS.agentMessage],
  ] as const) {
    const { data } = await db
      .from("bot_messages")
      .update({ status: "failed", done_at: done })
      .eq("status", "working")
      .eq("lane", lane)
      .lt("claimed_at", iso(ms))
      .select("id, thread");
    for (const row of (data ?? []) as { id: number; thread: string }[]) {
      await db.from("bot_messages").insert({
        thread: row.thread,
        role: "system",
        author: "saddlewoodbot",
        body: "That one did not finish on my end. Nothing was sent. Please ask again.",
        status: "done",
        reply_to: row.id,
        done_at: done,
      });
    }
  }
}

async function claimActions(lane: Lane): Promise<Claim["actions"]> {
  const db = getSupabaseAdmin();
  const { data: open, error } = await db
    .from("bot_actions")
    .select("id")
    .eq("status", "queued")
    .eq("lane", lane)
    .order("id", { ascending: true })
    .limit(lane === "fast" ? 25 : 3);
  if (error) throw new Error(`bot_actions claim failed: ${error.message}`);
  const ids = ((open ?? []) as { id: number }[]).map((r) => r.id);
  if (!ids.length) return [];
  const { data, error: e2 } = await db
    .from("bot_actions")
    .update({ status: "working", claimed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "queued")
    .select("*");
  if (e2) throw new Error(`bot_actions claim failed: ${e2.message}`);
  return ((data ?? []) as ActionRow[])
    .sort((a, b) => a.id - b.id)
    .map((r) => ({ id: r.id, actor: r.actor, kind: r.kind, payload: asRecord(r.payload), createdAt: r.created_at }));
}

async function claimMessages(lane: Lane): Promise<MessageRow[]> {
  const db = getSupabaseAdmin();
  // New messages wait with no lane. The fast lane takes those first to see if
  // one is a plain command ("approve 4"); what it cannot answer it hands to
  // the agent lane, which takes one at a time.
  let q = db.from("bot_messages").select("id").eq("status", "queued").eq("role", "user");
  q = lane === "fast" ? q.is("lane", null) : q.eq("lane", "agent");
  const { data: open, error } = await q.order("id", { ascending: true }).limit(lane === "fast" ? 10 : 1);
  if (error) throw new Error(`bot_messages claim failed: ${error.message}`);
  const ids = ((open ?? []) as { id: number }[]).map((r) => r.id);
  if (!ids.length) return [];
  const { data, error: e2 } = await db
    .from("bot_messages")
    .update({ status: "working", lane, claimed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "queued")
    .select("*");
  if (e2) throw new Error(`bot_messages claim failed: ${e2.message}`);
  return ((data ?? []) as MessageRow[]).sort((a, b) => a.id - b.id);
}

async function contextFor(row: MessageRow): Promise<ClaimedMessage["context"]> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("bot_messages")
    .select("role, body, created_at")
    .eq("thread", row.thread)
    .lt("id", row.id)
    .in("role", ["user", "bot"])
    .order("id", { ascending: false })
    .limit(6);
  type Row = { role: string; body: string; created_at: string };
  return ((data ?? []) as Row[])
    .reverse()
    .map((m) => ({ role: m.role, body: m.body.slice(0, 1500), at: m.created_at }));
}

export async function claimWork(lane: Lane): Promise<Claim> {
  await touchBridge(lane);
  const actions = await claimActions(lane);

  // From here on nothing may throw. The rows above are already marked as
  // working; an error response now would strand them until they time out, and
  // the Mac would never know it had been handed them.
  let rows: MessageRow[] = [];
  try {
    rows = await claimMessages(lane);
  } catch (e) {
    console.error("[bot/sync] message claim failed:", (e as Error).message);
  }
  const messages: ClaimedMessage[] = [];
  for (const row of rows) {
    const attachments: ClaimedMessage["attachments"] = [];
    for (const f of asFiles(row.attachments)) {
      // A file that is not in storage (the upload never finished) is handed
      // over without a URL; the Mac tells the person it could not read it.
      const url = await signDownload(f.path, 15 * 60).catch(() => null);
      attachments.push({ ...f, url });
    }
    const context = lane === "agent" ? await contextFor(row).catch(() => []) : [];
    messages.push({ id: row.id, thread: row.thread, body: row.body, createdAt: row.created_at, attachments, context });
  }
  return { actions, messages };
}

export type Applied = {
  actions: number;
  replies: { thread: string; preview: string }[];
  routed: number;
  posts: { thread: string; preview: string }[];
  sections: string[];
};

function preview(body: string): string {
  return body
    .replace(/=== DRAFT ===[\s\S]*?=== END DRAFT ===/g, "(draft attached)")
    .replace(/[#*_>`]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

const FAILED_REPLY =
  "Something went wrong on my end with that one. Nothing was sent. Please try again in a few minutes.";

/**
 * Record what the Mac did. Every write is conditional on the row still being
 * held by the lane that is reporting, so a report that arrives twice (the Mac
 * resends when it does not hear back) changes nothing the second time, and
 * one lane cannot answer for work the other is holding. Any database error is
 * thrown: the route answers 500 and the Mac sends the same report again.
 */
export async function applySync(post: SyncPost): Promise<Applied> {
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const applied: Applied = { actions: 0, replies: [], routed: 0, posts: [], sections: [] };

  for (const a of post.actions) {
    const { data, error } = await db
      .from("bot_actions")
      .update({ status: a.status, result: a.result, done_at: now })
      .eq("id", a.id)
      .eq("status", "working")
      .eq("lane", post.lane)
      .select("id");
    if (error) throw new Error(`bot_actions result failed: ${error.message}`);
    if (data?.length) applied.actions += 1;
  }

  for (const m of post.messages) {
    if (m.outcome === "route_agent") {
      // Only the fast lane hands a message on, and only one it is holding.
      const { data, error } = await db
        .from("bot_messages")
        .update({ status: "queued", lane: "agent", claimed_at: null })
        .eq("id", m.id)
        .eq("role", "user")
        .eq("status", "working")
        .eq("lane", "fast")
        .select("id");
      if (error) throw new Error(`bot_messages route failed: ${error.message}`);
      if (post.lane === "fast" && data?.length) applied.routed += 1;
      continue;
    }

    const failed = m.outcome === "failed";
    // Closing the request is the gate: of two reports racing, one gets the
    // row and only that one posts the reply.
    const { data, error } = await db
      .from("bot_messages")
      .update({ status: failed ? "failed" : "done", done_at: now })
      .eq("id", m.id)
      .eq("role", "user")
      .eq("status", "working")
      .eq("lane", post.lane)
      .select("id, thread");
    if (error) throw new Error(`bot_messages result failed: ${error.message}`);
    const row = (data as { id: number; thread: string }[] | null)?.[0];
    if (!row) continue;

    const body = m.body || (failed ? FAILED_REPLY : "");
    if (!body) continue;
    const { error: insertError } = await db.from("bot_messages").insert({
      thread: row.thread,
      role: failed ? "system" : "bot",
      author: "saddlewoodbot",
      body,
      attachments: m.files,
      status: "done",
      reply_to: m.id,
      meta: m.meta,
      done_at: now,
    });
    if (insertError) {
      // Reopen the request so the Mac's resend can deliver the answer.
      await db.from("bot_messages").update({ status: "working", done_at: null }).eq("id", m.id);
      throw new Error(`bot_messages reply failed: ${insertError.message}`);
    }
    applied.replies.push({ thread: row.thread, preview: preview(body) });
  }

  for (const p of post.posts) {
    // The Mac stamps each post with an id; a second copy is dropped.
    const postId = typeof p.meta.postId === "string" ? p.meta.postId : null;
    if (postId) {
      const { data: seen, error } = await db
        .from("bot_messages")
        .select("id")
        .eq("thread", p.thread)
        .eq("meta->>postId", postId)
        .limit(1);
      if (error) throw new Error(`bot_messages post check failed: ${error.message}`);
      if (seen?.length) continue;
    }
    const { error } = await db.from("bot_messages").insert({
      thread: p.thread,
      role: "bot",
      author: "saddlewoodbot",
      body: p.body,
      attachments: p.files,
      status: "done",
      meta: p.meta,
      done_at: now,
    });
    if (error) throw new Error(`bot_messages post failed: ${error.message}`);
    applied.posts.push({ thread: p.thread, preview: preview(p.body) });
  }

  applied.sections = await writeSections(post.state);
  return applied;
}

// ---- push subscriptions ----------------------------------------------------

export type PushSubscriptionRow = { endpoint: string; email: string; p256dh: string; auth: string };

export async function savePushSubscription(
  email: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string,
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("bot_push_subscriptions").upsert(
    {
      endpoint: sub.endpoint,
      email,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent.slice(0, 300),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(`push subscription save failed: ${error.message}`);
}

export async function deletePushSubscription(endpoint: string, email?: string): Promise<void> {
  const db = getSupabaseAdmin();
  let q = db.from("bot_push_subscriptions").delete().eq("endpoint", endpoint);
  if (email) q = q.eq("email", email);
  const { error } = await q;
  if (error) throw new Error(`push subscription delete failed: ${error.message}`);
}

export async function listPushSubscriptions(emails: string[]): Promise<PushSubscriptionRow[]> {
  if (!emails.length) return [];
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("bot_push_subscriptions")
    .select("endpoint, email, p256dh, auth")
    .in("email", emails);
  if (error) throw new Error(`push subscription list failed: ${error.message}`);
  return (data ?? []) as PushSubscriptionRow[];
}

export async function markPushDelivered(endpoints: string[]): Promise<void> {
  if (!endpoints.length) return;
  const db = getSupabaseAdmin();
  await db.from("bot_push_subscriptions").update({ last_ok_at: new Date().toISOString() }).in("endpoint", endpoints);
}
