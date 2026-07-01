import { NextResponse } from "next/server";
import { Resend } from "resend";

/**
 * Trade Partner / Subcontractor Bid-List API Route.
 *
 * Sister route to /api/contact. A subcontractor application must NEVER be
 * silently lost, so it is delivered through up to two independent channels and
 * only reports success if at least one actually succeeds:
 *
 *   1. GoHighLevel — files the applicant into the CRM as a contact tagged
 *      `subcontractor` + `bid-list` (+ per-trade tags) with a distinct source,
 *      so the bid list is queryable and stays separate from homeowner leads.
 *      The full application is written into a free-text custom field. Falls back
 *      to the inbound webhook if the API isn't configured or fails.
 *   2. Resend email — notifies the team inbox (info@ + marco@) on every
 *      submission whenever RESEND_API_KEY is configured, even if GHL succeeds.
 *
 * If NEITHER channel delivers, the route returns HTTP 500 { success: false } so
 * the client shows an error instead of a false confirmation.
 *
 * Reuses the same Vercel env vars as /api/contact: GHL_API_KEY, GHL_LOCATION_ID,
 * GHL_CF_VISION_ID (optional), GHL_WEBHOOK_URL (fallback), RESEND_API_KEY.
 */

const GHL_WEBHOOK_URL = process.env.GHL_WEBHOOK_URL || "";
const GHL_API_KEY = process.env.GHL_API_KEY || "";
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || "";
// Free-text custom-field id the full application is written into. GHL custom
// fields are written by id, not key. Same field the contact form uses.
const GHL_CF_VISION_ID = process.env.GHL_CF_VISION_ID || "bPd6r0bYyAKBbrn2wXVn";

// Team notification recipients. Kept SERVER-SIDE ONLY — never rendered on the
// site. `info@` is the canonical (already-public) inbox; Marco is CC'd for the
// bid list and sourced from env so his address stays out of the source too.
// The FROM address must live on a domain VERIFIED in Resend.
const MARCO_EMAIL = process.env.MARCO_EMAIL || "marco@saddlewoodcontracting.com";
const TO = ["info@saddlewoodcontracting.com", MARCO_EMAIL].filter(
  (addr, i, all) => addr && all.indexOf(addr) === i
);
const FROM =
  process.env.RESEND_FROM_ADDRESS || "notifications@saddlewoodcontracting.com";

interface TradePartnerBody {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  businessName?: string;
  website?: string;
  license?: string;
  classifications?: string[];
  serviceArea?: string;
  yearsInBusiness?: string;
  bondedInsured?: string;
  message?: string;
  source?: string;
  tags?: string[];
  /** Honeypot — must be empty. A non-empty value means a bot. */
  company?: string;
}

/** Escape user-supplied text before it lands in the notification HTML. */
function esc(value?: string): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label: string, value?: string) {
  if (!value) return "";
  return `
    <tr>
      <td style="padding:6px 0;color:#6b6256;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;width:170px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;color:#1a1a1a;font-size:15px;vertical-align:top;">${value}</td>
    </tr>`;
}

/** A readable, multi-line summary of the whole application (used for GHL). */
function buildSummary(b: TradePartnerBody): string {
  const lines = [
    b.businessName ? `Business: ${b.businessName}` : "",
    b.name ? `Contact: ${b.name}` : "",
    b.email ? `Email: ${b.email}` : "",
    b.phone ? `Phone: ${b.phone}` : "",
    b.website ? `Website: ${b.website}` : "",
    b.license ? `License / ROC #: ${b.license}` : "",
    b.classifications?.length ? `Trades: ${b.classifications.join(", ")}` : "",
    b.serviceArea ? `Service area: ${b.serviceArea}` : "",
    b.yearsInBusiness ? `Years in business: ${b.yearsInBusiness}` : "",
    b.bondedInsured ? `Bonded/Insured: ${b.bondedInsured}` : "",
    b.message ? `Notes: ${b.message}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildHtml(b: TradePartnerBody) {
  const trades = b.classifications?.length ? b.classifications.join(", ") : "";
  const website = b.website
    ? `<a href="${esc(b.website)}" style="color:#1f6f6f;">${esc(b.website)}</a>`
    : "";
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
              <p style="margin:0;color:#c9a96a;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">New Trade Partner — Bid List</p>
              <h1 style="margin:8px 0 0;color:#f5f2ec;font-size:24px;font-weight:500;">${esc(b.businessName) || "A subcontractor"} applied</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8e5e0;">
                ${row("Business", esc(b.businessName))}
                ${row("Contact", esc(b.name))}
                ${row("Email", esc(b.email))}
                ${row("Phone", esc(b.phone))}
                ${row("Website", website)}
                ${row("License / ROC #", esc(b.license))}
                ${row("Trades", esc(trades))}
                ${row("Service area", esc(b.serviceArea))}
                ${row("Years in business", esc(b.yearsInBusiness))}
                ${row("Bonded / Insured", esc(b.bondedInsured))}
                ${row("Source", esc(b.source))}
              </table>
              ${b.message ? `
              <div style="margin-top:24px;padding:20px;background:#f5f2ec;border-radius:4px;">
                <p style="margin:0 0 8px;color:#6b6256;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Capabilities &amp; Notes</p>
                <p style="margin:0;color:#1a1a1a;font-size:15px;line-height:1.6;">${esc(b.message)}</p>
              </div>` : ""}
              ${b.email ? `
              <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e8e5e0;">
                <a href="mailto:${esc(b.email)}" style="display:inline-block;background:#1f2a24;color:#f5f2ec;padding:12px 24px;border-radius:4px;font-size:14px;font-weight:500;text-decoration:none;">Reply to ${esc(b.businessName) || "applicant"}</a>
              </div>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background:#f5f2ec;border-top:1px solid #e8e5e0;">
              <p style="margin:0;color:#b0a99e;font-size:11px;">Sent from the saddlewoodcontracting.com trade partner form</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Email the team via Resend. Returns true only if Resend accepted it. */
async function sendEmail(body: TradePartnerBody): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const trades = body.classifications?.length
      ? body.classifications.join(", ")
      : "General";
    const { error } = await resend.emails.send({
      from: FROM,
      to: TO,
      replyTo: body.email,
      subject: `New trade partner — ${body.businessName ?? "Unknown"} · ${trades}`,
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

/** Fallback: forward into GoHighLevel via the inbound webhook. */
async function forwardToGhlWebhook(body: TradePartnerBody): Promise<boolean> {
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
        businessName: body.businessName,
        website: body.website,
        license: body.license,
        classifications: body.classifications,
        serviceArea: body.serviceArea,
        yearsInBusiness: body.yearsInBusiness,
        bondedInsured: body.bondedInsured,
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
 * Upsert the applicant into GHL — the PRIMARY CRM path that builds the bid list.
 * The full application is written into the free-text custom field, and the
 * `subcontractor` + `bid-list` + per-trade tags make the list filterable.
 * Upsert dedupes by email/phone, so re-submits update the same contact.
 */
async function upsertToGhl(body: TradePartnerBody): Promise<boolean> {
  if (!GHL_API_KEY || !GHL_LOCATION_ID) return false;
  try {
    const summary = buildSummary(body);
    const customFields = summary
      ? [{ id: GHL_CF_VISION_ID, field_value: summary }]
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
          name: body.name || body.businessName,
          email: body.email,
          phone: body.phone,
          companyName: body.businessName,
          website: body.website,
          source: body.source || "Website Trade Partner Application",
          tags: body.tags?.length
            ? body.tags
            : ["subcontractor", "bid-list"],
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
  let body: TradePartnerBody;
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
  if (!body.businessName || !body.email) {
    return NextResponse.json(
      { success: false, error: "Business name and email are required" },
      { status: 400 }
    );
  }

  // File into GHL (direct upsert preferred, webhook fallback) AND email the team
  // via Resend when configured. Upsert + email run in parallel; each fails soft.
  const [ghlApiOk, resendOk] = await Promise.all([
    upsertToGhl(body),
    sendEmail(body),
  ]);

  const ghlWebhookOk = ghlApiOk ? false : await forwardToGhlWebhook(body);

  const delivered = ghlApiOk || ghlWebhookOk || resendOk;

  if (!delivered) {
    console.error(
      "[TradePartners] APPLICATION NOT DELIVERED — no channel succeeded:",
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
