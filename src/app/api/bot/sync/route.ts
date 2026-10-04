import { NextRequest, NextResponse } from "next/server";

import { requireBridge, unauthorized } from "@/lib/bot/auth";
import { ownerEmails } from "@/lib/bot/home";
import { sendPush } from "@/lib/bot/push";
import { applySync, claimWork, readState } from "@/lib/bot/queries";
import { parseSection, syncPostSchema } from "@/lib/bot/types";

// The Mac's door. Saddlewood-KB bot/app_bridge.py calls this with
// OPS_AGENT_TOKEN and nothing else may: a portal session is refused here
// (src/lib/bot/auth.ts).
//
//   GET  ?lane=fast    every 20 s: taps to carry out, and new messages to
//                      check for plain commands ("approve 4")
//   GET  ?lane=agent   one message at a time for a full agent run, with the
//                      thread's recent turns and signed URLs for its files
//   POST               what happened: action results, replies, and the
//                      sections of the snapshot that changed
//
// Each GET is also the heartbeat: it stamps when that lane last checked in.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await requireBridge(request))) return unauthorized();
  const lane = new URL(request.url).searchParams.get("lane");
  if (lane !== "fast" && lane !== "agent") {
    return NextResponse.json({ ok: false, error: "lane must be fast or agent" }, { status: 400 });
  }
  try {
    const work = await claimWork(lane);
    return NextResponse.json({ ok: true, lane, now: new Date().toISOString(), ...work });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireBridge(request))) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = syncPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  // Items that did not parse were dropped, not refused (see syncPostSchema).
  // Say how many, so the Mac can log that something it sent was malformed.
  const raw = body as Record<string, unknown>;
  const sent = (key: string) => (Array.isArray(raw?.[key]) ? (raw[key] as unknown[]).length : 0);
  const dropped =
    sent("actions") - parsed.data.actions.length +
    (sent("messages") - parsed.data.messages.length) +
    (sent("posts") - parsed.data.posts.length) +
    (sent("notify") - parsed.data.notify.length);
  try {
    const applied = await applySync(parsed.data);

    // Notifications never fail the sync: the work is already recorded.
    let pushed = 0;
    try {
      for (const r of [...applied.replies, ...applied.posts]) {
        pushed += (await sendPush([r.thread], { title: "SaddleWoodBot", body: r.preview, url: "/app/ask", tag: "reply" })).sent;
      }
      if (parsed.data.notify.length) {
        const people =
          "people" in parsed.data.state
            ? parseSection("people", parsed.data.state.people)
            : (await readState()).sections.people;
        for (const n of parsed.data.notify) {
          // Only people with a seat are ever notified, whatever the list says.
          const to = n.to === "owners" ? ownerEmails(people) : n.to.filter((email) => !!people[email]);
          pushed += (await sendPush(to, { title: n.title, body: n.body, url: n.url, tag: n.tag })).sent;
        }
      }
    } catch (e) {
      console.error("[bot/sync] push failed:", (e as Error).message);
    }

    return NextResponse.json({
      ok: true,
      applied: {
        actions: applied.actions,
        replies: applied.replies.length,
        routed: applied.routed,
        posts: applied.posts.length,
        sections: applied.sections,
        pushed,
        dropped,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
