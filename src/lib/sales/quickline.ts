import type { EstimateItem, ItemKind } from "./types";

// One line typed the way people say it on a site walk, turned into an
// estimate line. Everything is optional except words:
//
//   "120 sf drywall patch @ 2.50"     120 SF, $2.50/SF, installed
//   "demo kitchen 16 hrs"             16 HR of labor at the rate
//   "dumpster $650"                   1 LS, $650, equipment
//   "plumbing sub 4200"               1 LS, $4,200, sub
//   "cabinet allowance 12000"         1 LS, $12,000, allowance
//   "baseboard 220 lf @ 3.10 mat"     220 LF, $3.10 material
//
// The person sees the parsed line before it is added and can fix any part.

const UNIT_ALIASES: Record<string, string> = {
  sf: "SF", sqft: "SF", "sq.ft": "SF", "sq ft": "SF", ft2: "SF", sqf: "SF",
  lf: "LF", ft: "LF", feet: "LF", foot: "LF", "lin ft": "LF",
  sy: "SY", cy: "CY", yd: "CY", yds: "CY",
  ea: "EA", each: "EA", pc: "EA", pcs: "EA", unit: "EA", units: "EA",
  hr: "HR", hrs: "HR", hour: "HR", hours: "HR", h: "HR",
  day: "DAY", days: "DAY",
  wk: "WK", wks: "WK", week: "WK", weeks: "WK",
  ls: "LS", lump: "LS", lot: "LS",
  sheet: "SHEET", sheets: "SHEET", sht: "SHEET",
  box: "BOX", boxes: "BOX", roll: "ROLL", rolls: "ROLL", gal: "GAL", gallon: "GAL", gallons: "GAL", ton: "TON", tons: "TON",
};

const KIND_WORDS: [RegExp, ItemKind][] = [
  [/\ballowance\b/i, "allowance"],
  [/\bsub(contract(or)?)?\b|\bplumb(ing|er)\b|\belectric(al|ian)?\b|\bhvac\b|\bpaint(ing|er)?\b|\bstucco\b|\broof(ing|er)?\b/i, "sub"],
  [/\bdumpster\b|\brental\b|\blift\b|\bscissor\b|\bequipment\b|\bportable toilet\b|\bporta[- ]?john\b/i, "equipment"],
  [/\bmat(erial)?s?\b(?!\s*\+)/i, "material"],
  [/\blabor\b|\bdemo(lition)?\b|\binstall(ation)?\b|\bclean ?up\b/i, "labor"],
];

export type QuickLine = Pick<EstimateItem, "description" | "kind" | "qty" | "unit" | "mat" | "hrs" | "lab" | "cost">;

function money(s: string): number {
  return Number(s.replace(/[$,]/g, ""));
}

export function parseQuickLine(raw: string, laborRate: number): QuickLine | null {
  let text = ` ${raw.trim().replace(/\s+/g, " ")} `;
  if (!text.trim()) return null;

  // "@ 2.50" or "at $2.50" (a unit price), else a bare "$650" (a lump sum).
  let unitPrice: number | null = null;
  let lump: number | null = null;
  const at = text.match(/\s(?:@|at)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(?:\/\s*[a-z.]+)?/i);
  if (at) {
    unitPrice = money(at[1]);
    text = text.replace(at[0], " ");
  } else {
    const dollar = text.match(/\s\$\s*([\d,]+(?:\.\d+)?)(k)?\b/i);
    if (dollar) {
      lump = money(dollar[1]) * (dollar[2] ? 1000 : 1);
      text = text.replace(dollar[0], " ");
    }
  }

  // A quantity with its unit: "120 sf", "16 hrs", "3 days".
  let qty: number | null = null;
  let unit: string | null = null;
  const unitNames = Object.keys(UNIT_ALIASES)
    .sort((a, b) => b.length - a.length)
    .map((u) => u.replace(/[.]/g, "\\.").replace(/ /g, "\\s"))
    .join("|");
  const qu = text.match(new RegExp(`\\s([\\d,]+(?:\\.\\d+)?)\\s*(${unitNames})\\b\\.?`, "i"));
  if (qu) {
    qty = money(qu[1]);
    unit = UNIT_ALIASES[qu[2].toLowerCase().replace(/\s+/g, " ")] ?? qu[2].toUpperCase();
    text = text.replace(qu[0], " ");
  }

  // A trailing bare number with no unit and no price yet is the amount ("plumbing sub 4200").
  if (unitPrice === null && lump === null) {
    const tail = text.match(/\s([\d,]+(?:\.\d+)?)(k)?\s*$/i);
    if (tail && (qty === null || unit === "HR")) {
      const v = money(tail[1]) * (tail[2] ? 1000 : 1);
      if (qty === null) lump = v;
      else unitPrice = v;
      text = text.replace(tail[0], " ");
    }
  }

  let kind: ItemKind | null = null;
  for (const [re, k] of KIND_WORDS) {
    if (re.test(text)) {
      kind = k;
      break;
    }
  }
  const description = text
    .replace(/\s(?:mat(?:erial)?s?)\s*$/i, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
  if (!description) return null;

  if (unit === "HR" && unitPrice === null && lump === null) {
    // Hours with no price: labor at the loaded rate.
    return { description, kind: "labor", qty: qty ?? 1, unit: "HR", mat: 0, hrs: 1, lab: 0, cost: 0 };
  }
  const q = qty ?? 1;
  const u = unit ?? "LS";
  const price = unitPrice ?? (lump !== null ? lump / q : 0);
  // No word saying what it is: a priced line is an all-in price ("other"), an
  // unpriced one with a unit is installed work waiting for its split.
  if (!kind) kind = price > 0 || u === "LS" ? "other" : "installed";
  const line: QuickLine = { description, kind, qty: q, unit: u, mat: 0, hrs: 0, lab: 0, cost: 0 };
  if (kind === "material") line.mat = price;
  else if (kind === "labor") {
    if (u === "HR" && Math.abs(price - laborRate) < 0.005) line.hrs = 1;
    else line.lab = price;
  } else if (kind !== "installed") line.cost = price;
  return line;
}
