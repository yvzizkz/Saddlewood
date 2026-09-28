import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  ProposalDashboardState,
  ProposalItem,
  DraftProposalInput,
  ProposalStatus,
  ProposalUpdateItem,
  ProposalUpdateInput,
} from './types';

const PROPOSALS_STATE_PATH = '/Users/landos/dev/Saddlewood-KB/bot/proposals_state.json';

const SEED_PROPOSALS: ProposalItem[] = [
  {
    id: 'prp-001',
    token: 'bellevue-church-schifferer-ac938',
    proposal_number: 'PRP-2026-001',
    client_name: 'Dean Schifferer',
    client_company: 'Schifferer Built, LLC',
    client_email: 'deans@schiffererbuilt.com',
    client_phone: '(602) 888-0344',
    project_name: 'Bellevue Heights Church (Franklin Hall & Sanctuary)',
    project_address: '9440 W Hutton Dr, Sun City, AZ 85351',
    archetype: 'commercial_gc',
    drawing_basis: {
      base_rev: 'Rev. 3 (05/27/2026)',
      current_rev: 'Rev. 5 (07/20/2026 Stamped Set in Procore)',
      set_name: 'BGW Architectural & Structural Permit Set',
      date: 'July 20, 2026',
      notes: 'Takeoff priced against Finishes documents & A303 Rev 3. Reconciling deltas against Rev 5 drawings.',
    },
    base_amount: 144913.0,
    line_items: [
      {
        id: 'li-1',
        phase: 'Cold-Formed Metal Framing (09 22 16)',
        description: 'Light gauge metal stud framing (Franklin Hall partitions, tall liner studs, headers & tracks)',
        amount: 58400.0,
        qty: 1840,
        unit: 'LF',
        dim_type: 'calculated',
        sheet_detail: 'A101 / A303 Detail 4',
        notes: 'Includes tall unbraced liner studs per engineering requirements.',
      },
      {
        id: 'li-2',
        phase: 'Thermal & Sound Insulation (07 21 00)',
        description: 'Sound attenuation batts (R-11 / R-19) throughout interior partition cavities',
        amount: 14200.0,
        qty: 5200,
        unit: 'SF',
        dim_type: 'calculated',
        sheet_detail: 'A303 Partition Legend',
        notes: 'Sound batts carried to deck height.',
      },
      {
        id: 'li-3',
        phase: 'Gypsum Board Assemblies (09 29 00)',
        description: '5/8" Type X gypsum board hung and finished to Level 4; acoustic sealants at rated perimeter',
        amount: 47913.0,
        qty: 18600,
        unit: 'SF',
        dim_type: 'calculated',
        sheet_detail: 'A101 / A102 / A303',
        notes: 'Standard Level 4 finish ready for prime and paint.',
      },
      {
        id: 'li-4',
        phase: 'Sanctuary Ceiling Substrate (09 51 00)',
        description: 'Double-layer 5/8" Type X drywall substrate & RC-1 framing for sloped ceiling (CD5 detail)',
        amount: 24400.0,
        qty: 1924,
        unit: 'SF',
        dim_type: 'schedule',
        sheet_detail: 'Reflected Ceiling Plan CD5',
        notes: 'Substrate & curved framing substrate only; decorative ChamClad plank carried as separate labor alternate.',
      },
    ],
    alternates: [
      {
        id: 'alt-1',
        title: 'Alternate 1: ChamClad Ceiling Installation (Labor Only)',
        description: 'Installation labor and high-reach scaffold access for decorative ChamClad ceiling planks. Material & trim provided by GC (12-15% waste factor recommended).',
        amount: 15000.0,
        selected: true,
      },
      {
        id: 'alt-2',
        title: 'Alternate 2: Upgrade Partition Sound Batts to Mineral Wool',
        description: 'Upgrade standard fiberglass sound batts to premium dense rockwool / mineral wool insulation (~5,200 SF) for superior acoustic isolation.',
        amount: 6700.0,
        selected: true,
      },
      {
        id: 'alt-3',
        title: 'Alternate 3: Furred Type X Hard Lid Ceiling (Classroom 111 & Storage 113)',
        description: 'Furred 5/8" Type X hard drywall ceiling over classroom 111 and storage 113 (~925 SF firm allowance based on scaled drawings).',
        amount: 6600.0,
        selected: true,
      },
      {
        id: 'alt-4',
        title: 'Alternate 4: 2-Hour Masonry Wall Furring & Drywall (10CR Walls)',
        description: 'Classroom-side furring and Type X drywall for new 2-hour CMU walls (firm allowance pending field measure of Rev 5 dimensions).',
        amount: 3500.0,
        selected: true,
      },
    ],
    clarifications: [
      'Framing and drywall substrate self-performed by Saddlewood Contracting LLC under AZ ROC #305762.',
      'ChamClad installation is labor and access only; materials and matching trims to be furnished by General Contractor to jobsite laydown.',
      'Pricing based on architectural finishes set and A303 Rev. 3; final scope reconciliation against Rev. 5 stamped drawings to occur at Monday pre-con meeting.',
      'Work to be performed during standard commercial working hours with dust mitigation barriers separating active church sanctuary.',
    ],
    exclusions: [
      'Furnishing ChamClad materials, clips, or trims (labor and staging access only).',
      'Structural steel framing, steel trusses, or glulam beams (coordination included).',
      'Painting or decorative wall coverings beyond Level 4 gypsum finish.',
      'HVAC, electrical, or plumbing rough-in work.',
    ],
    material_escalation_clause:
      'Due to steel feedstock volatility, this quotation incorporates a standard mutual escalation clause: cold-formed steel pricing is tied to BLS Index WPU101707. If steel moves more than ±5% between bid date and mill purchase order date, unit price adjustments shall reflect verified mill invoices without additional markup.',
    payment_terms:
      'Monthly progress billing on or before the 25th of each month, 10% retainage held, payment due within 30 days per Arizona Prompt Payment Act (A.R.S. § 32-1129).',
    warranty_terms:
      'One (1) year standard warranty on workmanship and installation from date of substantial completion.',
    valid_days: 30,
    valid_until: '2026-10-24',
    status: 'sent',
    created_at: '2026-09-24T18:00:00Z',
    created_by: 'Marco & Lando',
    updates: [
      {
        id: 'upd-001',
        author_name: 'Paul Johnson (Superintendent)',
        author_email: 'paulj@schiffererbuilt.com',
        author_role: 'contractor',
        category: 'drawing_revision',
        message: 'Uploaded Rev 5 stamped set sheet list. Confirming 10CR furring dimensions along Classroom 111 north wall for Monday walk.',
        attachments: [
          {
            id: 'att-001',
            name: 'Bellevue_A102_Rev5_Classrooms_NorthWall.pdf',
            size: 2450000,
            type: 'application/pdf',
            data_url: '#',
          },
        ],
        status: 'pending_review',
        created_at: '2026-09-26T16:30:00Z',
      },
    ],
  },
  {
    id: 'prp-002',
    token: 'jk-cardinal-lot-267-268',
    proposal_number: 'PRP-2026-002',
    client_name: 'Jourdan',
    client_company: 'JK Construction And Development Inc',
    client_email: 'jourdan@jk.studio',
    project_name: 'Cardinal - Lot 267 & 268 Remodel & Addition',
    project_address: 'Cardinal Project Site, Paradise Valley, AZ',
    archetype: 'commercial_gc',
    drawing_basis: {
      current_rev: '7.28.26 Combined Plan Set',
      set_name: 'JK Cardinal Construction Documents',
      date: 'July 28, 2026',
      notes: 'Sheet A-3.4 noted as belonging to another project; flagged in proposal cover letter.',
    },
    base_amount: 406835.14,
    line_items: [
      {
        id: 'li-c1',
        phase: 'Turnkey Framing Package (Material & Labor)',
        description: 'Complete structural wood framing, shear walls, holdowns, trusses, glulams, and roof sheathing',
        amount: 406835.14,
        notes: 'Trusses and glulams carried as budget figures until engineering stamp releases.',
      },
    ],
    alternates: [
      {
        id: 'alt-c1',
        title: 'Labor-Only Framing Alternate',
        description: 'Saddlewood self-performs all framing labor, layout, craning, and installation; lumber and trusses furnished by General Contractor.',
        amount: -232878.94,
        selected: false,
      },
    ],
    clarifications: [
      'Self-performed framing by Saddlewood licensed crew.',
      'Cover letter notes conflict on sheet A-3.4.',
    ],
    exclusions: [
      'Foundation concrete and anchor bolt placement.',
      'Roofing underlayment and tile/metal installation.',
    ],
    payment_terms: 'Progress draws twice monthly with standard 10% retainage.',
    warranty_terms: 'Two (2) year workmanship warranty.',
    valid_days: 30,
    valid_until: '2026-10-20',
    status: 'draft',
    created_at: '2026-09-21T11:20:00Z',
    created_by: 'Estimator Bot',
  },
  {
    id: 'prp-003',
    token: 'moore-buckeye-addition',
    proposal_number: 'PRP-2026-003',
    client_name: 'Cameron & Michelle Moore',
    client_email: 'michellemoore0525@gmail.com',
    client_phone: '(602) 628-9473',
    project_name: 'Moore Residence 247 SF Room Addition',
    project_address: '20207 W Whitton Ct, Buckeye, AZ 85396',
    archetype: 'luxury_residential',
    drawing_basis: {
      current_rev: 'Permit Set 08/10/2026',
      set_name: 'FINAL 081026-MOORE ADDITION',
      date: 'August 10, 2026',
    },
    base_amount: 45000.0,
    line_items: [
      {
        id: 'li-m1',
        phase: 'Structural Wood Framing (247 SF)',
        description: '2x6 exterior walls, 2x4 interior framing, structural roof rafters tied into existing garage wall',
        amount: 19500.0,
        qty: 247,
        unit: 'SF',
        notes: '12\'-7" x 19\'-8" footprint per architectural plan.',
      },
      {
        id: 'li-m2',
        phase: 'Thermal Insulation & Air Sealing',
        description: 'R-21 exterior wall batts and R-38 blown/batt ceiling insulation meeting Buckeye energy code',
        amount: 4800.0,
      },
      {
        id: 'li-m3',
        phase: 'Drywall Hung & Finished (Level 4)',
        description: '5/8" drywall hung on walls and ceiling, taped and floated to Level 4 smooth texture ready for paint',
        amount: 14200.0,
      },
      {
        id: 'li-m4',
        phase: 'Jobsite Protection & Clean',
        description: 'Floor protection, daily vacuum/cleanup, and trash haulaway',
        amount: 6500.0,
      },
    ],
    alternates: [
      {
        id: 'alt-m1',
        title: 'Upgrade to Level 5 Smooth Wall Finish',
        description: 'Full skim-coat across all new addition walls and ceilings for museum-quality smooth finish.',
        amount: 4200.0,
        selected: false,
      },
    ],
    clarifications: [
      'Work coordinated with owner schedule; site walk meeting scheduled for Wed 9/30 at 2:00 PM.',
      'Saddlewood is not liable for manufacturer equipment defects in third-party HVAC, electrical, or appliances.',
    ],
    exclusions: [
      'Roof tile tying into main house roof.',
      'Stucco exterior finish (framing and shear sheathing included).',
    ],
    payment_terms: '10% deposit upon contract signing, 40% framing completion, 40% drywall completion, 10% final punch walkthrough.',
    warranty_terms: 'Two (2) year comprehensive Saddlewood workmanship warranty.',
    valid_days: 30,
    valid_until: '2026-10-25',
    status: 'draft',
    created_at: '2026-09-25T14:00:00Z',
    created_by: 'Marco',
  },
];

export async function getProposalsState(): Promise<ProposalDashboardState> {
  if (fs.existsSync(PROPOSALS_STATE_PATH)) {
    try {
      const data = fs.readFileSync(PROPOSALS_STATE_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed.proposals)) {
        return parsed;
      }
    } catch (err) {
      console.error('Failed to parse proposals state:', err);
    }
  }

  // Fallback to seed data
  const state: ProposalDashboardState = {
    proposals: SEED_PROPOSALS,
    next_number: SEED_PROPOSALS.length + 1,
  };
  saveProposalsState(state);
  return state;
}

export function saveProposalsState(state: ProposalDashboardState) {
  try {
    fs.writeFileSync(PROPOSALS_STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save proposals state:', err);
  }
}

export function matchProposal(p: ProposalItem, identifier: string): boolean {
  if (!identifier) return false;
  const clean = identifier.toLowerCase().trim();

  // 1. Direct ID, Token, or Proposal Number match
  if (p.id.toLowerCase() === clean) return true;
  if (p.token.toLowerCase() === clean) return true;
  if (p.proposal_number.toLowerCase() === clean) return true;

  // 2. Token base match (e.g. "bellevue-church-schifferer-ac938" -> "bellevue-church-schifferer")
  const tokenBase = p.token.toLowerCase().replace(/-[a-f0-9]{4,}$/, '');
  if (tokenBase === clean) return true;

  // 3. Known clean short aliases for SMS / email links
  const aliases: Record<string, string[]> = {
    'prp-001': ['bellevue', 'schifferer', 'ac938', 'b1', 'franklin', 'hutton', 'bellevue-church'],
    'prp-002': ['cardinal', 'jk', 'c1', 'lot267', 'lot-267', 'lot268', 'lot-268', 'paradise'],
    'prp-003': ['moore', 'buckeye', 'm1', 'whitton', 'frank', 'moore-addition'],
  };

  if (aliases[p.id]?.includes(clean)) return true;

  // 4. Prefix match (e.g. "/p/bellevue" matches "bellevue-church-schifferer-ac938")
  if (clean.length >= 3 && p.token.toLowerCase().startsWith(clean)) return true;

  return false;
}

export async function getProposalByToken(token: string): Promise<ProposalItem | null> {
  const state = await getProposalsState();
  return state.proposals.find((p) => matchProposal(p, token)) || null;
}

export async function getProposalById(id: string): Promise<ProposalItem | null> {
  const state = await getProposalsState();
  return state.proposals.find((p) => matchProposal(p, id)) || null;
}

export async function updateProposalStatus(
  id: string,
  status: ProposalStatus
): Promise<ProposalItem | null> {
  const state = await getProposalsState();
  const proposal = state.proposals.find((p) => matchProposal(p, id));
  if (!proposal) return null;

  proposal.status = status;
  saveProposalsState(state);
  return proposal;
}

export async function toggleProposalAlternate(
  token: string,
  alternateId: string,
  selected: boolean
): Promise<ProposalItem | null> {
  const state = await getProposalsState();
  const proposal = state.proposals.find((p) => matchProposal(p, token));
  if (!proposal) return null;

  const alt = proposal.alternates.find((a) => a.id === alternateId);
  if (alt) {
    alt.selected = selected;
    saveProposalsState(state);
  }
  return proposal;
}

export async function acceptProposal(
  idOrToken: string,
  acceptance: { name: string; signature: string; ip: string }
): Promise<ProposalItem | null> {
  const state = await getProposalsState();
  const proposal = state.proposals.find((p) => matchProposal(p, idOrToken));
  if (!proposal) return null;

  proposal.status = 'accepted';
  proposal.accepted_at = new Date().toISOString();
  proposal.accepted_by = acceptance.name;
  proposal.accepted_signature = acceptance.signature;
  proposal.accepted_ip = acceptance.ip;

  saveProposalsState(state);
  return proposal;
}

export async function createProposal(input: DraftProposalInput, createdBy = 'Marco'): Promise<ProposalItem> {
  const state = await getProposalsState();
  const n = state.next_number;
  const id = `prp-${String(n).padStart(3, '0')}`;
  const token = `${input.project_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
  const proposal_number = `PRP-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`;

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);

  const proposal: ProposalItem = {
    id,
    token,
    proposal_number,
    client_name: input.client_name,
    client_company: input.client_company,
    client_email: input.client_email,
    client_phone: input.client_phone,
    project_name: input.project_name,
    project_address: input.project_address,
    archetype: input.archetype,
    drawing_basis: {
      current_rev: input.current_rev,
      base_rev: input.base_rev,
      set_name: input.set_name,
      date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    },
    base_amount: input.base_amount,
    line_items: input.line_items,
    alternates: input.alternates || [],
    clarifications: input.clarifications || [],
    exclusions: input.exclusions || [],
    material_escalation_clause: input.material_escalation_clause,
    payment_terms: input.payment_terms || 'Progress billing net 30 days per Arizona Prompt Payment Act.',
    warranty_terms: input.warranty_terms || 'One (1) year workmanship warranty.',
    valid_days: 30,
    valid_until: validUntil.toISOString().split('T')[0],
    status: 'draft',
    created_at: new Date().toISOString(),
    created_by: createdBy,
  };

  state.proposals.unshift(proposal);
  state.next_number += 1;
  saveProposalsState(state);

  return proposal;
}

export async function addProposalUpdate(
  idOrToken: string,
  input: ProposalUpdateInput
): Promise<{ proposal: ProposalItem; update: ProposalUpdateItem } | null> {
  const state = await getProposalsState();
  const proposal = state.proposals.find((p) => matchProposal(p, idOrToken));
  if (!proposal) return null;

  if (!proposal.updates) {
    proposal.updates = [];
  }

  const updateId = `upd-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const attachments = (input.attachments || []).map((att, idx) => ({
    id: `att-${Date.now().toString(36)}-${idx}`,
    name: att.name,
    size: att.size,
    type: att.type,
    data_url: att.data_url,
  }));

  const updateItem: ProposalUpdateItem = {
    id: updateId,
    author_name: input.author_name || proposal.client_name,
    author_email: input.author_email || proposal.client_email,
    author_role: input.author_role || 'client',
    category: input.category,
    message: input.message,
    attachments,
    status: 'pending_review',
    created_at: new Date().toISOString(),
  };

  proposal.updates.unshift(updateItem);
  saveProposalsState(state);

  return { proposal, update: updateItem };
}

export async function updateProposalUpdateStatus(
  proposalIdOrToken: string,
  updateId: string,
  status: 'pending_review' | 'acknowledged' | 'incorporated'
): Promise<ProposalItem | null> {
  const state = await getProposalsState();
  const proposal = state.proposals.find((p) => matchProposal(p, proposalIdOrToken));
  if (!proposal || !proposal.updates) return null;

  const target = proposal.updates.find((u) => u.id === updateId);
  if (!target) return null;

  target.status = status;
  saveProposalsState(state);
  return proposal;
}
