import webpush from "web-push";

import { deletePushSubscription, listPushSubscriptions, markPushDelivered } from "./queries";

// Web Push for the installed app: "draft #21 needs your OK", "your answer is
// ready". Optional. Without the three BOT_PUSH_* variables the app simply has
// no notification switch and everything else works.
//
//   npx web-push generate-vapid-keys
//   BOT_PUSH_PUBLIC_KEY, BOT_PUSH_PRIVATE_KEY, BOT_PUSH_SUBJECT (mailto:...)

export type PushNote = { title: string; body: string; url: string; tag: string };

type PushConfig = { publicKey: string; privateKey: string; subject: string };

export function pushConfig(): PushConfig | null {
  const publicKey = (process.env.BOT_PUSH_PUBLIC_KEY ?? "").trim();
  const privateKey = (process.env.BOT_PUSH_PRIVATE_KEY ?? "").trim();
  if (!publicKey || !privateKey) return null;
  const subject = (process.env.BOT_PUSH_SUBJECT ?? "").trim() || "mailto:info@saddlewoodcontracting.com";
  return { publicKey, privateKey, subject };
}

// Only real push services: the server will POST to this URL later. The
// library that sends parses URLs with Node's older parser, which ends the host
// at characters the standard parser allows inside it (";" for one), so
// "https://evil.example;.push.apple.com/" would pass a suffix test and still
// be dialed as evil.example. The host must be plain letters, digits, dots and
// dashes, on the default port, with no credentials, before the suffix counts.
export function isPushService(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  const host = url.hostname;
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  if (!/^[a-z0-9.-]+$/.test(host)) return false;
  return (
    host === "fcm.googleapis.com" ||
    host === "web.push.apple.com" ||
    host.endsWith(".push.apple.com") ||
    host.endsWith(".push.services.mozilla.com") ||
    host.endsWith(".notify.windows.com")
  );
}

export async function sendPush(emails: string[], note: PushNote): Promise<{ sent: number; removed: number }> {
  const config = pushConfig();
  const unique = [...new Set(emails)];
  if (!config || !unique.length) return { sent: 0, removed: 0 };

  const subs = await listPushSubscriptions(unique);
  const payload = JSON.stringify(note);
  const delivered: string[] = [];
  let removed = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          // timeout: a push service that hangs must not hold up the Mac's report.
          { vapidDetails: config, TTL: 6 * 3600, urgency: "high", timeout: 5000 },
        );
        delivered.push(s.endpoint);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404 / 410: the browser dropped this subscription (app removed, or
        // permission revoked). Anything else is the push service's problem
        // today, and the subscription stays.
        if (status === 404 || status === 410) {
          await deletePushSubscription(s.endpoint).catch(() => {});
          removed += 1;
        } else {
          console.error("[bot/push]", status ?? "", (e as Error).message);
        }
      }
    }),
  );

  await markPushDelivered(delivered).catch(() => {});
  return { sent: delivered.length, removed };
}
