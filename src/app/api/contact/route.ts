import { NextResponse } from "next/server";
import { Resend } from "resend";
import { renderNotificationEmail } from "@/lib/emailTemplate";

/**
 * Contact Form API Route — lead fail-safe
 *
 * A submitted lead must NEVER be silently lost. This route delivers each lead
 * through up to two independent channels and only reports success if at least
 * one of them actually succeeds:
 *
 *   1. GoHighLevel  — primary CRM delivery via the Contacts upsert API, which is
 *      the only path that maps the FULL lead (project message → custom field,
 *      plus source + tags) onto the contact. Falls back to the inbound webhook
 *      if the API isn't configured or fails.
 *   2. Resend email — defense-in-depth notification to the team inbox, sent
 *      whenever RESEND_API_KEY is configured, even if GHL also succeeds.
 *
 * If NEITHER channel delivers, the route returns HTTP 500 with
 * { success: false } so the client surfaces an error (and the visitor is told
 * to call instead) rather than seeing a false "sent" confirmation.
 *
 * SETUP (Vercel env vars):
 *   GHL_API_KEY       — GHL Private Integration token (pit-…). Enables the
 *                       primary full-mapping upsert. Needs Contacts read+write.
 *   GHL_LOCATION_ID   — the Saddlewood sub-account location id (required with
 *                       GHL_API_KEY).
 *   GHL_CF_VISION_ID  — (optional) custom-field id the project message maps to.
 *                       Defaults to the "Tell Us About Your Vision" field.
 *   GHL_WEBHOOK_URL   — Inbound Webhook URL; used as a FALLBACK only (it does not
 *                       map the message/custom fields on its own).
 *   RESEND_API_KEY    — enables the fail-safe email. Requires a verified sender
 *                       domain in Resend (see FROM below).
 */

const GHL_WEBHOOK_URL = process.env.GHL_WEBHOOK_URL || "";
const GHL_API_KEY = process.env.GHL_API_KEY || "";
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || "";
// Custom-field id for the free-text project message ("Tell Us About Your Vision",
// LARGE_TEXT). GHL custom fields are written by id, not key. Overridable via env.
const GHL_CF_VISION_ID =
  process.env.GHL_CF_VISION_ID || "bPd6r0bYyAKBbrn2wXVn";

// Team inbox for lead notifications. `info@` is the canonical address used
// across the site. The FROM address must live on a domain VERIFIED in Resend.
const TO = "info@saddlewoodcontracting.com";
const FROM = "notifications@saddlewoodcontracting.com";

interface ContactBody {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  neighborhood?: string;
  projectType?: string;
  budget?: string;
  timeline?: string;
  message?: string;
  source?: string;
  tags?: string[];
  /** Honeypot — must be empty. A non-empty value means a bot. */
  company?: string;
}

function buildHtml(b: ContactBody) {
  const phoneHref = b.phone
    ? `tel:${b.phone.replace(/[^0-9+]/g, "")}`
    : undefined;

  return renderNotificationEmail({
    eyebrow: "New website lead",
    heading: `${b.name ?? "Someone"} reached out`,
    intro:
      "You've got a new lead from the website. Here's the quick version — hit reply to get back to them.",
    rows: [
      { label: "Name", value: b.name },
      { label: "Email", value: b.email, href: b.email ? `mailto:${b.email}` : undefined },
      { label: "Phone", value: b.phone, href: phoneHref },
      { label: "Neighborhood", value: b.neighborhood },
      { label: "Project type", value: b.projectType },
      { label: "Budget", value: b.budget },
      { label: "Target start", value: b.timeline },
    ],
    noteLabel: "Their message",
    noteText: b.message,
    replyEmail: b.email,
    replyLabel: b.name ? `Reply to ${b.name}` : "Reply",
    footerNote: "Sent from the contact form at saddlewoodcontracting.com",
  });
}

/**
 * Send the lead to the team via Resend. Returns true only if the email was
 * accepted by Resend. No-ops (returns false) if RESEND_API_KEY is unset.
 */
async function sendEmail(body: ContactBody): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: TO,
      replyTo: body.email,
      subject: `New lead — ${body.name ?? "Unknown"} · ${body.projectType ?? "General"}`,
      html: buildHtml(body),
    });
    if (error) {
      console.error("[Resend error]", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Resend error]", err);
    return false;
  }
}

/**
 * Forward the lead into GoHighLevel via the inbound webhook. Returns true only
 * if the webhook responded OK. No-ops (returns false) if no webhook URL is set.
 */
async function forwardToGhlWebhook(body: ContactBody): Promise<boolean> {
  if (!GHL_WEBHOOK_URL) return false;
  try {
    const res = await fetch(GHL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: body.firstName,
        lastName: body.lastName,
        name: body.name,
        email: body.email,
        phone: body.phone,
        neighborhood: body.neighborhood,
        projectType: body.projectType,
        budget: body.budget,
        timeline: body.timeline,
        message: body.message,
        source: body.source,
        tags: body.tags,
        submittedAt: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      console.error("[GHL webhook] responded", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[GHL webhook error]", err);
    return false;
  }
}

/**
 * Upsert the contact directly via the GHL Contacts API — the PRIMARY CRM path.
 * Unlike the inbound webhook, this maps the full lead: the free-text project
 * message lands in the "Tell Us About Your Vision" custom field, and source +
 * tags (which carry the project type and neighborhood) are set on the contact.
 * Upsert dedupes by email/phone within the location, so re-submits update the
 * same contact instead of creating duplicates. No-ops (false) without creds.
 *
 * Note: custom fields must be written by id (keys are silently ignored by the
 * API). project_type and neighborhood are already carried as tags by the client,
 * so they are captured without a brittle write to GHL's single-option dropdowns.
 */
async function upsertToGhl(body: ContactBody): Promise<boolean> {
  if (!GHL_API_KEY || !GHL_LOCATION_ID) return false;
  try {
    const customFields = body.message
      ? [{ id: GHL_CF_VISION_ID, field_value: body.message }]
      : [];
    const res = await fetch(
      "https://services.leadconnectorhq.com/contacts/upsert",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GHL_API_KEY}`,
          "Content-Type": "application/json",
          Version: "2021-07-28",
        },
        body: JSON.stringify({
          locationId: GHL_LOCATION_ID,
          firstName: body.firstName,
          lastName: body.lastName,
          name: body.name,
          email: body.email,
          phone: body.phone,
          source: body.source || "Website Contact Form",
          tags: body.tags?.length ? body.tags : ["website-lead"],
          customFields,
        }),
      }
    );
    if (!res.ok) {
      const errorBody = await res.text();
      console.error("[GHL upsert error]", res.status, errorBody);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[GHL upsert error]", err);
    return false;
  }
}

export async function POST(request: Request) {
  let body: ContactBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 }
    );
  }

  // Honeypot: a filled hidden field means a bot. Pretend success (so the bot
  // moves on) but do no work — no CRM forward, no email.
  if (body.company && body.company.trim().length > 0) {
    return NextResponse.json({ success: true });
  }

  // Validate required fields.
  if (!body.name || !body.email) {
    return NextResponse.json(
      { success: false, error: "Name and email are required" },
      { status: 400 }
    );
  }

  // Deliver to GHL (direct upsert preferred — it maps the full lead — with the
  // inbound webhook as fallback) AND always email the team via Resend when
  // configured. Upsert + email run in parallel; each fails soft.
  const [ghlApiOk, resendOk] = await Promise.all([
    upsertToGhl(body),
    sendEmail(body),
  ]);

  // Only forward to the webhook if the direct upsert wasn't configured/didn't fire.
  const ghlWebhookOk = ghlApiOk ? false : await forwardToGhlWebhook(body);

  const delivered = ghlApiOk || ghlWebhookOk || resendOk;

  if (!delivered) {
    // Nothing accepted the lead — never report success. Log the full payload
    // as a last resort so it can be recovered from server logs.
    console.error(
      "[Contact] LEAD NOT DELIVERED — no channel succeeded:",
      JSON.stringify(body)
    );
    return NextResponse.json({ success: false }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    delivered: {
      ghl: ghlWebhookOk || ghlApiOk,
      email: resendOk,
    },
  });
}
