// Field quality checklists, pure so a client screen can read them; ops.ts
// re-exports them next to the reads and writes.

// Checklists per trade. The drywall sequence (pre-cover through final walk)
// is the one the app started with; plumbing, electrical and HVAC are our own
// licensed trades (CR-37, CR-11, CR-39) and each get rough-in, pre-cover and
// final, the points an Arizona inspector checks them (Scottsdale, Phoenix,
// Maricopa County: rough-in before any wall is covered, final before the
// certificate of occupancy). Stage keys are stored on the row, so a drywall
// checklist made before there were trades reads the same as it always did.

export const CHECKLIST_SETS = {
  drywall: ["pre_cover", "pre_board", "pre_tape", "pre_texture", "pre_paint", "final_walk"],
  plumbing: ["plumbing_rough", "plumbing_precover", "plumbing_final"],
  electrical: ["electrical_rough", "electrical_precover", "electrical_final"],
  hvac: ["hvac_rough", "hvac_precover", "hvac_final"],
} as const;

export type ChecklistTrade = keyof typeof CHECKLIST_SETS;
export type ChecklistStage = (typeof CHECKLIST_SETS)[ChecklistTrade][number];

export const CHECKLIST_TRADES = Object.keys(CHECKLIST_SETS) as ChecklistTrade[];
export const CHECKLIST_STAGES = CHECKLIST_TRADES.flatMap((t) => [...CHECKLIST_SETS[t]]) as ChecklistStage[];

export function isChecklistStage(v: unknown): v is ChecklistStage {
  return typeof v === "string" && (CHECKLIST_STAGES as string[]).includes(v);
}

/** The trade a checklist stage belongs to. */
export function checklistTradeOf(stage: ChecklistStage): ChecklistTrade {
  return CHECKLIST_TRADES.find((t) => (CHECKLIST_SETS[t] as readonly string[]).includes(stage)) ?? "drywall";
}

/** The trade's checklist set for a phase trade: drywall for drywall, framing and insulation (its pre-cover and pre-board gates); its own for MEP. */
export function checklistTradeFor(trade: string | null | undefined): ChecklistTrade {
  const t = (trade ?? "").trim().toLowerCase();
  return (CHECKLIST_TRADES as string[]).includes(t) ? (t as ChecklistTrade) : "drywall";
}

export const CHECKLIST_STAGE_LABEL: Record<ChecklistStage, string> = {
  pre_cover: "1. Pre-cover (framing & backing)",
  pre_board: "2. Pre-board (insulation & MEP sign-off)",
  pre_tape: "3. Pre-tape (screw pattern & beads)",
  pre_texture: "4. Pre-texture (skim & inside corners)",
  pre_paint: "5. Pre-paint (500W raking-light check)",
  final_walk: "6. Final walk (punch & closeout)",
  plumbing_rough: "Plumbing 1. Rough-in (underground & top-out)",
  plumbing_precover: "Plumbing 2. Pre-cover (top-out & gas inspected)",
  plumbing_final: "Plumbing 3. Final (fixtures, heater & gas)",
  electrical_rough: "Electrical 1. Rough-in (boxes, wire & circuits)",
  electrical_precover: "Electrical 2. Pre-cover (rough inspected)",
  electrical_final: "Electrical 3. Final (devices, panel & service)",
  hvac_rough: "HVAC 1. Rough-in (ducts, line set & condensate)",
  hvac_precover: "HVAC 2. Pre-cover (rough & duct inspected)",
  hvac_final: "HVAC 3. Final (startup & commissioning)",
};

export type ChecklistItem = {
  key: string;
  label: string;
  checked: boolean;
  note: string;
};

export type ChecklistRow = {
  id: number;
  jobId: string;
  phaseId: number | null;
  phaseName: string;
  stage: ChecklistStage;
  stageLabel: string;
  locationLabel: string;
  items: ChecklistItem[];
  status: "open" | "passed" | "blocked";
  note: string;
  completedBy: string;
  completedAt: string | null;
};

export function defaultChecklistItems(stage: ChecklistStage): ChecklistItem[] {
  switch (stage) {
    case "pre_cover":
      return [
        { key: "studs_backing", label: "Stud spacing, heavy-gauge door bucks & TV/cabinet backing verified", checked: false, note: "" },
        { key: "mep_clearance", label: "MEP rough-in plates, nail guards & acoustic putty pads installed", checked: false, note: "" },
        { key: "firestop", label: "Top-of-wall fire caulk & rated shaft clips inspected", checked: false, note: "" },
        { key: "both_faces_photo", label: "Photos captured of both wall faces with room label visible", checked: false, note: "" },
      ];
    case "pre_board":
      return [
        { key: "insulation_r", label: "Thermal & sound attenuation batts installed full-cavity with zero voids", checked: false, note: "" },
        { key: "municipal_signoff", label: "Municipal framing & insulation pre-board inspection signed off", checked: false, note: "" },
        { key: "both_faces_photo", label: "Photos captured of both insulated wall faces with location label", checked: false, note: "" },
      ];
    case "pre_tape":
      return [
        { key: "screw_pattern", label: "Screw spacing & dimple depth verified (no torn face paper)", checked: false, note: "" },
        { key: "beads_straight", label: "Corner bead, L-bead & reveal beads laser-plumb and square", checked: false, note: "" },
        { key: "both_faces_photo", label: "Photos captured of hung board on both wall faces", checked: false, note: "" },
      ];
    case "pre_texture":
      return [
        { key: "joints_flat", label: "Butt joints & flats feathered wide with zero crowning", checked: false, note: "" },
        { key: "inside_corners", label: "Inside corners crisp, sanded and free of buildup", checked: false, note: "" },
        { key: "both_faces_photo", label: "Photos captured of taped walls prior to texture/skim", checked: false, note: "" },
      ];
    case "pre_paint":
      return [
        { key: "skim_holiday", label: "Zero holidays, lap marks or pinholes under 500W raking light", checked: false, note: "" },
        { key: "sanded_dusted", label: "Walls vacuum-sanded and wiped ready for PVA primer", checked: false, note: "" },
        { key: "both_faces_photo", label: "Photos captured of both wall faces under raking light", checked: false, note: "" },
      ];
    case "final_walk":
      return [
        { key: "touchups_done", label: "All blue-tape punch touch-ups complete and paint sheen uniform", checked: false, note: "" },
        { key: "site_clean", label: "Floors, window tracks & fixtures spotless; protection removed", checked: false, note: "" },
        { key: "closeout_photos", label: "Final completion photos uploaded for billing package", checked: false, note: "" },
      ];
     default:
      return (MEP_ITEMS[stage] ?? []).map(([key, label]) => ({ key, label, checked: false, note: "" }));
  }
}

const MEP_ITEMS: Partial<Record<ChecklistStage, [key: string, label: string][]>> = {
  plumbing_rough: [
    ["underground_test", "Underground DWV and water lines under test (water or air) and inspected before backfill or slab pour"],
    ["dwv_slope", "Drain lines sloped 1/4 in. per foot, cleanouts accessible, vents through the roof"],
    ["stubouts", "Supply and drain stub-outs at the fixture schedule's heights and centers"],
    ["supply_test", "Water supply rough under pressure test, no drop on the gauge"],
    ["nail_plates", "Nail plates wherever pipe is within 1-1/4 in. of the stud face"],
    ["shower_pan", "Shower pans and liners flood-tested (2 in. of standing water) before cover"],
  ],
  plumbing_precover: [
    ["topout_signoff", "Top-out inspection signed off by the city or county"],
    ["gas_signoff", "Gas rough pressure test held and inspected (where there is gas)"],
    ["insulated_lines", "Hot water lines insulated where the energy code requires it"],
    ["both_faces_photo", "Photos captured of every plumbing wall, both faces, with the room label"],
  ],
  plumbing_final: [
    ["fixtures_tested", "Every fixture set, caulked and run; no leaks at traps or supplies"],
    ["water_heater", "Water heater T&P discharge piped to an approved point, expansion tank where required"],
    ["gas_appliances", "Gas appliances connected with shutoffs and leak-tested"],
    ["backflow", "Hose bibbs with vacuum breakers; backflow devices where required"],
    ["final_signoff", "Plumbing final inspection passed"],
  ],
  electrical_rough: [
    ["ufer", "Ufer (concrete-encased electrode) inspected in the footing before the pour, on new foundations"],
    ["boxes_set", "Boxes set at plan heights and locations, flush with the finish surface"],
    ["wire_secured", "Cable stapled within 12 in. of every box and every 4-1/2 ft, nail plates where needed"],
    ["circuits_plan", "AFCI and GFCI circuits, dedicated appliance circuits and smoke/CO locations per plan"],
    ["grounds_made_up", "Grounds made up and conductors folded in every box"],
    ["low_voltage", "Low-voltage and data roughed in, kept apart from line voltage"],
  ],
  electrical_precover: [
    ["rough_signoff", "Electrical rough inspection signed off by the city or county"],
    ["ses_ready", "Service (SES) and panel ready for inspection where the service is new or upgraded"],
    ["both_faces_photo", "Photos captured of every wall's wiring, both faces, with the room label"],
  ],
  electrical_final: [
    ["devices_covers", "Devices, fixtures and cover plates installed"],
    ["panel_directory", "Panel labeled with a circuit directory; breakers match the plan"],
    ["gfci_afci_tested", "GFCI and AFCI devices tested; smoke and CO alarms interconnected and tested"],
    ["service_release", "Service inspected and the release sent to the utility (APS or SRP)"],
    ["final_signoff", "Electrical final inspection passed"],
  ],
  hvac_rough: [
    ["duct_layout", "Duct runs, boots and returns per the duct layout; flex supported and not kinked"],
    ["duct_sealed", "Every joint and boot sealed with mastic"],
    ["line_set", "Refrigerant line set run, insulated and protected"],
    ["condensate", "Primary condensate trapped and routed; secondary drain or float switch at the air handler"],
    ["exhaust", "Bath, laundry and kitchen exhaust ducted to the outside"],
  ],
  hvac_precover: [
    ["rough_signoff", "Mechanical rough and duct inspection signed off by the city or county"],
    ["duct_leakage", "Duct leakage test passed where the energy code requires it"],
    ["both_faces_photo", "Photos captured of every duct chase and soffit before it is covered"],
  ],
  hvac_final: [
    ["equipment_set", "Condenser on its pad, disconnect in sight, air handler and filter in place"],
    ["charge_verified", "Refrigerant charge verified (superheat or subcooling) and recorded"],
    ["startup_temps", "Startup: supply and return temperature split recorded, every register flowing"],
    ["thermostat", "Thermostat programmed and the client shown how to use it"],
    ["final_signoff", "Mechanical final inspection passed"],
  ],
};
