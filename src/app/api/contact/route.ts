import { NextResponse } from "next/server";
import { Resend } from "resend";

/**
 * Contact Form API Route — lead fail-safe
 *
 * A submitted lead must NEVER be silently lost. This route delivers each lead
 * through up to two independent channels and only reports success if at least
 * one of them actually succeeds:
 *
 *   1. GoHighLevel  — primary CRM delivery (webhook, or direct API as fallback).
 *   2. Resend email — defense-in-depth notification to the team inbox, sent
 *      whenever RESEND_API_KEY is configured, even if GHL also succeeds.
 *
 * If NEITHER channel delivers, the route returns HTTP 500 with
 * { success: false } so the client surfaces an error (and the visitor is told
 * to call instead) rather than seeing a false "sent" confirmation.
 *
 * SETUP (Vercel env vars):
 *   GHL_WEBHOOK_URL   — Inbound Webhook URL from a GoHighLevel workflow (primary).
 *   GHL_API_KEY       — (optional) direct API key, used only if no webhook URL.
 *   GHL_LOCATION_ID   — (optional) required alongside GHL_API_KEY.
 *   RESEND_API_KEY    — enables the fail-safe email. Requires a verified sender
 *                       domain in Resend (see FROM below).
 */

const GHL_WEBHOOK_URL = process.env.GHL_WEBHOOK_URL || "";
const GHL_API_KEY = process.env.GHL_API_KEY || "";
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || "";

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
  message?: string;
  source?: string;
  tags?: string[];
  /** Honeypot — must be empty. A non-empty value means a bot. */
  company?: string;
}

function row(label: string, value?: string) {
  if (!value) return "";
  return `
    <tr>
      <td style="padding:6px 0;color:#6b6256;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;width:160px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;color:#1a1a1a;font-size:15px;vertical-align:top;">${value}</td>
    </tr>`;
}

function buildHtml(b: ContactBody) {
  const tagList = Array.isArray(b.tags) ? b.tags.filter(Boolean).join(", ") : "";
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f5f2ec;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:4px;overflow:hidden;">
          <tr>
            <td style="background:#1f2a24;padding:32px 40px;">
              <p style="margin:0;color:#c9a96a;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">New Lead</p>
              <h1 style="margin:8px 0 0;color:#f5f2ec;font-size:24px;font-weight:500;">${b.name ?? "Someone"} reached out</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8e5e0;">
                ${row("Email", b.email)}
                ${row("Phone", b.phone)}
                ${row("Neighborhood", b.neighborhood)}
                ${row("Project type", b.projectType)}
                ${row("Source", b.source)}
                ${row("Tags", tagList)}
              </table>
              ${b.message ? `
              <div style="margin-top:24px;padding:20px;background:#f5f2ec;border-radius:4px;">
                <p style="margin:0 0 8px;color:#6b6256;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Message</p>
                <p style="margin:0;color:#1a1a1a;font-size:15px;line-height:1.6;">${b.message}</p>
              </div>` : ""}
              ${b.email ? `
              <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e8e5e0;">
                <a href="mailto:${b.email}" style="display:inline-block;background:#1f2a24;color:#f5f2ec;padding:12px 24px;border-radius:4px;font-size:14px;font-weight:500;text-decoration:none;">Reply to ${b.name ?? "this lead"}</a>
              </div>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background:#f5f2ec;border-top:1px solid #e8e5e0;">
              <p style="margin:0;color:#b0a99e;font-size:11px;">Sent from the saddlewoodcontracting.com contact form</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
 * Create the contact directly via the GHL API. Used only when no webhook URL is
 * configured but an API key + location ID are. Returns true only on success.
 */
async function forwardToGhlApi(body: ContactBody): Promise<boolean> {
  if (!GHL_API_KEY || !GHL_LOCATION_ID) return false;
  try {
    const res = await fetch("https://services.leadconnectorhq.com/contacts/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GHL_API_KEY}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
      body: JSON.stringify({
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        locationId: GHL_LOCATION_ID,
        source: body.source || "Website Contact Form",
        tags: body.tags || ["website-lead"],
        customFields: [
          { key: "neighborhood", field_value: body.neighborhood },
          { key: "project_type", field_value: body.projectType },
          { key: "project_description", field_value: body.message },
        ],
      }),
    });
    if (!res.ok) {
      const errorBody = await res.text();
      console.error("[GHL API error]", res.status, errorBody);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[GHL API error]", err);
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

  // Deliver to GHL (webhook preferred, API as fallback) AND always email the
  // team via Resend when configured. Run in parallel; each fails soft.
  const [ghlWebhookOk, resendOk] = await Promise.all([
    forwardToGhlWebhook(body),
    sendEmail(body),
  ]);

  // Only try the direct API path if the webhook wasn't configured/didn't fire.
  const ghlApiOk = ghlWebhookOk ? false : await forwardToGhlApi(body);

  const delivered = ghlWebhookOk || ghlApiOk || resendOk;

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
