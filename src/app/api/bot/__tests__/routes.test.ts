import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptySections, type BotSections } from "@/lib/bot/types";

// The two doors of the app, tested at the routes:
//   a person (portal session) may read and write as themselves and nothing else
//   the Mac (agent token) may use /api/bot/sync and nothing else

const TOKEN = "test-token-with-enough-length-1234";
const LANDO = "lando@saddlewoodcontracting.com";
const ELI = "eli@saddlewoodcontracting.com";

const { session, q } = vi.hoisted(() => ({
  session: { email: null as string | null },
  q: {
    readState: vi.fn(),
    listInFlight: vi.fn(),
    listRecentActions: vi.fn(),
    failStale: vi.fn(),
    hasStale: vi.fn(),
    listThread: vi.fn(),
    countOpenRequests: vi.fn(),
    createUserMessage: vi.fn(),
    countOpenActions: vi.fn(),
    createAction: vi.fn(),
    claimWork: vi.fn(),
    applySync: vi.fn(),
    signDownload: vi.fn(),
    signUpload: vi.fn(),
    savePushSubscription: vi.fn(),
    deletePushSubscription: vi.fn(),
    listPushSubscriptions: vi.fn(),
    markPushDelivered: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: session.email ? { id: "u1", email: session.email } : null }, error: null }),
    },
  }),
}));

vi.mock("@/lib/bot/queries", async () => {
  const { createHash } = await import("crypto");
  const threadKey = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
  return {
    ...q,
    threadKey,
    newFilePath: (who: string, email: string, name: string) => `${who}/${threadKey(email)}/202610/a1b2c3d4e5f6-${name}`,
  };
});

import { POST as postAction } from "../actions/route";
import { GET as getFile } from "../files/route";
import { GET as getHome } from "../home/route";
import { GET as getMessages, POST as postMessage } from "../messages/route";
import { POST as postPush } from "../push/route";
import { GET as getSync, POST as postSync } from "../sync/route";
import { POST as postBotUpload } from "../sync/upload/route";
import { POST as postUpload } from "../uploads/route";

function req(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never;
}
const bearer = { Authorization: `Bearer ${TOKEN}` };

function state(): { sections: BotSections; bridge: { seenAt: string | null; agentSeenAt: null; reportedAt: null } } {
  const sections = emptySections();
  sections.people = { [LANDO]: { name: "Lando", role: "owner" }, [ELI]: { name: "Eli", role: "requester" } };
  return { sections, bridge: { seenAt: new Date().toISOString(), agentSeenAt: null, reportedAt: null } };
}

async function keyFor(email: string) {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(email).digest("hex").slice(0, 16);
}

beforeEach(() => {
  session.email = null;
  for (const fn of Object.values(q)) fn.mockReset();
  q.readState.mockResolvedValue(state());
  q.listInFlight.mockResolvedValue([]);
  q.listRecentActions.mockResolvedValue([]);
  q.hasStale.mockReturnValue(false);
  q.listThread.mockResolvedValue([]);
  q.countOpenRequests.mockResolvedValue(0);
  q.countOpenActions.mockResolvedValue(0);
  q.createUserMessage.mockImplementation(async (thread: string, body: string) => ({ id: 1, thread, body, status: "queued" }));
  q.createAction.mockImplementation(async (actor: string, input: { kind: string }) => ({ id: 1, actor, kind: input.kind, status: "queued" }));
  q.claimWork.mockResolvedValue({ actions: [], messages: [] });
  q.applySync.mockResolvedValue({ actions: 0, replies: [], routed: 0, posts: [], sections: [] });
  q.signDownload.mockResolvedValue("https://storage.example/signed");
  q.signUpload.mockImplementation(async (path: string) => ({ path, token: "t", signedUrl: "https://storage.example/upload" }));
  q.listPushSubscriptions.mockResolvedValue([]);
  q.markPushDelivered.mockResolvedValue(undefined);
  q.deletePushSubscription.mockResolvedValue(undefined);
  vi.stubEnv("OPS_AGENT_TOKEN", TOKEN);
  // Eli stands in for a future employee: on the portal allowlist, with a
  // requester's seat. bot@ is on the allowlist with no seat at all.
  vi.stubEnv("INTERNAL_ALLOWED_EMAILS", `${LANDO},${ELI},bot@saddlewoodcontracting.com`);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a person's door", () => {
  it("refuses everyone without a portal session", async () => {
    expect((await getHome(req("/api/bot/home"))).status).toBe(401);
    expect((await getMessages(req("/api/bot/messages"))).status).toBe(401);
    expect((await postMessage(req("/api/bot/messages", "POST", { body: "hi" }))).status).toBe(401);
    expect((await postAction(req("/api/bot/actions", "POST", { kind: "draft.approve", payload: { n: 1 } }))).status).toBe(401);
    expect((await postUpload(req("/api/bot/uploads", "POST", { name: "a.jpg", type: "image/jpeg", size: 10 }))).status).toBe(401);
    expect((await getFile(req("/api/bot/files?path=x"))).status).toBe(401);
    expect((await postPush(req("/api/bot/push", "POST", {}))).status).toBe(401);
  });

  it("refuses the agent token: nobody approves a send in a person's name", async () => {
    const res = await postAction(req("/api/bot/actions", "POST", { kind: "draft.approve", payload: { n: 18 } }, bearer));
    expect(res.status).toBe(401);
    expect(q.createAction).not.toHaveBeenCalled();
    expect((await postMessage(req("/api/bot/messages", "POST", { body: "hi" }, bearer))).status).toBe(401);
    expect((await getHome(req("/api/bot/home", "GET", undefined, bearer))).status).toBe(401);
  });

  it("gives a signed-in owner their Home", async () => {
    session.email = LANDO;
    const res = await getHome(req("/api/bot/home"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.me).toEqual({ email: LANDO, name: "Lando", role: "owner" });
    expect(json.bridge.online).toBe(true);
    expect(json.push).toEqual({ available: false, publicKey: null });
  });

  it("queues an owner's tap under their own email", async () => {
    session.email = LANDO;
    const res = await postAction(req("/api/bot/actions", "POST", { kind: "draft.approve", payload: { n: 18 } }));
    expect(res.status).toBe(201);
    expect(q.createAction).toHaveBeenCalledWith(LANDO, { kind: "draft.approve", payload: { n: 18 } });
  });

  it("does not hold a tap for later when the Mac is offline", async () => {
    session.email = LANDO;
    const stale = state();
    stale.bridge.seenAt = new Date(Date.now() - 10 * 60_000).toISOString();
    q.readState.mockResolvedValue(stale);
    const res = await postAction(req("/api/bot/actions", "POST", { kind: "draft.approve", payload: { n: 18 } }));
    expect(res.status).toBe(503);
    expect(q.createAction).not.toHaveBeenCalled();
  });

  it("does not queue a tap from someone without an owner's seat", async () => {
    session.email = ELI;
    const res = await postAction(req("/api/bot/actions", "POST", { kind: "draft.approve", payload: { n: 21 } }));
    expect(res.status).toBe(403);
    expect(q.createAction).not.toHaveBeenCalled();
  });

  it("rejects a tap that is not on the list", async () => {
    session.email = LANDO;
    expect((await postAction(req("/api/bot/actions", "POST", { kind: "autosend.on", payload: {} }))).status).toBe(400);
    expect((await postAction(req("/api/bot/actions", "POST", { kind: "draft.approve", payload: { n: -1 } }))).status).toBe(400);
  });

  it("lets a requester ask, in their own thread", async () => {
    session.email = ELI;
    const res = await postMessage(req("/api/bot/messages", "POST", { body: "what is the gate code at Powell?" }));
    expect(res.status).toBe(201);
    expect(q.createUserMessage).toHaveBeenCalledWith(ELI, "what is the gate code at Powell?", []);
  });

  it("does not take a message from an address the bot has no seat for", async () => {
    session.email = "bot@saddlewoodcontracting.com";
    const res = await postMessage(req("/api/bot/messages", "POST", { body: "hello" }));
    expect(res.status).toBe(403);
    expect(q.createUserMessage).not.toHaveBeenCalled();
  });

  it("does not let a person attach a file from someone else's folder", async () => {
    session.email = ELI;
    const theirs = `u/${await keyFor(LANDO)}/202610/a1b2c3d4e5f6-settlement.pdf`;
    const res = await postMessage(req("/api/bot/messages", "POST", { body: "see attached", attachments: [{ path: theirs, name: "settlement.pdf" }] }));
    expect(res.status).toBe(400);
    expect(q.createUserMessage).not.toHaveBeenCalled();
  });

  it("stops a person piling up requests", async () => {
    session.email = ELI;
    q.countOpenRequests.mockResolvedValue(5);
    expect((await postMessage(req("/api/bot/messages", "POST", { body: "one more" }))).status).toBe(429);
  });

  it("opens a person's own file, an owner's any, and nobody else's", async () => {
    const landoFile = `b/${await keyFor(LANDO)}/202610/a1b2c3d4e5f6-waiver.pdf`;
    session.email = ELI;
    expect((await getFile(req(`/api/bot/files?path=${encodeURIComponent(landoFile)}`))).status).toBe(404);
    expect(q.signDownload).not.toHaveBeenCalled();

    const eliFile = `u/${await keyFor(ELI)}/202610/a1b2c3d4e5f6-photo.jpg`;
    expect((await getFile(req(`/api/bot/files?path=${encodeURIComponent(eliFile)}`))).status).toBe(302);

    session.email = LANDO;
    expect((await getFile(req(`/api/bot/files?path=${encodeURIComponent(eliFile)}`))).status).toBe(302);
    expect((await getFile(req("/api/bot/files?path=..%2F..%2Fsecrets"))).status).toBe(404);
  });

  it("puts an upload in the person's own folder", async () => {
    session.email = ELI;
    const res = await postUpload(req("/api/bot/uploads", "POST", { name: "IMG_1.jpg", type: "image/jpeg", size: 2_000_000 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.path.startsWith(`u/${await keyFor(ELI)}/`)).toBe(true);
    expect((await postUpload(req("/api/bot/uploads", "POST", { name: "run.sh", type: "application/x-sh", size: 10 }))).status).toBe(400);
    expect((await postUpload(req("/api/bot/uploads", "POST", { name: "big.pdf", type: "application/pdf", size: 99_000_000 }))).status).toBe(400);
  });

  it("only saves a push subscription that points at a real push service", async () => {
    session.email = LANDO;
    vi.stubEnv("BOT_PUSH_PUBLIC_KEY", "BPublicKeyPublicKeyPublicKey");
    vi.stubEnv("BOT_PUSH_PRIVATE_KEY", "PrivateKeyPrivateKey");
    const keys = { p256dh: "p".repeat(40), auth: "a".repeat(16) };
    for (const endpoint of [
      "https://internal.example/hook",
      // Passes a suffix test, but the sending library would dial evil.example.
      "https://evil.example;.push.apple.com/x",
      "http://web.push.apple.com/abc",
      "https://web.push.apple.com:8443/abc",
    ]) {
      const bad = await postPush(req("/api/bot/push", "POST", { endpoint, keys }));
      expect(bad.status).toBe(400);
    }
    expect(q.savePushSubscription).not.toHaveBeenCalled();
    const good = await postPush(req("/api/bot/push", "POST", { endpoint: "https://web.push.apple.com/abc", keys }));
    expect(good.status).toBe(200);
    expect(q.savePushSubscription).toHaveBeenCalledWith(LANDO, { endpoint: "https://web.push.apple.com/abc", keys }, "");
  });
});

describe("the Mac's door", () => {
  it("refuses a signed-in person: a browser cannot write the bot's replies", async () => {
    session.email = LANDO;
    expect((await getSync(req("/api/bot/sync?lane=fast"))).status).toBe(401);
    expect((await postSync(req("/api/bot/sync", "POST", { lane: "fast" }))).status).toBe(401);
    expect((await postBotUpload(req("/api/bot/sync/upload", "POST", { thread: LANDO, name: "w.pdf", size: 10 }))).status).toBe(401);
    expect(q.claimWork).not.toHaveBeenCalled();
    expect(q.applySync).not.toHaveBeenCalled();
  });

  it("refuses a wrong token", async () => {
    const res = await getSync(req("/api/bot/sync?lane=fast", "GET", undefined, { Authorization: "Bearer nope-nope-nope-nope-nope-nope" }));
    expect(res.status).toBe(401);
  });

  it("hands the Mac its work, one lane at a time", async () => {
    q.claimWork.mockResolvedValue({ actions: [{ id: 3, actor: LANDO, kind: "draft.approve", payload: { n: 18 }, createdAt: "x" }], messages: [] });
    const res = await getSync(req("/api/bot/sync?lane=fast", "GET", undefined, bearer));
    expect(res.status).toBe(200);
    expect(q.claimWork).toHaveBeenCalledWith("fast");
    expect((await res.json()).actions).toHaveLength(1);
    expect((await getSync(req("/api/bot/sync?lane=everything", "GET", undefined, bearer))).status).toBe(400);
  });

  it("records what the Mac did", async () => {
    const body = {
      lane: "fast",
      actions: [{ id: 3, status: "done", result: "Sent #18" }],
      state: { drafts: [] },
    };
    const res = await postSync(req("/api/bot/sync", "POST", body, bearer));
    expect(res.status).toBe(200);
    expect(q.applySync).toHaveBeenCalledTimes(1);
    expect(q.applySync.mock.calls[0][0].actions[0]).toEqual({ id: 3, status: "done", result: "Sent #18" });
  });

  it("drops a malformed item and still records the rest, so one bad item cannot jam the queue", async () => {
    const body = {
      lane: "fast",
      actions: [{ id: "three", status: "done" }, { id: 4, status: "done", result: "ok" }],
      notify: [{ to: "owners", title: "x", url: "https://evil.example/app" }],
    };
    const res = await postSync(req("/api/bot/sync", "POST", body, bearer));
    expect(res.status).toBe(200);
    expect((await res.json()).applied.dropped).toBe(2);
    expect(q.applySync.mock.calls[0][0].actions).toEqual([{ id: 4, status: "done", result: "ok" }]);
    expect(q.applySync.mock.calls[0][0].notify).toEqual([]);
  });

  it("refuses a report with no lane", async () => {
    const res = await postSync(req("/api/bot/sync", "POST", { actions: [] }, bearer));
    expect(res.status).toBe(400);
    expect(q.applySync).not.toHaveBeenCalled();
  });

  it("gives the Mac an upload slot in the right person's folder", async () => {
    const res = await postBotUpload(req("/api/bot/sync/upload", "POST", { thread: LANDO, name: "waiver.pdf", type: "application/pdf", size: 120000 }, bearer));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.file.path.startsWith(`b/${await keyFor(LANDO)}/`)).toBe(true);
    expect(json.signedUrl).toBe("https://storage.example/upload");
  });
});
