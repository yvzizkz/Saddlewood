import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { send, q } = vi.hoisted(() => ({
  send: vi.fn(),
  q: {
    listPushSubscriptions: vi.fn(),
    deletePushSubscription: vi.fn(),
    markPushDelivered: vi.fn(),
  },
}));
vi.mock("web-push", () => ({ default: { sendNotification: send } }));
vi.mock("../queries", () => q);

import { isPushService, pushConfig, sendPush } from "../push";

const NOTE = { title: "Draft #21 needs your OK", body: "COI to McCully", url: "/app", tag: "draft-21" };
const sub = (id: string, email = "marco@saddlewoodcontracting.com") => ({
  endpoint: `https://web.push.apple.com/${id}`,
  email,
  p256dh: "p",
  auth: "a",
});

beforeEach(() => {
  send.mockReset();
  for (const fn of Object.values(q)) fn.mockReset();
  q.deletePushSubscription.mockResolvedValue(undefined);
  q.markPushDelivered.mockResolvedValue(undefined);
  vi.stubEnv("BOT_PUSH_PUBLIC_KEY", "public");
  vi.stubEnv("BOT_PUSH_PRIVATE_KEY", "private");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("where a notification may be sent", () => {
  it("is a real push service, and nothing that merely ends like one", () => {
    expect(isPushService("https://web.push.apple.com/QGk3")).toBe(true);
    expect(isPushService("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushService("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    for (const bad of [
      "https://evil.example;.push.apple.com/x",
      "https://evil.example/web.push.apple.com",
      "https://web.push.apple.com.evil.example/x",
      "https://user:pw@web.push.apple.com/x",
      "https://web.push.apple.com:444/x",
      "http://fcm.googleapis.com/fcm/send/abc",
      "not a url",
    ]) {
      expect(isPushService(bad)).toBe(false);
    }
  });
});

describe("notifications", () => {
  it("are simply off when the keys are not set", async () => {
    vi.stubEnv("BOT_PUSH_PRIVATE_KEY", "");
    expect(pushConfig()).toBeNull();
    expect(await sendPush(["marco@saddlewoodcontracting.com"], NOTE)).toEqual({ sent: 0, removed: 0 });
    expect(q.listPushSubscriptions).not.toHaveBeenCalled();
  });

  it("go to every phone the person turned them on for", async () => {
    q.listPushSubscriptions.mockResolvedValue([sub("phone"), sub("tablet")]);
    send.mockResolvedValue({});
    const res = await sendPush(["marco@saddlewoodcontracting.com", "marco@saddlewoodcontracting.com"], NOTE);
    expect(res).toEqual({ sent: 2, removed: 0 });
    expect(q.listPushSubscriptions).toHaveBeenCalledWith(["marco@saddlewoodcontracting.com"]);
    expect(JSON.parse(send.mock.calls[0][1])).toEqual(NOTE);
    expect(send.mock.calls[0][2].vapidDetails).toMatchObject({ publicKey: "public", privateKey: "private" });
    expect(q.markPushDelivered).toHaveBeenCalledWith(["https://web.push.apple.com/phone", "https://web.push.apple.com/tablet"]);
  });

  it("forget a phone that dropped the subscription, and keep one the push service merely failed", async () => {
    q.listPushSubscriptions.mockResolvedValue([sub("gone"), sub("flaky"), sub("fine")]);
    send.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (s.endpoint.endsWith("flaky")) throw Object.assign(new Error("try later"), { statusCode: 503 });
      return {};
    });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await sendPush(["marco@saddlewoodcontracting.com"], NOTE);
    quiet.mockRestore();
    expect(res).toEqual({ sent: 1, removed: 1 });
    expect(q.deletePushSubscription).toHaveBeenCalledTimes(1);
    expect(q.deletePushSubscription).toHaveBeenCalledWith("https://web.push.apple.com/gone");
  });
});
