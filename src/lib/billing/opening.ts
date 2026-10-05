import { headers } from "next/headers";

import { isAllowedEmail } from "@/lib/ops/allowlist";
import { createClient } from "@/lib/supabase/server";
import { listEvents, recordEvent } from "./documents";
import { looksAutomatic } from "./proof";
import type { BillingDocument } from "./types";

// Writes "the client opened this" to the proof record: the document's page
// itself ("viewed"), or one of the things shown with it ("downloaded").
// Staff who are signed in are not counted, and an opening that looks like a
// mail scanner is kept but marked (proof.ts).

async function isStaff(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return isAllowedEmail(user?.email);
  } catch {
    return false;
  }
}

export async function recordOpening(
  doc: BillingDocument,
  kind: "viewed" | "downloaded",
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    if (await isStaff()) return;
    const h = await headers();
    const now = new Date();
    const events = await listEvents(doc.id);
    const last = events.filter((e) => e.kind === "sent" || e.kind === "delivered").at(-1);
    const ua = h.get("user-agent");
    await recordEvent({
      documentId: doc.id,
      kind,
      at: now,
      actor: "client link",
      automatic: looksAutomatic({
        userAgent: ua,
        purpose: h.get("sec-purpose") ?? h.get("purpose") ?? (h.get("next-router-prefetch") ? "prefetch" : null),
        at: now,
        lastSentOrDeliveredAt: last ? new Date(last.at) : null,
      }),
      detail: {
        ...extra,
        ua: (ua ?? "").slice(0, 300),
        ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64),
      },
    });
  } catch (err) {
    // The client still gets what they asked for; we lose one line, and say so in the logs.
    console.error("opening not recorded:", err);
  }
}
