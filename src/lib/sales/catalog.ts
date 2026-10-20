import type { EstimateItem, ItemKind } from "./types";

// Prices the builder can drop in with one tap. Each one says where it came
// from and the day it was confirmed, so the checks can call out a stale price
// (the 60-day rule) instead of letting it ride into a bid. Nothing here is a
// guess: every entry is copied from a Saddlewood source, named in `source`.
//
//   RATE_CARD     Estimate/FRAMEWORK/PROFILES/saddlewood/RATE_CARD.md (effective 2026-06)
//   PHX-2026-08   .../VERIFIED_PRICES/PHX-2026-08 (browser-verified, 2026-08-01)
//   PRODUCTION    Estimate/FRAMEWORK/06_SCHEDULE/PRODUCTION_RATES.md (hours per unit = crew x 8 / units a day)
//   PATRICK-LN    Patrick Lane estimate-summary.md, general conditions (2026-10-12)

export const RATE_CARD = {
  /** Loaded field rate, $/hr: blended journey crew and working foreman alike. */
  laborRate: 45.03,
  effective: "2026-06-01",
  reviewDue: "2027-01-01",
} as const;

export type CatalogEntry = {
  id: string;
  group: string;
  description: string;
  unit: string;
  kind: ItemKind;
  mat?: number;
  wastePct?: number;
  hrs?: number;
  lab?: number;
  cost?: number;
  priceDate: string;
  source: string;
  /** Read before using it (freight not included, a volume break, ...). */
  caution?: string;
};

const PHX = "PHX-2026-08";
const PROD = "PRODUCTION_RATES";
const PL = "Patrick Lane GCs";

export const CATALOG: CatalogEntry[] = [
  // ---- installed assemblies (material + labor per unit) -------------------------
  {
    id: "asm-cfs-wall-6",
    group: "Assemblies",
    description: "6\" 20ga steel stud wall, 16\" o.c. (stud + track + slip track)",
    unit: "LF",
    kind: "installed",
    mat: 14.41,
    wastePct: 10,
    hrs: 0.08,
    priceDate: "2026-08-01",
    source: `${PHX} headline · ${PROD} track + stud ≤14' (2 × 8 ÷ 200 LF)`,
    caution: "Mail-order steel, FOB Louisiana: freight not included. Get a Phoenix distributor quote.",
  },
  {
    id: "asm-gwb-hang-tape",
    group: "Assemblies",
    description: "5/8\" Type X drywall, hung, taped, Level 4 (per SF of board)",
    unit: "SF",
    kind: "installed",
    mat: 0.541,
    wastePct: 10,
    hrs: 0.0378,
    priceDate: "2026-08-01",
    source: `${PHX} board $0.541/SF blended · ${PROD} hang 0.0178 + tape L4 0.020 hr/SF`,
    caution: "Level 4 tape at 0.020 hr/SF per the production-rate warning, not 0.0067.",
  },
  {
    id: "asm-r19-metal",
    group: "Assemblies",
    description: "R-19 unfaced batt in metal stud wall",
    unit: "SF",
    kind: "installed",
    mat: 0.75,
    wastePct: 5,
    hrs: 0.0107,
    priceDate: "2026-08-01",
    source: `${PHX} MP-I2 · ${PROD} thermal batts walls (2 × 8 ÷ 1,500 SF)`,
  },
  {
    id: "asm-r21-wood",
    group: "Assemblies",
    description: "R-21 kraft-faced batt, 2x6 wood wall",
    unit: "SF",
    kind: "installed",
    mat: 1.235,
    wastePct: 5,
    hrs: 0.0107,
    priceDate: "2026-08-01",
    source: `${PHX} MP-I1 · ${PROD} thermal batts walls`,
  },

  // ---- labor by production rate ---------------------------------------------
  { id: "lab-wall-demo", group: "Labor", description: "Interior wall demo (stud + drywall), incl. haul to dumpster", unit: "LF", kind: "labor", hrs: 0.267, priceDate: RATE_CARD.effective, source: `${PROD} 2 × 8 ÷ 60 LF` },
  { id: "lab-gwb-ceiling-demo", group: "Labor", description: "Drywall ceiling removal", unit: "SF", kind: "labor", hrs: 0.0267, priceDate: RATE_CARD.effective, source: `${PROD} 2 × 8 ÷ 600 SF` },
  { id: "lab-cab-demo", group: "Labor", description: "Cabinet / millwork removal (careful salvage)", unit: "LF", kind: "labor", hrs: 0.4, priceDate: RATE_CARD.effective, source: `${PROD} 2 × 8 ÷ 40 LF` },
  { id: "lab-wood-wall-new", group: "Labor", description: "Wood wall framing, new", unit: "LF", kind: "labor", hrs: 0.0889, priceDate: RATE_CARD.effective, source: `${PROD} 2 × 8 ÷ 180 LF` },
  { id: "lab-wood-wall-remodel", group: "Labor", description: "Wall framing, remodel (remove + replace)", unit: "LF", kind: "labor", hrs: 0.16, priceDate: RATE_CARD.effective, source: `${PROD} 2 × 8 ÷ 100 LF` },
  { id: "lab-soffit", group: "Labor", description: "Soffit / bulkhead framing", unit: "LF", kind: "labor", hrs: 0.2, priceDate: RATE_CARD.effective, source: `${PROD} 2 × 8 ÷ 80 LF` },
  { id: "lab-blocking", group: "Labor", description: "Blocking (fixtures, grab bars, TV, cabinets)", unit: "LF", kind: "labor", hrs: 0.0533, priceDate: RATE_CARD.effective, source: `${PROD} 2 × 8 ÷ 300 LF` },
  { id: "lab-gwb-ceiling", group: "Labor", description: "Hang drywall, flat ceiling", unit: "SF", kind: "labor", hrs: 0.0343, priceDate: RATE_CARD.effective, source: `${PROD} 3 × 8 ÷ 700 SF` },
  { id: "lab-tape-l5", group: "Labor", description: "Tape + finish, Level 5", unit: "SF", kind: "labor", hrs: 0.0114, priceDate: RATE_CARD.effective, source: `${PROD} 1 × 8 ÷ 700 SF` },
  { id: "lab-crown", group: "Labor", description: "Crown molding install", unit: "LF", kind: "labor", hrs: 0.133, priceDate: RATE_CARD.effective, source: `${PROD} 1 × 8 ÷ 60 LF` },
  { id: "lab-lvt", group: "Labor", description: "LVT floor, standard lay", unit: "SF", kind: "labor", hrs: 0.0229, priceDate: RATE_CARD.effective, source: `${PROD} 2 × 8 ÷ 700 SF` },
  { id: "lab-tile-floor", group: "Labor", description: "Porcelain tile floor, large format", unit: "SF", kind: "labor", hrs: 0.1, priceDate: RATE_CARD.effective, source: `${PROD} 1 × 8 ÷ 80 SF` },
  { id: "lab-tile-wall", group: "Labor", description: "Porcelain / ceramic wall tile", unit: "SF", kind: "labor", hrs: 0.08, priceDate: RATE_CARD.effective, source: `${PROD} 1 × 8 ÷ 100 SF` },
  { id: "lab-stone-top", group: "Labor", description: "Stone countertop install (incl. seam)", unit: "SF", kind: "labor", hrs: 0.107, priceDate: RATE_CARD.effective, source: `${PROD} 2 × 8 ÷ 150 SF` },
  { id: "lab-hourly", group: "Labor", description: "Field labor (loaded rate)", unit: "HR", kind: "labor", hrs: 1, priceDate: RATE_CARD.effective, source: "RATE_CARD $45.03/hr loaded" },

  // ---- materials (unit prices) -----------------------------------------------
  { id: "MP-F1", group: "Materials", description: "6\" metal stud 600S125-18 (20ga) × 16'", unit: "EA", kind: "material", mat: 13.63, wastePct: 10, priceDate: "2026-08-01", source: `${PHX} US Frame Factory`, caution: "Freight to Phoenix not included." },
  { id: "MP-F2", group: "Materials", description: "6\" metal track 600T125-18 (20ga) × 10'", unit: "EA", kind: "material", mat: 7.97, wastePct: 10, priceDate: "2026-08-01", source: `${PHX} US Frame Factory`, caution: "Freight to Phoenix not included." },
  { id: "MP-F3", group: "Materials", description: "6\" slotted slip track, 2-1/2\" leg × 10'", unit: "EA", kind: "material", mat: 22.99, wastePct: 10, priceDate: "2026-08-01", source: `${PHX} US Frame Factory` },
  { id: "MP-D1", group: "Materials", description: "5/8\" Type X gypsum board 4×12", unit: "SHEET", kind: "material", mat: 20.58, wastePct: 10, priceDate: "2026-08-01", source: `${PHX} Home Depot, 26+ break`, caution: "Volume-break price (26+ sheets); a single sheet is $27.44." },
  { id: "MP-D2", group: "Materials", description: "Joint compound, all-purpose 4.5 gal", unit: "BOX", kind: "material", mat: 20.4, priceDate: "2026-08-01", source: `${PHX} Home Depot, 10+ break` },
  { id: "MP-D3", group: "Materials", description: "Paper joint tape 500'", unit: "ROLL", kind: "material", mat: 7.5, priceDate: "2026-08-01", source: `${PHX}` },
  { id: "MP-D4", group: "Materials", description: "Metal corner bead 1-1/4\" × 10'", unit: "EA", kind: "material", mat: 4.98, priceDate: "2026-08-01", source: `${PHX} Home Depot` },
  { id: "MP-D5", group: "Materials", description: "Drywall screws #6 × 1-1/4\" fine thread, 25 lb", unit: "BOX", kind: "material", mat: 36.66, priceDate: "2026-08-01", source: `${PHX} Home Depot, 3+ break` },
  { id: "MP-I3", group: "Materials", description: "Thermafiber SAFB mineral wool 6\"", unit: "SF", kind: "material", mat: 3.37, wastePct: 25, priceDate: "2026-08-01", source: `${PHX} Insulation4US`, caution: "+25% cut waste for fireblocking rows." },

  // ---- general conditions ------------------------------------------------------
  { id: "gc-foreman", group: "General conditions", description: "Supervision: working foreman, full duration", unit: "WK", kind: "labor", lab: 1801.2, priceDate: "2026-10-12", source: `${PL} GC-01 (40 hr × $45.03)` },
  { id: "gc-mob", group: "General conditions", description: "Mobilization / demobilization", unit: "EA", kind: "labor", lab: 560.24, priceDate: "2026-10-12", source: `${PL} GC-02` },
  { id: "gc-tools", group: "General conditions", description: "Small tools and consumables", unit: "WK", kind: "other", cost: 300, priceDate: "2026-10-12", source: `${PL} GC-03` },
  { id: "gc-cleanup", group: "General conditions", description: "Daily cleanup of our debris", unit: "HR", kind: "labor", hrs: 1, priceDate: "2026-10-12", source: `${PL} GC-05` },
  { id: "gc-scissor", group: "General conditions", description: "26' rough-terrain scissor lift", unit: "WK", kind: "equipment", cost: 650, priceDate: "2026-10-12", source: `${PL} GC-09` },
  { id: "gc-lift-delivery", group: "General conditions", description: "Lift delivery / pickup", unit: "LS", kind: "equipment", cost: 350, priceDate: "2026-10-12", source: `${PL} GC-10` },
  { id: "gc-delivery", group: "General conditions", description: "Local delivery of material (HD / yard)", unit: "EA", kind: "other", cost: 150, priceDate: "2026-10-12", source: `${PL} GC-11` },
];

export function catalogGroups(): string[] {
  return [...new Set(CATALOG.map((c) => c.group))];
}

export function searchCatalog(q: string): CatalogEntry[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return CATALOG;
  return CATALOG.filter((c) => {
    const hay = `${c.description} ${c.group} ${c.id}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** A builder line from a catalog entry, quantity left for the person to enter. */
export function itemFromCatalog(c: CatalogEntry, id: string, qty = 0): EstimateItem {
  return {
    id,
    description: c.description,
    memo: c.caution,
    kind: c.kind,
    qty,
    unit: c.unit,
    mat: c.mat ?? 0,
    wastePct: c.wastePct ?? 0,
    hrs: c.hrs ?? 0,
    lab: c.lab ?? 0,
    cost: c.cost ?? 0,
    rate: null,
    priceDate: c.priceDate,
    source: `${c.id} · ${c.source}`,
  };
}
