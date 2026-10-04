import { beforeEach, describe, expect, it, vi } from "vitest";

import { syncPostSchema } from "../types";

// applySync against a small in-memory stand-in for the two tables, one that
// really filters and really updates. What is being pinned down: the Mac resends
// a report whenever it does not hear back, so a report must be safe to apply
// twice; and each lane may only answer for rows it is holding.

type Row = Record<string, unknown>;

const { db } = vi.hoisted(() => ({
  db: { tables: {} as Record<string, Row[]>, failInsert: null as null | ((table: string, row: Row) => string | null) },
}));

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "update" | "insert" | "upsert" = "select";
  let patch: Row = {};
  let rows: Row[] = [];
  let limit: number | null = null;
  let returning = false;
  const cell = (r: Row, col: string) => {
    if (!col.includes("->>")) return r[col];
    const [c, k] = col.split("->>");
    return (r[c] as Row | undefined)?.[k];
  };
  const run = () => {
    const t = (db.tables[table] ??= []);
    if (op === "insert") {
      for (const r of rows) {
        const refuse = db.failInsert?.(table, r);
        if (refuse) return { data: null, error: { message: refuse } };
        t.push({ id: 1000 + t.length, ...r });
      }
      return { data: null, error: null };
    }
    if (op === "upsert") {
      for (const r of rows) {
        const i = t.findIndex((x) => x.key === r.key);
        if (i >= 0) t[i] = { ...t[i], ...r };
        else t.push(r);
      }
      return { data: null, error: null };
    }
    let hit = t.filter((r) => filters.every((f) => f(r)));
    if (limit !== null) hit = hit.slice(0, limit);
    if (op === "update") {
      hit.forEach((r) => Object.assign(r, patch));
      return { data: returning ? hit.map((r) => ({ ...r })) : null, error: null };
    }
    return { data: hit.map((r) => ({ ...r })), error: null };
  };
  const b = {
    select() {
      if (op !== "select") returning = true;
      return b;
    },
    update(p: Row) {
      op = "update";
      patch = p;
      return b;
    },
    insert(r: Row | Row[]) {
      op = "insert";
      rows = Array.isArray(r) ? r : [r];
      return b;
    },
    upsert(r: Row | Row[]) {
      op = "upsert";
      rows = Array.isArray(r) ? r : [r];
      return b;
    },
    eq(col: string, val: unknown) {
      filters.push((r) => cell(r, col) === val);
      return b;
    },
    limit(n: number) {
      limit = n;
      return b;
    },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(run()).then(resolve, reject);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));

import { applySync } from "../queries";

const LANDO = "lando@saddlewoodcontracting.com";
const report = (r: unknown) => syncPostSchema.parse(r);
const messages = () => db.tables.bot_messages;
const byId = (table: string, id: number) => db.tables[table].find((r) => r.id === id)!;

beforeEach(() => {
  db.failInsert = null;
  db.tables = {
    bot_messages: [
      { id: 5, thread: LANDO, role: "user", body: "draft the follow-up", status: "working", lane: "agent" },
      { id: 6, thread: LANDO, role: "user", body: "what is waiting on me", status: "working", lane: "fast" },
      { id: 7, thread: LANDO, role: "user", body: "already answered", status: "done", lane: "agent" },
    ],
    bot_actions: [
      { id: 3, actor: LANDO, kind: "draft.approve", status: "working", lane: "fast", result: "" },
      { id: 4, actor: LANDO, kind: "duty.run", status: "working", lane: "agent", result: "" },
    ],
    bot_state: [],
  };
});

describe("recording what the Mac did", () => {
  it("posts an answer once, however many times the report arrives", async () => {
    const r = report({ lane: "agent", messages: [{ id: 5, outcome: "reply", body: "Here is the draft.", meta: { draftN: 26 } }] });
    const first = await applySync(r);
    expect(first.replies).toEqual([{ thread: LANDO, preview: "Here is the draft." }]);
    expect(byId("bot_messages", 5).status).toBe("done");
    const replies = () => messages().filter((m) => m.reply_to === 5);
    expect(replies()).toHaveLength(1);
    expect(replies()[0]).toMatchObject({ role: "bot", thread: LANDO, body: "Here is the draft.", meta: { draftN: 26 } });

    const second = await applySync(r);
    expect(second.replies).toEqual([]);
    expect(replies()).toHaveLength(1);
  });

  it("records a tap's result once, and only from the lane holding it", async () => {
    const wrongLane = await applySync(report({ lane: "agent", actions: [{ id: 3, status: "done", result: "Sent #18" }] }));
    expect(wrongLane.actions).toBe(0);
    expect(byId("bot_actions", 3).status).toBe("working");

    const right = await applySync(report({ lane: "fast", actions: [{ id: 3, status: "done", result: "Sent #18" }] }));
    expect(right.actions).toBe(1);
    expect(byId("bot_actions", 3)).toMatchObject({ status: "done", result: "Sent #18" });

    const again = await applySync(report({ lane: "fast", actions: [{ id: 3, status: "failed", result: "changed my mind" }] }));
    expect(again.actions).toBe(0);
    expect(byId("bot_actions", 3)).toMatchObject({ status: "done", result: "Sent #18" });
  });

  it("does not let one lane answer a message the other is working on", async () => {
    await applySync(report({ lane: "fast", messages: [{ id: 5, outcome: "reply", body: "not mine to answer" }] }));
    expect(byId("bot_messages", 5).status).toBe("working");
    expect(messages().filter((m) => m.reply_to === 5)).toHaveLength(0);
  });

  it("hands a message from the fast lane to the agent lane, and leaves a finished one alone", async () => {
    const res = await applySync(
      report({ lane: "fast", messages: [{ id: 6, outcome: "route_agent" }, { id: 7, outcome: "route_agent" }] }),
    );
    expect(res.routed).toBe(1);
    expect(byId("bot_messages", 6)).toMatchObject({ status: "queued", lane: "agent", claimed_at: null });
    expect(byId("bot_messages", 7).status).toBe("done");
  });

  it("tells the person when a request failed, in a system line", async () => {
    await applySync(report({ lane: "agent", messages: [{ id: 5, outcome: "failed" }] }));
    expect(byId("bot_messages", 5).status).toBe("failed");
    const [note] = messages().filter((m) => m.reply_to === 5);
    expect(note.role).toBe("system");
    expect(String(note.body)).toMatch(/Nothing was sent/);
  });

  it("reopens the request and reports an error when the answer cannot be stored, so the Mac sends it again", async () => {
    db.failInsert = (table) => (table === "bot_messages" ? "disk full" : null);
    const r = report({ lane: "agent", messages: [{ id: 5, outcome: "reply", body: "Here is the draft." }] });
    await expect(applySync(r)).rejects.toThrow(/disk full/);
    expect(byId("bot_messages", 5).status).toBe("working");

    db.failInsert = null;
    const retry = await applySync(r);
    expect(retry.replies).toHaveLength(1);
    expect(byId("bot_messages", 5).status).toBe("done");
  });

  it("keeps one copy of a duty report that is delivered twice", async () => {
    const r = report({ lane: "agent", posts: [{ thread: LANDO, body: "Nothing unpaid past 30 days.", meta: { postId: "duty-unpaid-1", duty: "Unpaid invoices" } }] });
    expect((await applySync(r)).posts).toHaveLength(1);
    expect((await applySync(r)).posts).toHaveLength(0);
    expect(messages().filter((m) => (m.meta as Row | undefined)?.postId === "duty-unpaid-1")).toHaveLength(1);
  });

  it("stores the sections it knows and ignores anything else", async () => {
    const res = await applySync(report({ lane: "fast", state: { drafts: [], "bridge:fast": { forged: true }, secrets: 1 } }));
    expect(res.sections).toEqual(["drafts"]);
    expect(db.tables.bot_state.map((r) => r.key)).toEqual(["drafts"]);
  });
});
