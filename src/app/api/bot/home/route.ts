import { NextRequest, NextResponse } from "next/server";

import { requirePerson, unauthorized } from "@/lib/bot/auth";
import { buildHome, whoIs } from "@/lib/bot/home";
import { pushConfig } from "@/lib/bot/push";
import { failStale, hasStale, listInFlight, listRecentActions, readState } from "@/lib/bot/queries";
import { crewSummary } from "@/lib/crew/queries";

// Everything the app's Home, Duties and More screens show, in one read: what
// the Mac last reported the bot is holding, who is asking it for what right
// now, and what happened to the last few taps. Filtered to what this person
// may see (src/lib/bot/home.ts).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const email = await requirePerson(request);
  if (!email) return unauthorized();
  try {
    let [state, inFlight, actions] = await Promise.all([readState(), listInFlight(), listRecentActions()]);
    const staleAction = actions.some(
      (a) => a.status === "working" && Date.now() - Date.parse(a.createdAt) > 10 * 60_000,
    );
    if (staleAction || hasStale(inFlight)) {
      await failStale();
      [state, inFlight, actions] = await Promise.all([readState(), listInFlight(), listRecentActions()]);
    }
    const config = pushConfig();
    // The crew at a glance, for an owner. Never worth failing Home over.
    const crew = whoIs(email, state.sections.people).role === "owner" ? await crewSummary().catch(() => null) : null;
    const home = buildHome({
      email,
      sections: state.sections,
      bridge: state.bridge,
      inFlight,
      actions,
      push: { available: !!config, publicKey: config?.publicKey ?? null },
      crew,
    });
    return NextResponse.json(home, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
