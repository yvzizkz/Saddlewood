import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const PatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    notifyEstimator: z.boolean(),
  }),
  z.object({
    action: z.literal("request_changes"),
    overallNote: z.string().min(1).max(2000),
    flagNotes: z
      .array(
        z.object({
          lineItemId: z.string().uuid(),
          note: z.string().max(500),
        }),
      )
      .optional(),
  }),
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  // Auth check — must run before any DB read.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Wrap body read + JSON.parse so malformed input → 400, not 500.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const estimatorEmail = process.env.ESTIMATOR_EMAIL ?? null;

  if (payload.action === "approve") {
    const { error } = await supabase
      .from("estimates")
      .update({
        review_status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (payload.notifyEstimator && estimatorEmail) {
      // Phase 5 email worker will pick up queued rows. We swallow failures so
      // a degraded log table doesn't break Marco's approve flow.
      const { error: logErr } = await supabase.from("email_log").insert({
        estimate_id: id,
        recipient: estimatorEmail,
        template: "estimate_approved",
        subject: "Estimate approved by Marco",
        status: "queued",
      });
      if (logErr) {
        console.error("[estimates PATCH] email_log insert failed:", logErr);
      }
    }

    return NextResponse.json({ status: "approved" });
  }

  // action === 'request_changes'
  const { error: updateErr } = await supabase
    .from("estimates")
    .update({ review_status: "changes_requested" })
    .eq("id", id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Phase 5 will replace this with proper estimate_comments + Resend send.
  // For now, queue a row in email_log so the eventual worker picks it up.
  if (estimatorEmail) {
    const { error: logErr } = await supabase.from("email_log").insert({
      estimate_id: id,
      recipient: estimatorEmail,
      template: "estimate_changes_requested",
      subject: "Marco requested changes",
      status: "queued",
    });
    if (logErr) {
      console.error("[estimates PATCH] email_log insert failed:", logErr);
    }
  }

  return NextResponse.json({
    status: "changes_requested",
    note: payload.overallNote,
    flagNotes: payload.flagNotes ?? [],
  });
}
