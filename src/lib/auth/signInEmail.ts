import { escapeHtml } from "@/lib/emailTemplate";
import { LINK_HOURS, SITE_URL } from "./magicLink";

// The sign-in email, and the same shell reused for the one-time
// announcement that carries a person's first link. Brand tokens mirror
// src/lib/emailTemplate.ts. Every string is escaped here; callers pass text.

const TEAL = "#182828";
const GOLD = "#c8a55a";
const GOLD_TEXT = "#8B6914";
const CREAM = "#f5f0e8";
const INK = "#2c2926";
const MUTE = "#6b6256";
const HAIR = "#e2dbd0";
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";

export type SignInEmailInput = {
  link: string;
  code: string;
  /** Eyebrow above the headline. Default "Secure sign-in". */
  eyebrow?: string;
  /** Headline. Default "Your sign-in link". */
  headline?: string;
  /** Paragraphs shown above the button, plain text, one per entry. */
  paragraphs?: string[];
  /** Button label. Default "Open the portal". */
  buttonLabel?: string;
  /** Lines under the button, plain text. */
  afterButton?: string[];
  /** Footer note. */
  footer?: string;
};

export function buildSignInEmail(input: SignInEmailInput): { html: string; text: string } {
  const eyebrow = input.eyebrow ?? "Secure sign-in";
  const headline = input.headline ?? "Your sign-in link";
  const paragraphs = input.paragraphs ?? [
    "Tap the button to open the Saddlewood portal. The link signs you in on its own and works on your phone or your computer.",
  ];
  const buttonLabel = input.buttonLabel ?? "Open the portal";
  const afterButton = input.afterButton ?? [
    `The link works once and expires in ${LINK_HOURS} hours. If it has expired, go to ${SITE_URL}/login, enter your email, and a fresh one arrives.`,
  ];
  const footer =
    input.footer ??
    "You are receiving this because your address is on the Saddlewood portal allowlist. If you did not ask for it, ignore it; nothing happens without the tap.";

  const codeDigits = escapeHtml(input.code || "").split("").join("&#8202;");

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(headline)}</title></head>
<body style="margin:0;padding:0;background:${CREAM};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${CREAM};">${escapeHtml(paragraphs[0] ?? headline)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};"><tr><td align="center" style="padding:36px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td align="center" style="padding:0 0 28px;"><a href="${SITE_URL}" style="text-decoration:none;"><img src="${SITE_URL}/images/logo.png" width="160" height="48" alt="Saddlewood Contracting" style="display:block;border:0;height:auto;width:auto;max-height:48px;"></a></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${HAIR};border-radius:2px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 40px 0;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="border-top:1px solid ${GOLD};width:24px;font-size:0;">&nbsp;</td>
<td style="padding:0 12px;font-family:${FONT};font-size:11px;font-weight:500;letter-spacing:.25em;text-transform:uppercase;color:${GOLD_TEXT};">${escapeHtml(eyebrow)}</td>
<td style="border-top:1px solid ${GOLD};width:24px;font-size:0;">&nbsp;</td>
</tr></table></td></tr>
<tr><td align="center" style="padding:18px 40px 8px;font-family:${SERIF};font-size:28px;line-height:1.2;color:${INK};">${escapeHtml(headline)}</td></tr>
${paragraphs
  .map(
    (p) =>
      `<tr><td style="padding:8px 40px 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(p)}</td></tr>`,
  )
  .join("")}
<tr><td align="center" style="padding:28px 40px 8px;"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:${TEAL};color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:2px;">${escapeHtml(buttonLabel)}</a></td></tr>
${
  input.code
    ? `<tr><td align="center" style="padding:20px 40px 0;font-family:${FONT};font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${MUTE};">Or enter this code at ${escapeHtml(SITE_URL.replace(/^https?:\/\//, ""))}/login</td></tr>
<tr><td align="center" style="padding:8px 40px 0;font-family:${FONT};font-size:30px;font-weight:600;letter-spacing:.3em;color:${INK};">${codeDigits}</td></tr>`
    : ""
}
${afterButton
  .map(
    (p) =>
      `<tr><td style="padding:22px 40px 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTE};">${escapeHtml(p)}</td></tr>`,
  )
  .join("")}
<tr><td style="padding:32px 40px 36px;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTE};border-top:1px solid ${HAIR};margin-top:24px;">${escapeHtml(footer)}</td></tr>
</table></td></tr>
<tr><td align="center" style="padding:20px 0 0;font-family:${FONT};font-size:11px;color:${MUTE};">Saddlewood Contracting LLC · ROC 305762 · Scottsdale, Arizona</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    headline,
    "",
    ...paragraphs,
    "",
    `${buttonLabel}: ${input.link}`,
    ...(input.code ? ["", `Or enter this code at ${SITE_URL}/login: ${input.code}`] : []),
    "",
    ...afterButton,
    "",
    footer,
  ].join("\n");

  return { html, text };
}
