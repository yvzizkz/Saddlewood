import type { Submission } from "@/lib/webforms/store";
import type { Sub } from "./types";

// A trade-partner application from the website becoming a sub. Pure, so the
// page and the route agree on who is already in the directory.

/** The website form's trades (TradePartnersForm) as the directory names them; "Other" says nothing. */
const TRADES: Record<string, string[]> = {
  "Framing / Rough Carpentry": ["framing"],
  "Concrete & Masonry": ["concrete", "masonry"],
  "Excavation / Grading": ["excavation"],
  "Structural Steel / Metal": ["steel"],
  Roofing: ["roofing"],
  Electrical: ["electrical"],
  Plumbing: ["plumbing"],
  "HVAC / Mechanical": ["hvac"],
  "Drywall & Insulation": ["drywall", "insulation"],
  "Painting & Finishes": ["paint"],
  "Flooring & Tile": ["flooring", "tile"],
  "Cabinetry / Millwork": ["cabinets"],
  "Windows & Doors": ["windows and doors"],
  "Stucco / Exterior": ["stucco"],
  "Landscaping / Hardscape": ["landscape"],
  "Pools & Water Features": ["pools"],
  "Low-Voltage / Smart Home": ["low voltage"],
  Other: [],
};

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

function trades(about: string): string[] {
  const picked = about.split(",").map((t) => t.trim()).filter(Boolean);
  return [...new Set(picked.flatMap((t) => TRADES[t] ?? [t.toLowerCase().slice(0, 40)]))].slice(0, 20);
}

/** What the applicant typed as a license. The form keeps it only in the summary. */
function license(summary: string): string {
  return /^License \/ ROC #: (.+)$/m.exec(summary)?.[1].trim().slice(0, 40) ?? "";
}

const digits = (s: string) => s.replace(/\D/g, "");

/** "Sunfire Construction, LLC." and "SUNFIRE CONSTRUCTION" are one company, and so are "Piñas" and "Pinas". */
function sameCompany(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(llc|l l c|inc|incorporated|co|corp|corporation|company|ltd)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A new sub starts as a prospect: nothing an applicant says counts as checked. All of it stays on the note. */
export function subFromApplication(s: Submission) {
  const email = EMAIL.test(s.email) ? s.email : "";
  return {
    name: (s.company || s.name).slice(0, 160),
    trades: trades(s.about),
    status: "prospect",
    phone: s.phone,
    email,
    rocLicense: license(s.summary),
    note: `From the website, ${s.createdAt.slice(0, 10)}.\n${s.summary}`.slice(0, 2000),
    contacts: s.name || email || s.phone ? [{ name: s.name.slice(0, 120), email, phone: s.phone, role: "", isPrimary: true }] : [],
  };
}

/** The sub this application already is, by company, license number or email. */
export function findSub(s: Submission, subs: readonly Sub[]): Sub | null {
  const company = sameCompany(s.company || s.name);
  const roc = digits(license(s.summary));
  const email = s.email.toLowerCase();
  const found = (test: (x: Sub) => boolean) => subs.find(test) ?? null;
  return (
    (company ? found((x) => sameCompany(x.name) === company) : null) ??
    (roc.length >= 5 ? found((x) => digits(x.rocLicense) === roc) : null) ??
    (email ? found((x) => x.email === email || x.contacts.some((c) => c.email === email)) : null)
  );
}
