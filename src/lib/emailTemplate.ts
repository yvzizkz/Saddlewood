/**
 * Shared branded notification email.
 *
 * A friendly, concise team notification with the Saddlewood logo on a dark
 * header, a one-line summary, a compact details block, an optional freeform
 * note, and a reply CTA. Used by /api/contact and /api/trade-partners so both
 * emails stay on-brand and consistent.
 *
 * ALL text values are HTML-escaped in here, so callers pass raw strings. The
 * logo is referenced by absolute URL (email clients can't resolve relative
 * paths) from NEXT_PUBLIC_SITE_URL, falling back to the production domain.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://saddlewoodcontracting.com";

// Brand tokens (mirrors the site's palette).
const TEAL = "#1f2a24";
const GOLD = "#c9a96a";
const CREAM = "#f5f2ec";
const INK = "#1a1a1a";
const MUTE = "#6b6256";
const HAIR = "#ece9e3";

export function escapeHtml(value?: string): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface EmailRow {
  label: string;
  value?: string;
  /** Optional link target, e.g. `mailto:x@y.com`, `tel:4805551234`, or a URL. */
  href?: string;
}

export interface NotificationEmailOptions {
  /** Small gold uppercase label, e.g. "New website lead". */
  eyebrow: string;
  /** Friendly headline, e.g. "Jane reached out". */
  heading: string;
  /** One-line friendly summary above the details. */
  intro: string;
  /** Compact key facts. Rows with a blank value are skipped automatically. */
  rows: EmailRow[];
  noteLabel?: string;
  noteText?: string;
  /** If set, renders a reply button (mailto). */
  replyEmail?: string;
  replyLabel?: string;
  /** Small footer line. */
  footerNote: string;
}

function rowHtml({ label, value, href }: EmailRow): string {
  if (!value || !value.trim()) return "";
  const safe = escapeHtml(value);
  const cell = href
    ? `<a href="${escapeHtml(href)}" style="color:${TEAL};text-decoration:none;border-bottom:1px solid ${GOLD};">${safe}</a>`
    : safe;
  return `
              <tr>
                <td style="padding:8px 0;color:${MUTE};font-size:12px;text-transform:uppercase;letter-spacing:0.07em;width:140px;vertical-align:top;">${escapeHtml(label)}</td>
                <td style="padding:8px 0;color:${INK};font-size:15px;vertical-align:top;">${cell}</td>
              </tr>`;
}

export function renderNotificationEmail(o: NotificationEmailOptions): string {
  const rows = o.rows.map(rowHtml).join("");

  const note =
    o.noteText && o.noteText.trim()
      ? `
              <div style="margin-top:24px;padding:18px 20px;background:${CREAM};border-radius:8px;">
                <p style="margin:0 0 6px;color:${MUTE};font-size:11px;text-transform:uppercase;letter-spacing:0.07em;">${escapeHtml(
                  o.noteLabel || "Notes"
                )}</p>
                <p style="margin:0;color:${INK};font-size:15px;line-height:1.65;white-space:pre-line;">${escapeHtml(
                  o.noteText
                )}</p>
              </div>`
      : "";

  const button = o.replyEmail
    ? `
              <div style="margin-top:28px;">
                <a href="mailto:${escapeHtml(
                  o.replyEmail
                )}" style="display:inline-block;background:${TEAL};color:${CREAM};padding:13px 28px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(
        o.replyLabel || "Reply"
      )}</a>
              </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.07);">
          <tr>
            <td align="center" style="background:${TEAL};padding:30px 40px 26px;">
              <img src="${SITE_URL}/images/logo.png" alt="Saddlewood Contracting" width="54" height="54" style="display:block;width:54px;height:54px;border:0;margin:0 auto 12px;" />
              <p style="margin:0;color:${GOLD};font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">${escapeHtml(
                o.eyebrow
              )}</p>
              <h1 style="margin:8px 0 0;color:${CREAM};font-size:22px;font-weight:600;line-height:1.3;">${escapeHtml(
                o.heading
              )}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 40px 36px;">
              <p style="margin:0 0 20px;color:${INK};font-size:15px;line-height:1.65;">${escapeHtml(
                o.intro
              )}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${HAIR};">${rows}
              </table>${note}${button}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 40px;background:${CREAM};border-top:1px solid ${HAIR};">
              <p style="margin:0;color:#b0a99e;font-size:11px;line-height:1.5;">${escapeHtml(
                o.footerNote
              )}</p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;color:#c3bcae;font-size:11px;">Saddlewood Contracting LLC &middot; Scottsdale, AZ</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
