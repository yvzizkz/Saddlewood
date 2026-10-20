import { readFileSync } from "fs";
import path from "path";
import { degrees, PDFDocument, rgb, StandardFonts, type Color, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import { scheduleAmounts, type ProposalSnapshot } from "./presentation";
import type { PublicSignature } from "./signing";

// The proposal as a PDF: what rides on a proposal email as an attachment, and
// the signed copy both sides keep. It is the printed form of the client's page
// (src/components/sales/ProposalView.tsx), built from the same frozen
// snapshot, so the two never disagree.
//
// Standard PDF fonts only (Times for headings, echoing Fraunces; Helvetica for
// the body), so nothing is downloaded or embedded but the logo and the
// signatures. Those fonts can only set the Windows-1252 characters: every
// string passes through pdfSafe first, which maps what it can and drops the
// rest, so an emoji in a client's note can never stop a PDF from being made.

export type PdfInput = {
  proposal: ProposalSnapshot;
  meta: { number: string; date: string | null; preparedFor: { name: string; attention?: string }; project: { name: string; address?: string } };
  /** Signatures on it, oldest first; image is a data:image/png;base64 URL. */
  signatures: PublicSignature[];
  /** When accepted: what the client chose. Then the PDF shows that package and those add-ons as the agreed price. */
  accepted?: { name: string; at: string; packageId: string; packageName: string; totalCents: number; options: { description: string; priceCents: number }[] } | null;
  /** Lines for a "Signature record" page (who, when, method, IP, SHA-256), for the signed copy. Omit for an unsigned PDF. */
  certificate?: string[];
  /** e.g. "Withdrawn" — stamped across the first page when set. */
  watermark?: string;
};

// ---- text the standard fonts can set ------------------------------------------------

/** The Windows-1252 characters outside Latin-1 that the standard fonts carry. */
const WINANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

const REPLACE: Record<string, string> = {
  "\t": " ",
  " ": " ",
  "­": "",
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
  "​": "",
  "‌": "",
  "‍": "",
  "⁠": "",
  "﻿": "",
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "―": "—",
  "−": "-",
  "′": "'",
  "″": '"',
  "≤": "<=",
  "≥": ">=",
  "≠": "!=",
  "≈": "~",
  "→": "->",
  "←": "<-",
  "↔": "<->",
  "✓": "",
  "✔": "",
  "•": "•",
  "∙": "·",
  "⋅": "·",
  "⅓": "1/3",
  "⅔": "2/3",
  "⅛": "1/8",
  "№": "No.",
  "′′": '"',
};

function encodable(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa1 && c <= 0xff && c !== 0xad) || WINANSI_EXTRA.has(ch);
}

/** Text the standard PDF fonts can set: mapped where there is an equivalent, dropped where not. Newlines are kept. */
export function pdfSafe(text: string | null | undefined): string {
  if (!text) return "";
  let out = "";
  for (const ch of String(text).replace(/\r\n?/g, "\n")) {
    if (ch === "\n") {
      out += "\n";
      continue;
    }
    if (encodable(ch)) {
      out += ch;
      continue;
    }
    if (ch in REPLACE) {
      out += REPLACE[ch];
      continue;
    }
    // An accented letter outside Latin-1 (ő, ł̈ ...) keeps its base letter.
    for (const part of ch.normalize("NFKD")) if (encodable(part)) out += part;
  }
  return out;
}

/** pdfSafe for a single line: newlines become spaces. */
function oneLine(text: string | null | undefined): string {
  return pdfSafe(text).replace(/\n+/g, " ");
}

// ---- formatting -----------------------------------------------------------------------

function money(c: number): string {
  return (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function longDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Phoenix" });
}

function qtyText(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function pdfFileName(number: string, signed: boolean): string {
  const safe = number.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "proposal";
  return `Saddlewood-Proposal-${safe}${signed ? "-signed" : ""}.pdf`;
}

// ---- the page ---------------------------------------------------------------------------

const W = 612;
const H = 792;
const M = 54;
const CW = W - 2 * M;
/** Room kept at the foot of each page for the footer. */
const BOTTOM = M + 18;

const hex = (h: string): Color => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = {
  teal: hex("#182828"),
  gold: hex("#d4af37"),
  goldText: hex("#8f6c18"),
  champagne: hex("#e5c97d"),
  ink: hex("#2c2926"),
  light: hex("#5a5a5a"),
  stone: hex("#e2dbd0"),
  stoneMid: hex("#d9d0c3"),
  cream: hex("#ede6d8"),
  paper: hex("#f5f0e8"),
  white: rgb(1, 1, 1),
  green: hex("#2f6b4a"),
  greenBg: hex("#e3ece6"),
  red: hex("#9a2a1f"),
  ink2: hex("#1b2f6b"),
};

type Fonts = { body: PDFFont; bold: PDFFont; head: PDFFont; headBold: PDFFont };

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of pdfSafe(text).split("\n")) {
    const words = para.split(/ +/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (let w of words) {
      // A word longer than the line (a URL, a part number) is broken where it must be.
      while (font.widthOfTextAtSize(w, size) > width) {
        let i = w.length - 1;
        while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(w.slice(0, i));
        w = w.slice(i);
      }
      if (!w) continue;
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line) out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  /** The top of the space still free on the page. */
  y = H - M;

  constructor(
    readonly pdf: PDFDocument,
    readonly f: Fonts,
  ) {}

  newPage() {
    this.page = this.pdf.addPage([W, H]);
    this.pages.push(this.page);
    this.y = H - M;
  }

  /** Room for `h` points, or a new page. A row is never split between pages. */
  ensure(h: number) {
    if (this.y - h < BOTTOM) this.newPage();
  }

  text(s: string, x: number, baseline: number, font: PDFFont, size: number, color: Color = C.ink) {
    const t = oneLine(s);
    if (t) this.page.drawText(t, { x, y: baseline, size, font, color });
  }

  right(s: string, xRight: number, baseline: number, font: PDFFont, size: number, color: Color = C.ink) {
    const t = oneLine(s);
    if (t) this.page.drawText(t, { x: xRight - font.widthOfTextAtSize(t, size), y: baseline, size, font, color });
  }

  rule(color: Color = C.stone, thickness = 0.75) {
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness, color });
  }

  /** Wrapped lines, each kept whole on a page. */
  para(s: string, opts: { font?: PDFFont; size?: number; color?: Color; x?: number; width?: number; lh?: number } = {}) {
    const font = opts.font ?? this.f.body;
    const size = opts.size ?? 10;
    const lh = opts.lh ?? size * 1.45;
    const x = opts.x ?? M;
    for (const line of wrap(s, font, size, opts.width ?? CW)) {
      this.ensure(lh);
      this.y -= lh;
      this.text(line, x, this.y + lh * 0.28, font, size, opts.color);
    }
  }

  eyebrow(s: string, color: Color = C.goldText) {
    this.ensure(14);
    this.y -= 12;
    this.text(s.toUpperCase(), M, this.y + 3, this.f.bold, 7.5, color);
  }

  /** A section heading with a rule above it, kept with the room its first row needs. */
  heading(s: string, keep = 30) {
    this.ensure(42 + keep);
    this.y -= 18;
    this.rule();
    this.y -= 22;
    this.text(s, M, this.y + 4, this.f.headBold, 14, C.teal);
    this.y -= 6;
  }

  /** A row: wrapped text on the left, an amount on the right, both on one page. */
  row(left: string, amount: string | null, opts: { font?: PDFFont; size?: number; color?: Color; indent?: number; sub?: string; subSize?: number } = {}) {
    const font = opts.font ?? this.f.body;
    const size = opts.size ?? 9.5;
    const lh = size * 1.45;
    const indent = opts.indent ?? 0;
    const amountW = amount ? this.f.body.widthOfTextAtSize(oneLine(amount), size) + 14 : 0;
    const lines = wrap(left, font, size, CW - indent - Math.max(amountW, amount ? 80 : 0));
    const subSize = opts.subSize ?? 8;
    const subLh = subSize * 1.4;
    const subLines = opts.sub ? wrap(opts.sub, this.f.body, subSize, CW - indent - 90) : [];
    this.ensure(lines.length * lh + subLines.length * subLh + 2);
    lines.forEach((l, i) => {
      this.y -= lh;
      this.text(l, M + indent, this.y + lh * 0.28, font, size, opts.color);
      if (i === 0 && amount) this.right(amount, W - M, this.y + lh * 0.28, this.f.body, size, opts.color ?? C.ink);
    });
    for (const l of subLines) {
      this.y -= subLh;
      this.text(l, M + indent + 8, this.y + subLh * 0.28, this.f.body, subSize, C.light);
    }
  }
}

function dataUrlBytes(url: string): Uint8Array | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(url ?? "");
  return m ? new Uint8Array(Buffer.from(m[1], "base64")) : null;
}

let logoBytes: Uint8Array | null | undefined;
function loadLogo(): Uint8Array | null {
  if (logoBytes !== undefined) return logoBytes;
  try {
    const b = readFileSync(path.join(process.cwd(), "public/images/logo-roundel.png"));
    logoBytes = b.length > 8 && b[0] === 0x89 && b[1] === 0x50 ? new Uint8Array(b) : null;
  } catch {
    logoBytes = null;
  }
  return logoBytes;
}

async function embedPngSafe(pdf: PDFDocument, bytes: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes) return null;
  try {
    return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

// ---- the cover --------------------------------------------------------------------------

async function cover(w: Writer, input: PdfInput) {
  const { f } = w;
  const p = input.proposal;
  const titleLines = wrap(p.title || input.meta.project.name, f.headBold, 22, CW - 10);
  const forLines = [input.meta.preparedFor.name, input.meta.preparedFor.attention ? `Attn: ${input.meta.preparedFor.attention}` : ""].filter(Boolean);
  const projLines = wrap(input.meta.project.address || "", f.body, 10, CW / 2 - 10);
  const infoRows = Math.max(forLines.length, projLines.length, 1);
  const bandH = 30 + 40 + 30 + 12 + titleLines.length * 26 + 18 + 12 + infoRows * 14 + 26;
  const top = H;
  w.page.drawRectangle({ x: 0, y: top - bandH, width: W, height: bandH, color: C.teal });
  w.page.drawRectangle({ x: 0, y: top - 4, width: W, height: 4, color: C.gold });

  let y = top - 30;
  const logo = await embedPngSafe(w.pdf, loadLogo());
  let nameX = M;
  if (logo) {
    w.page.drawImage(logo, { x: M, y: y - 38, width: 38, height: 38 });
    nameX = M + 48;
  }
  w.text("Saddlewood Contracting", nameX, y - 16, f.headBold, 15, C.white);
  w.text("ROC 305762 · Scottsdale, Arizona", nameX, y - 30, f.body, 8, C.champagne);
  w.right(`No. ${input.meta.number}`, W - M, y - 14, f.body, 9, C.white);
  if (input.meta.date) w.right(longDay(input.meta.date), W - M, y - 27, f.body, 9, C.champagne);
  y -= 40 + 30;
  w.text("PROPOSAL", M, y, f.bold, 8, C.gold);
  y -= 12;
  for (const l of titleLines) {
    y -= 26;
    w.text(l, M, y + 6, f.headBold, 22, C.white);
  }
  y -= 18;
  w.text("PREPARED FOR", M, y, f.bold, 7, C.champagne);
  if (projLines.length && projLines[0]) w.text("PROJECT", M + CW / 2, y, f.bold, 7, C.champagne);
  y -= 4;
  for (let i = 0; i < infoRows; i++) {
    y -= 14;
    if (forLines[i]) w.text(forLines[i], M, y + 3, i === 0 ? f.bold : f.body, 10, C.white);
    if (projLines[i]) w.text(projLines[i], M + CW / 2, y + 3, i === 0 ? f.bold : f.body, 10, C.white);
  }
  w.y = top - bandH - 8;

  if (input.watermark) {
    w.page.drawText(oneLine(input.watermark).toUpperCase().slice(0, 40), {
      x: 130,
      y: 250,
      size: 72,
      font: f.bold,
      color: C.red,
      opacity: 0.13,
      rotate: degrees(35),
    });
  }
}

// ---- the body ---------------------------------------------------------------------------

function packageBoxes(w: Writer, p: ProposalSnapshot) {
  const { f } = w;
  const n = p.packages.length;
  const gap = 10;
  const bw = (CW - gap * (n - 1)) / n;
  const inner = bw - 20;
  const boxes = p.packages.map((pk) => {
    const tag = wrap(pk.tagline ?? "", f.body, 8, inner).filter(Boolean);
    const hl = pk.highlights.flatMap((h) => wrap(`• ${h}`, f.body, 8, inner));
    const name = wrap(pk.name, f.headBold, 13, inner);
    return { pk, tag, hl, name, h: 12 + (pk.recommended ? 12 : 0) + name.length * 16 + tag.length * 10.5 + 8 + 22 + 6 + hl.length * 10.5 + 10 };
  });
  const bh = Math.max(...boxes.map((b) => b.h));
  w.ensure(bh + 20);
  w.eyebrow("Packages");
  w.y -= 8;
  const top = w.y;
  boxes.forEach((b, i) => {
    const x = M + i * (bw + gap);
    const lead = b.pk.recommended;
    w.page.drawRectangle({
      x,
      y: top - bh,
      width: bw,
      height: bh,
      color: lead ? C.paper : C.white,
      borderColor: lead ? C.teal : C.stoneMid,
      borderWidth: lead ? 1.5 : 0.75,
    });
    let y = top - 12;
    if (lead) {
      w.text("RECOMMENDED", x + 10, y - 6, f.bold, 6.5, C.goldText);
      y -= 12;
    }
    for (const l of b.name) {
      y -= 16;
      w.text(l, x + 10, y + 4, f.headBold, 13, C.teal);
    }
    for (const l of b.tag) {
      y -= 10.5;
      w.text(l, x + 10, y + 2, f.body, 8, C.light);
    }
    y -= 8 + 22;
    w.text(money(b.pk.totalCents), x + 10, y + 5, f.headBold, 16, C.ink);
    y -= 6;
    for (const l of b.hl) {
      y -= 10.5;
      w.text(l, x + 10, y + 2, f.body, 8, C.ink);
    }
  });
  w.y = top - bh;
}

function signatureBlock(w: Writer, input: PdfInput, images: Map<number, PDFImage | null>) {
  const { f } = w;
  const p = input.proposal;
  type Slot = { sig: PublicSignature | null; label: string; idx: number };
  const slots: Slot[] = [];
  input.signatures.forEach((s, idx) =>
    slots.push({ sig: s, idx, label: s.role === "client" ? "Client" : s.title || p.sign.companyTitle || "Saddlewood Contracting" }),
  );
  const hasClient = input.signatures.some((s) => s.role === "client");
  const hasCompany = input.signatures.some((s) => s.role === "company");
  if ((p.sign.mode === "client" || p.sign.mode === "both") && !hasClient) slots.unshift({ sig: null, label: "Client", idx: -1 });
  if (p.sign.mode === "both" && !hasCompany) slots.push({ sig: null, label: p.sign.companyTitle || "Saddlewood Contracting", idx: -1 });
  if (slots.length === 0) return;

  w.heading("Signatures", 110);
  if (p.sign.consent) w.para(p.sign.consent, { size: 8, color: C.light });
  w.y -= 6;
  const slotW = 240;
  const slotH = 112;
  for (let i = 0; i < slots.length; i += 2) {
    w.ensure(slotH);
    const top = w.y;
    for (let j = 0; j < 2 && i + j < slots.length; j++) {
      const s = slots[i + j];
      const x = M + j * (slotW + 24);
      const lineY = top - 66;
      const img = s.sig ? images.get(s.idx) ?? null : null;
      if (img) {
        const scale = Math.min(200 / img.width, 56 / img.height, 1);
        const iw = img.width * scale;
        const ih = img.height * scale;
        w.page.drawImage(img, { x, y: lineY + 3, width: iw, height: ih });
      } else if (s.sig) {
        w.text(s.sig.name, x, lineY + 10, f.head, 16, C.ink2);
      }
      w.page.drawLine({ start: { x, y: lineY }, end: { x: x + slotW, y: lineY }, thickness: 0.75, color: C.ink });
      w.text(s.sig ? s.sig.name : "Name", x, lineY - 13, s.sig ? f.bold : f.body, 9, s.sig ? C.ink : C.light);
      w.text(s.label, x, lineY - 25, f.body, 8, C.light);
      w.text(s.sig ? `Signed ${longDay(s.sig.at)}` : "Date", x, lineY - 37, f.body, 8, C.light);
    }
    w.y = top - slotH;
  }
}

export async function renderProposalPdf(input: PdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const f: Fonts = {
    body: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    head: await pdf.embedFont(StandardFonts.TimesRoman),
    headBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
  };
  pdf.setTitle(oneLine(`Proposal ${input.meta.number}: ${input.proposal.title || input.meta.project.name}`));
  pdf.setAuthor("Saddlewood Contracting");
  pdf.setCreator("Saddlewood Contracting");
  pdf.setProducer("Saddlewood Contracting");

  const w = new Writer(pdf, f);
  w.newPage();
  await cover(w, input);

  const p = input.proposal;
  const acc = input.accepted ?? null;
  const lead = p.packages.find((x) => x.recommended) ?? p.packages[0];
  const pkg = (acc ? p.packages.find((x) => x.id === acc.packageId) : null) ?? lead;
  const pid = pkg?.id ?? "";

  if (acc) {
    const text = `Accepted by ${acc.name} on ${longDay(acc.at)}: ${acc.packageName}, ${money(acc.totalCents)}.`;
    const lines = wrap(text, f.bold, 9.5, CW - 24);
    const h = lines.length * 14 + 14;
    w.ensure(h + 14);
    w.y -= 12;
    w.page.drawRectangle({ x: M, y: w.y - h, width: CW, height: h, color: C.greenBg, borderColor: C.green, borderWidth: 0.75 });
    lines.forEach((l, i) => w.text(l, M + 12, w.y - 18 - i * 14, f.bold, 9.5, C.green));
    w.y -= h;
  }

  if (p.intro) {
    w.y -= 8;
    w.para(p.intro, { size: 10.5 });
  }

  if (p.packages.length > 1 && !acc) {
    w.y -= 14;
    packageBoxes(w, p);
  }

  // Scope.
  w.heading(p.layout === "total" ? "Scope of work" : "Scope and price");
  if (p.packages.length > 1) w.para(`Shown for the ${pkg?.name ?? ""} package${acc ? ", as accepted" : ""}.`, { size: 8, color: C.light });
  const sections = p.sections.filter((s) => s.pkgs.includes(pid));
  sections.forEach((s, si) => {
    const lines = s.lines.filter((l) => l.pkgs.includes(pid));
    w.ensure(36);
    if (si > 0) {
      w.y -= 6;
      w.page.drawLine({ start: { x: M, y: w.y }, end: { x: W - M, y: w.y }, thickness: 0.5, color: C.stone });
    }
    w.y -= 4;
    const amt = p.layout !== "total" && s.amounts?.[pid] !== undefined ? money(s.amounts[pid]) : null;
    w.row(s.name, amt, { font: f.bold, size: 10.5 });
    if (s.note) w.para(s.note, { size: 8.5, color: C.light });
    for (const l of lines) {
      let left = `– ${l.description}`;
      if (l.allowance) left += "  [Allowance]";
      if (l.qty !== undefined) left += `   ${qtyText(l.qty)} ${l.unit ?? ""}${l.unitCents !== undefined ? ` × ${money(l.unitCents)}` : ""}`;
      const a = l.amounts?.[pid];
      w.row(left, a !== undefined ? money(a) : null, { size: 9, indent: 8, sub: l.note });
    }
  });
  if (p.adjustments.length) {
    w.y -= 6;
    w.ensure(20);
    w.page.drawLine({ start: { x: M, y: w.y }, end: { x: W - M, y: w.y }, thickness: 0.5, color: C.stone });
    w.y -= 2;
    for (const a of p.adjustments) {
      if (a.amounts[pid] === undefined) continue;
      w.row(a.label, money(a.amounts[pid]), { font: f.bold, size: 10 });
    }
  }
  if (p.layout === "total" && sections.some((s) => s.lines.some((l) => l.allowance && l.amounts?.[pid] !== undefined))) {
    w.para("The price includes the allowances marked above, each at the value shown.", { size: 8, color: C.light });
  }

  // Add-ons.
  const options = p.options.filter((o) => o.packages.length === 0 || o.packages.includes(pid));
  if (options.length) {
    w.heading("Add-ons");
    for (const o of options) {
      const taken = acc?.options.some((x) => x.description === o.description && x.priceCents === o.priceCents) ?? false;
      const mark = acc ? (taken ? "[Included]  " : "[Not included]  ") : "";
      w.row(`${mark}${o.description}`, `+${money(o.priceCents)}`, { size: 9.5, sub: o.note, font: taken ? f.bold : f.body });
    }
  }

  // The total.
  const total = acc ? acc.totalCents : (pkg?.totalCents ?? 0);
  {
    const incl = acc && acc.options.length ? wrap(`incl. ${acc.options.map((o) => o.description).join(", ")}`, f.body, 8, CW - 200) : [];
    const h = 46 + incl.length * 11 + (p.validUntil ? 12 : 0);
    w.ensure(h + 20);
    w.y -= 18;
    const top = w.y;
    w.page.drawRectangle({ x: M, y: top - h, width: CW, height: h, color: C.cream });
    const label = acc ? "Accepted total" : p.packages.length > 1 ? `${pkg?.name ?? ""} total` : "Total";
    w.text(label.toUpperCase(), M + 14, top - 20, f.bold, 7.5, C.goldText);
    w.right(money(total), W - M - 14, top - 32, f.headBold, 22, C.teal);
    incl.forEach((l, i) => w.text(l, M + 14, top - 34 - i * 11, f.body, 8, C.light));
    if (p.validUntil) w.text(`Valid until ${longDay(p.validUntil)}.`, M + 14, top - h + 10, f.body, 8, C.light);
    w.y = top - h;
  }

  if (p.timeline) {
    w.heading("Timeline");
    w.para(p.timeline, { size: 9.5 });
  }

  if (p.schedule.length) {
    w.heading("Payment schedule");
    for (const s of scheduleAmounts(p.schedule, total)) {
      const lh = 14;
      const lines = wrap(s.label, f.body, 9.5, CW - 150);
      w.ensure(lines.length * lh + 2);
      lines.forEach((l, i) => {
        w.y -= lh;
        w.text(l, M, w.y + 4, f.body, 9.5);
        if (i === 0) {
          w.right(`${s.pct}%`, W - M - 90, w.y + 4, f.body, 9.5, C.light);
          w.right(money(s.cents), W - M, w.y + 4, f.bold, 9.5);
        }
      });
    }
  }

  if (p.clarifications.length || p.exclusions.length) {
    w.heading("What this price assumes");
    if (p.clarifications.length) {
      w.eyebrow("Clarifications");
      for (const c of p.clarifications) w.para(`•  ${c}`, { size: 9, x: M + 4, width: CW - 4 });
      w.y -= 6;
    }
    if (p.exclusions.length) {
      w.eyebrow("Not included");
      for (const c of p.exclusions) w.para(`•  ${c}`, { size: 9, x: M + 4, width: CW - 4 });
    }
  }

  if (p.basis) {
    w.y -= 8;
    w.para(`${p.basis}.`, { size: 8, color: C.light });
  }

  if (p.terms) {
    w.heading("Terms");
    for (const t of p.terms.split("\n").filter((x) => x.trim())) {
      w.para(t, { size: 8, color: C.light, lh: 11 });
      w.y -= 3;
    }
  }

  const images = new Map<number, PDFImage | null>();
  for (const [i, s] of input.signatures.entries()) images.set(i, await embedPngSafe(pdf, dataUrlBytes(s.image)));
  signatureBlock(w, input, images);

  if (input.certificate?.length) {
    w.newPage();
    w.y -= 6;
    w.text("Signature record", M, w.y - 14, f.headBold, 16, C.teal);
    w.y -= 26;
    w.para(`Proposal No. ${input.meta.number}. Each signature below is kept in the proposal's proof record, which cannot be changed or deleted.`, {
      size: 8.5,
      color: C.light,
    });
    w.y -= 6;
    for (const line of input.certificate) w.para(line, { size: 9, lh: 13 });
  }

  // Footer on every page, now that the count is known.
  const n = w.pages.length;
  w.pages.forEach((pg, i) => {
    const t = oneLine(`Saddlewood Contracting · ROC 305762 · No. ${input.meta.number} · Page ${i + 1} of ${n}`);
    const size = 7.5;
    pg.drawText(t, { x: (W - f.body.widthOfTextAtSize(t, size)) / 2, y: M - 24, size, font: f.body, color: C.light });
  });

  return pdf.save();
}
